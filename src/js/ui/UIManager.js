const demo2pHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { background: #1a1a2e; color: white; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; }
    button { padding: 20px 40px; font-size: 28px; background: #6C5CE7; border: none; border-radius: 50px; color: white; cursor: pointer; margin: 10px; }
    button:disabled { background: #555; cursor: not-allowed; }
    .score { font-size: 48px; margin: 20px; }
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
  <script>
    let clickBtn = document.getElementById('clickBtn');
    let myScoreSpan = document.getElementById('myScore');
    let opponentScoreSpan = document.getElementById('opponentScore');
    let opponentNameSpan = document.getElementById('opponentName');
    let winnerMsg = document.getElementById('winnerMessage');
    let roomIdSpan = document.getElementById('roomId');
    let playerNameSpan = document.getElementById('playerName');

    let gameActive = true;

    clickBtn.addEventListener('click', () => {
      if (!gameActive) return;
      window.parent.postMessage({ type: 'player_click' }, '*');
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'init') {
        roomIdSpan.textContent = msg.roomId || '';
        playerNameSpan.textContent = msg.nickname || '';
      } else if (msg.type === 'state_update') {
        // Просто отображаем то, что пришло с сервера (абсолютная истина)
        myScoreSpan.textContent = msg.myScore;
        opponentScoreSpan.textContent = msg.opponentScore;
        opponentNameSpan.textContent = msg.opponentName || 'ожидание...';
      } else if (msg.type === 'game_over') {
        gameActive = false;
        clickBtn.disabled = true;
        if (msg.winner === 'me') {
          winnerMsg.textContent = '🎉 Вы победили!';
        } else {
          winnerMsg.textContent = '😵 Вы проиграли...';
        }
        window.parent.postMessage({ type: 'game_over_ack' }, '*');
      }
    });

    window.parent.postMessage({ type: 'iframe_ready' }, '*');
  </script>
</body>
</html>`;
