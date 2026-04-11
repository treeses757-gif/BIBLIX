import { ref, set, onValue, update, remove, serverTimestamp, child } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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
    this.timerInterval = null;
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

    const iframe = document.getElementById('game-iframe');
    iframe.onload = () => {
      update(child(sessionRef, `players/${user.id}`), { ready: true });
    };

    onValue(sessionRef, async (snapshot) => {
      const session = snapshot.val();
      if (!session) return;
      if (session.status === 'playing') return;

      const players = session.players;
      const allReady = Object.values(players).every(p => p.ready);

      if (allReady && session.status === 'waiting') {
        await update(sessionRef, { status: 'playing' });
      }
    });

    this.ui.hideGameContainer();
    const container = document.getElementById('game-container');
    const iframeEl = document.getElementById('game-iframe');
    document.getElementById('game-title-display').textContent = game.title;

    // Специальная обработка для демо-игры на 2 игроков
    if (game.id === 'local_demo_2p' && game.htmlContent) {
      // Внедряем параметры в HTML-код
      const finalHtml = game.htmlContent
        .replace('roomId = urlParams.get(\'roomId\')', `roomId = '${roomId}'`)
        .replace('userId = urlParams.get(\'userId\')', `userId = '${user.id}'`)
        .replace('nickname = urlParams.get(\'nickname\')', `nickname = '${user.nickname}'`)
        // Для совместимости с тем, как написано в демо (там используется urlParams)
        .replace('const urlParams = new URLSearchParams(window.location.search);', '')
        .replace('const roomId = urlParams.get(\'roomId\');', `const roomId = '${roomId}';`)
        .replace('const userId = urlParams.get(\'userId\');', `const userId = '${user.id}';`)
        .replace('const nickname = urlParams.get(\'nickname\') || \'Игрок\';', `const nickname = '${user.nickname}';`);

      const blob = new Blob([finalHtml], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      iframeEl.src = blobUrl;
      iframeEl.onload = () => URL.revokeObjectURL(blobUrl);
    } else {
      // Обычные игры (пользовательские) — загружаем через getGameUrl
      const url = this.gameLauncher.getGameUrl(game);
      if (url) {
        iframeEl.src = url;
        iframeEl.onload = () => {
          if (game.htmlContent) URL.revokeObjectURL(url);
        };
      } else {
        this.ui.showToast('Не удалось загрузить игру', 'error');
        this.hideMatchmakingModal();
        return;
      }
    }

    container.style.display = 'flex';
    this.hideMatchmakingModal();
  }

  cancelMatchmaking() {
    if (this.unsubscribeQueue) this.unsubscribeQueue();
    if (this.currentGame) {
      const user = this.auth.currentUser;
      remove(ref(this.rtdb, `matchmaking/${this.currentGame.id}/queue/${user.id}`));
    }
    this.hideMatchmakingModal();
    this.stopTimer();
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
