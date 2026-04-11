import { doc, updateDoc, increment, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class GameLauncher {
  constructor(db, rtdb, auth) {
    this.db = db;
    this.rtdb = rtdb;
    this.auth = auth;
    this.ui = null;
    this.lastPlayedGameId = null;
  }

  setUI(ui) { this.ui = ui; }

  // Возвращает URL для iframe (Blob URL или готовый)
  getGameUrl(game) {
    if (game.htmlContent) {
      const blob = new Blob([game.htmlContent], { type: 'text/html' });
      return URL.createObjectURL(blob);
    } else if (game.htmlUrl) {
      return game.htmlUrl;
    }
    return null;
  }

  launchSinglePlayer(game) {
    this.lastPlayedGameId = game.id;
    const container = document.getElementById('game-container');
    const iframe = document.getElementById('game-iframe');
    const titleDisplay = document.getElementById('game-title-display');

    titleDisplay.textContent = game.title;

    const url = this.getGameUrl(game);
    if (!url) {
      this.ui.showToast('Не удалось загрузить игру', 'error');
      this.ui.hideGameContainer();
      return;
    }

    iframe.src = url;
    iframe.onload = () => {
      if (game.htmlContent) URL.revokeObjectURL(url);
    };
    container.style.display = 'flex';

    window.addEventListener('message', this.handleGameMessage);
    this.rewardAuthor(game);
  }

  handleGameMessage = (event) => {
    if (event.data && event.data.type === 'game_over') {
      this.ui.hideGameContainer();
      window.removeEventListener('message', this.handleGameMessage);
    }
  }

  async rewardAuthor(game) {
    if (!this.auth.currentUser) return;
    const key = `last_reward_${game.id}_${this.auth.currentUser.nickname}`;
    const lastReward = localStorage.getItem(key);
    const now = Date.now();
    if (lastReward && now - parseInt(lastReward) < 3600000) return;

    try {
      const authorRef = doc(this.db, 'users', game.authorUid);
      await updateDoc(authorRef, { coins: increment(5) });
      localStorage.setItem(key, now.toString());
    } catch (e) {}
  }

  async rateGame(gameId, value) {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Войдите для оценки');

    const ratingRef = doc(this.db, 'games', gameId, 'ratings', user.id);
    const gameRef = doc(this.db, 'games', gameId);
    const ratingSnap = await getDoc(ratingRef);

    let incLikes = 0, incDislikes = 0;
    if (ratingSnap.exists()) {
      const old = ratingSnap.data().value;
      if (old === value) {
        if (value === 1) incLikes = -1;
        else incDislikes = -1;
        await updateDoc(ratingRef, { value: 0 });
      } else {
        if (old === 1) incLikes = -1;
        if (old === -1) incDislikes = -1;
        if (value === 1) incLikes += 1;
        else incDislikes += 1;
        await updateDoc(ratingRef, { value });
      }
    } else {
      await setDoc(ratingRef, { value });
      if (value === 1) incLikes = 1;
      else incDislikes = 1;
    }
    await updateDoc(gameRef, {
      likes: increment(incLikes),
      dislikes: increment(incDislikes)
    });
  }
}
