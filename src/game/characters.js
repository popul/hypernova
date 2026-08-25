// Les personnages du jeu, façon fenêtres de communication à la Star Fox.
//
// NOVA — l'IA copilote : pilote holographique à la crête lumineuse cyan-magenta,
// grands yeux vifs, sourire en coin. Confiante, chaleureuse, un brin cabotine.
// VORAX, le Dévoreur d'Étoiles — seigneur de l'essaim : tête blindée couronnée de
// pointes, cornes, fissures incandescentes, œil unique furieux. Théâtral et vaniteux.
//
// Une seule fenêtre de comm (portrait animé + nom + texte) : la bouche s'anime pendant
// la réplique, la voix est une salve de blips synthétiques. Anti-spam intégré.

const NOVA_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="nova-crest" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4ff2ff"/>
      <stop offset="100%" stop-color="#ff3df0"/>
    </linearGradient>
    <radialGradient id="nova-face" cx="45%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#eafcff"/>
      <stop offset="70%" stop-color="#9fe8f5"/>
      <stop offset="100%" stop-color="#57c6dd"/>
    </radialGradient>
  </defs>
  <!-- crête lumineuse balayée vers l'arrière -->
  <path d="M14 30 Q10 12 30 8 Q52 5 56 22 Q58 30 52 36 Q54 20 40 16 Q24 13 20 26 Z"
        fill="url(#nova-crest)" opacity="0.92"/>
  <path d="M50 20 Q60 24 58 36 Q54 46 48 48 Q53 38 50 30 Z" fill="url(#nova-crest)" opacity="0.6"/>
  <!-- visage -->
  <path d="M18 26 Q18 12 33 12 Q48 12 48 27 Q48 42 40 48 Q33 52 26 48 Q18 42 18 26 Z"
        fill="url(#nova-face)" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>
  <!-- oreillette -->
  <rect x="11" y="28" width="6" height="11" rx="3" fill="#0b4c63" stroke="#4ff2ff" stroke-width="1.2"/>
  <circle cx="14" cy="33.5" r="1.6" fill="#ffe066"/>
  <!-- sourcils : l'attitude -->
  <path d="M22 25 Q26 22 30 24" stroke="#0b4c63" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M36 24 Q41 21 45 24" stroke="#0b4c63" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <!-- yeux : iris cyan, éclat -->
  <g class="ch-eye">
    <ellipse cx="26.5" cy="30.5" rx="3.7" ry="4.8" fill="#083a4a"/>
    <circle cx="27.4" cy="29.6" r="1.5" fill="#4ff2ff"/>
    <circle cx="25.8" cy="28.4" r="0.9" fill="#ffffff"/>
  </g>
  <g class="ch-eye">
    <ellipse cx="40.5" cy="30.5" rx="3.7" ry="4.8" fill="#083a4a"/>
    <circle cx="41.4" cy="29.6" r="1.5" fill="#4ff2ff"/>
    <circle cx="39.8" cy="28.4" r="0.9" fill="#ffffff"/>
  </g>
  <!-- marques holographiques sur les joues -->
  <path d="M20.5 36 L24 36" stroke="#ff3df0" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
  <path d="M43 36 L46.5 36" stroke="#ff3df0" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
  <!-- sourire en coin, sûre d'elle -->
  <path class="ch-mouth" d="M27 42 Q33 46 39.5 40.5" fill="none" stroke="#0b4c63" stroke-width="2.4"
        stroke-linecap="round"/>
  <!-- micro-perche -->
  <path d="M46 41 Q52 44 50.5 48" stroke="#4ff2ff" stroke-width="1.6" fill="none"/>
  <circle cx="50.5" cy="48" r="1.9" fill="#4ff2ff"/>
</svg>`;

const VORAX_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="vorax-armor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a12744"/>
      <stop offset="55%" stop-color="#57112a"/>
      <stop offset="100%" stop-color="#20060f"/>
    </linearGradient>
    <radialGradient id="vorax-eye" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#fff6c8"/>
      <stop offset="45%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#ff7a1a"/>
    </radialGradient>
  </defs>
  <!-- couronne à pointes -->
  <path d="M16 18 L20 6 L26 15 L32 3 L38 15 L44 6 L48 18 Z"
        fill="#2c0a18" stroke="#ff4757" stroke-width="1.4"/>
  <!-- cornes -->
  <path d="M12 22 Q2 26 6 38 Q10 30 16 28 Z" fill="#57112a" stroke="#ff4757" stroke-width="1.2"/>
  <path d="M52 22 Q62 26 58 38 Q54 30 48 28 Z" fill="#57112a" stroke="#ff4757" stroke-width="1.2"/>
  <!-- tête blindée -->
  <path d="M16 18 L48 18 L52 34 L44 52 L20 52 L12 34 Z"
        fill="url(#vorax-armor)" stroke="#ff4757" stroke-width="1.6"/>
  <!-- fissures incandescentes -->
  <path d="M20 24 L24 30 M44 24 L40 30 M32 44 L32 47" stroke="#ff4757" stroke-width="1.2" opacity="0.85"/>
  <!-- arcade furieuse au-dessus de l'œil -->
  <path d="M20 27 L30 31 M44 27 L34 31" stroke="#1d0510" stroke-width="4" stroke-linecap="round"/>
  <!-- œil unique incandescent -->
  <g class="ch-bigeye">
    <ellipse cx="32" cy="34.5" rx="9.5" ry="7.5" fill="url(#vorax-eye)"/>
    <circle cx="32" cy="34.5" r="3.2" fill="#20060f"/>
    <circle cx="30.4" cy="33" r="1.1" fill="#fff6d8"/>
  </g>
  <!-- mâchoire crantée, sourire mauvais -->
  <path class="ch-mand left" d="M22 46 L26 50 L29.5 46" fill="none" stroke="#ff9f43"
        stroke-width="2.4" stroke-linejoin="round"/>
  <path class="ch-mand right" d="M34.5 46 L38 50 L42 46" fill="none" stroke="#ff9f43"
        stroke-width="2.4" stroke-linejoin="round"/>
  <!-- épaulières -->
  <path d="M10 57 L21 51 M54 57 L43 51" stroke="#57112a" stroke-width="5" stroke-linecap="round"/>
</svg>`;

const LINES = {
  runStart: [
    'Systèmes en ligne. Montre-leur qui pilote !',
    'Moteurs chauds, canons parés. On décolle !',
    'Je surveille tes arrières, comme toujours.',
  ],
  missionStart: [
    'Briefing chargé. Fais-nous briller, capitaine.',
    'Nouveau système, mêmes mauvaises manières. Nettoyons.',
  ],
  combo3: ['Combo ×3 ! Ils n’ont rien vu venir !', 'Trois d’un coup ! Continue comme ça !'],
  combo5: ['×5 ?! J’inscris ça dans les annales !', 'Combo maximal ! Tu es en feu !'],
  dive: [
    'Ils plongent ! Esquive serrée !',
    'Kamikazes en approche — bouge, bouge !',
    'Deux plongeurs sur toi. Je te fais confiance.',
  ],
  shieldLost: ['Bouclier encaissé ! Je le recharge, tiens bon.', 'Impact absorbé. Ça va secouer !'],
  lifeLost: [
    'On tient le coup ! Il nous reste des ailes.',
    'Aïe. Respire, réaligne, riposte.',
    'Je répare ce que je peux — reste concentré !',
  ],
  bossIntro: [
    'C’est VORAX, le Dévoreur d’Étoiles. Vise l’œil !',
    'Le voilà. Grand, cornu, et très vexable. Feu !',
  ],
  voraxIntro: [
    'Vos étoiles m’appartiennent, petit pilote.',
    'Encore toi ?! L’essaim est ÉTERNEL.',
    'Ce système est à MOI. Comme tous les autres.',
  ],
  voraxHalf: ['Tu… commences à m’AGACER !', 'Mes drones ! Peu importe. J’en ai des MILLIERS.'],
  bossDown: ['VORAX balayé ! La lumière revient.', 'Et une étoile de reprise, une !'],
  voraxDown: ['Ce n’est… qu’un repli TACTIQUE !', 'Impossible ! Mes drones ! Mes beaux drones !'],
  shopOpen: [
    'Un conseil ? Les missiles. C’est mon nom dessus.',
    'Le bouclier m’aide à t’aider. Pense à nous.',
    'Cadence de tir : le classique qui ne déçoit jamais.',
  ],
  buyGood: ['Excellent choix !', 'Ça, c’est de l’armement.', 'Je le branche tout de suite !'],
  missionWon: ['Système libéré ! Cap sur la suite.', 'Encore un pas vers Sagittarius A★ !'],
  gameOver: [
    'On les aura la prochaine fois. Je crois en toi.',
    'Chaque grand pilote a connu ça. Redécolle !',
  ],
  novaIntro: ['Je suis NOVA, ta copilote. En piste, pilote !'],
  // Tutoriel contextuel : ces répliques n'apparaissent qu'à la première occasion.
  grazeFirst: ['Tu l’as frôlée ! Passe près des balles, ça charge la jauge.'],
  bombReady: ['Jauge pleine à moitié — appuie sur X pour la NOVA BOMB !'],
  bombReadyTouch: ['Jauge à moitié — touche le bouton ✦ pour la NOVA BOMB !'],
  odReady: ['Jauge PLEINE ! MAINTIENS X : Overdrive, score doublé !'],
  odReadyTouch: ['Jauge PLEINE ! MAINTIENS le bouton ✦ : Overdrive !'],
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const BUBBLE_TIME = 3800; // ms d'affichage d'une réplique
const TALK_TIME = 1600; // ms d'animation de bouche
const QUIET_TIME = 5000; // ms minimum entre deux répliques non prioritaires

export class Characters {
  // Monté au niveau de l'app (pas dans le HUD) : les personnages parlent aussi
  // par-dessus la cinématique et les écrans de victoire/défaite.
  constructor(appRoot, audio) {
    this.audio = audio;
    this.el = document.createElement('div');
    this.el.className = 'comm';
    this.el.innerHTML = `
      <div class="comm-portrait">
        <span class="comm-face nova">${NOVA_SVG}</span>
        <span class="comm-face vorax">${VORAX_SVG}</span>
      </div>
      <div class="comm-panel">
        <span class="comm-name" id="comm-name">NOVA</span>
        <span class="comm-text" id="comm-text"></span>
      </div>
    `;
    appRoot.appendChild(this.el);
    this.nameEl = this.el.querySelector('#comm-name');
    this.textEl = this.el.querySelector('#comm-text');
    this.lastShown = -Infinity;
    this.hideTimer = null;
    this.talkTimer = null;
  }

  sayText(text, { speaker = 'nova', priority = false } = {}) {
    const now = performance.now();
    if (!priority && now - this.lastShown < QUIET_TIME) return;
    this.lastShown = now;
    this.el.classList.remove('vorax-mode', 'nova-mode');
    // Relance l'animation d'allumage de la fenêtre de comm.
    void this.el.offsetWidth;
    this.el.classList.add(speaker === 'vorax' ? 'vorax-mode' : 'nova-mode', 'visible', 'talking');
    this.nameEl.textContent = speaker === 'vorax' ? 'VORAX' : 'NOVA';
    this.textEl.textContent = text;
    if (speaker === 'vorax') this.audio.voiceVorax();
    else this.audio.voiceNova();
    if (this.talkTimer) clearTimeout(this.talkTimer);
    this.talkTimer = setTimeout(() => this.el.classList.remove('talking'), TALK_TIME);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.el.classList.remove('visible'), BUBBLE_TIME);
  }

  say(key, opts = {}) {
    const line = pick(LINES[key] || []);
    if (line) this.sayText(line, opts);
  }

  hide() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.el.classList.remove('visible');
  }

  // Hooks sémantiques appelés par le jeu.
  onRunStart(isCampaign) {
    this.say(isCampaign ? 'missionStart' : 'runStart', { priority: true });
  }

  onComboUp(mult) {
    if (mult >= 5) this.say('combo5');
    else if (mult >= 3) this.say('combo3');
  }

  onDive() {
    this.say('dive');
  }

  onShieldLost() {
    this.say('shieldLost');
  }

  onLifeLost() {
    this.say('lifeLost', { priority: true });
  }

  onBossIntro() {
    this.say('voraxIntro', { speaker: 'vorax', priority: true });
    setTimeout(() => this.say('bossIntro', { priority: true }), BUBBLE_TIME + 200);
  }

  onBossHalf() {
    this.say('voraxHalf', { speaker: 'vorax', priority: true });
  }

  onBossDown() {
    this.say('voraxDown', { speaker: 'vorax', priority: true });
    setTimeout(() => this.say('bossDown', { priority: true }), BUBBLE_TIME + 200);
  }

  onShopOpen() {
    this.say('shopOpen', { priority: true });
  }

  onBuy() {
    this.say('buyGood');
  }

  onMissionWon() {
    this.say('missionWon', { priority: true });
  }

  onGameOver() {
    this.say('gameOver', { priority: true });
  }

  onNovaIntro() {
    this.say('novaIntro', { priority: true });
  }

  // Tutoriel : chaque leçon n'est donnée qu'une fois, à la première occasion réelle.
  teachOnce(key, isTouch = false) {
    this._taught = this._taught || new Set();
    if (this._taught.has(key)) return;
    this._taught.add(key);
    const touchKey = `${key}Touch`;
    this.say(isTouch && LINES[touchKey] ? touchKey : key, { priority: true });
  }
}
