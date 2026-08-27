// Les personnages du jeu, façon fenêtres de communication à la Star Fox.
//
// NOVA — l'IA copilote : pilote holographique à la crête lumineuse cyan-magenta,
// grands yeux vifs, sourire en coin. Confiante, chaleureuse, un brin cabotine.
// KORN, le Dévoreur de Mondes — une arche qu'on a remplie d'un peuple entier puis
// abandonnée sans la clé pour l'ouvrir. Il les porte encore. Il cherche depuis dix
// mille ans ceux qui ont fui, et il vient de découvrir qu'ils sont morts de vieillesse
// sans jamais repenser à lui.
//
// Une seule fenêtre de comm (portrait animé + nom + texte). Les visages sont pilotés
// image par image par FaceRig : regard, paupières, articulation, cheveux.

import { NOVA_SVG, KORN_SVG, FaceRig } from './face.js';

// Le script. Deux voix qui s'opposent par leur OBJET, pas par leur registre.
//
// NOVA ne félicite jamais, elle constate — d'où son tic, « Je note » : elle est
// littéralement faite des rapports de trente-neuf pilotes morts.
//
// KORN, lui, NE PARLE PAS AU JOUEUR. Il s'adresse à la coque, aux modules, au métal —
// parce que le métal est élide et qu'il le reconnaît piece par piece, avec le nom de
// celui qui l'a soudé. L'humain aux commandes ne l'intéresse pas plus qu'un insecte
// posé sur une pièce de musée. Qu'il finisse par s'adresser DIRECTEMENT au pilote est
// l'escalade de tout le jeu, et c'est bien plus inquiétant qu'une menace.
//
// {PILOTE}, {SYSTEME} et {SECTEUR} sont substitués à l'affichage.
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
  callFirst: [
    'Il te reste de l’argent dans le champ. Touche C : j’envoie une onde qui te le rabat. Une seule par vague.',
  ],
  callFirstTouch: [
    'Il te reste de l’argent dans le champ. Le bouton ◉ : j’envoie une onde qui te le rabat. Une seule par vague.',
  ],
  rollFirst: [
    'Assez de jus pour un tonneau. Deux fois la même flèche : tu passes à travers les tirs. Pas à travers eux.',
  ],
  rollFirstTouch: [
    'Assez de jus pour un tonneau. Tape deux fois du côté où tu veux te jeter : les tirs te traversent. Pas les carcasses.',
  ],
  reflexFirst: [
    'Le temps vient de se plier. Pas toi. Sers-t’en : tu as une seconde qui n’existe pas.',
  ],
  grazeFirst: ['Tu viens de la frôler à quatre centimètres. Refais-le : ça charge la jauge.'],
  bombReady: ["Nova Bomb armée. X, et tout ce qui est devant toi cesse d'exister. Tu en as une."],
  bombReadyTouch: [
    "Nova Bomb armée. Le bouton ✦, et tout ce qui est devant toi cesse d'exister. Tu en as une.",
  ],
  odReady: ['Jauge pleine. Maintiens X. Quatre secondes où tu ne recules pas.'],
  odReadyTouch: ['Jauge pleine. Maintiens le bouton ✦. Quatre secondes où tu ne recules pas.'],
  // Première apparition. Il regarde le VAISSEAU. Pas le pilote.
  kornIntro: [
    'Tourne à gauche. Je veux voir le flanc.',
    'Réacteur élide, modèle quatre. Sur une coque en fer-blanc. Où as-tu pris ça.',
    'Ce blindage a été coulé par des mains que je connais. Il n’est pas à toi.',
    'Encore leurs outils. Toujours leurs outils, et jamais eux.',
  ],
  bossIntro: [
    "Ne réponds pas. Tant qu'il parle, il ne tire pas. Sers-t'en.",
    'Il parle pour gagner du temps. Nous aussi. Approche maintenant.',
  ],
  // À mi-vie : il s'aperçoit qu'il y a quelqu'un dedans. C'est l'escalade du jeu.
  kornHalf: [
    'Attends. … Il y a quelqu’un là-dedans.',
    'Ce n’est pas le vaisseau qui tourne comme ça. C’est toi.',
    'Tu pilotes mieux que cette ferraille ne le mérite. Je te regarde, maintenant.',
  ],
  kornDown: [
    'Ce corps était en fer. J’ai la lune entière derrière moi.',
    'Tu as cassé un outil. Je suis déjà dans le suivant.',
    '{PILOTE}. Voilà. Maintenant je sais quoi chercher.',
  ],
  bossDown: [
    'Corps détruit, signal intact. Ne fête pas encore. Tu peux respirer trois secondes.',
    "Il a ton nom. Ça veut dire qu'il a arrêté d'improviser.",
  ],
  missionWon: [
    '{SYSTEME} repris. Trente-neuf noms au dossier, et un vivant en bas de page.',
    "Système propre. C'était pas mal, {PILOTE}. Ne le prends pas mal, je ne le redirai pas.",
  ],
  // Fin de vague. NOVA constate, jamais elle ne félicite — et elle annonce le
  // secteur suivant, ce qui donne au saut sa raison d'être : on va QUELQUE PART.
  jump: [
    'Secteur vide. Cap sur {SECTEUR}. Accroche-toi, je pousse.',
    'Plus rien qui bouge ici. {SECTEUR} au cap. Trois secondes.',
    'On dégage. {SECTEUR} — et je te préviens tout de suite, ce n’est pas mieux.',
    'Zone propre. {SECTEUR}. Tu tiens encore debout, je le note.',
    'Saut armé. {SECTEUR}. Garde tes mains sur la barre.',
  ],
  jumpAfterBoss: ['Corps froid derrière nous. {SECTEUR}. Ne te retourne pas.'],
  // Échanges à deux voix. KORN parle le premier, NOVA a le dernier mot — toujours
  // dans cet ordre : c'est ce qui fait d'elle une alliée et non un commentaire.
  kornJump: [
    'Chaque pièce de ta coque porte un nom. Je les connais tous. Toi, aucun.',
    'Je ne te poursuis pas. Je rentre chez moi. Tu es sur le chemin.',
    'Ils sont morts avant que j’arrive. Morts de vieillesse. Et tu portes leurs affaires.',
    'Cours vers {SECTEUR}. Il n’y a rien là-bas non plus. Il n’y a rien nulle part.',
    'J’ai ouvert des milliers de mondes pour les trouver. Le tien ne pèse pas plus lourd.',
  ],
  // Chaque réponse doit tenir SEULE : les deux listes sont tirées au sort
  // indépendamment, donc aucune ne peut supposer la réplique qui la précède.
  novaAnswer: [
    'Il parle à la coque. Pas à toi. Garde-le comme ça le plus longtemps possible.',
    'Il a raison sur un point : rien de ce vaisseau n’est de nous. Ça ne change rien.',
    'Il cherche quelqu’un. Ce n’est pas toi. Ne lui donne pas de raison de changer d’avis.',
    'Coupe la fréquence. Il n’a pas besoin d’un interlocuteur, il a besoin d’un coupable.',
  ],
  gameOver: [
    "Ligne quarante. Je ne l'écris pas encore. Reviens la chercher.",
    "Non. Pas deux fois. Remets-moi en l'air.",
  ],
};

// Chaque situation a son émotion. NOVA ne sourit presque jamais : elle constate.
// KORN reste impassible — c'est son calme qui inquiète, pas ses grimaces.
const EMOTION_BY_KEY = {
  runStart: 'determine',
  missionStart: 'neutre',
  combo3: 'neutre',
  combo5: 'content',
  dive: 'alerte',
  shieldLost: 'alerte',
  lifeLost: 'inquiet',
  bossIntro: 'determine',
  kornIntro: 'neutre',
  kornHalf: 'neutre',
  bossDown: 'neutre',
  kornDown: 'neutre',
  shopOpen: 'neutre',
  buyGood: 'neutre',
  missionWon: 'content',
  gameOver: 'triste',
  novaIntro: 'neutre',
  jump: 'determine',
  jumpAfterBoss: 'neutre',
  kornJump: 'neutre',
  novaAnswer: 'alerte',
  grazeFirst: 'neutre',
  rollFirst: 'determine',
  rollFirstTouch: 'determine',
  reflexFirst: 'alerte',
  callFirst: 'neutre',
  callFirstTouch: 'neutre',
  bombReady: 'alerte',
  bombReadyTouch: 'alerte',
  odReady: 'determine',
  odReadyTouch: 'determine',
};

// Espaces insécables devant la ponctuation double, et à l'intérieur des guillemets
// français. Appliqué à l'AFFICHAGE et non aux sources : les répliques restent
// lisibles dans le code, et la règle vaut aussi pour celles qu'on écrira demain.
function typo(t) {
  return String(t)
    .replace(/ ([:;!?»])/g, '\u00a0$1')
    .replace(/« /g, '«\u00a0');
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Durée de LECTURE, qui n'a rien à voir avec la durée de la voix. L'affichage était
// calé sur l'articulation (environ 46 ms par caractère) : une réplique de cent
// signes tenait 4,9 s à l'écran alors qu'il en faut près de neuf pour la lire au
// rythme d'un enfant de douze ans — et encore, en pleine partie, sans regarder.
// 1,4 s pour repérer la fenêtre qui s'allume, puis 75 ms par caractère (≈ 13
// signes par seconde, marge de compréhension comprise).
const READ_NOTICE = 1400;
const READ_PER_CHAR = 75;
const READ_MAX = 11000;

function readingTime(text) {
  return Math.min(READ_MAX, READ_NOTICE + text.length * READ_PER_CHAR);
}

const QUIET_TIME = 6500; // ms minimum entre deux répliques non prioritaires

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
        <span class="comm-face korn">${KORN_SVG}</span>
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
    // ON NE PARLE JAMAIS PENDANT QU'ON PILOTE.
    //
    // La règle ne valait que pour les écrans étroits : ailleurs, NOVA commentait
    // par-dessus l'action. Mais le reproche n'était pas une affaire de largeur —
    // c'est de la PLACE PRISE SUR LE JEU qu'il s'agissait, et un panneau de
    // dialogue en prend autant sur un grand écran. Il n'y a d'ailleurs aucun
    // moment où l'on souhaite lire quatre lignes de récit en esquivant.
    //
    // Le jeu dit à chaque image si l'on tient encore le manche ; tout ce qui
    // voudrait se dire avant attend le prochain écran.
    this.calme = true;
    this.muet = false;
    // Ce qui n'a pas pu être dit. Trois au plus, et une seule sortie à chaque
    // retour au calme : trois répliques qui se déversent d'un coup à la fin d'une
    // vague seraient pires que le silence.
    this.file = [];
    this.hideTimer = null;
    this.talkTimer = null;

    // Les deux visages sont animés en permanence : ils ne s'immobilisent jamais.
    this.rigs = {
      nova: new FaceRig(this.el.querySelector('.comm-face.nova'), { kind: 'nova' }),
      korn: new FaceRig(this.el.querySelector('.comm-face.korn'), { kind: 'korn' }),
    };
    this.rigs.nova.setEmotion('neutre');
    this.rigs.korn.setEmotion('determine');
    this.current = 'nova';
  }

  // Le jeu dit à chaque frame si l'instant se prête à une réplique. Ce n'est pas
  // aux personnages de le deviner : eux ne savent rien de la formation ennemie.
  setCalme(v) {
    if (this.calme === v) return;
    this.calme = v;
    // LE MANCHE REPREND, LA FENÊTRE SE FERME.
    //
    // Ne pas OUVRIR pendant qu'on pilote ne suffisait pas : une réplique lancée
    // juste avant la vague continuait de s'afficher onze secondes après le début
    // des hostilités, puisque sa durée d'affichage est calculée sur le temps de
    // lecture. Refuser d'ouvrir et laisser traîner ce qui était déjà ouvert
    // revenait au même pour le joueur, qui voyait un panneau sur son aire de vol.
    if (!v) this.hide();
    // Ce qui attendait sort tout seul, une réplique à la fois : c'est `update`
    // qui s'en charge, quand la précédente a eu le temps d'être lue.
  }

  // Appelé chaque frame par la boucle de rendu.
  update(dt) {
    this.rigs.nova.update(dt);
    this.rigs.korn.update(dt);
    // LA FILE SE VIDE AU CALME, UNE RÉPLIQUE À LA FOIS.
    //
    // Le hangar dure une bonne dizaine de secondes : il a la place pour deux ou
    // trois phrases, à condition de les enchaîner au rythme de la lecture et non
    // de les jeter d'un bloc. On attend donc que la précédente ait fini d'être
    // lisible — et qu'aucun échange scénarisé ne soit en cours, celui-là ayant
    // son propre minutage.
    if (this.calme && !this.muet && this.file.length && !this.isBusy() && !this.inExchange()) {
      const { text, opts } = this.file.shift();
      this.sayText(text, opts);
    }
  }

  sayText(
    text,
    { speaker = 'nova', priority = false, emotion = null, duration = null, ephemere = false } = {}
  ) {
    // Typographie française : l'espace qui précède deux-points, point-virgule,
    // point d'exclamation ou d'interrogation doit être INSÉCABLE. Sans elle, la
    // ponctuation tombe seule en début de ligne — « …te jeter / : les tirs te
    // traversent ». C'est fréquent dans une colonne étroite, c'est-à-dire sur un
    // téléphone, c'est-à-dire là où le jeu se joue.
    text = typo(text);
    // SUR PETIT ÉCRAN, NOVA ATTEND SON TOUR.
    //
    // Le panneau de dialogue occupe le quart bas d'un téléphone en portrait —
    // c'est-à-dire précisément la zone où l'on pilote. Le rétrécir n'aurait fait
    // que le rendre illisible sans cesser de gêner : quatre lignes de récit n'ont
    // pas leur place par-dessus une esquive.
    //
    // La réplique est donc mise de côté et dite au prochain moment CALME : début
    // de vague, vague nettoyée, vaisseau détruit, ou n'importe quel écran. On ne
    // garde que la dernière en attente — trois répliques qui se déversent d'un
    // coup à la fin d'une vague seraient pires que le silence.
    // Le mode Survie coupe la parole à tout le monde : il n'y a pas de récit à y
    // raconter, et un dialogue qui s'ouvre entre deux vagues enchaînées serait une
    // gêne pure.
    if (this.muet) return;
    if (!this.calme) {
      // UNE RÉPLIQUE PÉRISSABLE NE SE MET PAS DE CÔTÉ. « Trois en piqué, axe
      // court » prévient d'une chose qui arrive maintenant : la ressortir au
      // hangar deux minutes plus tard ne prévient de rien et occupe la place
      // d'une réplique qui, elle, aurait encore un sens.
      if (ephemere) return;
      if (this.file.length >= 3) this.file.shift();
      this.file.push({ text, opts: { speaker, priority, emotion, duration } });
      return;
    }
    const now = performance.now();
    if (!priority && now - this.lastShown < QUIET_TIME) return;
    this.lastShown = now;
    this.el.classList.remove('korn-mode', 'nova-mode');
    // Relance l'animation d'allumage de la fenêtre de comm.
    void this.el.offsetWidth;
    this.el.classList.add(speaker === 'korn' ? 'korn-mode' : 'nova-mode', 'visible');
    this.nameEl.textContent = speaker === 'korn' ? 'KORN' : 'NOVA';
    this.textEl.textContent = text;
    this.current = speaker;

    // Deux durées distinctes, et c'est tout l'enjeu : la bouche s'arrête quand la
    // phrase est dite, la fenêtre reste tant que le texte n'est pas lu.
    const talkMs = duration ?? Math.min(4200, 420 + text.length * 46);
    const holdMs = readingTime(text);
    this.busyUntil = performance.now() + holdMs;
    const rig = this.rigs[speaker] || this.rigs.nova;
    if (emotion) rig.setEmotion(emotion);
    rig.startTalking(talkMs, 1);

    // Indicatif d'ouverture de canal, uniquement quand l'interlocuteur CHANGE :
    // c'est le basculement qui doit s'entendre, pas chaque réplique.
    if (speaker !== this.lastSpeaker) {
      if (speaker === 'korn') this.audio.kornSting();
      else this.audio.novaSting();
    }
    this.lastSpeaker = speaker;

    // La voix est synthétisée à partir du TEXTE : sa durée et son articulation
    // suivent la phrase, au lieu d'être un bip de longueur fixe.
    if (speaker === 'korn') this.audio.voiceKorn(text);
    else this.audio.voiceNova(text);
    if (this.talkTimer) clearTimeout(this.talkTimer);
    this.talkTimer = setTimeout(() => rig.stopTalking(), talkMs);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.el.classList.remove('visible'), holdMs);
  }

  // Contexte de substitution : {PILOTE} et {SYSTEME} sont remplis par le jeu.
  setContext(ctx) {
    this.ctx = { ...(this.ctx || {}), ...ctx };
  }

  _fill(text) {
    return text
      .replace('{PILOTE}', this.ctx?.pilote || 'pilote')
      .replace('{SYSTEME}', this.ctx?.systeme || 'Ce système')
      .replace('{SECTEUR}', this.ctx?.secteur || 'le secteur suivant');
  }

  say(key, opts = {}) {
    const line = pick(LINES[key] || []);
    if (line) this.sayText(this._fill(line), { emotion: EMOTION_BY_KEY[key], ...opts });
  }

  // Enchaîne plusieurs répliques dans l'ordre, chacune attendant que la précédente
  // ait fini de s'articuler. Les répliques du saut n'ont pas le droit d'être
  // filtrées par le silence minimal : la séquence dure trois secondes et n'a pas
  // de seconde chance.
  // Vrai tant que la réplique en cours n'a pas eu le temps d'être lue.
  isBusy() {
    return performance.now() < (this.busyUntil ?? 0);
  }

  playExchange(keys) {
    if (this._exchange) this._exchange.forEach(clearTimeout);
    this._exchange = [];
    let delay = 0;
    this.exchangeUntil = 0;
    for (const key of keys) {
      const line = pick(LINES[key] || []);
      if (!line) continue;
      const text = this._fill(line);
      const speaker = key.startsWith('korn') ? 'korn' : 'nova';
      const hold = readingTime(text) + 350;
      this._exchange.push(
        setTimeout(
          () => this.sayText(text, { speaker, priority: true, emotion: EMOTION_BY_KEY[key] }),
          delay
        )
      );
      delay += hold;
    }
    this.exchangeUntil = performance.now() + delay;
  }

  // Un échange scénarisé ne doit pas être coupé par une réplique de contexte.
  inExchange() {
    return performance.now() < (this.exchangeUntil ?? 0);
  }

  hide() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.el.classList.remove('visible');
  }

  // Fermer le canal ET oublier ce qui attendait. Sans le second, une réplique
  // gardée d'une partie précédente ressortirait au premier calme de la suivante —
  // typiquement par-dessus la vitrine de l'écran d'accueil.
  taisToi() {
    this.hide();
    this.file.length = 0;
  }

  // Hooks sémantiques appelés par le jeu.
  onRunStart(survie) {
    this.say(survie ? 'missionStart' : 'runStart', { priority: true });
  }

  onComboUp(mult) {
    if (mult >= 5) this.say('combo5', { ephemere: true });
    else if (mult >= 3) this.say('combo3', { ephemere: true });
  }

  onDive() {
    this.say('dive', { ephemere: true });
  }

  onShieldLost() {
    this.say('shieldLost', { ephemere: true });
  }

  onLifeLost() {
    this.say('lifeLost', { priority: true });
  }

  // Les duos boss passent par le même mécanisme que le saut : la réponse attend
  // que la première réplique ait eu le temps d'être lue, pas un délai forfaitaire.
  onBossIntro() {
    this.playExchange(['kornIntro', 'bossIntro']);
  }

  onBossHalf() {
    this.say('kornHalf', { speaker: 'korn', priority: true });
  }

  onBossDown() {
    this.playExchange(['kornDown', 'bossDown']);
  }

  onShopOpen() {
    // La boutique s'ouvre à la fin du saut, alors que l'échange avec KORN est
    // souvent encore en cours. On ne le coupe pas : ce dialogue-là est la
    // récompense, le conseil d'achat peut attendre le tour suivant.
    if (this.inExchange()) return;
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
