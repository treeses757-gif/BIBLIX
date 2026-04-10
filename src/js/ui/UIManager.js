// ========== FILE: src/js/ui/UIManager.js ==========
import { 
  collection, getDocs, query, orderBy, where, limit, doc, setDoc, serverTimestamp, updateDoc, increment, arrayUnion 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

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
    // Кнопки входа/регистрации
    document.getElementById('login-btn')?.addEventListener('click', () => this.showAuthModal('login'));
    document.getElementById('register-btn')?.addEventListener('click', () => this.showAuthModal('register'));
    document.getElementById('switch-to-register')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthModal('register');
    });
    document.getElementById('auth-form')?.addEventListener('submit', (e) => this.handleAuthSubmit(e));
    
    // Создание игры
    document.getElementById('create-game-btn')?.addEventListener('click', () => this.showCreateModal());
    document.getElementById('create-game-form')?.addEventListener('submit', (e) => this.handleCreateGame(e));
    document.getElementById('game-avatar')?.addEventListener('change', (e) => this.previewAvatar(e));
    document.getElementById('game-html')?.addEventListener('change', (e) => this.updateHtmlFilename(e));
    document.querySelectorAll('#create-game-form input, #create-game-form select').forEach(el => {
      el?.addEventListener('input', () => this.validateCreateForm());
    });
    
    // Магазин и инвентарь
    document.getElementById('shop-btn')?.addEventListener('click', () => this.showShopModal());
    document.getElementById('inventory-btn')?.addEventListener('click', () => this.showInventoryModal());
    
    // Выход
    document.getElementById('logout-btn')?.addEventListener('click', () => this.authManager.logout());
    
    // Поиск и фильтры
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
    
    // Закрытие модалок
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });
    
    // Закрытие игры
    document.getElementById('close-game-btn')?.addEventListener('click', () => {
      this.hideGameContainer();
    });
    
    // Рейтинг
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
      this.filterAndSortGames();
    } catch (error) {
      console.error(error);
      grid.innerHTML = '<div class="loader">Ошибка загрузки</div>';
    }
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
    if (this.currentGames.length > 0) return;
    try {
      const q = query(collection(this.db, 'games'), where('title', '==', 'Кликер (демо)'));
      const snap = await getDocs(q);
      if (!snap.empty) return;
      
      const demoHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#1a1a2e;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;} button{padding:20px 40px;font-size:24px;background:#6C5CE7;border:none;border-radius:40px;color:white;cursor:pointer;}</style></head><body><h1>Кликер</h1><p>Счёт: <span id="score">0</span></p><button onclick="increment()">Клик!</button><script>let score=0;function increment(){score++;document.getElementById('score').textContent=score;if(score>=10){window.parent.postMessage({type:'game_over',score},'*');}}<\/script></body></html>`;
      
      const blob = new Blob([demoHtml], { type: 'text/html' });
      const htmlRef = ref(this.storage, `games/demo_${Date.now()}.html`);
      await uploadBytes(htmlRef, blob);
      const htmlUrl = await getDownloadURL(htmlRef);
      
      const canvas = document.createElement('canvas'); canvas.width=200; canvas.height=200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle='#6C5CE7'; ctx.fillRect(0,0,200,200);
      ctx.fillStyle='white'; ctx.font='bold 40px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('CLICK',100,100);
      const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const avatarRef = ref(this.storage, `avatars/demo_${Date.now()}.png`);
      await uploadBytes(avatarRef, pngBlob);
      const avatarUrl = await getDownloadURL(avatarRef);
      
      await setDoc(doc(collection(this.db, 'games')), {
        title: 'Кликер (демо)',
        authorNickname: 'BIBLIX',
        authorUid: 'system',
        players: 1,
        avatarUrl,
        htmlUrl,
        likes: 0,
        dislikes: 0,
        createdAt: serverTimestamp()
      });
      
      this.loadGames();
    } catch (e) {
      console.warn('Не удалось создать демо', e);
    }
  }
}