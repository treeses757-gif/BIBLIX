import { 
  collection, getDocs, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class UIManager {
  constructor() {
    this.db = window.db;
    this.storage = window.storage;
    this.authManager = null;
    this.shopManager = null;
    this.uploadManager = null;
    this.gameLauncher = null;
    this.matchmaker = null;
    this.currentGames = [];
    this.filter = 'all';
    this.sort = 'newest';
    this.searchQuery = '';
    this.debounceTimer = null;
    
    this.bindEvents();
  }
  
  setAuthManager(auth) { this.authManager = auth; }
  setShopManager(shop) { this.shopManager = shop; }
  setUploadManager(upload) { this.uploadManager = upload; }
  setGameLauncher(launcher) { this.gameLauncher = launcher; }
  setMatchmaker(mm) { this.matchmaker = mm; }
  
  bindEvents() {
    document.getElementById('login-btn')?.addEventListener('click', () => this.showAuthModal('login'));
    document.getElementById('register-btn')?.addEventListener('click', () => this.showAuthModal('register'));
    document.getElementById('switch-to-register')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthModal('register');
    });
    document.getElementById('auth-form')?.addEventListener('submit', (e) => this.handleAuthSubmit(e));
    
    document.getElementById('create-game-btn')?.addEventListener('click', () => this.showCreateModal());
    document.getElementById('create-game-form')?.addEventListener('submit', (e) => this.handleCreateGame(e));
    document.getElementById('game-avatar')?.addEventListener('change', (e) => this.previewAvatar(e));
    document.getElementById('game-html')?.addEventListener('change', (e) => this.updateHtmlFilename(e));
    document.querySelectorAll('#create-game-form input, #create-game-form select').forEach(el => {
      el?.addEventListener('input', () => this.validateCreateForm());
    });
    
    document.getElementById('shop-btn')?.addEventListener('click', () => this.showShopModal());
    document.getElementById('inventory-btn')?.addEventListener('click', () => this.showInventoryModal());
    
    document.getElementById('logout-btn')?.addEventListener('click', () => this.authManager.logout());
    
    document.getElementById('search-input')?.addEventListener('input', (e) => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.searchQuery = e.target.value.toLowerCase();
        this.filterAndSortGames();
      }, 300);
    });
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filter = btn.dataset.filter;
        this.filterAndSortGames();
      });
    });
    
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.sort = e.target.value;
      this.filterAndSortGames();
    });
    
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });
    
    document.getElementById('close-game-btn')?.addEventListener('click', () => {
      this.hideGameContainer();
    });
    
    document.getElementById('rate-like')?.addEventListener('click', () => this.submitRating(1));
    document.getElementById('rate-dislike')?.addEventListener('click', () => this.submitRating(-1));
  }
  
  showAuthModal(mode) {
    const modal = document.getElementById('auth-modal');
    const title = document.getElementById('auth-modal-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchLink = document.getElementById('switch-to-register');
    if (mode === 'login') {
      title.textContent = 'Вход';
      submitBtn.textContent = 'Войти';
      switchLink.textContent = 'Зарегистрироваться';
    } else {
      title.textContent = 'Регистрация';
      submitBtn.textContent = 'Зарегистрироваться';
      switchLink.textContent = 'Войти';
    }
    modal.style.display = 'flex';
    modal.dataset.mode = mode;
  }
  
  async handleAuthSubmit(e) {
    e.preventDefault();
    const nickname = document.getElementById('auth-nickname').value.trim();
    const password = document.getElementById('auth-password').value;
    const mode = document.getElementById('auth-modal').dataset.mode;
    
    try {
      if (mode === 'login') {
        await this.authManager.login(nickname, password);
      } else {
        await this.authManager.register(nickname, password);
      }
      this.closeAllModals();
      this.updateUserUI();
      this.loadGames();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }
  
  updateUserUI() {
    const user = this.authManager.currentUser;
    const guestBlock = document.getElementById('guest-buttons');
    const userPanel = document.getElementById('user-panel');
    
    if (user) {
      guestBlock.style.display = 'none';
      userPanel.style.display = 'flex';
      document.getElementById('user-balance').innerHTML = `💰 ${user.coins || 0}`;
      const avatar = document.getElementById('user-avatar');
      avatar.textContent = user.nickname.charAt(0).toUpperCase();
      this.applyAvatarSkin(avatar, user.currentSkin || 'default');
    } else {
      guestBlock.style.display = 'flex';
      userPanel.style.display = 'none';
    }
  }
  
  applyAvatarSkin(element, skinId) {
    element.className = 'user-avatar';
    if (skinId === 'gold') element.style.background = 'linear-gradient(145deg, #FFD700, #B8860B)';
    else if (skinId === 'neon') element.style.background = '#00FFFF', element.style.boxShadow = '0 0 15px #00FFFF';
    else if (skinId === 'cyberpunk') element.style.background = 'repeating-linear-gradient(45deg, #ff00ff, #00ffff 10px)';
    else element.style.background = '#6C5CE7';
  }
  
  async loadGames() {
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '<div class="loader">Загрузка игр...</div>';
    
    try {
      const gamesRef = collection(this.db, 'games');
      const q = query(gamesRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      this.currentGames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      this.currentGames = [];
      grid.innerHTML = '<div class="loader">Ошибка загрузки</div>';
      return;
    }
    
    await this.ensureDemoGameExists();
    this.filterAndSortGames();
  }
  
  filterAndSortGames() {
    let filtered = [...this.currentGames];
    
    if (this.filter !== 'all') {
      filtered = filtered.filter(g => g.players === parseInt(this.filter));
    }
    
    if (this.searchQuery) {
      filtered = filtered.filter(g => 
        g.title.toLowerCase().includes(this.searchQuery) || 
        g.authorNickname?.toLowerCase().includes(this.searchQuery)
      );
    }
    
    if (this.sort === 'newest') {
      filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } else {
      filtered.sort((a, b) => ((b.likes||0)-(b.dislikes||0)) - ((a.likes||0)-(a.dislikes||0)));
    }
    
    this.renderGames(filtered);
  }
  
  renderGames(games) {
    const grid = document.getElementById('games-grid');
    if (games.length === 0) {
      grid.innerHTML = '<div class="loader">Игры не найдены</div>';
      return;
    }
    
    grid.innerHTML = games.map(game => `
      <div class="game-card" data-game-id="${game.id}">
        <img class="game-avatar" src="${game.avatarUrl || 'https://via.placeholder.com/200'}" alt="${game.title}">
        <div class="game-title">${game.title}</div>
        <div class="game-author">от ${game.authorNickname}</div>
        <div class="game-meta">
          <span class="game-players">👤 ${game.players}</span>
          <span class="game-rating">👍 ${game.likes || 0} 👎 ${game.dislikes || 0}</span>
        </div>
        <button class="play-btn" data-game-id="${game.id}">Играть</button>
      </div>
    `).join('');
    
    document.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('play-btn')) {
          const btn = card.querySelector('.play-btn');
          if (btn) this.launchGame(btn.dataset.gameId);
        }
      });
    });
    
    document.querySelectorAll('.play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.launchGame(btn.dataset.gameId);
      });
    });
  }
  
  async launchGame(gameId) {
    const game = this.currentGames.find(g => g.id === gameId);
    if (!game) return;
    
    if (!this.authManager.currentUser) {
      this.showToast('Войдите, чтобы играть', 'error');
      this.showAuthModal('login');
      return;
    }
    
    if (game.players === 1) {
      this.gameLauncher.launchSinglePlayer(game);
    } else {
      this.matchmaker.startMatchmaking(game);
    }
  }
  
  showCreateModal() {
    if (!this.authManager.currentUser) {
      this.showToast('Войдите для создания игры', 'error');
      this.showAuthModal('login');
      return;
    }
    document.getElementById('create-modal').style.display = 'flex';
    this.validateCreateForm();
  }
  
  previewAvatar(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = document.getElementById('avatar-preview');
        img.src = ev.target.result;
        img.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  }
  
  updateHtmlFilename(e) {
    const file = e.target.files[0];
    document.getElementById('html-filename').textContent = file ? file.name : '';
    this.validateCreateForm();
  }
  
  validateCreateForm() {
    const title = document.getElementById('game-title').value.trim();
    const avatar = document.getElementById('game-avatar').files[0];
    const html = document.getElementById('game-html').files[0];
    const errorDiv = document.getElementById('create-error');
    const publishBtn = document.getElementById('publish-btn');
    
    let error = '';
    if (title.length < 3 || title.length > 30) error = 'Название от 3 до 30 символов';
    else if (!avatar) error = 'Загрузите аватарку';
    else if (avatar.size > 1024 * 1024) error = 'Аватарка больше 1 МБ';
    else if (!html) error = 'Загрузите HTML файл';
    else if (html.size > 60 * 1024) error = 'HTML файл больше 60 КБ';
    
    errorDiv.textContent = error;
    publishBtn.disabled = !!error;
  }
  
  async handleCreateGame(e) {
    e.preventDefault();
    const publishBtn = document.getElementById('publish-btn');
    if (publishBtn.disabled) return;
    
    const title = document.getElementById('game-title').value.trim();
    const players = parseInt(document.getElementById('game-players').value);
    const avatarFile = document.getElementById('game-avatar').files[0];
    const htmlFile = document.getElementById('game-html').files[0];
    
    try {
      publishBtn.disabled = true;
      publishBtn.textContent = 'Загрузка...';
      await this.uploadManager.uploadGame(title, players, avatarFile, htmlFile);
      this.closeAllModals();
      this.showToast('Игра опубликована! +100 монет', 'success');
      this.loadGames();
      this.updateUserUI();
    } catch (error) {
      this.showToast(error.message, 'error');
      publishBtn.disabled = false;
      publishBtn.textContent = 'Опубликовать';
    }
  }
  
  showShopModal() {
    this.shopManager.renderShop();
    document.getElementById('shop-modal').style.display = 'flex';
  }
  
  showInventoryModal() {
    this.shopManager.renderInventory();
    document.getElementById('inventory-modal').style.display = 'flex';
  }
  
  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }
  
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
  
  hideGameContainer() {
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('game-iframe').src = 'about:blank';
    if (this.gameLauncher.lastPlayedGameId) {
      this.showRatingModal(this.gameLauncher.lastPlayedGameId);
    }
  }
  
  showRatingModal(gameId) {
    const game = this.currentGames.find(g => g.id === gameId);
    if (!game) return;
    document.getElementById('rating-game-title').textContent = game.title;
    document.getElementById('rating-modal').dataset.gameId = gameId;
    document.getElementById('rating-modal').style.display = 'flex';
  }
  
  async submitRating(value) {
    const gameId = document.getElementById('rating-modal').dataset.gameId;
    if (!gameId || !this.authManager.currentUser) return;
    
    try {
      await this.gameLauncher.rateGame(gameId, value);
      this.showToast('Спасибо за оценку!', 'success');
      this.closeAllModals();
      this.loadGames();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }
  
  async ensureDemoGameExists() {
    const hasSolo = this.currentGames.some(g => g.id === 'local_demo_1p');
    const hasDuel = this.currentGames.some(g => g.id === 'local_demo_2p');
    
    if (!hasSolo) {
      const demoHtmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { background: #1a1a2e; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: 'Segoe UI', sans-serif; }
    button { padding: 20px 40px; font-size: 28px; background: #6C5CE7; border: none; border-radius: 50px; color: white; cursor: pointer; box-shadow: 0 8px 20px rgba(108, 92, 231, 0.5); transition: 0.2s; }
    button:hover { transform: scale(1.05); background: #8A7BFF; }
    #score { font-size: 48px; margin: 20px; }
  </style>
</head>
<body>
  <h1>⚡ Быстрый кликер</h1>
  <p>Нажми 10 раз для победы</p>
  <div id="score">0</div>
  <button onclick="clicked()">КЛИК!</button>
  <script>
    let count = 0;
    const scoreEl = document.getElementById('score');
    function clicked() {
      count++;
      scoreEl.textContent = count;
      if (count >= 10) {
        window.parent.postMessage({ type: 'game_over', score: count }, '*');
      }
    }
  <\/script>
</body>
</html>`;
      
      this.currentGames.push({
        id: 'local_demo_1p',
        title: '⚡ Кликер (демо)',
        authorNickname: 'BIBLIX',
        players: 1,
        avatarUrl: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Crect width=\'200\' height=\'200\' fill=\'%236C5CE7\'/%3E%3Ctext x=\'100\' y=\'120\' font-size=\'50\' fill=\'white\' text-anchor=\'middle\' font-family=\'Arial\'%3E⚡%3C/text%3E%3C/svg%3E',
        htmlContent: demoHtmlContent,
        likes: 0,
        dislikes: 0,
        createdAt: new Date()
      });
    }
    
    if (!hasDuel) {
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
    const clickBtn = document.getElementById('clickBtn');
    const myScoreSpan = document.getElementById('myScore');
    const opponentScoreSpan = document.getElementById('opponentScore');
    const opponentNameSpan = document.getElementById('opponentName');
    const winnerMsg = document.getElementById('winnerMessage');
    const roomIdSpan = document.getElementById('roomId');
    const playerNameSpan = document.getElementById('playerName');

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
        myScoreSpan.textContent = msg.myScore;
        opponentScoreSpan.textContent = msg.opponentScore;
        opponentNameSpan.textContent = msg.opponentName || 'ожидание...';
      } else if (msg.type === 'game_over') {
        gameActive = false;
        clickBtn.disabled = true;
        winnerMsg.textContent = msg.winner === 'me' ? '🎉 Вы победили!' : '😵 Вы проиграли...';
        window.parent.postMessage({ type: 'game_over_ack' }, '*');
      }
    });

    window.parent.postMessage({ type: 'iframe_ready' }, '*');
  </script>
</body>
</html>`;
      
      this.currentGames.push({
        id: 'local_demo_2p',
        title: '⚔️ Дуэль (2 игрока)',
        authorNickname: 'BIBLIX',
        players: 2,
        avatarUrl: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Crect width=\'200\' height=\'200\' fill=\'%23e74c3c\'/%3E%3Ctext x=\'100\' y=\'120\' font-size=\'50\' fill=\'white\' text-anchor=\'middle\' font-family=\'Arial\'%3E⚔%3C/text%3E%3C/svg%3E',
        htmlContent: demo2pHtml,
        likes: 0,
        dislikes: 0,
        createdAt: new Date()
      });
    }
    
    if (document.getElementById('games-grid').children.length > 0) {
      this.filterAndSortGames();
    }
  }
}
