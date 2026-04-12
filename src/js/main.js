import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

import { UIManager } from "./ui/UIManager.js";
import { AuthManager } from "./auth/AuthManager.js";
import { ShopManager } from "./shop/ShopManager.js";
import { UploadManager } from "./upload/UploadManager.js";
import { GameLauncher } from "./games/GameLauncher.js";
import { UserGameController } from "./games/UserGameController.js";
import { Matchmaker } from "./matchmaking/Matchmaker.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

window.db = db;
window.rtdb = rtdb;

const ui = new UIManager();
const auth = new AuthManager(db); // анонимный вход внутри
const shop = new ShopManager(db, auth);
const upload = new UploadManager(db, null, auth);
const gameLauncher = new GameLauncher(db, rtdb, auth);
const matchmaker = new Matchmaker(rtdb, db, auth, gameLauncher);
const userGameController = new UserGameController(rtdb, auth);

// ... привязка UI ...

document.addEventListener('DOMContentLoaded', async () => {
  initStarfield();
  feather.replace();
  ui.initEventListeners();
  // Ждём завершения анонимного входа перед проверкой авто-логина
  await auth.anonymousLoginPromise;
  await auth.checkAutoLogin();
  await ui.loadGames();
  // ...
});
