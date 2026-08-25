// HUD en DOM par-dessus le canvas : score, crédits, combo, vies, annonces, barre de boss.
// Les valeurs sont mises en cache pour ne toucher le DOM que lorsqu'elles changent.

import { OVERDRIVE } from './constants.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-block hud-score">
          <div class="hud-label">Score</div>
          <div class="hud-value" id="hud-score">0</div>
          <div class="hud-sub">Record <span id="hud-hiscore">0</span></div>
        </div>
        <div class="hud-block hud-wave">
          <div class="hud-label">Vague</div>
          <div class="hud-value" id="hud-wave">1</div>
        </div>
        <div class="hud-block hud-credits">
          <div class="hud-label">Crédits</div>
          <div class="hud-value gold" id="hud-credits">0</div>
        </div>
      </div>
      <div class="hud-combo" id="hud-combo">
        <div class="combo-mult" id="combo-mult">×2</div>
        <div class="combo-bar"><div class="combo-fill" id="combo-fill"></div></div>
      </div>
      <div class="hud-lives" id="hud-lives"></div>
      <div class="hud-energy" id="hud-energy">
        <div class="energy-track"><div class="energy-fill" id="energy-fill"></div></div>
        <div class="energy-label" id="energy-label">X</div>
      </div>
      <div class="boss-bar" id="boss-bar">
        <div class="boss-label">KORN — Dévoreur de Mondes</div>
        <div class="boss-track"><div class="boss-fill" id="boss-fill"></div></div>
      </div>
      <div class="announce" id="announce"></div>
      <div class="hud-hints">← → gauche/droite (×2 pirouette) · ↑ ↓ avancer/reculer · C appel · X bombe · P pause · M son</div>
      <div class="hud-touch">
        <button id="btn-pause-touch" aria-label="Pause">⏸</button>
        <button id="btn-sound-touch" aria-label="Couper le son">♪</button>
      </div>
      <button class="btn-energy-touch" id="btn-energy-touch" aria-label="Bombe / Overdrive">✦</button>
      <button class="btn-call-touch" id="btn-call-touch" aria-label="Appel des crédits">◉<i></i></button>
      <div class="credit-pops" id="credit-pops"></div>
    `;
    this.el = Object.fromEntries(
      [
        'btn-call-touch',
        'hud-score',
        'hud-hiscore',
        'hud-wave',
        'hud-credits',
        'hud-combo',
        'combo-mult',
        'combo-fill',
        'hud-lives',
        'boss-bar',
        'boss-fill',
        'announce',
        'credit-pops',
        'hud-energy',
        'energy-fill',
        'energy-label',
      ].map((id) => [id, root.querySelector('#' + id)])
    );
    this._cache = {};
    this._announceTimer = null;
  }

  _set(id, value) {
    if (this._cache[id] !== value) {
      this._cache[id] = value;
      this.el[id].textContent = value;
    }
  }

  setScore(v) {
    this._set('hud-score', String(v));
  }

  setHiscore(v) {
    this._set('hud-hiscore', String(v));
  }

  setWave(v) {
    this._set('hud-wave', String(v));
  }

  setCredits(v) {
    this._set('hud-credits', String(v));
  }

  setLives(n) {
    if (this._cache.lives === n) return;
    this._cache.lives = n;
    this.el['hud-lives'].innerHTML = Array.from(
      { length: Math.max(0, n) },
      () => '<span class="life"></span>'
    ).join('');
  }

  setCombo(mult, timeFrac) {
    const show = mult > 1;
    this.el['hud-combo'].classList.toggle('visible', show);
    if (show) {
      this._set('combo-mult', `×${mult}`);
      this.el['combo-fill'].style.transform = `scaleX(${Math.max(0, Math.min(1, timeFrac))})`;
    }
  }

  pulseCombo() {
    const el = this.el['combo-mult'];
    el.classList.remove('pulse');
    void el.offsetWidth; // relance l'animation CSS
    el.classList.add('pulse');
  }

  // frac 0→1. L'étiquette annonce ce qui est disponible : sans elle, personne ne
  // devine qu'une touche existe.
  // Appels restants pour la vague. On affiche le NOMBRE, pas une jauge : une
  // ressource qui ne se recharge pas se compte, elle ne se remplit pas.
  setCall(reste, total = 1) {
    const b = this.el['btn-call-touch'];
    if (!b) return;
    b.classList.toggle('ready', reste > 0);
    b.classList.toggle('spent', reste <= 0);
    b.dataset.left = total > 1 ? String(reste) : '';
  }

  setEnergy(frac) {
    const pct = Math.max(0, Math.min(1, frac));
    this.el['energy-fill'].style.transform = `scaleY(${pct})`;
    const el = this.el['hud-energy'];
    const bombReady = pct >= OVERDRIVE.bombCost / OVERDRIVE.max;
    const odReady = pct >= 1;
    el.classList.toggle('bomb-ready', bombReady);
    el.classList.toggle('od-ready', odReady);
    const label = odReady ? 'MAINTIENS' : bombReady ? 'BOMBE' : 'X';
    this._set('energy-label', label);
  }

  setOverdrive(active) {
    this.el['hud-energy'].classList.toggle('overdrive', active);
    this.root.classList.toggle('overdrive', active);
  }

  showBossBar() {
    this.el['boss-bar'].classList.add('visible');
    this.setBossHp(1);
  }

  setBossHp(frac) {
    this.el['boss-fill'].style.transform = `scaleX(${Math.max(0, frac)})`;
  }

  hideBossBar() {
    this.el['boss-bar'].classList.remove('visible');
  }

  // title/sub sont échappés : ils peuvent venir des JSON de campagne (noms de systèmes).
  announce(title, sub = '', duration = 2200) {
    const el = this.el['announce'];
    el.innerHTML = `<div class="announce-title">${esc(title)}</div>${
      sub ? `<div class="announce-sub">${esc(sub)}</div>` : ''
    }`;
    el.classList.remove('visible');
    void el.offsetWidth;
    el.classList.add('visible');
    if (this._announceTimer) clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => el.classList.remove('visible'), duration);
  }

  // Étiquette « FRÔLÉ ! » à l'endroit exact du frôlement : c'est ce qui apprend
  // au joueur d'où vient l'énergie.
  grazePop(x, y) {
    const pops = this.el['credit-pops'];
    if (pops.childElementCount > 14) pops.firstElementChild.remove();
    const span = document.createElement('span');
    span.className = 'graze-pop';
    span.textContent = 'FRÔLÉ !';
    span.style.left = `${x}px`;
    span.style.top = `${y}px`;
    pops.appendChild(span);
    setTimeout(() => span.remove(), 800);
  }

  // La jauge accuse le coup à chaque frôlement : le lien de cause à effet est visible.
  pulseEnergy() {
    const el = this.el['hud-energy'];
    el.classList.remove('gain');
    void el.offsetWidth;
    el.classList.add('gain');
  }

  // Petit "+N" doré qui flotte à l'écran, à la position (px) donnée.
  creditPop(x, y, text, big = false) {
    const pops = this.el['credit-pops'];
    if (pops.childElementCount > 14) pops.firstElementChild.remove();
    const span = document.createElement('span');
    span.className = big ? 'credit-pop big' : 'credit-pop';
    span.textContent = text;
    span.style.left = `${x}px`;
    span.style.top = `${y}px`;
    pops.appendChild(span);
    setTimeout(() => span.remove(), 900);
  }
}
