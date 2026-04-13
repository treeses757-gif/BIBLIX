// src/js/ui/UIManager.js (фрагменты с изменениями)

// В начало класса добавьте массив встроенных игр:
const BUILT_IN_GAMES = [
  {
    id: 'builtin_clicker2p',
    title: '⚡ Кликер-гонка 2P',
    players: 2,
    authorNickname: 'BIBLIX',
    authorUid: 'system',
    avatarUrl: '🎮', // или data:image
    localPath: '/games/clicker2p.html',
    likes: 100,
    dislikes: 0,
    createdAt: new Date() // для сортировки
  },
  // можно добавить другие игры
];

// В методе loadGames():
async loadGames() {
  const grid = document.getElementById('games-grid');
  grid.innerHTML = '<div class="loader">Загрузка игр...</div>';
  try {
    const gamesCol = collection(window.db, 'games');
    const q = query(gamesCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const firestoreGames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Объединяем встроенные и загруженные игры
    this.allGames = [...BUILT_IN_GAMES, ...firestoreGames];
    this.renderGames();
  } catch (e) {
    // Если Firestore недоступен, показываем хотя бы встроенные
    this.allGames = [...BUILT_IN_GAMES];
    this.renderGames();
  }
}

// В методе createGameCard() замените строчку с аватаркой:
createGameCard(game) {
  const players = game.players || 1;
  let avatar = game.avatarUrl;
  if (!avatar || avatar === '🎮') {
    avatar = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%231e1e2e\'/%3E%3Ctext x=\'50\' y=\'60\' font-size=\'50\' text-anchor=\'middle\' fill=\'%23aaa\'%3E🎮%3C/text%3E%3C/svg%3E';
  }
  // ... остальное без изменений
}
