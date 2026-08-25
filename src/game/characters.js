// Les personnages du jeu, façon fenêtres de communication à la Star Fox.
//
// NOVA — l'IA copilote : pilote holographique à la crête lumineuse cyan-magenta,
// grands yeux vifs, sourire en coin. Confiante, chaleureuse, un brin cabotine.
// VORAX, le Dévoreur d'Étoiles — seigneur de l'essaim : tête blindée couronnée de
// pointes, cornes, fissures incandescentes, œil unique furieux. Théâtral et vaniteux.
//
// Une seule fenêtre de comm (portrait animé + nom + texte). Les visages sont pilotés
// image par image par FaceRig : regard, paupières, articulation, cheveux.

import { NOVA_SVG, VORAX_SVG, FaceRig } from './face.js';

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

// Chaque situation a son émotion : c'est ce qui empêche NOVA d'être perpétuellement
// souriante quoi qu'il arrive au joueur.
const EMOTION_BY_KEY = {
  runStart: 'determine',
  missionStart: 'determine',
  combo3: 'content',
  combo5: 'content',
  dive: 'alerte',
  shieldLost: 'alerte',
  lifeLost: 'inquiet',
  bossIntro: 'alerte',
  voraxIntro: 'determine',
  voraxHalf: 'determine',
  bossDown: 'content',
  voraxDown: 'inquiet',
  shopOpen: 'neutre',
  buyGood: 'content',
  missionWon: 'content',
  gameOver: 'triste',
  novaIntro: 'content',
  grazeFirst: 'content',
  bombReady: 'alerte',
  bombReadyTouch: 'alerte',
  odReady: 'alerte',
  odReadyTouch: 'alerte',
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const BUBBLE_TIME = 3800; // ms d'affichage d'une réplique
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

    // Les deux visages sont animés en permanence : ils ne s'immobilisent jamais.
    this.rigs = {
      nova: new FaceRig(this.el.querySelector('.comm-face.nova'), { kind: 'nova' }),
      vorax: new FaceRig(this.el.querySelector('.comm-face.vorax'), { kind: 'vorax' }),
    };
    this.rigs.nova.setEmotion('neutre');
    this.rigs.vorax.setEmotion('determine');
    this.current = 'nova';
  }

  // Appelé chaque frame par la boucle de rendu.
  update(dt) {
    this.rigs.nova.update(dt);
    this.rigs.vorax.update(dt);
  }

  sayText(text, { speaker = 'nova', priority = false, emotion = null, duration = null } = {}) {
    const now = performance.now();
    if (!priority && now - this.lastShown < QUIET_TIME) return;
    this.lastShown = now;
    this.el.classList.remove('vorax-mode', 'nova-mode');
    // Relance l'animation d'allumage de la fenêtre de comm.
    void this.el.offsetWidth;
    this.el.classList.add(speaker === 'vorax' ? 'vorax-mode' : 'nova-mode', 'visible');
    this.nameEl.textContent = speaker === 'vorax' ? 'VORAX' : 'NOVA';
    this.textEl.textContent = text;
    this.current = speaker;

    // Durée d'articulation proportionnelle à la longueur du texte : la bouche
    // s'arrête quand la phrase est finie, pas après un délai forfaitaire.
    const talkMs = duration ?? Math.min(4200, 420 + text.length * 46);
    const rig = this.rigs[speaker] || this.rigs.nova;
    if (emotion) rig.setEmotion(emotion);
    rig.startTalking(talkMs, 1);

    if (speaker === 'vorax') this.audio.voiceVorax();
    else this.audio.voiceNova();
    if (this.talkTimer) clearTimeout(this.talkTimer);
    this.talkTimer = setTimeout(() => rig.stopTalking(), talkMs);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(
      () => this.el.classList.remove('visible'),
      Math.max(BUBBLE_TIME, talkMs + 700)
    );
  }

  say(key, opts = {}) {
    const line = pick(LINES[key] || []);
    if (line) this.sayText(line, { emotion: EMOTION_BY_KEY[key], ...opts });
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
