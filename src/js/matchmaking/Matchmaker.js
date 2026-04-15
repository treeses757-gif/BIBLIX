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

    this.unsubscribeSession = onValue(sessionRef, async (snapshot) => {
      const session = snapshot.val();
      if (!session) { this.cleanup(); return; }

      if (session.status === 'playing' && this.currentIframe) {
        this.sendToIframe({
          type: 'state_update',
          gameState: session.gameState || {},
          players: session.players
        });

        if (session.gameState && session.gameState.winner) {
          await this.endGame(roomId, session.gameState.winner);
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
        this.handlePlayerAction(roomId, this.userId, data);
      }
      else if (data.type === 'state_update') {
        if (data.gameState) {
          await update(ref(this.rtdb, `gameSessions/${roomId}`), { gameState: data.gameState });
        }
      }
      else if (data.type === 'game_over') {
        this.endGame(roomId, data.winner);
      }
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

    if (data.action === 'move') {
      const updates = {};
      updates[`gameSessions/${roomId}/gameState/players/${userId}/px`] = data.px;
      updates[`gameSessions/${roomId}/gameState/players/${userId}/py`] = data.py;
      updates[`gameSessions/${roomId}/gameState/players/${userId}/angle`] = data.angle;
      await update(ref(this.rtdb), updates);
    }
    else if (data.action === 'shoot') {
      const gameStateRef = ref(this.rtdb, `gameSessions/${roomId}/gameState`);
      const snap = await get(gameStateRef);
      const gameState = snap.val() || { players: {}, bullets: [] };
      const player = gameState.players?.[userId];
      if (!player || player.ammo <= 0) return;

      const newAmmo = player.ammo - 1;
      const angle = player.angle || 0;
      const barrelLength = 24;
      const spawnX = player.px + Math.cos(angle) * barrelLength;
      const spawnY = player.py + Math.sin(angle) * barrelLength;
      const BULLET_SPEED = 6;
      const vx = Math.cos(angle) * BULLET_SPEED;
      const vy = Math.sin(angle) * BULLET_SPEED;

      const bullet = {
        id: Date.now() + '_' + Math.random(),
        x: spawnX, y: spawnY,
        vx, vy,
        owner: userId,
      };

      const bullets = gameState.bullets || [];
      bullets.push(bullet);
      if (bullets.length > 50) bullets.shift();

      const updates = {};
      updates[`gameSessions/${roomId}/gameState/players/${userId}/ammo`] = newAmmo;
      updates[`gameSessions/${roomId}/gameState/bullets`] = bullets;
      await update(ref(this.rtdb), updates);
    }
    else if (data.action === 'click') {
      const scoreRef = ref(this.rtdb, `gameSessions/${roomId}/gameState/${userId}`);
      await runTransaction(scoreRef, (currentScore) => (currentScore || 0) + 1);
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
