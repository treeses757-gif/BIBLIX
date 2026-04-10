// ========== FILE: src/js/games/GameLauncher.js ==========
import { doc, getDoc, updateDoc, increment, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class GameLauncher {
  constructor(db, rtdb, auth) {
    this.db = db;
    this.rtdb = rtdb;
    this.auth = auth;
    this.ui = null;
    this.lastPlayedGameId = null;
  }
  
  setUI(ui) { this.ui = ui; }
  
  launchSinglePlayer(game) {
    this.lastPlayedGameId = game.id;
    const container = document.getElementById('game-container');
    const iframe = document.getElementById('game-iframe');
    const titleDisplay = document.getElementById('game-title-display');
    
    titleDisplay.textContent = game.title;
    iframe.src = game.htmlUrl;
    container.style.display = 'flex';
    
    // Слушаем сообщения от игры
    window.addEventListener('message', this.handleGameMessage);
    
    // Начисление монет автору (с проверкой времени)
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
    if (lastReward && now - parseInt(lastReward) < 3600000) return; // раз в час
    
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
    const gameSnap = await getDoc(gameRef);
    const gameData = gameSnap.data();
    
    let incrementLikes = 0;
    let incrementDislikes = 0;
    
    if (ratingSnap.exists()) {
      const oldValue = ratingSnap.data().value;
      if (oldValue === value) {
        // Снять оценку
        if (value === 1) incrementLikes = -1;
        else incrementDislikes = -1;
        await updateDoc(ratingRef, { value: 0 });
      } else {
        // Изменить
        if (oldValue === 1) incrementLikes = -1;
        if (oldValue === -1) incrementDislikes = -1;
        if (value === 1) incrementLikes += 1;
        else incrementDislikes += 1;
        await updateDoc(ratingRef, { value });
      }
    } else {
      await setDoc(ratingRef, { value });
      if (value === 1) incrementLikes = 1;
      else incrementDislikes = 1;
    }
    
    await updateDoc(gameRef, {
      likes: increment(incrementLikes),
      dislikes: increment(incrementDislikes)
    });
  }
}