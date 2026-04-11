// Вставьте этот код в ensureDemoGameExists после добавления одиночного демо

// Демо для 2 игроков
if (!this.currentGames.some(g => g.id === 'local_demo_2p')) {
  const demo2pHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { background: #1a1a2e; color: white; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; }
    button { padding: 20px 40px; font-size: 28px; background: #6C5CE7; border: none; border-radius: 50px; color: white; cursor: pointer; margin: 10px; }
    button:disabled { background: #555; cursor: not-allowed; }
    .score { font-size: 48px; margin: 20px; }
    .opponent { opacity: 0.8; }
  </style>
</head>
<body>
  <h1>⚔️ Дуэль кликеров</h1>
  <p>Комната: <span id="roomId"></span></p>
  <p>Вы: <span id="playerName"></span></p>
  <div class="score">Ваши очки: <span id="myScore">0</span></div>
  <button id="clickBtn">КЛИК!</button>
  <div class="opponent">
    <p>Соперник: <span id="opponentName">ожидание...</span></p>
    <div class="score">Очки соперника: <span id="opponentScore">0</span></div>
  </div>
  <div id="winnerMessage" style="font-size: 24px; margin-top: 20px;"></div>

  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
    import { getDatabase, ref, set, onValue, update, get, child } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
    
    const firebaseConfig = {
      apiKey: "AIzaSyADQHyaiHrnCzk-IsrgZguP1Sl6eRqo9pc",
      authDomain: "minigames-fb308.firebaseapp.com",
      projectId: "minigames-fb308",
      storageBucket: "minigames-fb308.firebasestorage.app",
      messagingSenderId: "73826070494",
      appId: "1:73826070494:web:23dd86d36861af4190f74f"
    };
    
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    
    // Получаем roomId из параметра URL (будет добавлен Matchmaker'ом)
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('roomId');
    const userId = urlParams.get('userId');
    const nickname = urlParams.get('nickname');
    
    document.getElementById('roomId').textContent = roomId || 'неизвестно';
    document.getElementById('playerName').textContent = nickname || 'Вы';
    
    if (!roomId || !userId) {
      document.body.innerHTML = '<h2>Ошибка: нет данных комнаты</h2>';
      throw new Error('No roomId');
    }
    
    const sessionRef = ref(db, 'gameSessions/' + roomId);
    const myPlayerRef = child(sessionRef, 'players/' + userId);
    const gameStateRef = child(sessionRef, 'gameState');
    
    let myScore = 0;
    let opponentId = null;
    let opponentScore = 0;
    let gameEnded = false;
    
    const clickBtn = document.getElementById('clickBtn');
    const myScoreSpan = document.getElementById('myScore');
    const opponentScoreSpan = document.getElementById('opponentScore');
    const opponentNameSpan = document.getElementById('opponentName');
    const winnerMsg = document.getElementById('winnerMessage');
    
    // Отмечаем готовность
    update(myPlayerRef, { ready: true, score: 0 });
    
    // Слушаем изменения в сессии
    onValue(sessionRef, (snapshot) => {
      const session = snapshot.val();
      if (!session) return;
      
      const players = session.players || {};
      const gameState = session.gameState || {};
      
      // Находим соперника
      const ids = Object.keys(players);
      opponentId = ids.find(id => id !== userId);
      
      if (opponentId) {
        opponentNameSpan.textContent = players[opponentId].nickname || 'Соперник';
        opponentScore = gameState[opponentId] || 0;
        opponentScoreSpan.textContent = opponentScore;
      }
      
      myScore = gameState[userId] || 0;
      myScoreSpan.textContent = myScore;
      
      // Проверка на победу
      if (!gameEnded) {
        if (myScore >= 5) {
          winnerMsg.textContent = '🎉 Вы победили!';
          clickBtn.disabled = true;
          gameEnded = true;
          // Сообщаем родительскому окну о завершении
          window.parent.postMessage({ type: 'game_over', winner: userId }, '*');
        } else if (opponentScore >= 5) {
          winnerMsg.textContent = '😵 Вы проиграли...';
          clickBtn.disabled = true;
          gameEnded = true;
          window.parent.postMessage({ type: 'game_over', winner: opponentId }, '*');
        }
      }
    });
    
    clickBtn.addEventListener('click', () => {
      if (gameEnded) return;
      const newScore = myScore + 1;
      update(gameStateRef, { [userId]: newScore });
    });
  </script>
</body>
</html>`;

  const blob = new Blob([demo2pHtml], { type: 'text/html' });
  const demo2pUrl = URL.createObjectURL(blob);
  
  const demoGame2p = {
    id: 'local_demo_2p',
    title: '⚔️ Дуэль кликеров (2 игрока)',
    authorNickname: 'BIBLIX',
    players: 2,
    avatarUrl: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Crect width=\'200\' height=\'200\' fill=\'%23e74c3c\'/%3E%3Ctext x=\'100\' y=\'120\' font-size=\'50\' fill=\'white\' text-anchor=\'middle\' font-family=\'Arial\'%3E⚔️%3C/text%3E%3C/svg%3E',
    htmlContent: demo2pHtml, // сохраняем как текст, чтобы работал getGameUrl
    likes: 0,
    dislikes: 0,
    createdAt: new Date()
  };
  
  this.currentGames.push(demoGame2p);
}
