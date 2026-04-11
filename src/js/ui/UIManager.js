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
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>
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
  <script>
    const firebaseConfig = {
      apiKey: "AIzaSyADQHyaiHrnCzk-IsrgZguP1Sl6eRqo9pc",
      authDomain: "minigames-fb308.firebaseapp.com",
      projectId: "minigames-fb308",
      databaseURL: "https://minigames-fb308-default-rtdb.firebaseio.com",
      storageBucket: "minigames-fb308.firebasestorage.app",
      messagingSenderId: "73826070494",
      appId: "1:73826070494:web:23dd86d36861af4190f74f"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    const roomId = '__ROOM_ID__';
    const userId = '__USER_ID__';
    const nickname = '__NICKNAME__';

    document.getElementById('roomId').textContent = roomId || 'неизвестно';
    document.getElementById('playerName').textContent = nickname;

    if (!roomId || !userId) {
      document.body.innerHTML = '<h2>Ошибка: нет данных комнаты</h2>';
      throw new Error('No roomId');
    }

    const sessionRef = db.ref('gameSessions/' + roomId);
    const myPlayerRef = sessionRef.child('players/' + userId);
    const gameStateRef = sessionRef.child('gameState');

    let myScore = 0;
    let opponentId = null;
    let gameEnded = false;

    const clickBtn = document.getElementById('clickBtn');
    const myScoreSpan = document.getElementById('myScore');
    const opponentScoreSpan = document.getElementById('opponentScore');
    const opponentNameSpan = document.getElementById('opponentName');
    const winnerMsg = document.getElementById('winnerMessage');

    myPlayerRef.update({ ready: true, score: 0 });

    sessionRef.on('value', (snapshot) => {
      const session = snapshot.val();
      if (!session) return;
      const players = session.players || {};
      const gameState = session.gameState || {};
      const ids = Object.keys(players);
      opponentId = ids.find(id => id !== userId);
      if (opponentId) {
        opponentNameSpan.textContent = players[opponentId].nickname || 'Соперник';
        opponentScoreSpan.textContent = gameState[opponentId] || 0;
      }
      myScore = gameState[userId] || 0;
      myScoreSpan.textContent = myScore;
      if (!gameEnded) {
        if (myScore >= 5) {
          winnerMsg.textContent = '🎉 Вы победили!';
          clickBtn.disabled = true;
          gameEnded = true;
          window.parent.postMessage({ type: 'game_over', winner: userId }, '*');
        } else if (gameState[opponentId] >= 5) {
          winnerMsg.textContent = '😵 Вы проиграли...';
          clickBtn.disabled = true;
          gameEnded = true;
          window.parent.postMessage({ type: 'game_over', winner: opponentId }, '*');
        }
      }
    });

    clickBtn.addEventListener('click', () => {
      if (gameEnded) return;
      gameStateRef.child(userId).set(myScore + 1);
    });
  </script>
</body>
</html>`;
