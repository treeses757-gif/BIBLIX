import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class UploadManager {
  constructor(db, storage, authManager) {
    this.db = db;
    this.auth = authManager;
    this.ui = null;
  }

  setUI(ui) { this.ui = ui; }

  fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  fileToText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async uploadGame(title, players, avatarFile, htmlFile) {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Не авторизован');

    try {
      const avatarUrl = await this.fileToDataURL(avatarFile);
      const htmlContent = await this.fileToText(htmlFile);

      const gameData = {
        title,
        players,
        authorNickname: user.nickname,
        authorUid: user.nickname_lower, // используем nickname_lower как UID
        avatarUrl,
        htmlContent,
        likes: 0,
        dislikes: 0,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(this.db, 'games'), gameData);
      await this.auth.addCoins(100);
      return docRef.id;
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Ошибка загрузки: ${error.message}`);
    }
  }
}
