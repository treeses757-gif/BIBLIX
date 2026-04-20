// ========== FILE: src/js/shop/ShopManager.js ==========
import { doc, updateDoc, arrayUnion, increment } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class ShopManager {
  constructor(db, authManager) {
    this.db = db;
    this.auth = authManager;
    this.ui = null;
    
    this.skins = [
      { id: 'default', name: 'Стандартный', price: 0, gradient: '#6C5CE7' },
      { id: 'gold', name: 'Золотой', price: 500, gradient: 'linear-gradient(145deg, #FFD700, #B8860B)' },
      { id: 'neon', name: 'Неоновый', price: 1000, gradient: '#00FFFF', glow: '0 0 15px #00FFFF' },
      { id: 'cyberpunk', name: 'Киберпанк', price: 1500, gradient: 'repeating-linear-gradient(45deg, #ff00ff, #00ffff 10px)' }
    ];
  }
  
  setUI(ui) { this.ui = ui; }
  
  renderShop() {
    const container = document.getElementById('shop-content');
    const user = this.auth.currentUser;
    if (!user) return;
    
    const inventory = user.inventory || ['default'];
    
    container.innerHTML = this.skins.map(skin => {
      const owned = inventory.includes(skin.id);
      const isActive = user.currentSkin === skin.id;
      return `
        <div class="skin-card">
          <div style="display: flex; align-items: center;">
            <div class="skin-preview" style="background: ${skin.gradient}; ${skin.glow ? 'box-shadow:'+skin.glow : ''}"></div>
            <div>
              <div><strong>${skin.name}</strong></div>
              <div style="color: gold;">💰 ${skin.price}</div>
            </div>
          </div>
          ${owned ? 
            (isActive ? '<span>Активен</span>' : '<button class="btn btn-outline-small equip-skin" data-skin="'+skin.id+'">Выбрать</button>') :
            `<button class="btn btn-primary buy-skin" data-skin="${skin.id}" data-price="${skin.price}">Купить</button>`
          }
        </div>
      `;
    }).join('');
    
    container.querySelectorAll('.buy-skin').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const skinId = btn.dataset.skin;
        const price = parseInt(btn.dataset.price);
        await this.buySkin(skinId, price);
      });
    });
    
    container.querySelectorAll('.equip-skin').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        await this.equipSkin(btn.dataset.skin);
      });
    });
  }
  
  async buySkin(skinId, price) {
    const user = this.auth.currentUser;
    if (!user) return;
    if (user.coins < price) {
      this.ui.showToast('Недостаточно монет', 'error');
      return;
    }
    
    try {
      const userRef = doc(this.db, 'users', user.nickname_lower);
      await updateDoc(userRef, {
        coins: increment(-price),
        inventory: arrayUnion(skinId)
      });
      
      await this.auth.refreshUser();
      this.ui.showToast('Скин куплен!', 'success');
      this.renderShop();
      this.ui.updateUserUI();
    } catch (error) {
      this.ui.showToast('Ошибка покупки', 'error');
    }
  }
  
  async equipSkin(skinId) {
    const user = this.auth.currentUser;
    if (!user) return;
    
    try {
      const userRef = doc(this.db, 'users', user.nickname_lower);
      await updateDoc(userRef, { currentSkin: skinId });
      await this.auth.refreshUser();
      this.ui.applyAvatarSkin(document.getElementById('user-avatar'), skinId);
      this.renderShop();
      this.ui.showToast('Скин применён', 'success');
    } catch (error) {
      this.ui.showToast('Ошибка', 'error');
    }
  }
  
  renderInventory() {
    const container = document.getElementById('inventory-list');
    const user = this.auth.currentUser;
    if (!user) return;
    
    const inventory = user.inventory || ['default'];
    const skins = this.skins.filter(s => inventory.includes(s.id));
    
    container.innerHTML = skins.map(skin => `
      <div class="skin-card">
        <div class="skin-preview" style="background: ${skin.gradient};"></div>
        <div>${skin.name}</div>
        <button class="btn btn-outline-small equip-skin" data-skin="${skin.id}">${user.currentSkin === skin.id ? 'Активен' : 'Выбрать'}</button>
      </div>
    `).join('');
    
    container.querySelectorAll('.equip-skin').forEach(btn => {
      btn.addEventListener('click', () => this.equipSkin(btn.dataset.skin));
    });
  }
}