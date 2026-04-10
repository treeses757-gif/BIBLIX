// ========== FILE: src/js/upload/UploadManager.js ==========
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

export class UploadManager {
  constructor(db, storage, authManager) {
    this.db = db;
    this.storage = storage;
    this.auth = authManager;
    this.ui = null;
  }
  
  setUI(ui) { this.ui = ui; }
  
  async uploadGame(title, players, avatarFile, htmlFile) {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Не авторизован');
    
    // Загрузка аватарки
    const avatarExt = avatarFile.name.split('.').pop();
    const avatarPath = `avatars/${Date.now()}_${user.nickname}.${avatarExt}`;
    const avatarRef = ref(this.storage, avatarPath);
    await uploadBytes(avatarRef, avatarFile);
    const avatarUrl = await getDownloadURL(avatarRef);
    
    // Загрузка HTML
    const htmlPath = `games/${Date.now()}_${user.nickname}.html`;
    const htmlRef = ref(this.storage, htmlPath);
    await uploadBytes(htmlRef, htmlFile);
    const htmlUrl = await getDownloadURL(htmlRef);
    
    // Создание документа игры
    const gameData = {
      title,
      players,
      authorNickname: user.nickname,
      authorUid: user.id,
      avatarUrl,
      htmlUrl,
      likes: 0,
      dislikes: 0,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(this.db, 'games'), gameData);
    
    // Начисление монет автору (единоразово)
    await this.auth.addCoins(100);
    
    return docRef.id;
  }
}