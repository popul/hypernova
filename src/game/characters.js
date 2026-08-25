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

// Le script. Deux voix qui s'opposent par la GRAMMAIRE : NOVA tutoie, VORAX vouvoie.
// NOVA ne félicite jamais, elle constate — d'où son tic, « Je note ». VORAX ne crie
// jamais : sa politesse est sa menace. {PILOTE} et {SYSTEME} sont substitués à l'affichage.
const LINES = {
  runStart: [
    'Trente-neuf avant toi. Aucun retour. Poste de tir à toi, le reste est à moi.',
    'Systèmes verts, canons chauds. Ne me fais pas ouvrir un quarantième dossier.',
  ],
  novaIntro: ["NOVA, c'était le nom de l'escadron. Il n'en reste que moi et cette table de vol."],
  missionStart: ["{SYSTEME}. On n'y capte plus rien depuis cinq ans. On va voir pourquoi."],
  dive: [
    'Trois en piqué, axe court. Ne recule pas : ils comptent là-dessus.',
    'Piqué à gauche. Ils visent où tu seras, pas où tu es.',
    'Ils plongent par deux et tirent par trois. Tiens la ligne du bas.',
    'Deux qui descendent. Un des deux te ratera. Devine lequel.',
  ],
  combo3: [
    'Trois enchaînés. Je révise mon estimation. Légèrement.',
    "Propre. Continue avant que je change d'avis.",
  ],
  combo5: [
    "×5. Je note. Onze pilotes que ce n'était pas arrivé.",
    "Cinq d'affilée. Là, tu commences à m'intéresser.",
  ],
  shieldLost: [
    'Bouclier à zéro. Tu es en tôle nue. Ça se pilote autrement.',
    "Plus de plaque. C'était la mienne, au passage. La prochaine, tu la sens passer.",
  ],
  lifeLost: [
    'Coque perdue. Je te remets en vol dans une seconde trois. Utilise-la mieux.',
    "Nacelle récupérée, {PILOTE}. C'est la seule bonne nouvelle de la minute.",
  ],
  shopOpen: [
    'Mon avis : le blindage. Tu vas prendre les canons. Tu prends toujours les canons.',
    'Tu as de quoi acheter deux erreurs. Choisis-en une.',
    "Tes crédits, ma soute. Les missiles, si tu veux mon avis. Ce n'est pas un avis.",
  ],
  buyGood: [
    'Boulonné. Ça pèse quatre kilos de plus. Tu vas le sentir en virage.',
    'Installé. Je le teste sur le premier qui passe.',
  ],
  grazeFirst: ['Tu viens de la frôler à quatre centimètres. Refais-le : ça charge la jauge.'],
  bombReady: ["Nova Bomb armée. X, et tout ce qui est devant toi cesse d'exister. Tu en as une."],
  bombReadyTouch: [
    "Nova Bomb armée. Le bouton ✦, et tout ce qui est devant toi cesse d'exister. Tu en as une.",
  ],
  odReady: ['Jauge pleine. Maintiens X. Quatre secondes où tu ne recules pas.'],
  odReadyTouch: ['Jauge pleine. Maintiens le bouton ✦. Quatre secondes où tu ne recules pas.'],
  voraxIntro: [
    'Bonsoir. Vous êtes en avance : je comptais éteindre celle-ci demain. Cela ne me dérange pas.',
    'Ah. La lumière qui bougeait encore. Bételgeuse a mis onze minutes. Celle-ci en mettra neuf.',
  ],
  bossIntro: [
    "Ne réponds pas. Tant qu'il parle, il ne tire pas. Sers-t'en.",
    'Il parle pour gagner du temps. Nous aussi. Approche maintenant.',
  ],
  voraxHalf: [
    "Merci. J'apprends votre façon de tourner. Personne ne m'y avait obligé depuis Bételgeuse.",
    "Vous m'obligez à faire attention. Tu viens de perdre le « vous ».",
  ],
  voraxDown: [
    "Merci. Ce corps était lent. J'en ai onze mille.",
    "{PILOTE}. Voilà. Je note ton nom. C'est rare.",
  ],
  bossDown: [
    'Corps détruit, signal intact. Ne fête pas encore. Tu peux respirer trois secondes.',
    "Il a ton nom. Ça veut dire qu'il a arrêté d'improviser.",
  ],
  missionWon: [
    '{SYSTEME} repris. Trente-neuf noms au dossier, et un vivant en bas de page.',
    "Système propre. C'était pas mal, {PILOTE}. Ne le prends pas mal, je ne le redirai pas.",
  ],
  gameOver: [
    "Ligne quarante. Je ne l'écris pas encore. Reviens la chercher.",
    "Non. Pas deux fois. Remets-moi en l'air.",
  ],
};

// Chaque situation a son émotion. NOVA ne sourit presque jamais : elle constate.
// VORAX reste impassible — c'est son calme qui inquiète, pas ses grimaces.
const EMOTION_BY_KEY = {
  runStart: 'determine',
  missionStart: 'neutre',
  combo3: 'neutre',
  combo5: 'content',
  dive: 'alerte',
  shieldLost: 'alerte',
  lifeLost: 'inquiet',
  bossIntro: 'determine',
  voraxIntro: 'neutre',
  voraxHalf: 'neutre',
  bossDown: 'neutre',
  voraxDown: 'neutre',
  shopOpen: 'neutre',
  buyGood: 'neutre',
  missionWon: 'content',
  gameOver: 'triste',
  novaIntro: 'neutre',
  grazeFirst: 'neutre',
  bombReady: 'alerte',
  bombReadyTouch: 'alerte',
  odReady: 'determine',
  odReadyTouch: 'determine',
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

    // Indicatif d'ouverture de canal, uniquement quand l'interlocuteur CHANGE :
    // c'est le basculement qui doit s'entendre, pas chaque réplique.
    if (speaker !== this.lastSpeaker) {
      if (speaker === 'vorax') this.audio.voraxSting();
      else this.audio.novaSting();
    }
    this.lastSpeaker = speaker;

    // La voix est synthétisée à partir du TEXTE : sa durée et son articulation
    // suivent la phrase, au lieu d'être un bip de longueur fixe.
    if (speaker === 'vorax') this.audio.voiceVorax(text);
    else this.audio.voiceNova(text);
    if (this.talkTimer) clearTimeout(this.talkTimer);
    this.talkTimer = setTimeout(() => rig.stopTalking(), talkMs);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(
      () => this.el.classList.remove('visible'),
      Math.max(BUBBLE_TIME, talkMs + 700)
    );
  }

  // Contexte de substitution : {PILOTE} et {SYSTEME} sont remplis par le jeu.
  setContext(ctx) {
    this.ctx = { ...(this.ctx || {}), ...ctx };
  }

  _fill(text) {
    return text
      .replace('{PILOTE}', this.ctx?.pilote || 'pilote')
      .replace('{SYSTEME}', this.ctx?.systeme || 'Ce système');
  }

  say(key, opts = {}) {
    const line = pick(LINES[key] || []);
    if (line) this.sayText(this._fill(line), { emotion: EMOTION_BY_KEY[key], ...opts });
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
