// Les personnages du jeu, façon fenêtres de communication à la Star Fox.
//
// NOVA — l'IA copilote : visage holographique cyan aux grands yeux, chaleureuse et
// un brin cabotine. Elle briefe, alerte sur les plongées, célèbre les combos.
// KRRK — l'amiral de l'essaim : tête d'insecte pourpre, œil composé jaune, mandibules.
// Théâtral, vaniteux, vexé en permanence. Il interpelle le joueur aux boss.
//
// Une seule fenêtre de comm (portrait animé + nom + texte) : la bouche s'anime pendant
// la réplique, la voix est une salve de blips synthétiques. Anti-spam intégré.

const NOVA_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <radialGradient id="nova-head" cx="38%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#d8fdff"/>
      <stop offset="45%" stop-color="#4ff2ff"/>
      <stop offset="100%" stop-color="#0b4c63"/>
    </radialGradient>
  </defs>
  <line x1="32" y1="4" x2="32" y2="10" stroke="#4ff2ff" stroke-width="2"/>
  <circle cx="32" cy="4" r="2.6" fill="#ffe066"/>
  <circle cx="32" cy="34" r="24" fill="url(#nova-head)"/>
  <circle cx="32" cy="34" r="24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.4"/>
  <ellipse class="ch-eye" cx="23" cy="31" rx="4.6" ry="7"/>
  <ellipse class="ch-eye" cx="41" cy="31" rx="4.6" ry="7"/>
  <circle cx="24.6" cy="29" r="1.7" fill="#eafcff"/>
  <circle cx="42.6" cy="29" r="1.7" fill="#eafcff"/>
  <path class="ch-mouth" d="M25 45 Q32 50 39 45" fill="none" stroke="#063846" stroke-width="2.6" stroke-linecap="round"/>
  <ellipse cx="17" cy="40" rx="3.4" ry="2.2" fill="rgba(255,120,190,0.5)"/>
  <ellipse cx="47" cy="40" rx="3.4" ry="2.2" fill="rgba(255,120,190,0.5)"/>
</svg>`;

const KRRK_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <radialGradient id="krrk-head" cx="45%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#8e2440"/>
      <stop offset="60%" stop-color="#4d0f22"/>
      <stop offset="100%" stop-color="#1d0510"/>
    </radialGradient>
  </defs>
  <path d="M14 10 L24 22 M50 10 L40 22" stroke="#ff4757" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="12" cy="8" r="2.6" fill="#ff4757"/>
  <circle cx="52" cy="8" r="2.6" fill="#ff4757"/>
  <path d="M32 12 L54 28 L48 52 L16 52 L10 28 Z" fill="url(#krrk-head)" stroke="#ff4757" stroke-width="1.6"/>
  <ellipse class="ch-bigeye" cx="32" cy="32" rx="11" ry="9" fill="#ffe066"/>
  <circle cx="32" cy="32" r="4" fill="#3d060e"/>
  <circle cx="30" cy="30" r="1.3" fill="#fff6d8"/>
  <path class="ch-mand left" d="M22 50 Q26 58 31 53" fill="none" stroke="#ff9f43" stroke-width="3" stroke-linecap="round"/>
  <path class="ch-mand right" d="M42 50 Q38 58 33 53" fill="none" stroke="#ff9f43" stroke-width="3" stroke-linecap="round"/>
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
    'C’est KRRK, l’amiral de l’essaim. Vise l’œil !',
    'Le voilà. Grand, rouge, et très vexable. Feu !',
  ],
  krrkIntro: [
    'Vos étoiles m’appartiennent, petit pilote.',
    'Encore toi ?! L’essaim est ÉTERNEL.',
    'Ce système est à MOI. Comme tous les autres.',
  ],
  krrkHalf: ['Vous… commencez à m’AGACER !', 'Mes drones ! Peu importe. J’en ai des MILLIERS.'],
  bossDown: ['Amiral balayé ! La lumière revient.', 'Et une étoile de reprise, une !'],
  krrkDown: ['Ce n’est… qu’un repli TACTIQUE !', 'Impossible ! Mes drones ! Mes beaux drones !'],
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
        <span class="comm-face krrk">${KRRK_SVG}</span>
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
    this.el.classList.remove('krrk-mode', 'nova-mode');
    // Relance l'animation d'allumage de la fenêtre de comm.
    void this.el.offsetWidth;
    this.el.classList.add(speaker === 'krrk' ? 'krrk-mode' : 'nova-mode', 'visible', 'talking');
    this.nameEl.textContent = speaker === 'krrk' ? 'KRRK' : 'NOVA';
    this.textEl.textContent = text;
    if (speaker === 'krrk') this.audio.voiceKrrk();
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
    this.say('krrkIntro', { speaker: 'krrk', priority: true });
    setTimeout(() => this.say('bossIntro', { priority: true }), BUBBLE_TIME + 200);
  }

  onBossHalf() {
    this.say('krrkHalf', { speaker: 'krrk', priority: true });
  }

  onBossDown() {
    this.say('krrkDown', { speaker: 'krrk', priority: true });
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
}
