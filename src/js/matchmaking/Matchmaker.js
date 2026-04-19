// src/js/matchmaking/Matchmaker.js
import { ref, set, onValue, update, remove, serverTimestamp, runTransaction, get, child } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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

  _getUserId() {
    const user = this.auth.currentUser;
    if (user) return user.uid || user.id || user.nickname_lower;
    let guestId = localStorage.getItem('biblix_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('biblix_guest_id', guestId);
    }
    return guestId;
  }

  _getNickname() {
    const user = this.auth.currentUser;
    return user?.nickname || 'Гость_' + this._getUserId().slice(-4);
  }

  startMatchmaking(game) {
    this.currentGame = game;
    this.userId = this._getUserId();
    const nickname = this._getNickname();

    this.showMatchmakingModal();
    this.startTimer();

    const queueRef = ref(this.rtdb, `matchmaking/${game.id}/queue/${this.userId}`);
    set(queueRef, { nickname, timestamp: serverTimestamp() })
      .catch(err => { this.ui.showToast('Ошибка подключения', 'error'); this.cancelMatchmaking(); });

    const queueListRef = ref(this.rtdb, `matchmaking/${game.id}/queue`);
    this.unsubscribeQueue = onValue(queueListRef, async (snapshot) => {
      const queue = snapshot.val() || {};
      const players = Object.keys(queue);
      const statusEl = document.getElementById('queue-status');
      if (statusEl) statusEl.textContent = `В очереди: ${players.length}/${game.players}`;

      if (players.length >= game.players) {
        const selectedPlayers = players.slice(0, game.players);
        const roomId = `${game.id}_${Date.now()}`;
        this.roomId = roomId;

        const updates = {};
        selectedPlayers.forEach(pid => updates[`matchmaking/${game.id}/queue/${pid}`] = null);
        await update(ref(this.rtdb), updates);

        const sessionRef = ref(this.rtdb, `gameSessions/${roomId}`);
        const playersObj = {};
        selectedPlayers.forEach(pid => {
          playersObj[pid] = { nickname: queue[pid].nickname, ready: true };
        });

        const initialGameState = {
          players: {},
          bullets: [],
          map: null,
          winner: null
        };

        // Инициализируем позиции для игр, где нужны координаты
        Object.keys(playersObj).forEach((pid, idx) => {
          initialGameState.players[pid] = {
            x: 200 + idx * 100,
            y: 200 + idx * 80
          };
        });

        await set(sessionRef, {
          gameId: game.id,
          players: playersObj,
          host: selectedPlayers[0],
          status: 'playing',
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

    console.log(`[Matchmaker] subscribing to session ${roomId}`);

    this.unsubscribeSession = onValue(sessionRef, (snapshot) => {
      const session = snapshot.val();
      if (!session) { this.cleanup(); return; }

      console.log('[Matchmaker] session updated:', session);

      if (session.status === 'playing' && this.currentIframe) {
        this.sendToIframe({
          type: 'state_update',
          gameState: session.gameState || {},
          players: session.players || {}
        });

        if (session.gameState && session.gameState.winner) {
          this.endGame(roomId, session.gameState.winner);
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

      console.log('[Matchmaker] received from iframe:', data.type);

      if (data.type === 'iframe_ready') {
        const sessionSnapshot = await get(sessionRef);
        const sessionData = sessionSnapshot.val() || {};
        this.sendToIframe({
          type: 'init',
          roomId, userId: this.userId, nickname,
          gameState: sessionData.gameState || {},
          players: sessionData.players || {}
        });
      }
      else if (data.type === 'player_action') {
        await this.handlePlayerAction(roomId, this.userId, data);
      }
      else if (data.type === 'game_over') {
        this.endGame(roomId, data.winner);
      }
      // IGNORE state_update from client – server is the only source of truth
    };
    window.addEventListener('message', this.iframeMessageHandler);

    const url = this.gameLauncher.getGameUrl(game);
    if (url) {
      iframeEl.src = url;
      iframeEl.onload = () => { if (game.htmlContent) URL.revokeObjectURL(url); };
    } else {
      this.ui.showToast('Не удалось загрузить игру', 'error');
      this.cleanup();
      return;
    }
    container.style.display = 'flex';
  }

  sendToIframe(data) {
    if (this.currentIframe?.contentWindow) {
      this.currentIframe.contentWindow.postMessage(data, '*');
    }
  }

  async handlePlayerAction(roomId, userId, data) {
    if (!roomId || !userId) return;
    const gameStateRef = ref(this.rtdb, `gameSessions/${roomId}/gameState`);

    try {
      if (data.action === 'move') {
        const updates = {};
        if (data.px !== undefined) {
          updates[`players/${userId}/px`] = data.px;
          updates[`players/${userId}/py`] = data.py;
          updates[`players/${userId}/angle`] = data.angle;
        } else if (data.x !== undefined) {
          updates[`players/${userId}/x`] = data.x;
          updates[`players/${userId}/y`] = data.y;
        }
        if (Object.keys(updates).length > 0) {
          await update(gameStateRef, updates);
          console.log('[Matchmaker] updated move:', updates);
        }
      }
      else if (data.action === 'shoot') {
        // ... (можно оставить как было)
      }
      else if (data.action === 'click') {
        const scoreRef = child(gameStateRef, userId);
        await runTransaction(scoreRef, (current) => (current || 0) + 1);
      }
    } catch (error) {
      console.error('[Matchmaker] error handling action:', error);
    }
  }

  async endGame(roomId, winnerId) {
    if (!roomId) return;
    const sessionRef = ref(this.rtdb, `gameSessions/${roomId}`);
    await update(sessionRef, { status: 'ended', 'gameState/winner': winnerId });
    this.sendToIframe({ type: 'game_over', winner: winnerId });
    setTimeout(() => remove(sessionRef), 5000);
    if (winnerId === this.userId) {
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
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
  }
}
