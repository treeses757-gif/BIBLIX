// ========== FILE: src/js/matchmaking/Matchmaker.js ==========
import { ref, set, onValue, get, child, update, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class Matchmaker {
  constructor(rtdb, db, auth) {
    this.rtdb = rtdb;
    this.db = db;
    this.auth = auth;
    this.ui = null;
    this.currentGame = null;
    this.roomId = null;
    this.queueRef = null;
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
    
    // Слушаем очередь
    const queueListRef = ref(this.rtdb, `matchmaking/${game.id}/queue`);
    this.unsubscribeQueue = onValue(queueListRef, async (snapshot) => {
      const queue = snapshot.val() || {};
      const players = Object.keys(queue);
      document.getElementById('queue-status').textContent = `В очереди: ${players.length}/${game.players}`;
      
      if (players.length >= game.players) {
        // Формируем комнату
        const selectedPlayers = players.slice(0, game.players);
        const roomId = `${game.id}_${Date.now()}`;
        this.roomId = roomId;
        
        // Удаляем из очереди выбранных
        const updates = {};
        selectedPlayers.forEach(pid => updates[`matchmaking/${game.id}/queue/${pid}`] = null);
        await update(ref(this.rtdb), updates);
        
        // Создаём сессию
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
          createdAt: serverTimestamp()
        });
        
        // Отписываемся от очереди
        if (this.unsubscribeQueue) this.unsubscribeQueue();
        this.unsubscribeQueue = null;
        
        // Ждём готовности
        this.waitForGameStart(roomId, game);
      }
    });
    
    // Кнопка отмены
    document.getElementById('cancel-matchmaking').onclick = () => this.cancelMatchmaking();
  }
  
  waitForGameStart(roomId, game) {
    const sessionRef = ref(this.rtdb, `gameSessions/${roomId}`);
    const user = this.auth.currentUser;
    
    // Отмечаем готовность при загрузке iframe
    const iframe = document.getElementById('game-iframe');
    iframe.onload = () => {
      update(child(sessionRef, `players/${user.id}`), { ready: true });
    };
    
    onValue(sessionRef, async (snapshot) => {
      const session = snapshot.val();
      if (!session) return;
      
      if (session.status === 'playing') {
        // Игра уже идёт
        return;
      }
      
      // Проверяем, все ли готовы
      const players = session.players;
      const allReady = Object.values(players).every(p => p.ready);
      
      if (allReady && session.status === 'waiting') {
        // Запускаем игру
        await update(sessionRef, { status: 'playing' });
        this.launchMultiplayerGame(game, roomId);
      }
    });
    
    // Загружаем игру в iframe
    this.ui.hideGameContainer(); // скрываем текущий контейнер если был
    const container = document.getElementById('game-container');
    const iframeEl = document.getElementById('game-iframe');
    document.getElementById('game-title-display').textContent = game.title;
    iframeEl.src = game.htmlUrl;
    container.style.display = 'flex';
    
    // Закрываем модалку матчмейкинга
    this.hideMatchmakingModal();
  }
  
  launchMultiplayerGame(game, roomId) {
    // Упрощённая версия: игра просто загружена, синхронизация через postMessage
    // В реальном приложении здесь настройка событий RTDB
    console.log('Multiplayer game started', roomId);
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