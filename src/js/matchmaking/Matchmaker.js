// src/js/matchmaking/Matchmaker.js
import { ref, set, onValue, update, remove, serverTimestamp, runTransaction, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

export class Matchmaker {
  constructor(rtdb, db, auth, gameLauncher) {
    this.rtdb = rtdb;
    this.db = db;
    this.auth = auth;
    this.gameLauncher = gameLauncher;
    this.ui = null;
    this.currentGame = null;
    this.roomId = null;
    this.unsubscribeQueue = null;
    this.unsubscribeSession = null;
    this.timerInterval = null;
    this.iframeMessageHandler = null;
    this.currentIframe = null;
    this.userId = null;
  }

  setUI(ui) { this.ui = ui; }

  // Получение стабильного ID игрока
  _getUserId() {
    const user = this.auth.currentUser;
    if (user) {
      // Если есть UID из Firebase Auth (приоритет)
      if (user.uid) return user.uid;
      // Иначе используем ID из Firestore (если есть)
      if (user.id) return user.id;
    }
    // Гостевой ID из localStorage
    let guestId = localStorage.getItem('biblix_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('biblix_guest_id', guestId);
    }
    return guestId;
  }

  _getNickname() {
    const user = this.auth.currentUser;
    if (user && user.nickname) return user.nickname;
    return 'Гость_' + this._getUserId().slice(-4);
  }

  startMatchmaking(game) {
    console.log('[MM] startMatchmaking for game:', game.id, game.title);
    this.currentGame = game;
    this.userId = this._getUserId();
    const nickname = this._getNickname();

    this.showMatchmakingModal();
    this.startTimer();

    const queueRef = ref(this.rtdb, `matchmaking/${game.id}/queue/${this.userId}`);
    set(queueRef, {
      nickname: nickname,
      timestamp: serverTimestamp()
    }).then(() => {
      console.log('[MM] Added to queue');
    }).catch(err => {
      console.error('[MM] Error adding to queue:', err);
      this.ui.showToast('Ошибка подключения', 'error');
      this.cancelMatchmaking();
      return;
    });

    const queueListRef = ref(this.rtdb, `matchmaking/${game.id}/queue`);
    this.unsubscribeQueue = onValue(queueListRef, async (snapshot) => {
      const queue = snapshot.val() || {};
      const players = Object.keys(queue);
      console.log('[MM] Queue update, players:', players.length, players);
      
      const statusEl = document.getElementById('queue-status');
      if (statusEl) statusEl.textContent = `В очереди: ${players.length}/${game.players}`;

      if (players.length >= game.players) {
        const selectedPlayers = players.slice(0, game.players);
        const roomId = `${game.id}_${Date.now()}`;
        this.roomId = roomId;

        // Удаляем из очереди
        const updates = {};
        selectedPlayers.forEach(pid => updates[`matchmaking/${game.id}/queue/${pid}`] = null);
        await update(ref(this.rtdb), updates);

        const sessionRef = ref(this.rtdb, `gameSessions/${roomId}`);
        const playersObj = {};
        const initialGameState = {};
        selectedPlayers.forEach(pid => {
          playersObj[pid] = { nickname: queue[pid].nickname, ready: false };
          initialGameState[pid] = 0;
        });

        await set(sessionRef, {
          gameId: game.id,
          players: playersObj,
          host: selectedPlayers[0],
          status: 'waiting',
          gameState: initialGameState,
          createdAt: serverTimestamp()
        });

        if (this.unsubscribeQueue) {
          this.unsubscribeQueue();
          this.unsubscribeQueue = null;
        }

        this.waitForGameStart(roomId, game);
      }
    });

    document.getElementById('cancel-matchmaking').onclick = () => this.cancelMatchmaking();
  }

  waitForGameStart(roomId, game) {
    const sessionRef = ref(this.rtdb, `gameSessions/${roomId}`);
    const nickname = this._getNickname();

    this.unsubscribeSession = onValue(sessionRef, async (snapshot) => {
      const session = snapshot.val();
      if (!session) {
        this.cleanup();
        return;
      }

      const players = session.players;
      const allReady = Object.values(players).every(p => p.ready === true);
      
      if (allReady && session.status === 'waiting') {
        await update(sessionRef, { status: 'playing' });
      }

      if (session.status === 'playing' && this.currentIframe) {
        this.sendToIframe({
          type: 'state_update',
          gameState: session.gameState,
          players: session.players
        });

        // Проверка победы (любой игрок набрал 5 очков)
        const gameState = session.gameState;
        for (const [uid, score] of Object.entries(gameState)) {
          if (score >= 5) {
            console.log('[MM] Winner detected:', uid);
            await this.endGame(roomId, uid);
            break;
          }
        }
      }
    });

    this.hideMatchmakingModal();
    this.ui.hideGameContainer();
    const container = document.getElementById('game-container');
    const iframeEl = document.getElementById('game-iframe');
    document.getElementById('game-title-display').textContent = game.title;
    this.currentIframe = iframeEl;

    this.iframeMessageHandler = async (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      
      if (data.type === 'iframe_ready') {
        console.log('[MM] iframe ready');
        const sessionSnapshot = await get(sessionRef);
        const sessionData = sessionSnapshot.val() || {};
        this.sendToIframe({
          type: 'init',
          roomId: roomId,
          userId: this.userId,
          nickname: nickname,
          gameState: sessionData.gameState || {},
          players: sessionData.players || {}
        });
      }
      else if (data.type === 'player_action') {
        this.handlePlayerAction(roomId, this.userId, data);
      }
      else if (data.type === 'game_over') {
        console.log('[MM] game_over from iframe, winner:', data.winner);
        this.endGame(roomId, data.winner);
      }
    };
    window.addEventListener('message', this.iframeMessageHandler);

    // Загрузка iframe
    const url = this.gameLauncher.getGameUrl(game);
    if (url) {
      iframeEl.src = url;
      iframeEl.onload = () => {
        if (game.htmlContent) URL.revokeObjectURL(url);
        update(ref(this.rtdb, `gameSessions/${roomId}/players/${this.userId}`), { ready: true });
      };
    } else {
      this.ui.showToast('Не удалось загрузить игру', 'error');
      this.cleanup();
      return;
    }

    container.style.display = 'flex';
  }

  sendToIframe(data) {
    if (this.currentIframe && this.currentIframe.contentWindow) {
      this.currentIframe.contentWindow.postMessage(data, '*');
    }
  }

  async handlePlayerAction(roomId, userId, actionData) {
    if (!roomId || !userId) return;
    const scoreRef = ref(this.rtdb, `gameSessions/${roomId}/gameState/${userId}`);
    await runTransaction(scoreRef, (currentScore) => {
      return (currentScore || 0) + 1;
    });
    console.log('[MM] Score incremented for', userId);
  }

  async endGame(roomId, winnerId) {
    if (!roomId) return;
    const sessionRef = ref(this.rtdb, `gameSessions/${roomId}`);
    const snapshot = await get(sessionRef);
    if (!snapshot.exists()) return;
    
    await update(sessionRef, { status: 'ended', winner: winnerId });
    
    this.sendToIframe({
      type: 'game_over',
      winner: winnerId
    });
    
    setTimeout(() => remove(sessionRef), 5000);
    
    if (winnerId && this.auth.currentUser && winnerId === this.userId) {
      await this.auth.addCoins(10);
      this.ui.showToast('Победа! +10 монет', 'success');
    }
  }

  cleanup() {
    if (this.unsubscribeSession) { this.unsubscribeSession(); this.unsubscribeSession = null; }
    if (this.unsubscribeQueue) { this.unsubscribeQueue(); this.unsubscribeQueue = null; }
    if (this.iframeMessageHandler) {
      window.removeEventListener('message', this.iframeMessageHandler);
      this.iframeMessageHandler = null;
    }
    this.stopTimer();
    this.currentGame = null;
    this.roomId = null;
    this.currentIframe = null;
  }

  cancelMatchmaking() {
    if (this.unsubscribeQueue) this.unsubscribeQueue();
    if (this.currentGame) {
      remove(ref(this.rtdb, `matchmaking/${this.currentGame.id}/queue/${this.userId}`));
    }
    this.hideMatchmakingModal();
    this.stopTimer();
    this.cleanup();
  }

  showMatchmakingModal() { document.getElementById('matchmaking-modal').style.display = 'flex'; }
  hideMatchmakingModal() { document.getElementById('matchmaking-modal').style.display = 'none'; }

  startTimer() {
    let seconds = 0;
    const timerEl = document.getElementById('matchmaking-timer');
    this.timerInterval = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
