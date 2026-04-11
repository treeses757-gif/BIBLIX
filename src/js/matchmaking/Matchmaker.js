import { ref, set, onValue, update, remove, serverTimestamp, child, get, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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
    this.messageHandler = null;
  }

  setUI(ui) { this.ui = ui; }

  startMatchmaking(game) {
    this.currentGame = game;
    const user = this.auth.currentUser;
    if (!user) return;

    this.showMatchmakingModal();
    this.startTimer();

    const queueRef = ref(this.rtdb, `matchmaking/${game.id}/queue/${user.id}`);
    set(queueRef, {
      nickname: user.nickname,
      timestamp: serverTimestamp()
    });

    const queueListRef = ref(this.rtdb, `matchmaking/${game.id}/queue`);
    this.unsubscribeQueue = onValue(queueListRef, async (snapshot) => {
      const queue = snapshot.val() || {};
      const players = Object.keys(queue);
      document.getElementById('queue-status').textContent = `В очереди: ${players.length}/${game.players}`;

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
          playersObj[pid] = { nickname: queue[pid].nickname, ready: false };
        });

        await set(sessionRef, {
          gameId: game.id,
          players: playersObj,
          host: selectedPlayers[0],
          status: 'waiting',
          gameState: {},
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
    const user = this.auth.currentUser;

    this.ui.hideGameContainer();
    const container = document.getElementById('game-container');
    const iframe = document.getElementById('game-iframe');
    document.getElementById('game-title-display').textContent = game.title;

    const url = this.gameLauncher.getGameUrl(game);
    if (!url) {
      this.ui.showToast('Не удалось загрузить игру', 'error');
      this.hideMatchmakingModal();
      return;
    }
    iframe.src = url;
    container.style.display = 'flex';

    const messageHandler = (event) => {
      if (event.data && event.data.type === 'iframe_ready') {
        iframe.contentWindow.postMessage({
          type: 'init',
          roomId,
          nickname: user.nickname
        }, '*');
        update(child(sessionRef, `players/${user.id}`), { ready: true });
        window.removeEventListener('message', messageHandler);
      }
    };
    window.addEventListener('message', messageHandler);
    this.messageHandler = messageHandler;

    this.unsubscribeSession = onValue(sessionRef, async (snapshot) => {
      const session = snapshot.val();
      if (!session) return;
      
      const players = session.players || {};
      const gameState = session.gameState || {};
      const opponentId = Object.keys(players).find(id => id !== user.id);
      
      // Победитель уже определён
      if (gameState.winner) {
        if (gameState.winner === user.id) {
          iframe.contentWindow.postMessage({ type: 'game_over', winner: 'me' }, '*');
        } else {
          iframe.contentWindow.postMessage({ type: 'game_over', winner: 'opponent' }, '*');
        }
        return;
      }

      // Отправка текущего состояния
      iframe.contentWindow.postMessage({
        type: 'state_update',
        myScore: gameState[user.id] || 0,
        opponentScore: gameState[opponentId] || 0,
        opponentName: players[opponentId]?.nickname || 'ожидание...'
      }, '*');

      const allReady = Object.values(players).every(p => p.ready);
      if (allReady && session.status === 'waiting') {
        await update(sessionRef, { status: 'playing' });
      }
    });

    // Обработчик кликов с атомарным инкрементом
    const clickHandler = (event) => {
      if (event.data && event.data.type === 'player_click') {
        const scoreRef = child(sessionRef, `gameState/${user.id}`);
        // Транзакция для атомарного увеличения
        runTransaction(scoreRef, (currentScore) => {
          return (currentScore || 0) + 1;
        }).then((result) => {
          if (result.committed) {
            const newScore = result.snapshot.val();
            // Проверка победы (5 очков)
            if (newScore >= 5) {
              update(sessionRef, { 'gameState/winner': user.id });
            }
          }
        });
      } else if (event.data && event.data.type === 'game_over_ack') {
        this.ui.hideGameContainer();
        this.cleanup();
      }
    };
    window.addEventListener('message', clickHandler);
    this.clickHandler = clickHandler;

    this.hideMatchmakingModal();
  }

  cancelMatchmaking() {
    if (this.unsubscribeQueue) this.unsubscribeQueue();
    if (this.currentGame) {
      const user = this.auth.currentUser;
      remove(ref(this.rtdb, `matchmaking/${this.currentGame.id}/queue/${user.id}`));
    }
    this.cleanup();
  }

  cleanup() {
    if (this.unsubscribeQueue) {
      this.unsubscribeQueue();
      this.unsubscribeQueue = null;
    }
    if (this.unsubscribeSession) {
      this.unsubscribeSession();
      this.unsubscribeSession = null;
    }
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    if (this.clickHandler) {
      window.removeEventListener('message', this.clickHandler);
      this.clickHandler = null;
    }
    this.stopTimer();
    this.hideMatchmakingModal();
  }

  showMatchmakingModal() {
    document.getElementById('matchmaking-modal').style.display = 'flex';
  }

  hideMatchmakingModal() {
    document.getElementById('matchmaking-modal').style.display = 'none';
  }

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
    if (this.timerInterval) clearInterval(this.timerInterval);
  }
}
