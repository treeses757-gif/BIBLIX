// ========== FILE: src/js/ui/UIManager.js ==========
import { 
  collection, getDocs, query, orderBy, where, limit, 
  doc, getDoc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Встроенная демо-игра для 2 игроков (дуэль кликеров)
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

    // Подписка на изменения сессии
    const unsubscribe = sessionRef.on('value', (snapshot) => {
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

    // Исправление: атомарное увеличение счёта через транзакцию
    clickBtn.addEventListener('click', () => {
      if (gameEnded) return;
      gameStateRef.child(userId).transaction((currentScore) => {
        return (currentScore || 0) + 1;
      });
    });

    // Очистка подписки при закрытии окна
    window.addEventListener('beforeunload', () => {
      unsubscribe();
    });
  </script>
</body>
</html>`;

export class UIManager {
  constructor() {
    this.auth = null;
    this.shop = null;
    this.upload = null;
    this.gameLauncher = null;
    this.matchmaker = null;
    
    // Привязка методов к контексту
    this.updateUserUI = this.updateUserUI.bind(this);
    this.showToast = this.showToast.bind(this);
    this.closeAllModals = this.closeAllModals.bind(this);
    this.hideGameContainer = this.hideGameContainer.bind(this);
  }

  setAuthManager(auth) { this.auth = auth; }
  setShopManager(shop) { this.shop = shop; }
  setUploadManager(upload) { this.upload = upload; }
  setGameLauncher(launcher) { this.gameLauncher = launcher; }
  setMatchmaker(matchmaker) { this.matchmaker = matchmaker; }

  // ========== ИНИЦИАЛИЗАЦИЯ UI ==========
  async loadGames() {
    const grid = document.getElementById('games-grid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loader">Загрузка игр...</div>';
    
    try {
      const gamesCol = collection(window.db, 'games');
      const q = query(gamesCol, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const games = [];
      snapshot.forEach(doc => games.push({ id: doc.id, ...doc.data() }));
      
      this.renderGames(games);
      this.setupFilters(games);
    } catch (error) {
      console.error('Load games error:', error);
      grid.innerHTML = '<div class="loader">Ошибка загрузки</div>';
    }
  }

  renderGames(games) {
    const grid = document.getElementById('games-grid');
    if (!grid) return;
    
    if (games.length === 0) {
      grid.innerHTML = '<div class="loader">Игр пока нет. Создайте первую!</div>';
      return;
    }
    
    const searchInput = document.getElementById('search-input');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sort-select');
    
    let filtered = [...games];
    
    // Поиск
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
      filtered = filtered.filter(g => 
        g.title.toLowerCase().includes(searchTerm) || 
        (g.authorNickname && g.authorNickname.toLowerCase().includes(searchTerm))
      );
    }
    
    // Фильтр по игрокам
    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    if (activeFilter !== 'all') {
      filtered = filtered.filter(g => g.players == activeFilter);
    }
    
    // Сортировка
    const sort = sortSelect?.value || 'newest';
    if (sort === 'popular') {
      filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    } else {
      filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="loader">Ничего не найдено</div>';
      return;
    }
    
    grid.innerHTML = filtered.map(game => this.createGameCard(game)).join('');
    
    // Навешиваем обработчики
    grid.querySelectorAll('.play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gameId = btn.dataset.gameId;
        const game = games.find(g => g.id === gameId);
        if (game) this.playGame(game);
      });
    });
    
    grid.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('play-btn')) return;
        const gameId = card.dataset.gameId;
        const game = games.find(g => g.id === gameId);
        if (game) this.playGame(game);
      });
    });
  }

  createGameCard(game) {
    const likes = game.likes || 0;
    const dislikes = game.dislikes || 0;
    const rating = likes - dislikes;
    const players = game.players || 1;
    
    return `
      <div class="game-card" data-game-id="${game.id}">
        <img class="game-avatar" src="${game.avatarUrl || 'https://via.placeholder.com/200?text=Game'}" alt="${game.title}">
        <div class="game-title">${game.title}</div>
        <div class="game-author">от ${game.authorNickname || 'Аноним'}</div>
        <div class="game-meta">
          <div class="game-players">👥 ${players} игрок${players > 1 ? 'а' : ''}</div>
          <div class="game-rating">
            <span style="color: #2ecc71;">👍 ${likes}</span>
            <span style="color: #e74c3c;">👎 ${dislikes}</span>
            <span>⭐ ${rating}</span>
          </div>
        </div>
        <button class="play-btn" data-game-id="${game.id}">Играть</button>
      </div>
    `;
  }

  setupFilters(allGames) {
    const searchInput = document.getElementById('search-input');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sort-select');
    
    const update = () => this.renderGames(allGames);
    
    searchInput?.addEventListener('input', update);
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        update();
      });
    });
    sortSelect?.addEventListener('change', update);
  }

  // ========== ЗАПУСК ИГР ==========
  playGame(game) {
    if (!this.auth.currentUser) {
      this.showToast('Войдите, чтобы играть', 'warning');
      this.openAuthModal('login');
      return;
    }
    
    if (game.players > 1) {
      // Мультиплеер — запускаем матчмейкинг
      if (this.matchmaker) {
        this.matchmaker.startMatchmaking(game);
      } else {
        this.showToast('Мультиплеер временно недоступен', 'error');
      }
    } else {
      // Одиночная игра
      if (this.gameLauncher) {
        this.gameLauncher.launchSinglePlayer(game);
      } else {
        this.showToast('Ошибка запуска игры', 'error');
      }
    }
  }

  hideGameContainer() {
    const container = document.getElementById('game-container');
    const iframe = document.getElementById('game-iframe');
    container.style.display = 'none';
    iframe.src = '';
    window.removeEventListener('message', this.gameLauncher?.handleGameMessage);
  }

  // ========== АВТОРИЗАЦИЯ И ПРОФИЛЬ ==========
  updateUserUI() {
    const guestButtons = document.getElementById('guest-buttons');
    const userPanel = document.getElementById('user-panel');
    const userAvatar = document.getElementById('user-avatar');
    const balanceEl = document.getElementById('user-balance');
    
    if (this.auth.currentUser) {
      const user = this.auth.currentUser;
      guestButtons.style.display = 'none';
      userPanel.style.display = 'flex';
      
      const firstLetter = user.nickname.charAt(0).toUpperCase();
      userAvatar.textContent = firstLetter;
      
      this.applyAvatarSkin(userAvatar, user.currentSkin || 'default');
      
      balanceEl.innerHTML = `💰 ${user.coins || 0}`;
    } else {
      guestButtons.style.display = 'flex';
      userPanel.style.display = 'none';
      if (userAvatar) {
        userAvatar.textContent = 'U';
        userAvatar.style.background = '#6C5CE7';
        userAvatar.style.boxShadow = 'none';
      }
    }
  }

  applyAvatarSkin(element, skinId) {
    const skins = this.shop?.skins || [
      { id: 'default', gradient: '#6C5CE7' },
      { id: 'gold', gradient: 'linear-gradient(145deg, #FFD700, #B8860B)' },
      { id: 'neon', gradient: '#00FFFF', glow: '0 0 15px #00FFFF' },
      { id: 'cyberpunk', gradient: 'repeating-linear-gradient(45deg, #ff00ff, #00ffff 10px)' }
    ];
    
    const skin = skins.find(s => s.id === skinId) || skins[0];
    element.style.background = skin.gradient;
    element.style.boxShadow = skin.glow || 'none';
  }

  openAuthModal(mode = 'login') {
    const modal = document.getElementById('auth-modal');
    const title = document.getElementById('auth-modal-title');
    const form = document.getElementById('auth-form');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchLink = document.getElementById('switch-to-register');
    
    title.textContent = mode === 'login' ? 'Вход' : 'Регистрация';
    submitBtn.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    
    modal.style.display = 'flex';
    
    const handleSubmit = async (e) => {
      e.preventDefault();
      const nickname = document.getElementById('auth-nickname').value.trim();
      const password = document.getElementById('auth-password').value;
      
      if (!nickname || !password) {
        this.showToast('Заполните все поля', 'error');
        return;
      }
      
      try {
        if (mode === 'login') {
          await this.auth.login(nickname, password);
        } else {
          await this.auth.register(nickname, password);
        }
        modal.style.display = 'none';
        form.reset();
        await this.loadGames(); // Обновляем список (может быть новый автор)
      } catch (error) {
        this.showToast(error.message, 'error');
      }
    };
    
    form.onsubmit = handleSubmit;
    
    switchLink.onclick = (e) => {
      e.preventDefault();
      mode = mode === 'login' ? 'register' : 'login';
      title.textContent = mode === 'login' ? 'Вход' : 'Регистрация';
      submitBtn.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    };
  }

  // ========== МОДАЛЬНЫЕ ОКНА ==========
  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }

  // ========== ТОСТЫ ==========
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  // ========== ДЕМО-ИГРА ==========
  async ensureDemoGameExists() {
    try {
      const gamesRef = collection(window.db, 'games');
      const q = query(gamesRef, where('title', '==', '⚔️ Дуэль кликеров'), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Создаём демо-игру
        const demoGame = {
          title: '⚔️ Дуэль кликеров',
          players: 2,
          authorNickname: 'BIBLIX',
          authorUid: 'system',
          avatarUrl: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Crect width=\'200\' height=\'200\' fill=\'%236C5CE7\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'white\' font-size=\'80\'%3E⚔%3C/text%3E%3C/svg%3E',
          htmlContent: demo2pHtml,
          likes: 0,
          dislikes: 0,
          createdAt: serverTimestamp()
        };
        
        await setDoc(doc(gamesRef), demoGame);
        console.log('Demo game created');
      }
    } catch (error) {
      console.error('Failed to create demo game:', error);
    }
  }

  // ========== ПРИВЯЗКА СОБЫТИЙ ==========
  initEventListeners() {
    // Кнопки входа/регистрации
    document.getElementById('login-btn')?.addEventListener('click', () => this.openAuthModal('login'));
    document.getElementById('register-btn')?.addEventListener('click', () => this.openAuthModal('register'));
    
    // Выход
    document.getElementById('logout-btn')?.addEventListener('click', () => this.auth.logout());
    
    // Магазин и инвентарь
    document.getElementById('shop-btn')?.addEventListener('click', () => {
      if (!this.auth.currentUser) {
        this.openAuthModal('login');
        return;
      }
      this.shop.renderShop();
      document.getElementById('shop-modal').style.display = 'flex';
    });
    
    document.getElementById('inventory-btn')?.addEventListener('click', () => {
      if (!this.auth.currentUser) {
        this.openAuthModal('login');
        return;
      }
      this.shop.renderInventory();
      document.getElementById('inventory-modal').style.display = 'flex';
    });
    
    // Создание игры
    document.getElementById('create-game-btn')?.addEventListener('click', () => {
      if (!this.auth.currentUser) {
        this.openAuthModal('login');
        return;
      }
      document.getElementById('create-modal').style.display = 'flex';
    });
    
    // Закрытие модалок по клику на крестик
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal').style.display = 'none';
      });
    });
    
    // Закрытие по клику вне модалки
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
      }
    });
    
    // Закрытие игры
    document.getElementById('close-game-btn')?.addEventListener('click', () => this.hideGameContainer());
    
    // Форма создания игры
    const createForm = document.getElementById('create-game-form');
    createForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('game-title').value;
      const players = parseInt(document.getElementById('game-players').value);
      const avatarFile = document.getElementById('game-avatar').files[0];
      const htmlFile = document.getElementById('game-html').files[0];
      
      if (!avatarFile || !htmlFile) {
        this.showToast('Выберите оба файла', 'error');
        return;
      }
      
      try {
        await this.upload.uploadGame(title, players, avatarFile, htmlFile);
        document.getElementById('create-modal').style.display = 'none';
        createForm.reset();
        document.getElementById('avatar-preview').style.display = 'none';
        document.getElementById('html-filename').textContent = '';
        await this.loadGames();
        this.showToast('Игра опубликована! +100 монет', 'success');
      } catch (error) {
        document.getElementById('create-error').textContent = error.message;
      }
    });
    
    // Предпросмотр аватарки
    document.getElementById('game-avatar')?.addEventListener('change', (e) => {
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
    });
    
    // Отображение имени HTML-файла
    document.getElementById('game-html')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('html-filename').textContent = file.name;
      }
    });
    
    // Отмена матчмейкинга
    document.getElementById('cancel-matchmaking')?.addEventListener('click', () => {
      this.matchmaker?.cancelMatchmaking();
    });
    
    // Оценка игры
    document.getElementById('rate-like')?.addEventListener('click', async () => {
      const gameId = this.gameLauncher?.lastPlayedGameId;
      if (gameId) {
        try {
          await this.gameLauncher.rateGame(gameId, 1);
          this.showToast('Спасибо за оценку!', 'success');
          document.getElementById('rating-modal').style.display = 'none';
        } catch (e) {
          this.showToast(e.message, 'error');
        }
      }
    });
    
    document.getElementById('rate-dislike')?.addEventListener('click', async () => {
      const gameId = this.gameLauncher?.lastPlayedGameId;
      if (gameId) {
        try {
          await this.gameLauncher.rateGame(gameId, -1);
          this.showToast('Спасибо за оценку!', 'success');
          document.getElementById('rating-modal').style.display = 'none';
        } catch (e) {
          this.showToast(e.message, 'error');
        }
      }
    });
  }
}

// Инициализация слушателей после создания экземпляра
// В main.js после new UIManager() нужно вызвать ui.initEventListeners()
