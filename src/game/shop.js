// Boutique entre les vagues : cartes d'améliorations, achats à la souris ou au clavier (1-7),
// lancement de la vague suivante avec Entrée.

import { UPGRADES, priceOf } from './upgrades.js';

export class Shop {
  constructor(overlayRoot, { onBuy, onLaunch }) {
    this.root = overlayRoot;
    this.onBuy = onBuy;
    this.onLaunch = onLaunch;
    this.panel = null;
    this._keyHandler = null;
  }

  open(state) {
    this.close();
    this.panel = document.createElement('div');
    this.panel.className = 'screen shop';
    this.panel.innerHTML = `
      <div class="shop-head">
        <h2 class="shop-title">Hangar d'armement</h2>
        <div class="shop-credits">Crédits <span class="gold" id="shop-credits">${state.credits}</span></div>
      </div>
      <div class="shop-grid" id="shop-grid"></div>
      <button class="btn-launch" id="btn-launch">
        Lancer la vague ${state.wave} <span class="key-hint">Entrée</span>
      </button>
    `;
    this.root.appendChild(this.panel);
    this.panel.querySelector('#btn-launch').addEventListener('click', () => this.onLaunch());
    this.refresh(state);

    this._keyHandler = (e) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        this.onLaunch();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const idx = Number(e.code.slice(5)) - 1;
        if (idx < UPGRADES.length) this.onBuy(UPGRADES[idx].id);
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  refresh(state) {
    if (!this.panel) return;
    this.panel.querySelector('#shop-credits').textContent = state.credits;
    const grid = this.panel.querySelector('#shop-grid');
    grid.innerHTML = '';
    UPGRADES.forEach((u, i) => {
      const level = state.levels[u.id];
      const maxed = level >= u.maxLevel;
      const price = maxed ? 0 : priceOf(u, level);
      const affordable = !maxed && state.credits >= price;
      const card = document.createElement('button');
      card.className = `card${maxed ? ' maxed' : affordable ? '' : ' locked'}`;
      card.style.setProperty('--stagger', `${i * 55}ms`);
      card.innerHTML = `
        <span class="card-key">${i + 1}</span>
        <span class="card-icon">${u.icon}</span>
        <span class="card-name">${u.name}</span>
        <span class="card-pips">${Array.from({ length: u.maxLevel }, (_, p) =>
          `<i class="pip${p < level ? ' on' : ''}"></i>`
        ).join('')}</span>
        <span class="card-desc">${u.desc}</span>
        <span class="card-price">${maxed ? 'MAX' : `${price} ¤`}</span>
      `;
      if (!maxed) card.addEventListener('click', () => this.onBuy(u.id));
      grid.appendChild(card);
    });
  }

  close() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
