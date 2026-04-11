// ========== FILE: src/js/ui/UIManager.js ==========
import { 
  collection, query, orderBy, limit, getDocs, where, startAfter, doc, getDoc, updateDoc, increment 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Демо-игра 2 игроков (встроенная)
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

export class UIManager {
  constructor() {
    this.auth = null;
    this.shop = null;
    this.upload = null;
    this.gameLauncher = null;
    this.matchmaker = null;
    this.currentFilter = 'all';
    this.currentSort = 'newest';
    this.lastVisible = null;
    this.gamesCache = [];
    this.currentRatingGameId = null;
    this.currentRatingGame = null;
  }

  setAuthManager(auth) { this.auth = auth; }
  setShopManager(shop) { this.shop = shop; }
  setUploadManager(upload) { this.upload = upload; }
  setGameLauncher(launcher) { this.gameLauncher = launcher; }
  setMatchmaker(matchmaker) { this.matchmaker = matchmaker; }

  // ========== UI обновления ==========
  updateUserUI() {
    const user = this.auth?.currentUser;
    const guestBtns = document.getElementById('guest-buttons');
    const userPanel = document.getElementById('user-panel');
    const balanceEl = document.getElementById('user-balance');
    const avatarEl = document.getElementById('user-avatar');

    if (user) {
      guestBtns.style.display = 'none';
      userPanel.style.display = 'flex';
      balanceEl.textContent = `💰 ${user.coins || 0}`;
      avatarEl.textContent = user.nickname.charAt(0).toUpperCase();
      this.applyAvatarSkin(avatarEl, user.currentSkin || 'default');
    } else {
      guestBtns.style.display = 'flex';
      userPanel.style.display = 'none';
      balanceEl.textContent = `💰 0`;
      avatarEl.textContent = 'U';
      avatarEl.style.background = '#6C5CE7';
      avatarEl.style.boxShadow = 'none';
    }
  }

  applyAvatarSkin(element, skinId) {
    const skins = this.shop?.skins || [];
    const skin = skins.find(s => s.id === skinId) || { gradient: '#6C5CE7', glow: '' };
    element.style.background = skin.gradient;
    element.style.boxShadow = skin.glow || 'none';
  }

  // ========== Загрузка игр ==========
  async loadGames(loadMore = false) {
    const grid = document.getElementById('games-grid');
    if (!loadMore) {
      grid.innerHTML = '<div class="loader">Загрузка игр...</div>';
      this.lastVisible = null;
    }

    const db = window.db;
    const gamesRef = collection(db, 'games');
    let q;

    if (this.currentSort === 'newest') {
      q = query(gamesRef, orderBy('createdAt', 'desc'), limit(12));
    } else {
      q = query(gamesRef, orderBy('likes', 'desc'), limit(12));
    }

    if (this.lastVisible && loadMore) {
      q = query(q, startAfter(this.lastVisible));
    }

    try {
      const snapshot = await getDocs(q);
      const games = [];
      snapshot.forEach(doc => {
        games.push({ id: doc.id, ...doc.data() });
      });
      this.lastVisible = snapshot.docs[snapshot.docs.length - 1];

      if (!loadMore) {
        this.gamesCache = games;
      } else {
        this.gamesCache = [...this.gamesCache, ...games];
      }
      this.renderGames(this.filterGames(this.gamesCache));
    } catch (e) {
      grid.innerHTML = '<div class="loader">Ошибка загрузки игр</div>';
    }
  }

  filterGames(games) {
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    return games.filter(game => {
      const matchesSearch = game.title.toLowerCase().includes(searchTerm) ||
                           (game.authorNickname || '').toLowerCase().includes(searchTerm);
      const players = game.players;
      let matchesFilter = true;
      if (this.currentFilter === '1') matchesFilter = players === 1;
      else if (this.currentFilter === '2') matchesFilter = players === 2;
      else if (this.currentFilter === '3') matchesFilter = players === 3;
      return matchesSearch && matchesFilter;
    });
  }

  renderGames(games) {
    const grid = document.getElementById('games-grid');
    if (games.length === 0) {
      grid.innerHTML = '<div class="loader">Игры не найдены</div>';
      return;
    }

    grid.innerHTML = games.map(game => {
      const rating = ((game.likes || 0) - (game.dislikes || 0)).toFixed(0);
      const avatar = game.avatarUrl || 'https://via.placeholder.com/200?text=Game';
      return `
        <div class="game-card" data-game-id="${game.id}">
          <img class="game-avatar" src="${avatar}" alt="${game.title}" loading="lazy">
          <div class="game-title">${game.title}</div>
          <div class="game-author">от ${game.authorNickname || 'Неизвестный'}</div>
          <div class="game-meta">
            <span class="game-players">👥 ${game.players}</span>
            <span class="game-rating">👍 ${game.likes || 0} 👎 ${game.dislikes || 0} ⭐ ${rating}</span>
          </div>
          <button class="play-btn" data-game-id="${game.id}">Играть</button>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.gameId;
        const game = this.gamesCache.find(g => g.id === id);
        this.handlePlayGame(game);
      });
    });

    grid.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('play-btn')) return;
        const id = card.dataset.gameId;
        const game = this.gamesCache.find(g => g.id === id);
        this.openRatingModal(game);
      });
    });
  }

  handlePlayGame(game) {
    if (!this.auth.currentUser) {
      this.showToast('Войдите, чтобы играть', 'error');
      this.openAuthModal('login');
      return;
    }

    if (game.players === 1) {
      this.gameLauncher.launchSinglePlayer(game);
    } else {
      this.matchmaker.startMatchmaking(game);
    }
  }

  openRatingModal(game) {
    if (!this.auth.currentUser) return;
    this.currentRatingGameId = game.id;
    this.currentRatingGame = game;
    document.getElementById('rating-game-title').textContent = game.title;
    document.getElementById('rating-modal').style.display = 'flex';
  }

  async ensureDemoGameExists() {
    const db = window.db;
    const gamesRef = collection(db, 'games');
    const q = query(gamesRef, where('id', '==', 'local_demo_2p'));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return;

    // Создаём демо-игру, если её нет
    const demoGame = {
      title: 'Дуэль кликеров (демо)',
      players: 2,
      authorNickname: 'BIBLIX',
      authorUid: 'system',
      avatarUrl: 'https://via.placeholder.com/200/6C5CE7/ffffff?text=Duo',
      htmlContent: demo2pHtml,
      likes: 0,
      dislikes: 0,
      createdAt: new Date(),
      id: 'local_demo_2p'
    };
    const docRef = doc(db, 'games', 'local_demo_2p');
    await setDoc(docRef, demoGame);
  }

  // ========== Модальные окна ==========
  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }

  openAuthModal(mode = 'login') {
    document.getElementById('auth-modal-title').textContent = mode === 'login' ? 'Вход' : 'Регистрация';
    document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    document.getElementById('auth-modal').style.display = 'flex';
  }

  hideGameContainer() {
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('game-iframe').src = '';
  }

  // ========== Toast ==========
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.borderLeftColor = type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : '#6C5CE7';
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ========== Привязка событий (вызывается из main.js после DOMContentLoaded) ==========
  bindEvents() {
    // Кнопки гостя
    document.getElementById('login-btn').addEventListener('click', () => this.openAuthModal('login'));
    document.getElementById('register-btn').addEventListener('click', () => this.openAuthModal('register'));
    document.getElementById('switch-to-register').addEventListener('click', (e) => {
      e.preventDefault();
      this.openAuthModal('register');
    });
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    // Форма авторизации
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nickname = document.getElementById('auth-nickname').value.trim();
      const password = document.getElementById('auth-password').value;
      const isLogin = document.getElementById('auth-modal-title').textContent === 'Вход';
      try {
        if (isLogin) {
          await this.auth.login(nickname, password);
        } else {
          await this.auth.register(nickname, password);
        }
        this.closeAllModals();
        this.loadGames();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    });

    // Пользовательская панель
    document.getElementById('logout-btn').addEventListener('click', () => this.auth.logout());
    document.getElementById('shop-btn').addEventListener('click', () => {
      this.shop.renderShop();
      document.getElementById('shop-modal').style.display = 'flex';
    });
    document.getElementById('inventory-btn').addEventListener('click', () => {
      this.shop.renderInventory();
      document.getElementById('inventory-modal').style.display = 'flex';
    });
    document.getElementById('create-game-btn').addEventListener('click', () => {
      document.getElementById('create-modal').style.display = 'flex';
    });

    // Создание игры
    document.getElementById('game-avatar').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const preview = document.getElementById('avatar-preview');
          preview.src = ev.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
      this.validateCreateForm();
    });

    document.getElementById('game-html').addEventListener('change', (e) => {
      const file = e.target.files[0];
      document.getElementById('html-filename').textContent = file ? file.name : '';
      this.validateCreateForm();
    });

    document.getElementById('game-title').addEventListener('input', () => this.validateCreateForm());
    document.getElementById('game-players').addEventListener('change', () => this.validateCreateForm());

    document.getElementById('create-game-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('game-title').value.trim();
      const players = parseInt(document.getElementById('game-players').value);
      const avatarFile = document.getElementById('game-avatar').files[0];
      const htmlFile = document.getElementById('game-html').files[0];
      
      try {
        await this.upload.uploadGame(title, players, avatarFile, htmlFile);
        this.closeAllModals();
        this.showToast('Игра опубликована! +100 монет', 'success');
        this.loadGames();
        this.updateUserUI();
      } catch (err) {
        document.getElementById('create-error').textContent = err.message;
      }
    });

    // Фильтры
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.loadGames();
      });
    });

    document.getElementById('sort-select').addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.loadGames();
    });

    document.getElementById('search-input').addEventListener('input', () => {
      this.renderGames(this.filterGames(this.gamesCache));
    });

    // Закрытие контейнера игры
    document.getElementById('close-game-btn').addEventListener('click', () => this.hideGameContainer());

    // Рейтинг
    document.getElementById('rate-like').addEventListener('click', async () => {
      await this.gameLauncher.rateGame(this.currentRatingGameId, 1);
      this.closeAllModals();
      this.loadGames();
      this.showToast('Спасибо за оценку!', 'success');
    });
    document.getElementById('rate-dislike').addEventListener('click', async () => {
      await this.gameLauncher.rateGame(this.currentRatingGameId, -1);
      this.closeAllModals();
      this.loadGames();
      this.showToast('Спасибо за оценку!', 'success');
    });

    // Бесконечный скролл (упрощённо)
    window.addEventListener('scroll', () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        this.loadGames(true);
      }
    });
  }

  validateCreateForm() {
    const title = document.getElementById('game-title').value.trim();
    const avatar = document.getElementById('game-avatar').files[0];
    const html = document.getElementById('game-html').files[0];
    const publishBtn = document.getElementById('publish-btn');
    const isValid = title.length >= 3 && avatar && html;
    publishBtn.disabled = !isValid;
  }
}
