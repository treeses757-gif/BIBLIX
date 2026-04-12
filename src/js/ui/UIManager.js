// ========== FILE: src/js/ui/UIManager.js ==========
import { 
  collection, getDocs, query, orderBy, where 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class UIManager {
  constructor() {
    this.auth = null;
    this.shop = null;
    this.upload = null;
    this.gameLauncher = null;
    this.matchmaker = null;
    this.currentFilter = 'all';
    this.currentSort = 'newest';
    this.searchTerm = '';
    this.allGames = [];
    this.ratingModalGameId = null;
  }

  setAuthManager(auth) { this.auth = auth; }
  setShopManager(shop) { this.shop = shop; }
  setUploadManager(upload) { this.upload = upload; }
  setGameLauncher(launcher) { this.gameLauncher = launcher; }
  setMatchmaker(matchmaker) { this.matchmaker = matchmaker; }

  updateUserUI() {
    const user = this.auth?.currentUser;
    const guestDiv = document.getElementById('guest-buttons');
    const userDiv = document.getElementById('user-panel');
    const avatar = document.getElementById('user-avatar');
    const balanceSpan = document.getElementById('user-balance');

    if (user) {
      guestDiv.style.display = 'none';
      userDiv.style.display = 'flex';
      balanceSpan.textContent = `💰 ${user.coins}`;
      const initial = user.nickname.charAt(0).toUpperCase();
      avatar.textContent = initial;
      this.applyAvatarSkin(avatar, user.currentSkin || 'default');
    } else {
      guestDiv.style.display = 'flex';
      userDiv.style.display = 'none';
    }
  }

  applyAvatarSkin(avatarEl, skinId) {
    const skins = this.shop?.skins || [
      { id: 'default', gradient: '#6C5CE7' },
      { id: 'gold', gradient: 'linear-gradient(145deg, #FFD700, #B8860B)' },
      { id: 'neon', gradient: '#00FFFF', glow: '0 0 15px #00FFFF' },
      { id: 'cyberpunk', gradient: 'repeating-linear-gradient(45deg, #ff00ff, #00ffff 10px)' }
    ];
    const skin = skins.find(s => s.id === skinId) || skins[0];
    avatarEl.style.background = skin.gradient;
    avatarEl.style.boxShadow = skin.glow || 'none';
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.borderLeftColor = type === 'error' ? '#e74c3c' : '#6C5CE7';
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }

  async loadGames() {
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '<div class="loader">Загрузка игр...</div>';
    try {
      const gamesCol = collection(window.db, 'games');
      const q = query(gamesCol, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      this.allGames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.renderGames();
    } catch (e) {
      grid.innerHTML = '<div class="loader">Ошибка загрузки</div>';
    }
  }

  renderGames() {
    const grid = document.getElementById('games-grid');
    let filtered = [...this.allGames];

    if (this.currentFilter !== 'all') {
      const playersNeeded = parseInt(this.currentFilter);
      filtered = filtered.filter(g => g.players == playersNeeded);
    }

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(g => g.title.toLowerCase().includes(term) || g.authorNickname?.toLowerCase().includes(term));
    }

    if (this.currentSort === 'popular') {
      filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    } else {
      filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="loader">Игры не найдены. Нажмите ➕, чтобы создать свою.</div>';
      return;
    }

    grid.innerHTML = filtered.map(game => this.createGameCard(game)).join('');
    document.querySelectorAll('.play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const game = this.allGames.find(g => g.id === id);
        this.playGame(game);
      });
    });
    document.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const game = this.allGames.find(g => g.id === id);
        this.showRatingModal(game);
      });
    });
  }

  createGameCard(game) {
    const players = game.players || 1;
    const avatar = game.avatarUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%231e1e2e\'/%3E%3Ctext x=\'50\' y=\'60\' font-size=\'50\' text-anchor=\'middle\' fill=\'%23aaa\'%3E🎮%3C/text%3E%3C/svg%3E';
    return `
      <div class="game-card" data-id="${game.id}">
        <img class="game-avatar" src="${avatar}" alt="${game.title}">
        <div class="game-title">${game.title}</div>
        <div class="game-author">от ${game.authorNickname || 'BIBLIX'}</div>
        <div class="game-meta">
          <span class="game-players">👥 ${players}</span>
          <span class="game-rating">👍 ${game.likes || 0} 👎 ${game.dislikes || 0}</span>
        </div>
        <button class="play-btn" data-id="${game.id}">Играть</button>
      </div>
    `;
  }

  playGame(game) {
    if (!this.auth.currentUser) {
      this.showToast('Войдите, чтобы играть', 'error');
      return;
    }
    if (game.players === 1) {
      this.gameLauncher.launchSinglePlayer(game);
    } else {
      this.matchmaker.startMatchmaking(game);
    }
  }

  showRatingModal(game) {
    if (!this.auth.currentUser) return;
    this.ratingModalGameId = game.id;
    document.getElementById('rating-game-title').textContent = game.title;
    document.getElementById('rating-modal').style.display = 'flex';
  }

  hideGameContainer() {
    const container = document.getElementById('game-container');
    const iframe = document.getElementById('game-iframe');
    iframe.src = 'about:blank';
    container.style.display = 'none';
  }

  initEventListeners() {
    document.getElementById('login-btn').addEventListener('click', () => this.showAuthModal('login'));
    document.getElementById('register-btn').addEventListener('click', () => this.showAuthModal('register'));
    document.getElementById('logout-btn').addEventListener('click', () => this.auth.logout());
    document.getElementById('switch-to-register').addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthModal('register');
    });
    document.querySelector('#auth-modal .close-modal').addEventListener('click', () => this.closeAllModals());
    document.getElementById('auth-form').addEventListener('submit', (e) => this.handleAuthSubmit(e));

    document.getElementById('create-game-btn').addEventListener('click', () => {
      if (!this.auth.currentUser) {
        this.showToast('Войдите, чтобы создавать игры', 'error');
        return;
      }
      document.getElementById('create-modal').style.display = 'flex';
    });

    document.querySelector('#create-modal .close-modal').addEventListener('click', () => this.closeAllModals());
    document.getElementById('create-game-form').addEventListener('submit', (e) => this.handleCreateSubmit(e));
    document.getElementById('game-avatar').addEventListener('change', (e) => this.previewAvatar(e));
    document.getElementById('game-html').addEventListener('change', (e) => {
      const file = e.target.files[0];
      document.getElementById('html-filename').textContent = file ? file.name : '';
      this.validateCreateForm();
    });
    document.getElementById('game-title').addEventListener('input', () => this.validateCreateForm());

    document.getElementById('shop-btn').addEventListener('click', () => {
      this.shop.renderShop();
      document.getElementById('shop-modal').style.display = 'flex';
    });
    document.getElementById('inventory-btn').addEventListener('click', () => {
      this.shop.renderInventory();
      document.getElementById('inventory-modal').style.display = 'flex';
    });
    document.querySelectorAll('#shop-modal .close-modal, #inventory-modal .close-modal').forEach(btn =>
      btn.addEventListener('click', () => this.closeAllModals())
    );

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.renderGames();
      });
    });
    document.getElementById('sort-select').addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.renderGames();
    });
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      this.renderGames();
    });

    document.getElementById('close-game-btn').addEventListener('click', () => {
      if (this.matchmaker && this.matchmaker.roomId) {
        this.matchmaker.cleanup();
      }
      this.hideGameContainer();
    });

    document.querySelector('#rating-modal .close-modal').addEventListener('click', () => this.closeAllModals());
    document.getElementById('rate-like').addEventListener('click', () => this.submitRating(1));
    document.getElementById('rate-dislike').addEventListener('click', () => this.submitRating(-1));

    document.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });
  }

  showAuthModal(mode) {
    document.getElementById('auth-modal-title').textContent = mode === 'login' ? 'Вход' : 'Регистрация';
    document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    document.querySelector('.auth-switch').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('auth-modal').style.display = 'flex';
    document.getElementById('auth-modal').dataset.mode = mode;
  }

  async handleAuthSubmit(e) {
    e.preventDefault();
    const nickname = document.getElementById('auth-nickname').value.trim();
    const password = document.getElementById('auth-password').value;
    const mode = document.getElementById('auth-modal').dataset.mode;
    try {
      if (mode === 'login') {
        await this.auth.login(nickname, password);
      } else {
        await this.auth.register(nickname, password);
      }
      this.closeAllModals();
    } catch (error) {
      alert(error.message);
    }
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
    this.validateCreateForm();
  }

  validateCreateForm() {
    const title = document.getElementById('game-title').value.trim();
    const avatar = document.getElementById('game-avatar').files[0];
    const html = document.getElementById('game-html').files[0];
    const btn = document.getElementById('publish-btn');
    btn.disabled = !(title.length >= 3 && avatar && html);
  }

  async handleCreateSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('game-title').value.trim();
    const players = parseInt(document.getElementById('game-players').value);
    const avatarFile = document.getElementById('game-avatar').files[0];
    const htmlFile = document.getElementById('game-html').files[0];
    const errorDiv = document.getElementById('create-error');
    errorDiv.textContent = '';

    try {
      await this.upload.uploadGame(title, players, avatarFile, htmlFile);
      this.closeAllModals();
      this.showToast('Игра опубликована! +100 монет', 'success');
      this.loadGames();
    } catch (err) {
      errorDiv.textContent = err.message;
    }
  }

  async submitRating(value) {
    if (!this.ratingModalGameId) return;
    try {
      await this.gameLauncher.rateGame(this.ratingModalGameId, value);
      this.showToast('Спасибо за оценку!', 'success');
      this.closeAllModals();
      this.loadGames();
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }
}
