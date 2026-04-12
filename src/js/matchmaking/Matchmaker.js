import { ref, set, onValue, update, remove, serverTimestamp, runTransaction, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

export class Matchmaker {
  constructor(rtdb, db, auth, gameLauncher) {
    this.rtdb = rtdb;
    this.db = db;
    this.auth = auth;
    this.gameLauncher = gameLauncher;
    this.ui = null;
    // ... остальные поля ...
  }

  async startMatchmaking(game) {
    this.currentGame = game;
    const user = this.auth.currentUser;
    if (!user) {
      this.ui.showToast('Войдите в аккаунт', 'error');
      return;
    }

    // Убедимся, что у пользователя есть uid (от Firebase Auth)
    let userId = user.id;
    if (!userId) {
      // Если нет, попробуем получить из auth.currentUser
      const firebaseUser = this.auth.auth.currentUser;
      userId = firebaseUser ? firebaseUser.uid : null;
    }
    if (!userId) {
      this.ui.showToast('Ошибка идентификации', 'error');
      return;
    }
    this.userId = userId;
    
    this.showMatchmakingModal();
    this.startTimer();

    const queueRef = ref(this.rtdb, `matchmaking/${game.id}/queue/${userId}`);
    await set(queueRef, {
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

        // Удаляем игроков из очереди
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

  // ... waitForGameStart и другие методы остаются похожими, но нужно использовать this.userId ...
  
  async waitForGameStart(roomId, game) {
    // ... подписка на сессию ...
    const user = this.auth.currentUser;
    const userId = this.userId; // используем сохранённый

    // В sendToIframe нужно передавать правильный userId
    this.sendToIframe({
      type: 'init',
      roomId: roomId,
      userId: userId,          // теперь это настоящий uid
      nickname: user.nickname,
      gameState: sessionData.gameState || {},
      players: sessionData.players || {}
    });
    // ...
  }

  // ... остальные методы без существенных изменений ...
}
