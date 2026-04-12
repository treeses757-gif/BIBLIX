// Добавляем импорт getAuth для получения текущего пользователя Firebase
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

export class AuthManager {
  constructor(db) {
    this.db = db;
    this.currentUser = null;
    this.ui = null;
    this.auth = getAuth(); // получаем экземпляр Auth
    // Анонимный вход сразу при создании (чтобы был uid)
    this.anonymousLoginPromise = signInAnonymously(this.auth).catch(e => console.warn('RTDB auth skipped', e));
  }
  
  // ... остальные методы без изменений ...

  async login(nickname, password) {
    // ... существующий код ...
    // После успешного входа добавим uid из Firebase Auth
    const firebaseUser = this.auth.currentUser;
    const uid = firebaseUser ? firebaseUser.uid : docSnap.id; // fallback
    this.currentUser = { 
      nickname: userData.nickname, 
      ...userData, 
      id: uid,  // теперь это настоящий uid
      firestoreId: docSnap.id // сохраним и ник для Firestore
    };
    // ...
  }

  async checkAutoLogin() {
    // ... аналогично добавить uid
  }
}
