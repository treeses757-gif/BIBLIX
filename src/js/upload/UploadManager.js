import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
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
    
    try {
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
        authorUid: user.id || user.nickname_lower,
        avatarUrl,
        htmlUrl,
        likes: 0,
        dislikes: 0,
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(this.db, 'games'), gameData);
      
      // Начисление монет автору
      await this.auth.addCoins(100);
      
      return docRef.id;
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Ошибка загрузки: ${error.message}`);
    }
  }
}
