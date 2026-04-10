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
    
    try {
      // Загрузка аватарки
      const avatarExt = avatarFile.name.split('.').pop();
      const avatarPath = `avatars/${Date.now()}_${user.nickname}.${avatarExt}`;
      const avatarRef = ref(this.storage, avatarPath);
      const avatarSnapshot = await uploadBytes(avatarRef, avatarFile);
      const avatarUrl = await getDownloadURL(avatarSnapshot.ref);
      
      // Загрузка HTML
      const htmlPath = `games/${Date.now()}_${user.nickname}.html`;
      const htmlRef = ref(this.storage, htmlPath);
      const htmlSnapshot = await uploadBytes(htmlRef, htmlFile);
      const htmlUrl = await getDownloadURL(htmlSnapshot.ref);
      
      // Создание документа игры
      const gameData = {
        title,
        players,
        authorNickname: user.nickname,
        authorUid: user.nickname_lower || user.id,
        avatarUrl,
        htmlUrl,
        likes: 0,
        dislikes: 0,
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(this.db, 'games'), gameData);
      
      // Начисление монет автору
      const userRef = doc(this.db, 'users', user.nickname_lower);
      await updateDoc(userRef, { coins: increment(100) });
      
      // Обновляем локального пользователя
      user.coins += 100;
      
      return docRef.id;
    } catch (error) {
      console.error('Upload error:', error);
      if (error.code === 'storage/unauthorized') {
        throw new Error('Нет прав для загрузки файлов. Проверьте правила Storage.');
      } else if (error.code === 'permission-denied') {
        throw new Error('Нет доступа к Firestore. Проверьте правила базы данных.');
      } else {
        throw new Error('Ошибка загрузки: ' + (error.message || 'неизвестная ошибка'));
      }
    }
  }
}
