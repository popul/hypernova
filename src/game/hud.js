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
        <div class="hud-block hud-credits" id="hud-credits-bloc">
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
        <div class="boss-label"><span id="boss-nom">KORN — Dévoreur de Mondes</span><span class="boss-acte" id="boss-acte"></span></div>
        <div class="boss-track"><div class="boss-fill" id="boss-fill"></div></div>
      </div>
      <div class="announce" id="announce"></div>
      <div class="hud-hints">← → gauche/droite (×2 pirouette) · ↑ ↓ avancer/reculer · C appel · X bombe · P pause · M son</div>
      <div class="hud-touch">
        <button id="btn-pause-touch" aria-label="Pause">⏸</button>
        <button id="btn-sound-touch" aria-label="Couper le son">♪</button>
        <!-- LE MICRO N'EXISTAIT QU'AU MENU. On pouvait appeler un copain depuis
             l'écran des copains, et plus rien ensuite : une fois en partie, ni
             pour décrocher, ni pour se couper. Or c'est EN JOUANT qu'on se parle.
             Le bouton n'apparaît que s'il y a quelqu'un à qui parler. -->
        <button id="btn-micro-touch" class="hidden" aria-label="Micro">🎙</button>
      </div>
      <button class="btn-energy-touch" id="btn-energy-touch" aria-label="Bombe / Overdrive">✦</button>
      <button class="btn-call-touch" id="btn-call-touch" aria-label="Appel des crédits">◉<i></i></button>
      <div class="credit-pops" id="credit-pops"></div>
    `;
    this.el = Object.fromEntries(
      [
        'btn-call-touch',
        'boss-nom',
        'btn-micro-touch',
        'hud-score',
        'hud-hiscore',
        'hud-wave',
        'hud-credits',
        'hud-credits-bloc',
        'hud-combo',
        'combo-mult',
        'combo-fill',
        'hud-lives',
        'boss-bar',
        'boss-fill',
        'boss-acte',
        'announce',
        'credit-pops',
        'hud-energy',
        'energy-fill',
        'energy-label',
      ].map((id) => [id, root.querySelector('#' + id)])
    );
    this._cache = {};
    this._announceTimer = null;
    this._announceJusqua = 0;
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

  // Le mode Survie n'a pas de monnaie : afficher « Crédits 0 » pendant cent vagues
  // annoncerait une mécanique qui n'existe pas, et le joueur chercherait où
  // dépenser.
  setModeSurvie(actif) {
    this.el['hud-credits-bloc']?.classList.toggle('hidden', !!actif);
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

  // LE NOM N'EST PLUS ÉCRIT DANS LE GABARIT. Il l'était, et c'était juste tant
  // que KORN était le seul boss du jeu. Depuis qu'on affronte des ombres, une
  // barre qui annonce « KORN » au-dessus de l'ombre d'HÉLIOS ment au joueur au
  // pire moment — celui où il essaie de comprendre à quoi il a affaire.
  // L'ÉTAT DU MICRO, EN UN GLYPHE.
  //
  //   null      — personne à qui parler : le bouton n'existe pas
  //   'appeler' — un copain est là, la ligne est fermée
  //   'sonne'   — ça sonne, d'un côté ou de l'autre
  //   'ouvert'  — on s'entend
  //   'muet'    — on s'entend, mais on a coupé son micro
  setMicro(etat) {
    const b = this.el['btn-micro-touch'];
    if (!b) return;
    b.classList.toggle('hidden', !etat);
    if (!etat) return;
    b.textContent = { appeler: '📞', sonne: '📳', ouvert: '🎙', muet: '🔇' }[etat] || '🎙';
    b.classList.toggle('micro-ouvert', etat === 'ouvert');
    b.classList.toggle('micro-muet', etat === 'muet');
    b.setAttribute(
      'aria-label',
      {
        appeler: 'Appeler le copain',
        sonne: 'Ça sonne',
        ouvert: 'Couper le micro',
        muet: 'Rouvrir le micro',
      }[etat] || 'Micro'
    );
  }

  showBossBar(nom = 'KORN', sous = 'Dévoreur de Mondes') {
    this.el['boss-bar'].classList.add('visible');
    if (this.el['boss-nom']) this.el['boss-nom'].textContent = sous ? `${nom} — ${sous}` : nom;
    this.setBossHp(1);
    this.setBossPhase(1);
  }

  setBossHp(frac) {
    this.el['boss-fill'].style.transform = `scaleX(${Math.max(0, frac)})`;
  }

  // 1, 2 ou 3 — et 0 quand il n'y a plus de boss. Les deux repères de la barre
  // annoncent les trois actes DÈS la première seconde du combat : une jauge qui ne
  // révélerait ses tronçons qu'en les franchissant n'aurait rien annoncé du tout.
  // Le reste (teinte, halo, battement) dit lequel on joue, pour le joueur qui n'a
  // pas le temps d'estimer une longueur restante.
  setBossPhase(phase) {
    const p = Math.min(3, Math.max(0, Math.round(phase) || 0));
    if (this._cache.bossPhase === p) return;
    this._cache.bossPhase = p;
    const bar = this.el['boss-bar'];
    bar.classList.remove('phase-1', 'phase-2', 'phase-3');
    if (p >= 1) bar.classList.add(`phase-${p}`);
    this._set('boss-acte', p >= 1 ? ` · ACTE ${['I', 'II', 'III'][p - 1]}` : '');
  }

  hideBossBar() {
    this.el['boss-bar'].classList.remove('visible');
    this.setBossPhase(0);
  }

  // title/sub sont échappés : ils peuvent venir des JSON de campagne (noms de systèmes).
  // `priorite` protège une annonce : tant qu'elle est à l'écran, rien ne l'écrase.
  //
  // Sans ça, le changement d'acte d'un boss — le moment fort du combat — se faisait
  // effacer par un « Combo ×2 » arrivé un dixième de seconde plus tard. Mesuré en
  // jeu : c'est même le cas le PLUS fréquent, puisqu'on enchaîne les touches
  // précisément quand on entame un tiers de sa coque.
  announce(title, sub = '', duration = 2200, priorite = false) {
    if (!priorite && this._announceJusqua > performance.now()) return;
    this._announceJusqua = priorite ? performance.now() + duration : 0;
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
