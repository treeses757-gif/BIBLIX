// ========== FILE: src/js/main.js ==========
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

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// Глобальные ссылки для доступа из других модулей
window.db = db;
window.rtdb = rtdb;

// Создание менеджеров
const ui = new UIManager();
const auth = new AuthManager(db);
const shop = new ShopManager(db, auth);
const upload = new UploadManager(db, null, auth);
const gameLauncher = new GameLauncher(db, rtdb, auth);
const matchmaker = new Matchmaker(rtdb, db, auth, gameLauncher);
const userGameController = new UserGameController(rtdb, auth);

// Связывание зависимостей
ui.setAuthManager(auth);
ui.setShopManager(shop);
ui.setUploadManager(upload);
ui.setGameLauncher(gameLauncher);
ui.setMatchmaker(matchmaker);
auth.setUI(ui);
shop.setUI(ui);
upload.setUI(ui);
gameLauncher.setUI(ui);
matchmaker.setUI(ui);

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
  initStarfield();
  feather.replace();
  ui.initEventListeners(); // <-- важная строка
  await auth.checkAutoLogin();
  await ui.loadGames();
  await ui.ensureDemoGameExists();
  document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
});

// Звёздное поле
function initStarfield() {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  let width, height;
  let stars = [];
  
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    stars = Array.from({ length: 150 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 0.2 + 0.05
    }));
  }
  
  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      s.y += s.speed;
      if (s.y > height) {
        s.y = 0;
        s.x = Math.random() * width;
      }
    });
    requestAnimationFrame(draw);
  }
  
  window.addEventListener('resize', resize);
  resize();
  draw();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    document.getElementById('fullscreen-btn').textContent = '✕';
  } else {
    document.exitFullscreen();
    document.getElementById('fullscreen-btn').textContent = '⛶';
  }
}

// Экспорт для отладки
window.BIBLIX = { ui, auth, shop, upload, gameLauncher, matchmaker, userGameController };
