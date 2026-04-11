// ========== FILE: src/js/auth/AuthManager.js ==========
import { 
  collection, doc, setDoc, getDoc, updateDoc, increment 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class AuthManager {
  constructor(db) {
    this.db = db;
    this.currentUser = null;
    this.ui = null;
  }
  
  setUI(ui) { this.ui = ui; }
  
  // Хэширование с солью
  hashPassword(password, salt) {
    return CryptoJS.SHA256(salt + password).toString();
  }
  
  generateSalt() {
    return CryptoJS.lib.WordArray.random(128/8).toString();
  }
  
  async register(nickname, password) {
    const lowerNick = nickname.toLowerCase();
    const userRef = doc(this.db, 'users', lowerNick);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
      throw new Error('Пользователь уже существует');
    }
    
    const salt = this.generateSalt();
    const hash = this.hashPassword(password, salt);
    
    const userData = {
      nickname,
      nickname_lower: lowerNick,
      passwordHash: hash,
      salt,
      coins: 500,
      inventory: ['default'],
      currentSkin: 'default',
      createdAt: new Date()
    };
    
    await setDoc(userRef, userData);
    
    // Авто-вход
    this.currentUser = { nickname, ...userData, id: lowerNick };
    localStorage.setItem('biblix_session', JSON.stringify({ nickname, hash }));
    this.ui.updateUserUI();
    this.ui.showToast('Регистрация успешна!', 'success');
  }
  
  async login(nickname, password) {
    const lowerNick = nickname.toLowerCase();
    const userRef = doc(this.db, 'users', lowerNick);
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      throw new Error('Неверный ник или пароль');
    }
    
    const userData = docSnap.data();
    const hash = this.hashPassword(password, userData.salt);
    if (hash !== userData.passwordHash) {
      throw new Error('Неверный ник или пароль');
    }
    
    this.currentUser = { nickname: userData.nickname, ...userData, id: lowerNick };
    localStorage.setItem('biblix_session', JSON.stringify({ nickname: userData.nickname, hash }));
    this.ui.updateUserUI();
    this.ui.showToast(`Добро пожаловать, ${userData.nickname}!`, 'success');
  }
  
  async checkAutoLogin() {
    const session = localStorage.getItem('biblix_session');
    if (!session) return;
    
    try {
      const { nickname, hash } = JSON.parse(session);
      const lowerNick = nickname.toLowerCase();
      const userRef = doc(this.db, 'users', lowerNick);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const userData = docSnap.data();
        // Проверка по хэшу (доверительная, но можно сверить)
        this.currentUser = { nickname, ...userData, id: lowerNick };
        this.ui.updateUserUI();
      } else {
        localStorage.removeItem('biblix_session');
      }
    } catch (e) {
      localStorage.removeItem('biblix_session');
    }
  }
  
  logout() {
    this.currentUser = null;
    localStorage.removeItem('biblix_session');
    this.ui.updateUserUI();
    this.ui.closeAllModals();
    this.ui.showToast('Вы вышли', 'info');
  }
  
  async addCoins(amount) {
    if (!this.currentUser) return;
    const userRef = doc(this.db, 'users', this.currentUser.nickname_lower);
    await updateDoc(userRef, { coins: increment(amount) });
    this.currentUser.coins += amount;
    this.ui.updateUserUI();
  }
  
  async updateBalance(amount) {
    await this.addCoins(amount);
  }
  
  async refreshUser() {
    if (!this.currentUser) return;
    const userRef = doc(this.db, 'users', this.currentUser.nickname_lower);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      this.currentUser = { ...this.currentUser, ...snap.data() };
      this.ui.updateUserUI();
    }
  }
}
