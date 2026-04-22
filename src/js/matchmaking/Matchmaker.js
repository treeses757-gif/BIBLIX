// src/js/matchmaking/Matchmaker.js
import { ref, set, onValue, update, remove, serverTimestamp, runTransaction, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// Константы танчиков
const TILE_SIZE = 40;
const MAP_WIDTH = 31;
const MAP_HEIGHT = 21;
const BULLET_SPEED = 6;

function generateMap() {
  let m = Array(MAP_HEIGHT).fill().map(() => Array(MAP_WIDTH).fill(0));
  for (let x = 0; x < MAP_WIDTH; x++) { m[0][x] = 1; m[MAP_HEIGHT-1][x] = 1; }
  for (let y = 0; y < MAP_HEIGHT; y++) { m[y][0] = 1; m[y][MAP_WIDTH-1] = 1; }
  const brickCount = 80 + Math.floor(Math.random() * 60);
  for (let i = 0; i < brickCount; i++) {
    let x = Math.floor(Math.random() * (MAP_WIDTH-2)) + 1;
    let y = Math.floor(Math.random() * (MAP_HEIGHT-2)) + 1;
    if ((x===4 && y===4) || (x===5 && y===4) || (x===4 && y===5)) continue;
    if ((x===MAP_WIDTH-5 && y===MAP_HEIGHT-5) || (x===MAP_WIDTH-6 && y===MAP_HEIGHT-5)) continue;
    if ((x===MAP_WIDTH-5 && y===4) || (x===MAP_WIDTH-6 && y===4)) continue;
    m[y][x] = 1;
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    let nx = 4+dx, ny = 4+dy; if (nx>=1 && nx<MAP_WIDTH-1 && ny>=1 && ny<MAP_HEIGHT-1) m[ny][nx] = 0;
    nx = MAP_WIDTH-5+dx; ny = MAP_HEIGHT-5+dy; if (nx>=1 && nx<MAP_WIDTH-1 && ny>=1 && ny<MAP_HEIGHT-1) m[ny][nx] = 0;
    nx = MAP_WIDTH-5+dx; ny = 4+dy; if (nx>=1 && nx<MAP_WIDTH-1 && ny>=1 && ny<MAP_HEIGHT-1) m[ny][nx] = 0;
  }
  return m;
}

function tileAtPixel(px, py, map) {
  if (!map) return 1;
  const tx = Math.floor(px / TILE_SIZE);
  const ty = Math.floor(py / TILE_SIZE);
  if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return 1;
  return map[ty][tx];
}

function canMoveTo(px, py, map, players, excludeId) {
  const half = TILE_SIZE/2 - 2;
  const corners = [[px-half, py-half], [px+half, py-half], [px-half, py+half], [px+half, py+half]];
  for (let c of corners) if (tileAtPixel(c[0], c[1], map) === 1) return false;
  for (let id in players) {
    if (id === excludeId) continue;
    const o = players[id];
    if (Math.hypot(px - o.px, py - o.py) < TILE_SIZE) return false;
  }
  return true;
}

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
    this.gameLoopInterval = null;
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

        const isClicker = game.id.includes('clicker') || (game.localPath && game.localPath.includes('clicker'));
        const isSquare = game.id.includes('square') || (game.localPath && game.localPath.includes('square'));
        const isTanks = game.id.includes('tanks') || (game.localPath && game.localPath.includes('tanks'));

        let initialGameState;
        if (isClicker) {
          initialGameState = {};
          selectedPlayers.forEach(pid => { initialGameState[pid] = 0; });
        } else {
          initialGameState = { players: {}, bullets: [], map: null, winner: null };
          if (isTanks) {
            initialGameState.map = generateMap();
            Object.keys(playersObj).forEach((pid, idx) => {
              let sx, sy;
              if (idx === 0) { sx = 4 * TILE_SIZE + TILE_SIZE/2; sy = 4 * TILE_SIZE + TILE_SIZE/2; }
              else if (idx === 1) { sx = (MAP_WIDTH-5) * TILE_SIZE + TILE_SIZE/2; sy = (MAP_HEIGHT-5) * TILE_SIZE + TILE_SIZE/2; }
              else { sx = (MAP_WIDTH-5) * TILE_SIZE + TILE_SIZE/2; sy = 4 * TILE_SIZE + TILE_SIZE/2; }
              initialGameState.players[pid] = {
                px: sx, py: sy, angle: 0,
                lives: 3, ammo: 5,
                colorIndex: idx
              };
            });
          } else if (isSquare) {
            Object.keys(playersObj).forEach((pid, idx) => {
              initialGameState.players[pid] = { x: 200 + idx * 100, y: 200 + idx * 80 };
            });
          }
        }

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
    const isTanks = game.id.includes('tanks') || (game.localPath && game.localPath.includes('tanks'));

    this.unsubscribeSession = onValue(sessionRef, (snapshot) => {
      const session = snapshot.val();
      if (!session) { this.cleanup(); return; }

      this.sendToIframe({
        type: 'state_update',
        gameState: session.gameState || {},
        players: session.players
      });

      const gs = session.gameState;
      if (gs && !gs.players) {
        for (const [uid, score] of Object.entries(gs)) {
          if (score >= 5) {
            this.endGame(roomId, uid);
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
        const sessionSnapshot = await get(sessionRef);
        const sessionData = sessionSnapshot.val() || {};
        this.sendToIframe({
          type: 'init',
          roomId, userId: this.userId, nickname,
          gameState: sessionData.gameState || {},
          players: sessionData.players || {}
        });
        if (isTanks) this.startGameLoop(roomId);
      }
      else if (data.type === 'player_update') {
        if (data.playerState) {
          const updates = {};
          updates[`gameSessions/${roomId}/gameState/players/${this.userId}`] = data.playerState;
          await update(ref(this.rtdb), updates);
        }
      }
      else if (data.type === 'player_action') {
        await this.handlePlayerAction(roomId, this.userId, data);
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

  startGameLoop(roomId) {
    if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);
    this.gameLoopInterval = setInterval(async () => {
      await this.updateBullets(roomId);
    }, 1000 / 30); // 30 fps
  }

  async updateBullets(roomId) {
    const gameStateRef = ref(this.rtdb, `gameSessions/${roomId}/gameState`);
    const snap = await get(gameStateRef);
    const gs = snap.val();
    if (!gs || !gs.bullets) return;

    const bullets = gs.bullets;
    const players = gs.players;
    const map = gs.map;
    const newBullets = [];
    const playersToUpdate = {};

    for (const b of bullets) {
      let nx = b.x + b.vx;
      let ny = b.y + b.vy;
      let hit = false;

      // Проверка стены
      if (tileAtPixel(nx, ny, map) === 1) {
        hit = true;
      } else {
        // Проверка попадания в танк
        for (let id in players) {
          if (id === b.owner) continue;
          const p = players[id];
          if (!p || p.lives <= 0) continue;
          if (Math.hypot(nx - p.px, ny - p.py) < TILE_SIZE/2) {
            playersToUpdate[id] = (playersToUpdate[id] || p.lives) - 1;
            hit = true;
            break;
          }
        }
      }

      if (!hit) {
        newBullets.push({ ...b, x: nx, y: ny });
      }
    }

    // Ограничение количества пуль
    const finalBullets = newBullets.slice(-50);

    // Применяем урон
    for (let id in playersToUpdate) {
      const newLives = Math.max(0, playersToUpdate[id]);
      await update(ref(this.rtdb), {
        [`gameSessions/${roomId}/gameState/players/${id}/lives`]: newLives
      });
      if (newLives <= 0) {
        // Определяем победителя (последний выживший)
        const alive = Object.entries(players).filter(([pid, p]) => p.lives > 0 && pid !== id);
        if (alive.length === 1) {
          this.endGame(roomId, alive[0][0]);
        }
      }
    }

    await update(ref(this.rtdb), {
      [`gameSessions/${roomId}/gameState/bullets`]: finalBullets
    });
  }

  sendToIframe(data) {
    if (this.currentIframe?.contentWindow) {
      this.currentIframe.contentWindow.postMessage(data, '*');
    }
  }

  async handlePlayerAction(roomId, userId, data) {
    const gameStateRef = ref(this.rtdb, `gameSessions/${roomId}/gameState`);
    const snap = await get(gameStateRef);
    const gs = snap.val() || { players: {}, bullets: [], map: null };
    const player = gs.players[userId];
    if (!player || player.lives <= 0) return;

    if (data.action === 'move') {
      // Клиент отправляет предполагаемые координаты, сервер проверяет
      let nx = data.px, ny = data.py;
      if (canMoveTo(nx, ny, gs.map, gs.players, userId)) {
        const updates = {};
        updates[`gameSessions/${roomId}/gameState/players/${userId}/px`] = nx;
        updates[`gameSessions/${roomId}/gameState/players/${userId}/py`] = ny;
        updates[`gameSessions/${roomId}/gameState/players/${userId}/angle`] = data.angle;
        await update(ref(this.rtdb), updates);
      } else {
        // Если нельзя, просто обновляем угол
        await update(ref(this.rtdb), {
          [`gameSessions/${roomId}/gameState/players/${userId}/angle`]: data.angle
        });
      }
    }
    else if (data.action === 'shoot') {
      if (player.ammo <= 0) return;
      const newAmmo = player.ammo - 1;
      const angle = player.angle || 0;
      const barrelLength = 24;
      const spawnX = player.px + Math.cos(angle) * barrelLength;
      const spawnY = player.py + Math.sin(angle) * barrelLength;
      const vx = Math.cos(angle) * BULLET_SPEED;
      const vy = Math.sin(angle) * BULLET_SPEED;

      const bullet = {
        id: Date.now() + '_' + Math.random(),
        x: spawnX, y: spawnY,
        vx, vy,
        owner: userId,
      };

      const bullets = gs.bullets || [];
      bullets.push(bullet);
      if (bullets.length > 50) bullets.shift();

      await update(ref(this.rtdb), {
        [`gameSessions/${roomId}/gameState/players/${userId}/ammo`]: newAmmo,
        [`gameSessions/${roomId}/gameState/bullets`]: bullets
      });
    }
    else if (data.action === 'click') {
      const scoreRef = ref(this.rtdb, `gameSessions/${roomId}/gameState/${userId}`);
      await runTransaction(scoreRef, (current) => (current || 0) + 1);
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
    if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);
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
