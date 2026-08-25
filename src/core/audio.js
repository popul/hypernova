// Tout l'audio est synthétisé en WebAudio : aucun fichier son.
//
// Trois étages : les SFX ponctuels, les voix à formants des personnages, et un
// séquenceur musical à lookahead qui joue UNE partition de 32 mesures — batterie,
// basse, nappe, arpège, lead — dont l'instrumentation change selon l'écran.
// Toute la musique est écrite en demi-tons depuis ré1, ce qui rend possibles les
// accords, la modulation du boss et les indicatifs des personnages : ce sont des
// citations littérales du même thème de cinq notes.

import { STORAGE_KEYS } from '../game/constants.js';

// ---- Théorie ----
//
// Tout est écrit en DEMI-TONS depuis ré1. Une table de fréquences absolues ne
// permet ni accord, ni transposition, ni cadence : le modèle de données lui-même
// interdisait la musique. Ré mineur parce que sa tonique (36,7 Hz) et ses harmoniques
// tombent dans le grave que restituent les petits haut-parleurs, et parce que la
// version phrygienne (♭2, quinte abaissée) donne le mode du boss sans changer
// de tonalité : l'oreille entend le MÊME monde qui se corrompt.
const ROOT = 36.708; // ré1
const hz = (s) => ROOT * Math.pow(2, s / 12);

// Tempo UNIQUE : changer de tempo entre les écrans casserait l'illusion d'un seul
// morceau. Mais 150 BPM avec une grosse caisse à quatre temps, c'était un morceau
// de club — aucun rapport avec un voyage de plusieurs mois vers l'extérieur du
// système. 84 BPM, c'est un pas d'orchestre, et surtout le temps y tombe à
// 0,714 s : la seconde d'horloge à un cheveu près. C'est ce tic-là qui porte la
// pulsation, pas une caisse.
const TEMPO = 84;

// ---- LA MÉLODIE ----
//
// Ce qui précédait était un motif de cinq notes : un jingle, pas un thème. Une
// mélodie, ça n'est pas une suite de notes justes — il lui faut quatre choses, et
// aucune n'est facultative :
//
//  1. UNE PHRASE ET SA RÉPONSE. Quatre mesures qui posent une question et
//     s'arrêtent en suspens, quatre mesures qui répondent et se posent.
//  2. UN SOMMET, UN SEUL. Ici le fa5 de la mesure 5. La note la plus haute de tout
//     le morceau ne se joue qu'une fois : c'est ce qui en fait un sommet.
//  3. DES DURÉES INÉGALES. Des notes longues, des notes brèves. Une mélodie en
//     valeurs égales est un exercice de solfège.
//  4. DES DEGRÉS CONJOINTS, ET DEUX SAUTS. On monte et on descend par pas, sauf
//     deux fois : la quarte du début et la quarte du sommet. Un saut n'existe que
//     s'il est rare.
//
// Huit mesures en ré mineur sur la grille Dm–Dm–Bb–Bb–F–F–C–C. La dernière note
// est un ré tenu par-dessus l'accord de do : il ne se résout pas tout seul, c'est
// l'accord qui bouge dessous à la reprise. La boucle est donc sans couture.
//
// Notation : { b: mesure (0-7), s: pas (0-15), n: demi-tons depuis ré1, d: durée }.
const MELODY = [
  // — Question. On entre sur le contretemps, ce qui donne l'élan.
  { b: 0, s: 4, n: 43, d: 4 }, // la4
  { b: 0, s: 8, n: 48, d: 6 }, // ré5   ← premier saut : la quarte
  { b: 0, s: 14, n: 46, d: 2 }, // do5
  { b: 1, s: 0, n: 44, d: 6 }, // si♭4  ← le doute
  { b: 1, s: 6, n: 43, d: 6 }, // la4
  { b: 1, s: 12, n: 39, d: 4 }, // fa4
  { b: 2, s: 0, n: 41, d: 4 }, // sol4
  { b: 2, s: 4, n: 43, d: 4 }, // la4
  { b: 2, s: 8, n: 44, d: 8 }, // si♭4  ← on remonte
  { b: 3, s: 0, n: 43, d: 8 }, // la4
  { b: 3, s: 8, n: 41, d: 8 }, // sol4  ← en suspens : la question reste ouverte

  // — Réponse. Même contour, mais elle va plus haut et elle se pose.
  { b: 4, s: 4, n: 46, d: 4 }, // do5
  { b: 4, s: 8, n: 51, d: 6 }, // fa5   ← LE SOMMET, une seule fois dans tout le morceau
  { b: 4, s: 14, n: 50, d: 2 }, // mi5
  { b: 5, s: 0, n: 48, d: 6 }, // ré5
  { b: 5, s: 6, n: 46, d: 6 }, // do5
  { b: 5, s: 12, n: 43, d: 4 }, // la4
  { b: 6, s: 0, n: 44, d: 4 }, // si♭4
  { b: 6, s: 4, n: 43, d: 4 }, // la4
  { b: 6, s: 8, n: 41, d: 8 }, // sol4
  { b: 7, s: 0, n: 38, d: 8 }, // mi4
  { b: 7, s: 8, n: 36, d: 8 }, // ré4   ← la tonique, tenue par-dessus l'accord de do
];

// La signature : les cinq premières notes de la mélodie, rien d'autre. Les
// indicatifs de NOVA et de KORN, l'appel de début de vague et l'escalier de combo
// citent donc littéralement le thème — et le joueur les relie sans y penser.
const SIGNATURE = [43, 48, 46, 44, 43];

// Le mode du boss. On n'écrit pas une seconde mélodie : on abaisse la QUINTE et la
// SECONDE de celle du joueur. Ré mineur devient ré phrygien à quinte diminuée —
// la même ligne, le même contour, un monde qui a tourné. C'est aussi pour ça que
// le boss se reconnaît en une seconde sans qu'aucun texte ne l'annonce.
function darken(semi) {
  const pc = ((semi % 12) + 12) % 12;
  if (pc === 7 || pc === 2) return semi - 1; // la → la♭, mi → mi♭
  return semi;
}

// Compat : plusieurs effets citaient l'ancien motif.
const THEME = SIGNATURE;
const THEME_BOSS = SIGNATURE.map((n) => darken(n) - 12);

// Accords, en demi-tons depuis ré1 — donc le degré 0 est un RÉ.
//
// C'est ici que se logeait le défaut le plus grave de toute la partition. La table
// avait été écrite en prenant le DO comme degré 0, par réflexe : chaque accord
// sonnait donc un ton au-dessus de son nom. « Dm » jouait mi mineur, « C » jouait
// ré MAJEUR — avec un fa# qui n'existe pas en ré mineur et qui heurtait au demi-ton
// le fa naturel de la mélodie. Comme la mélodie, elle, était juste, le morceau était
// bitonal d'un bout à l'autre : mélodie en ré mineur, harmonie en mi mineur.
// C'est ce décalage d'un ton, et rien d'autre, qui rendait la musique désagréable.
//
// Trois champs, trois registres, et ils ne sont pas interchangeables :
//   pad  — les quatre voix tenues (orgue et chœur), enchaînées en conduite serrée :
//          d'un accord au suivant, une ou deux voix bougent, jamais les quatre.
//   bass — les notes de contrebasse DE CET ACCORD, dans l'ordre fondamentale,
//          quinte, tierce. Les motifs pointent dessus par leur indice : un
//          intervalle fixe donnerait une tierce mineure sur un accord majeur.
//   sub  — la pédale de 32 pieds, et la hauteur des timbales (sub + 14).
const CHORDS = {
  Dm: { sub: 0, pad: [24, 27, 31, 36], bass: [12, 19, 15] },
  Bb: { sub: 8, pad: [24, 27, 32, 36], bass: [8, 15, 12] },
  F: { sub: 3, pad: [22, 27, 31, 34], bass: [15, 22, 19] },
  C: { sub: 10, pad: [22, 26, 29, 34], bass: [10, 17, 14] },
  Gm: { sub: 5, pad: [24, 29, 32, 36], bass: [17, 24, 20] },
};

// La forme, en mesures. 32 mesures = 51,2 s, et la boucle repart à la mesure 4 :
// l'intro ne se réentend jamais. Chaque section porte sa propre grille d'accords,
// à raison d'un accord toutes les deux mesures — c'est ce qui fait qu'on entend
// UN morceau qui avance, et non une boucle de deux secondes.
const FORM = [
  // Quatre mesures de nappe seule, le temps que le kick arrive.
  { name: 'intro', from: 0, grid: ['Dm', 'Bb'] },
  // La cadence qui tourne : elle appelle toujours la suite, elle ne se pose jamais.
  { name: 'A', from: 4, grid: ['Dm', 'Bb', 'F', 'C'] },
  // La montée. Se termine sur do : l'accord qui NE PEUT PAS rester en l'air.
  { name: 'lift', from: 12, grid: ['Bb', 'C'] },
  // Le drop résout sur la tonique — c'est l'arrivée, pas une étape.
  { name: 'drop', from: 16, grid: ['Gm', 'Bb', 'C', 'Dm'] },
  // La respiration. Sans elle, le drop suivant ne fait plus rien.
  { name: 'breakdown', from: 24, grid: ['Dm', 'Bb'] },
  // Le retour, qui recale sur do pour retomber sur ré à la boucle.
  { name: 'retour', from: 28, grid: ['F', 'C'] },
];

// L'ostinato : le motif d'orgue qui tourne sans fin sous tout le morceau. Ce n'est
// pas un arpège décoratif, c'est le moteur — il occupe la place qu'avait la grosse
// caisse. Degrés dans l'accord courant, en croches.
const OSTINATO = [0, 2, 4, 2, 3, 2, 4, 2];

// Le tic. Un temps sur quatre, sec, sans réverbération : l'horloge qui continue de
// tourner pendant qu'on s'éloigne. Un enfant ne saura pas pourquoi ça l'inquiète,
// mais ça l'inquiétera.
const TICK = [0, 4, 8, 12];

// Timbales. Jamais sur tous les temps : ce qui fait la gravité d'un orchestre,
// c'est ce qu'il ne joue PAS.
const TIMPANI = [0, 6, 8, 14];
const TIMPANI_HEAVY = [0, 3, 6, 8, 11, 14]; // 3+3+2, réservé au sommet

// Contrebasses. Deux ou trois notes TENUES par mesure au lieu de huit notes
// piquées : un pupitre de contrebasses ne joue pas une ligne de basse électronique.
// Les valeurs sont des INDICES dans chord.bass (0 fondamentale, 1 quinte, 2 tierce)
// et non des intervalles : un intervalle fixe plaquerait une tierce mineure sur un
// accord majeur, ce qui était l'autre moitié du problème.
const BASS_EVEN = { 0: { i: 0, len: 8 }, 8: { i: 1, len: 8 } };
const BASS_ODD = { 0: { i: 0, len: 6 }, 6: { i: 2, len: 4 }, 10: { i: 1, len: 6 } };

// Voyelles françaises par triplet de formants (F1, F2, F3). Le morphing entre ces
// triplets EST l'articulation : c'est lui qui fabrique l'illusion d'une bouche.
const VOWEL = {
  ou: [325, 700, 2530],
  o: [450, 800, 2600],
  a: [700, 1220, 2600],
  e: [530, 1840, 2480],
  i: [270, 2300, 3000],
};

// Les deux voix s'opposent par l'ESPACE et le registre, pas par le volume.
// NOVA est à 220 Hz (A3) : la quinte de la tonique du jeu, et la 3e harmonique de
// la fondamentale de KORN — ils sont harmoniquement verrouillés.
const VOICE = {
  nova: {
    f0: 220,
    wave: 'vox',
    detune: -9,
    syl: 0.115,
    gain: 0.2,
    q: [7, 8, 6],
    band: [250, 3600], // bande de comm : c'est elle qui dit « radio »
    pan: -0.35, // à gauche, là où est son portrait
    reverb: 0.08, // sèche : elle est dans le casque, à quinze centimètres
    vowels: [VOWEL.e, VOWEL.a, VOWEL.i, VOWEL.o, VOWEL.a, VOWEL.e],
  },
  korn: {
    f0: 73.42,
    wave: 'growl',
    detune: 7,
    syl: 0.165, // il prend son temps : c'est son calme qui inquiète
    gain: 0.26,
    q: [5, 6, 4],
    band: [60, 2200],
    pan: 0.3,
    reverb: 0.5, // loin, dans un très grand vide
    vowels: [VOWEL.o, VOWEL.ou, VOWEL.a, VOWEL.o, VOWEL.ou],
  },
};

// Volume du bus musique par ambiance. Plus de tempo par mode : un seul morceau.
const MODES = {
  off: { gain: 0 },
  title: { gain: 0.23 },
  play: { gain: 0.19 },
  shop: { gain: 0.15 },
  paused: { gain: 0.06 }, // en sourdine, pas coupée : la grille doit continuer d'avancer
  boss: { gain: 0.21 },
  cinematic: { gain: 0 }, // la cinématique joue ses propres nappes sur cineBus
};

const boss = (mode) => mode === 'boss';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(STORAGE_KEYS.muted) === '1';
    this.mode = 'off';
    this.step = 0;
    this.bar = 0;
    this.nextStepTime = 0;
    this.schedulerId = null;
  }

  // À appeler sur le premier geste utilisateur (contrainte navigateur).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    // Limiteur de sortie. Rien n'empêchait jusqu'ici la musique, trois explosions
    // et une voix de s'additionner au-delà de 1.0 : au-dessus, la carte son écrête
    // en carré, et c'est ce grésillement que l'oreille lit comme « son de vieux jeu ».
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.09;
    this.master.connect(limiter);
    limiter.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.5;
    this.sfxBus.connect(this.master);

    // Chaîne musique. L'ancienne version sommait tout dans un seul gain suivi d'un
    // passe-bas à 2400 Hz : ce filtre à lui seul coupait tout l'air au-dessus de la
    // voix humaine — c'est très exactement ce qu'on appelle « rétro ».
    //
    //   instruments ─→ musicDuck ─┐
    //                             ├─→ glue ─→ makeup ─→ musicVol ─→ passe-bas ─→ master
    //   kick ─────────────────────┘
    //
    // L'ordre compte, et deux détails valent la peine d'être écrits :
    //  · le kick contourne le ducking — un sidechain doit creuser tout SAUF ce qui
    //    le déclenche, sinon le kick se coupe lui-même de moitié ;
    //  · la compression est AVANT le volume d'ambiance. Placée après, elle voyait un
    //    niveau différent à chaque écran et ne travaillait plus qu'aux forts volumes.
    this.musicBus = this.ctx.createGain();
    this.musicDuck = this.ctx.createGain();
    this.kickBus = this.ctx.createGain();
    this.musicVol = this.ctx.createGain();
    this.musicVol.gain.value = MODES[this.mode]?.gain ?? 0;

    // Compression de bus, réglage ORCHESTRAL. Le réglage précédent (seuil −17,
    // rapport 3,5) servait à faire tenir ensemble une batterie et une basse
    // électroniques ; appliqué à un orchestre, il écrasait exactement ce qu'on
    // cherche à obtenir — mesuré, il ne restait que 2 dB entre la respiration et
    // le sommet. Un orchestre ne se comprime pas : on retient les crêtes, un point.
    const glue = this.ctx.createDynamicsCompressor();
    glue.threshold.value = -11;
    glue.knee.value = 14; // genou très doux : la compression ne doit pas s'entendre
    glue.ratio.value = 1.8;
    glue.attack.value = 0.02; // laisse passer l'attaque des timbales et du piano
    glue.release.value = 0.32;
    const makeup = this.ctx.createGain();
    makeup.gain.value = 1.35;

    const musicFilter = this.ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 13000; // juste de quoi arrondir, pas de quoi étouffer
    musicFilter.Q.value = 0.6;

    this.musicBus.connect(this.musicDuck);
    this.musicDuck.connect(glue);
    this.kickBus.connect(glue);
    glue.connect(makeup);
    makeup.connect(this.musicVol);
    this.musicVol.connect(musicFilter);
    musicFilter.connect(this.master);

    // Bus dédié aux nappes de la cinématique (mixé plus sombre, filtré).
    this.cineBus = this.ctx.createGain();
    this.cineBus.gain.value = 0.5;
    const cineFilter = this.ctx.createBiquadFilter();
    cineFilter.type = 'lowpass';
    cineFilter.frequency.value = 1600;
    this.cineBus.connect(cineFilter);
    cineFilter.connect(this.master);

    // Buffer de bruit blanc partagé (explosions, percussions, risers).
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this._buildSpace();
    this._buildWaves();

    this.nextStepTime = this.ctx.currentTime + 0.1;
    this._scheduler();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_KEYS.muted, this.muted ? '1' : '0');
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  // Changement d'ambiance en fondu-enchaîné (jamais de coupure sèche).
  // La grille ne redémarre PAS : passer du jeu à la boutique et revenir doit donner
  // l'impression d'un seul morceau qui continue, pas de trois morceaux qui se coupent.
  setMode(mode) {
    const wasSilent = this.mode === 'off' || this.mode === 'cinematic';
    this.mode = mode;
    const def = MODES[mode] ?? MODES.off;
    // Un vrai départ (après le silence) repart de l'intro écrite, mesure 0.
    if (wasSilent && mode !== 'off' && mode !== 'cinematic') {
      this.step = 0;
      this.bar = 0;
    }
    if (this.ctx) {
      this.musicVol.gain.setTargetAtTime(def.gain, this.ctx.currentTime, 0.6);
    }
  }

  // ---- Le lieu : réverbération et delay partagés ----

  // Le jeu n'avait AUCUN espace : une explosion à l'extrême gauche sonnait au même
  // endroit qu'à droite, et rien n'avait de queue. Un seul convolveur partagé, une
  // impulsion générée en interne, et tout le jeu gagne d'un coup une profondeur.
  _buildSpace() {
    const sr = this.ctx.sampleRate;
    const dur = 1.8;
    const len = (sr * dur) | 0;
    const pre = (sr * 0.02) | 0;
    const ir = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let y = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        const x = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * Math.exp(-1.1 * t * dur);
        // Absorption de l'air : la queue s'assombrit avec le temps — c'est ce qui
        // donne la TAILLE du lieu, bien plus que sa durée.
        y += (x - y) * (0.42 - 0.3 * t);
        d[i] = y;
      }
      // Premières réflexions décorrélées entre les canaux : elles disent « grand ».
      [13, 19, 28, 37, 49, 58, 69].forEach((ms, k) => {
        const i = (pre + ((ms + (ch ? 1.7 : 0)) * sr) / 1000) | 0;
        if (i < len) d[i] += (k % 2 ? -1 : 1) * 0.34 * Math.pow(0.72, k);
      });
    }
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = ir;
    this.revSend = this.ctx.createGain();
    this.revSend.gain.value = 1;
    this.revSend.connect(this.reverb);
    const revLevel = this.ctx.createGain();
    revLevel.gain.value = 0.9;
    this.reverb.connect(revLevel);
    revLevel.connect(this.master);

    // Delay ping-pong en croche pointée : cale exactement sur le tempo.
    this.delay = this.ctx.createDelay(1);
    this.delay.delayTime.value = 0.3;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.28;
    const dlyTone = this.ctx.createBiquadFilter();
    dlyTone.type = 'lowpass';
    dlyTone.frequency.value = 2600;
    this.dlySend = this.ctx.createGain();
    this.dlySend.gain.value = 1;
    this.dlySend.connect(this.delay);
    this.delay.connect(dlyTone);
    dlyTone.connect(fb);
    fb.connect(this.delay);
    const dlyLevel = this.ctx.createGain();
    dlyLevel.gain.value = 0.35;
    dlyTone.connect(dlyLevel);
    dlyLevel.connect(this.master);
  }

  // Tables d'ondes : un oscillateur portant un PeriodicWave coûte exactement le même
  // prix qu'un `square`, mais il sort de l'identité spectrale d'une puce 8 bits.
  _buildWaves() {
    const mk = (imag) => {
      const re = new Float32Array(imag.length);
      return this.ctx.createPeriodicWave(re, new Float32Array(imag), {
        disableNormalization: false,
      });
    };
    const strings = [0];
    for (let n = 1; n <= 32; n++) strings[n] = (1 / n) * (1 - n / 40);
    const vox = [0];
    for (let n = 1; n <= 40; n++) vox[n] = 1 / Math.pow(n, 1.15);
    const growl = [0];
    for (let n = 1; n <= 32; n++) growl[n] = (1 / Math.pow(n, 0.85)) * (n >= 6 && n <= 9 ? 1.9 : 1);
    // Orgue d'église. Les jeux d'orgue ne sont PAS des harmoniques successives :
    // ce sont des tuyaux de 16, 8, 5⅓, 4, 2⅔ et 2 pieds, soit des rapports 1, 2,
    // 3, 4, 6 et 8 par rapport au 16 pieds. En prenant le 16 pieds comme
    // fondamentale, tout redevient entier et tient dans une seule onde — c'est
    // cette quinte du 5⅓ qui donne le grain d'orgue, et rien d'autre.
    const organ = [0, 1, 0.88, 0.42, 0.62, 0.1, 0.3, 0.07, 0.34];
    // Cuivres doux : plus de fondamentale, moins d'aigu que le brass existant. Le
    // caractère de cuivre vient du FILTRE qui s'ouvre avec la nuance, pas du spectre.
    const horn = [0, 1, 0.6, 0.36, 0.22, 0.13, 0.08, 0.05, 0.03];
    this.W = {
      strings: mk(strings),
      vox: mk(vox),
      growl: mk(growl),
      organ: mk(organ),
      horn: mk(horn),
      hollow: mk([0, 1, 0, 0.5, 0, 0.3, 0, 0.18, 0, 0.1]),
      brass: mk([0, 1, 0.82, 0.72, 0.6, 0.45, 0.32, 0.22, 0.15, 0.1, 0.06, 0.04]),
    };
  }

  // Panoramique dérivé de la position dans l'arène : l'information spatiale
  // existait déjà côté jeu, elle était simplement jetée à la frontière de l'audio.
  _pan(x = 0) {
    const p = Math.max(-1, Math.min(1, x / 14.5)) * 0.85;
    const node = this.ctx.createStereoPanner();
    node.pan.value = p;
    return node;
  }

  // ---- Primitives de synthèse ----

  _tone({ type = 'square', freq = 440, freqEnd = null, dur = 0.15, gain = 0.3, when = 0, dest }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(dest || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.3, gain = 0.4, filterFreq = 1200, filterEnd = 120, when = 0, dest }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, filterEnd), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest || this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  // Nappe tenue : plusieurs oscillateurs légèrement désaccordés, attaque et retombée lentes.
  _pad({ freqs, dur = 4, gain = 0.05, attack = 1.2, type = 'sawtooth', when = 0, dest }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    for (const f of freqs) {
      for (const detune of [-4, 3]) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = f;
        osc.detune.value = detune;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(gain, t0 + attack);
        g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - 1.2));
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.connect(g);
        g.connect(dest || this.cineBus);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      }
    }
  }

  // ---- Cues cinématiques (appelées par la timeline de l'intro) ----

  cinePad(chord = 'dark', dur = 6) {
    const chords = {
      dark: [55, 110, 130.81, 164.81], // la mineur grave
      tension: [58.27, 116.54, 138.59, 174.61], // si bémol — un demi-ton plus haut, ça serre
      hope: [65.41, 130.81, 196, 246.94], // do majeur ouvert
    };
    this._pad({ freqs: chords[chord] || chords.dark, dur, gain: 0.045, attack: 1.6 });
  }

  cinePulse() {
    this._tone({ type: 'sine', freq: 55, freqEnd: 40, dur: 0.5, gain: 0.4, dest: this.cineBus });
  }

  cineRiser(dur = 3) {
    if (!this.ctx) return;
    this._noise({ dur, gain: 0.16, filterFreq: 200, filterEnd: 3200, dest: this.cineBus });
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t0);
    osc.frequency.exponentialRampToValueAtTime(640, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.cineBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  cineImpact() {
    this._noise({ dur: 1.4, gain: 0.5, filterFreq: 900, filterEnd: 40, dest: this.cineBus });
    this._tone({ type: 'sine', freq: 90, freqEnd: 25, dur: 1.2, gain: 0.6, dest: this.cineBus });
  }

  // Une étoile qui s'éteint : petit glissando descendant, feutré et triste.
  cineStarDie() {
    this._tone({ type: 'sine', freq: 980, freqEnd: 160, dur: 0.6, gain: 0.12, dest: this.cineBus });
    this._noise({ dur: 0.3, gain: 0.05, filterFreq: 2400, filterEnd: 300, dest: this.cineBus });
  }

  // Thème héroïque : accord majeur add9 + envolée d'arpège, pour la révélation du vaisseau.
  cineHero() {
    this._pad({
      freqs: [130.81, 196, 261.63, 293.66, 392],
      dur: 5.5,
      gain: 0.055,
      attack: 0.15,
      type: 'triangle',
    });
    [523.25, 587.33, 783.99, 1046.5, 1174.66, 1567.98].forEach((f, i) =>
      this._tone({
        type: 'square',
        freq: f,
        dur: 0.4,
        gain: 0.06,
        when: 0.12 + i * 0.09,
        dest: this.cineBus,
      })
    );
    this._tone({ type: 'sine', freq: 65, freqEnd: 55, dur: 2.5, gain: 0.35, dest: this.cineBus });
  }

  // ---- SFX ----

  shoot() {
    this._tone({ type: 'square', freq: 880, freqEnd: 220, dur: 0.09, gain: 0.12 });
  }

  missile() {
    this._tone({ type: 'sawtooth', freq: 220, freqEnd: 660, dur: 0.25, gain: 0.1 });
    this._noise({ dur: 0.25, gain: 0.08, filterFreq: 3000, filterEnd: 600 });
  }

  enemyShoot() {
    this._tone({ type: 'sawtooth', freq: 320, freqEnd: 140, dur: 0.12, gain: 0.05 });
  }

  explosionSmall() {
    this._noise({ dur: 0.28, gain: 0.35, filterFreq: 2200, filterEnd: 200 });
    this._tone({ type: 'triangle', freq: 220, freqEnd: 50, dur: 0.2, gain: 0.2 });
  }

  explosionBig() {
    this._noise({ dur: 0.7, gain: 0.55, filterFreq: 1600, filterEnd: 60 });
    this._tone({ type: 'sine', freq: 120, freqEnd: 28, dur: 0.6, gain: 0.4 });
  }

  playerHit() {
    this._noise({ dur: 0.5, gain: 0.5, filterFreq: 900, filterEnd: 80 });
    this._tone({ type: 'sawtooth', freq: 200, freqEnd: 40, dur: 0.5, gain: 0.3 });
  }

  shieldHit() {
    this._tone({ type: 'sine', freq: 1200, freqEnd: 300, dur: 0.3, gain: 0.25 });
  }

  pickup(comboTier = 1) {
    const base = 660 + comboTier * 110;
    this._tone({ type: 'sine', freq: base, dur: 0.07, gain: 0.14 });
    this._tone({ type: 'sine', freq: base * 1.5, dur: 0.09, gain: 0.12, when: 0.05 });
  }

  // L'escalier de combo montait par intervalles de 1,335 — une quarte APPROCHÉE,
  // qui dérivait de plus en plus faux à chaque palier. Il monte maintenant dans la
  // gamme du morceau : à ×8, le dernier degré tombe pile sur la tonique.
  comboUp(tier) {
    const steps = [26, 29, 33, 36, 38, 41, 45, 48, 50]; // ré mineur, en montant
    for (let i = 0; i <= Math.min(tier, 4); i++) {
      this._tone({
        type: 'triangle',
        freq: hz(steps[Math.min(tier + i, steps.length - 1)]),
        dur: 0.11,
        gain: 0.09,
        when: i * 0.055,
      });
    }
  }

  buy() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this._tone({ type: 'triangle', freq: f, dur: 0.12, gain: 0.16, when: i * 0.05 })
    );
  }

  deny() {
    this._tone({ type: 'square', freq: 160, dur: 0.12, gain: 0.15 });
    this._tone({ type: 'square', freq: 120, dur: 0.16, gain: 0.15, when: 0.1 });
  }

  uiTick() {
    this._tone({ type: 'sine', freq: 900, dur: 0.03, gain: 0.05 });
  }

  // Frôlement : cristallin et montant, il doit s'entendre au-dessus du combat et
  // récompenser à l'oreille. Le timbre monte avec les frôlements enchaînés.
  graze(streak = 0) {
    const base = 1180 * Math.pow(1.06, Math.min(6, streak));
    this._tone({ type: 'sine', freq: base, freqEnd: base * 1.9, dur: 0.12, gain: 0.16 });
    this._tone({ type: 'triangle', freq: base * 2, dur: 0.09, gain: 0.08, when: 0.02 });
    this._noise({ dur: 0.1, gain: 0.05, filterFreq: 6000, filterEnd: 2200 });
  }

  // ---- Voix ----
  //
  // Une voix crédible, ce n'est pas une hauteur : ce sont des FORMANTS. Trois
  // passe-bande résonants en parallèle sur une source riche, dont les fréquences
  // GLISSENT d'une voyelle à l'autre à chaque syllabe. C'est ce glissement, et rien
  // d'autre, qui fabrique l'illusion d'une bouche. Les anciens bips en sinus purs
  // n'avaient qu'une seule harmonique : aucun formant possible, d'où l'enfantin.
  _speak(text, who = 'nova') {
    if (!this.ctx || !this.W) return 0;
    const P = VOICE[who];
    const syllables = Math.max(3, Math.min(9, Math.round(text.length / 9)));
    const t0 = this.ctx.currentTime + 0.02;
    const dur = syllables * P.syl;

    // Deux sources en unisson désaccordé : un oscillateur seul sonne synthétique.
    const src = this.ctx.createOscillator();
    src.setPeriodicWave(this.W[P.wave]);
    const src2 = this.ctx.createOscillator();
    src2.setPeriodicWave(this.W[P.wave]);
    src2.detune.value = P.detune;

    // Contour de hauteur : monte sur une question, retombe sur une affirmation.
    const q = text.trim().endsWith('?');
    const endF = q ? P.f0 * 1.16 : P.f0 * 0.9;
    for (const o of [src, src2]) {
      o.frequency.setValueAtTime(P.f0, t0);
      o.frequency.linearRampToValueAtTime(endF, t0 + dur);
    }

    const vca = this.ctx.createGain();
    vca.gain.setValueAtTime(0.0008, t0);
    src.connect(vca);
    src2.connect(vca);

    // Une enveloppe par syllabe : le rythme fait entendre qu'on PARLE.
    for (let i = 0; i < syllables; i++) {
      const ts = t0 + i * P.syl;
      const amp = P.gain * (0.72 + Math.random() * 0.5) * (i === 0 ? 1.15 : 1);
      vca.gain.linearRampToValueAtTime(amp, ts + 0.028);
      vca.gain.exponentialRampToValueAtTime(0.0008, ts + P.syl * 0.82);
    }

    // Banc de formants, morphé d'une voyelle à l'autre à chaque syllabe.
    const sum = this.ctx.createGain();
    const bank = P.vowels[0].map((f, i) => {
      const b = this.ctx.createBiquadFilter();
      b.type = 'bandpass';
      b.frequency.setValueAtTime(f, t0);
      b.Q.setValueAtTime(P.q[i], t0);
      const g = this.ctx.createGain();
      g.gain.value = [1.0, 0.55, 0.24][i];
      vca.connect(b);
      b.connect(g);
      g.connect(sum);
      return b;
    });
    for (let i = 1; i < syllables; i++) {
      const target = P.vowels[i % P.vowels.length];
      const ts = t0 + i * P.syl;
      bank.forEach((b, k) => b.frequency.linearRampToValueAtTime(target[k], ts + 0.05));
    }

    // Canal de transmission : c'est la bande passante qui dit « radio ».
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = P.band[0];
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = P.band[1];
    sum.connect(hp);
    hp.connect(lp);

    const out = this.ctx.createGain();
    out.gain.value = 1;
    lp.connect(out);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = P.pan;
    out.connect(pan);
    pan.connect(this.sfxBus);

    // NOVA est sèche, dans le casque ; KORN est loin et réverbéré. C'est l'ESPACE
    // qui les oppose, pas le volume.
    if (this.revSend) {
      const rev = this.ctx.createGain();
      rev.gain.value = P.reverb;
      out.connect(rev);
      rev.connect(this.revSend);
    }

    src.start(t0);
    src2.start(t0);
    src.stop(t0 + dur + 0.12);
    src2.stop(t0 + dur + 0.12);
    return dur * 1000;
  }

  voiceNova(text = 'transmission') {
    return this._speak(text, 'nova');
  }

  voiceKorn(text = 'transmission') {
    return this._speak(text, 'korn');
  }

  // Appel de cors : les trois premières notes du thème, en fanfare. Chaque vague
  // s'ouvre sur le motif que le joueur connaît déjà par l'écran-titre.
  waveStart() {
    const t0 = this.ctx?.currentTime;
    if (t0 == null) return;
    [THEME[0], THEME[1], THEME[1] + 12].forEach((semi, i) =>
      this._horn(t0 + i * 0.16, semi - 12, 3, 0.9)
    );
    this._timpani(t0, 14, 0.55);
  }

  // Montée en régime du saut lumière : un accord qui s'ouvre pendant que le bruit
  // filtré monte. La tension vient de l'ATTENTE, pas du volume.
  jumpCharge() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (const [i, semi] of [26, 33, 38, 45].entries()) {
      const o = this.ctx.createOscillator();
      o.setPeriodicWave(this.W.brass);
      o.frequency.setValueAtTime(hz(semi) * 0.985, t0);
      o.frequency.linearRampToValueAtTime(hz(semi), t0 + 1.1);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 1.05);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + 1.35);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t0 + i * 0.08);
      o.stop(t0 + 1.45);
    }
    this._noise({ dur: 1.15, gain: 0.09, filterFreq: 400, filterEnd: 6500 });
  }

  // Le départ : une chute d'octave sur la tonique, et un souffle qui s'éloigne.
  jumpGo() {
    const t0 = this.ctx?.currentTime;
    if (t0 == null) return;
    // Coup de timbale, cymbale, et le souffle qui s'éloigne.
    this._timpani(t0, 14, 1.3);
    this._cymbal(t0, 1.5, 2.6);
    this._horn(t0, THEME[0] - 24, 5, 1.2);
    this._noise({ dur: 1.1, gain: 0.2, filterFreq: 8000, filterEnd: 150 });
  }

  // Réflexe Chrono : la dilatation du temps s'entend par une CHUTE de hauteur,
  // c'est le seul signal que l'oreille lit spontanément comme « ça ralentit ».
  reflexIn() {
    this._tone({ type: 'sine', freq: hz(50), freqEnd: hz(31), dur: 0.34, gain: 0.16 });
    this._tone({
      type: 'triangle',
      freq: hz(38),
      freqEnd: hz(26),
      dur: 0.5,
      gain: 0.1,
      when: 0.03,
    });
    this._noise({ dur: 0.45, gain: 0.08, filterFreq: 6000, filterEnd: 500 });
  }

  // Et la remontée quand le temps reprend : le mouvement inverse, plus court.
  reflexOut() {
    this._tone({ type: 'sine', freq: hz(31), freqEnd: hz(50), dur: 0.2, gain: 0.11 });
  }

  // Cuivres graves en cluster : la tierce du thème contre sa quinte ABAISSÉE,
  // jouées ensemble. Deux notes qui ne devraient pas cohabiter, et l'oreille sait
  // immédiatement que quelque chose ne va pas — sans qu'aucun texte l'annonce.
  bossAlarm() {
    const t0 = this.ctx?.currentTime;
    if (t0 == null) return;
    for (let i = 0; i < 3; i++) {
      const w = t0 + i * 0.5;
      this._horn(w, THEME_BOSS[0] - 12, 7, 1.1);
      this._horn(w, THEME_BOSS[2] - 13, 7, 0.85);
      this._timpani(w, 12, 0.9);
    }
    this._cymbal(t0, 1.3, 3);
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) =>
      this._tone({ type: 'triangle', freq: f, dur: 0.4, gain: 0.2, when: i * 0.28 })
    );
  }

  // ---- Musique ----
  //
  // Le modèle de données change, et c'est lui le verrou : un tableau de fréquences
  // ABSOLUES interdit à lui seul tout accord, toute transposition, toute cadence.
  // Tout s'écrit ici en demi-tons depuis ré1 — d'où des accords, une grille qui
  // avance, et un boss qui ne change pas de tonique mais de MODE.
  //
  // Forme : 32 mesures (51,2 s) au lieu d'une boucle de 2 s répétée à l'identique.
  // L'oreille apprenait l'ancienne boucle en trois passages puis la filtrait comme
  // du bruit de fond.

  _scheduler() {
    if (!this.ctx) return;
    const lookahead = 0.12;
    const stepDur = 60 / TEMPO / 4; // 0,100 s pile : toutes les transitions sont calées
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      if (this.mode !== 'off' && this.mode !== 'cinematic' && !this.muted) {
        this._playStep(this.step, this.bar, this.nextStepTime);
      }
      this.nextStepTime += stepDur;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
        // L'intro (mesures 0-3) ne se réentend jamais : on reboucle sur la mesure 4.
        if (this.bar >= 32) this.bar = 4;
      }
    }
    this.schedulerId = setTimeout(() => this._scheduler(), 40);
  }

  // Section de la forme à la mesure donnée.
  _form(bar) {
    let f = FORM[0];
    for (const s of FORM) if (bar >= s.from) f = s;
    return f;
  }

  // Un accord toutes les deux mesures, compté DEPUIS le début de la section :
  // chaque section commence donc sur son premier accord, pas au milieu de la grille.
  _chordAt(bar) {
    const f = this._form(bar);
    return CHORDS[f.grid[Math.floor((bar - f.from) / 2) % f.grid.length]];
  }

  // Hachage déterministe : on veut une variation musicale reproductible, pas du bruit.
  _rnd(bar, step, salt = 0) {
    let h = (bar * 73856093) ^ (step * 19349663) ^ (salt * 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---- L'orchestre ----
  //
  // Rien de ce qui suit n'est un « son de synthé » : chaque instrument est fabriqué
  // à partir de ce qui le caractérise physiquement. C'est la seule façon d'obtenir
  // un orchestre sans un seul fichier son.

  // Nappe persistante : orgue d'église + chœur, en portamento. On rampe les
  // fréquences au lieu de créer et détruire des oscillateurs à chaque accord —
  // un orgue ne réattaque pas quand l'harmonie change, il glisse.
  _ensurePad() {
    if (this.padVoices) return;
    this.padVoices = [];
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 1;
    this.padGain.connect(this.musicBus);

    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.9;
    this.padFilter.connect(this.padGain);

    // L'orgue vit dans une grande pièce, c'est ce qui le fait exister. On lui donne
    // beaucoup plus de réverbération qu'à n'importe quoi d'autre dans le jeu.
    const padRev = this.ctx.createGain();
    padRev.gain.value = 0.75;
    this.padFilter.connect(padRev);
    if (this.revSend) padRev.connect(this.revSend);

    for (let i = 0; i < 4; i++) {
      const g = this.ctx.createGain();
      g.gain.value = 0.02;
      g.connect(this.padFilter);
      // Deux tuyaux par voix, désaccordés de ±7 cents. Un orgue réel n'est jamais
      // parfaitement accordé d'un tuyau à l'autre, et c'est ce battement lent qui
      // le rend vivant plutôt que mathématique.
      const pair = [-7, 7].map((det) => {
        const o = this.ctx.createOscillator();
        o.setPeriodicWave(this.W.organ);
        o.detune.value = det;
        o.frequency.value = 110;
        o.connect(g);
        o.start();
        return o;
      });
      this.padVoices.push({ oscs: pair, gain: g });
    }

    // Chœur : quatre voix à formants sur la même harmonie. Le formant est ce qui
    // distingue une voix humaine d'une onde — et la machinerie existe déjà pour
    // NOVA et KORN, on la réutilise telle quelle.
    this.choirVoices = [];
    this.choirGain = this.ctx.createGain();
    this.choirGain.gain.value = 0;
    this.choirGain.connect(this.musicBus);
    const choirRev = this.ctx.createGain();
    choirRev.gain.value = 0.9;
    this.choirGain.connect(choirRev);
    if (this.revSend) choirRev.connect(this.revSend);

    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      osc.setPeriodicWave(this.W.vox);
      osc.frequency.value = 220;
      osc.detune.value = (i - 1.5) * 9; // le pupitre n'est jamais à l'unisson exact
      // Vibrato lent et faible : un chœur qui ne vibre pas est un synthé.
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 4.6 + i * 0.25;
      const lfoAmt = this.ctx.createGain();
      lfoAmt.gain.value = 4.5;
      lfo.connect(lfoAmt);
      lfoAmt.connect(osc.detune);
      lfo.start();

      const sum = this.ctx.createGain();
      sum.gain.value = 0.33;
      // Trois formants pour la voyelle « a » : c'est ce triplet, et lui seul, qui
      // fait entendre une bouche ouverte.
      for (const [fi, f] of VOWEL.a.entries()) {
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = [8, 9, 7][fi];
        const amp = this.ctx.createGain();
        amp.gain.value = [1, 0.5, 0.22][fi];
        osc.connect(bp);
        bp.connect(amp);
        amp.connect(sum);
      }
      sum.connect(this.choirGain);
      osc.start();
      this.choirVoices.push(osc);
    }

    // Pédale d'orgue : le 32 pieds. On ne l'entend pas vraiment, on le sent — et
    // c'est lui qui donne l'impression que la pièce est immense.
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = ROOT;
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.055;
    this.subOsc.connect(this.subGain);
    this.subGain.connect(this.musicBus);
    this.subOsc.start();
  }

  // Niveau de la nappe par section. C'est le RETRAIT des couches qui fabrique la
  // forme : sans dynamique, un orchestre n'est qu'un mur.
  _padLevel(sec, quiet) {
    if (quiet) return 0.85;
    return { intro: 0.8, A: 0.42, lift: 0.55, drop: 1, breakdown: 0.16, retour: 0.5 }[sec] ?? 0.42;
  }

  _choirLevel(sec, quiet) {
    if (quiet) return 0.05;
    return (
      { intro: 0, A: 0.03, lift: 0.08, drop: 0.3, breakdown: 0.035, retour: 0.09 }[sec] ?? 0.03
    );
  }

  _setChord(chord, when) {
    this._ensurePad();
    chord.pad.forEach((semi, i) => {
      const v = this.padVoices[i];
      if (!v) return;
      // L'orgue sonne une octave sous la voix écrite : le jeu de 16 pieds sert de
      // fondamentale au spectre (voir _buildWaves).
      for (const o of v.oscs) o.frequency.linearRampToValueAtTime(hz(semi - 12), when + 0.35);
      // Le chœur chante le voicing écrit, PAS une octave au-dessus. Placé plus
      // haut, il occupait exactement le registre de la mélodie : un si♭ de mélodie
      // contre un la de chœur tenu donne une seconde mineure soutenue, ce qui est
      // le frottement le plus dur qui existe. Règle d'orchestration élémentaire :
      // une nappe tenue ne se met jamais dans l'octave du chant.
      const c = this.choirVoices?.[i];
      if (c) c.frequency.linearRampToValueAtTime(hz(semi), when + 0.5);
    });
    this.subOsc.frequency.linearRampToValueAtTime(hz(chord.sub), when + 0.35);
  }

  // Le sidechain d'origine était un pompage de musique électronique. Il n'a plus
  // lieu d'être : un orchestre ne se creuse pas sous ses propres timbales. On garde
  // un très léger retrait, uniquement pour que le coup de timbale respire.
  _duck(when, depth = 0.16, release = 0.5) {
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(when);
    g.setValueAtTime(1 - depth, when);
    g.linearRampToValueAtTime(1, when + release);
  }

  // --- Percussions ---

  // Timbale : une PEAU TENDUE, donc une hauteur définie qui descend légèrement à
  // l'attaque, et une longue résonance. C'est ce glissando court qui fait la
  // différence entre une timbale et une grosse caisse.
  _timpani(when, semi, gain = 1) {
    const t = when - this.ctx.currentTime;
    const f = hz(semi);
    this._tone({
      type: 'sine',
      freq: f * 1.18,
      freqEnd: f,
      dur: 1.5,
      gain: 0.55 * gain,
      when: t,
      dest: this.kickBus,
    });
    this._tone({
      type: 'triangle',
      freq: f * 2.02,
      freqEnd: f * 1.98,
      dur: 0.7,
      gain: 0.16 * gain,
      when: t,
      dest: this.kickBus,
    });
    // Le mailletage : le bruit feutré du feutre sur la peau, très court.
    this._noise({
      dur: 0.05,
      gain: 0.1 * gain,
      filterFreq: 2600,
      filterEnd: 500,
      when: t,
      dest: this.kickBus,
    });
    this._duck(when);
  }

  // Le tic. Très court, très sec, et SANS réverbération : c'est ce qui le place
  // dans le cockpit plutôt que dans la nef.
  _tick(when, gain = 1) {
    const t = when - this.ctx.currentTime;
    this._noise({
      dur: 0.012,
      gain: 0.13 * gain,
      filterFreq: 5200,
      filterEnd: 3000,
      when: t,
      dest: this.musicBus,
    });
    this._tone({
      type: 'square',
      freq: 2100,
      freqEnd: 1500,
      dur: 0.014,
      gain: 0.05 * gain,
      when: t,
      dest: this.musicBus,
    });
  }

  // --- Instruments à hauteur ---

  // Orgue percussif : la note de l'ostinato. Attaque quasi instantanée, coupure
  // franche — un tuyau s'ouvre et se ferme, il ne se fond pas.
  _organ(when, semi, dur = 0.3, gain = 0.06) {
    if (!this.ctx) return;
    const t0 = when;
    const o = this.ctx.createOscillator();
    o.setPeriodicWave(this.W.organ);
    o.frequency.value = hz(semi - 12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.setValueAtTime(gain, t0 + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    o.connect(g);
    g.connect(this.musicBus);
    if (this.revSend) {
      const s = this.ctx.createGain();
      s.gain.value = 0.35;
      g.connect(s);
      s.connect(this.revSend);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // Jeu de flûte. Une registration douce de l'orgue — presque une sinusoïde avec
  // un peu de quinte — qui porte la mélodie sans la couleur d'attaque des tuyaux
  // d'anche. C'est ce qui remplace le piano : après quatre tentatives infructueuses
  // de synthèse de corde frappée, autant confier la ligne à l'instrument dont on
  // sait qu'il sonne juste.
  _flute(when, semi, steps, gain = 1) {
    if (!this.ctx) return;
    const dur = (steps * 60) / TEMPO / 4;
    const t0 = when;
    for (const [mul, amp, det] of [
      [1, 1, 0],
      [2, 0.22, 4],
      [3, 0.09, -5],
      [4, 0.05, 6],
    ]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(semi) * mul;
      o.detune.value = det;
      const g = this.ctx.createGain();
      const peak = 0.062 * amp * gain;
      // Attaque douce mais pas molle : un tuyau met une trentaine de millisecondes
      // à s'établir, et c'est ce petit retard qui le distingue d'une sinusoïde.
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.035);
      g.gain.setValueAtTime(peak, t0 + dur * 0.72);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
      o.connect(g);
      g.connect(this.musicBus);
      if (this.revSend) {
        const sd = this.ctx.createGain();
        sd.gain.value = 0.42;
        g.connect(sd);
        sd.connect(this.revSend);
      }
      o.start(t0);
      o.stop(t0 + dur + 0.06);
    }
  }

  // Cuivres. Le caractère de cuivre ne vient PAS du spectre mais du filtre : plus
  // la note est forte, plus elle est brillante. Une enveloppe de filtre qui suit
  // l'enveloppe d'amplitude, et un sawtooth devient un cor.
  _horn(when, semi, steps, gain = 1) {
    if (!this.ctx) return;
    const dur = (steps * 60) / TEMPO / 4;
    const t0 = when;
    for (const det of [-6, 6]) {
      const o = this.ctx.createOscillator();
      o.setPeriodicWave(this.W.horn);
      o.detune.value = det;
      o.frequency.setValueAtTime(hz(semi), t0);

      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(420, t0);
      f.frequency.linearRampToValueAtTime(2600, t0 + dur * 0.35);
      f.frequency.linearRampToValueAtTime(900, t0 + dur);

      const g = this.ctx.createGain();
      // Attaque lente : c'est le souffle qui met le tuyau en vibration. Une attaque
      // sèche donnerait un orgue, pas un cuivre.
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.075 * gain, t0 + dur * 0.28);
      g.gain.setValueAtTime(0.075 * gain, t0 + dur * 0.72);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);

      // Vibrato tardif : un cuivre ne vibre pas dès la première seconde.
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const amt = this.ctx.createGain();
      amt.gain.setValueAtTime(0, t0);
      amt.gain.linearRampToValueAtTime(6, t0 + dur * 0.6);
      lfo.connect(amt);
      amt.connect(o.detune);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);

      o.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      if (this.revSend) {
        const s = this.ctx.createGain();
        s.gain.value = 0.5;
        g.connect(s);
        s.connect(this.revSend);
      }
      o.start(t0);
      o.stop(t0 + dur + 0.06);
    }
  }

  // Contrebasses : archet, donc attaque molle et note tenue. Aucune percussion.
  _bass(when, semi, steps = 8) {
    if (!this.ctx) return;
    const dur = (steps * 60) / TEMPO / 4;
    const t0 = when;
    const o = this.ctx.createOscillator();
    o.setPeriodicWave(this.W.strings);
    o.frequency.value = hz(semi);
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = hz(semi - 12);

    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.14, t0 + 0.14);
    g.gain.setValueAtTime(0.14, t0 + dur * 0.78);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    o.connect(f);
    sub.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    o.start(t0);
    sub.start(t0);
    o.stop(t0 + dur + 0.06);
    sub.stop(t0 + dur + 0.06);
  }

  // Cordes tenues. C'est le pupitre le plus nombreux d'un orchestre et celui qui
  // fait le VOLUME d'un tutti : sans lui, le sommet du morceau sortait plus bas que
  // la montée qui l'annonçait — mesuré, −20 dB contre −17. Attaque lente à
  // l'archet, aucune percussion, et un léger désaccord entre pupitres.
  _strings(when, semis, steps, gain = 1) {
    if (!this.ctx) return;
    const dur = (steps * 60) / TEMPO / 4;
    const t0 = when;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.036 * gain, t0 + dur * 0.22);
    g.gain.setValueAtTime(0.036 * gain, t0 + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    g.connect(this.musicBus);
    if (this.revSend) {
      const sfx = this.ctx.createGain();
      sfx.gain.value = 0.55;
      g.connect(sfx);
      sfx.connect(this.revSend);
    }
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1600, t0);
    f.frequency.linearRampToValueAtTime(3400, t0 + dur * 0.3);
    f.connect(g);
    for (const semi of semis) {
      for (const det of [-8, 8]) {
        const o = this.ctx.createOscillator();
        o.setPeriodicWave(this.W.strings);
        o.detune.value = det + (Math.random() - 0.5) * 6;
        o.frequency.value = hz(semi);
        o.connect(f);
        o.start(t0);
        o.stop(t0 + dur + 0.06);
      }
    }
  }

  // Cordes en trémolo : l'archet qui va et vient très vite sur la corde. C'est la
  // signature universelle de la tension qui monte.
  //
  // Piège à éviter, et je suis tombé dedans : la modulation d'un AudioParam est
  // ADDITIVE. Brancher un LFO d'amplitude 0,45 sur un gain dont l'enveloppe vaut
  // 0,02 ne donne pas un trémolo de 45 %, ça donne un signal qui bat entre −0,43 et
  // +0,47 — vingt fois trop fort. Mesuré, la montée sortait 3 dB AU-DESSUS du
  // sommet qu'elle était censée annoncer. D'où deux étages séparés : un gain de
  // trémolo qui oscille autour de sa propre valeur, puis l'enveloppe.
  _tremolo(when, semis, dur, gain = 1) {
    if (!this.ctx) return;
    const t0 = when;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.05 * gain, t0 + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    env.connect(this.musicBus);
    if (this.revSend) {
      const s = this.ctx.createGain();
      s.gain.value = 0.4;
      env.connect(s);
      s.connect(this.revSend);
    }

    // Étage de trémolo : oscille entre 0,3 et 1,0 de son propre niveau.
    const trem = this.ctx.createGain();
    trem.gain.value = 0.65;
    trem.connect(env);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(7, t0);
    lfo.frequency.linearRampToValueAtTime(13, t0 + dur); // l'archet s'affole
    const depth = this.ctx.createGain();
    depth.gain.value = 0.35;
    lfo.connect(depth);
    depth.connect(trem.gain);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);

    for (const semi of semis) {
      const o = this.ctx.createOscillator();
      o.setPeriodicWave(this.W.strings);
      o.frequency.value = hz(semi);
      o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(trem);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }

  // ---- Instruments rendus hors ligne ----
  //
  // Trois pianos additifs successifs ont échoué, et l'échec était structurel :
  // on ne fabrique pas un piano en décrivant son SPECTRE. Ce que l'oreille
  // reconnaît, c'est la manière dont le son s'installe et meurt, et ça ne se
  // décrit pas, ça se simule.
  //
  // On change donc de méthode : guide d'onde numérique pour les cordes, synthèse
  // modale pour les métaux. Tout ce qu'on imitait péniblement en sort tout seul.
  //
  // WebAudio interdit de boucler un DelayNode plus court qu'un bloc de 128
  // échantillons, soit 345 Hz au minimum — or la mélodie monte à 694 Hz. On
  // calcule donc l'instrument en JavaScript, une fois par hauteur, dans un
  // AudioBuffer mis en cache : physique exacte à l'échantillon, coût nul ensuite.
  //
  // Les tampons sont rendus à 32 kHz et déclarent eux-mêmes leur fréquence
  // d'échantillonnage : le navigateur les rééchantillonne sans changer la
  // hauteur, et on divise par un tiers la mémoire et le temps de calcul pour du
  // contenu qui, de toute façon, n'a rien au-dessus de 16 kHz.
  _renderBuffer(key, seconds, fill) {
    if (!this._bufCache) this._bufCache = new Map();
    const hit = this._bufCache.get(key);
    if (hit) return hit;
    const sr = 32000;
    const n = Math.floor(sr * seconds);
    const data = new Float32Array(n);
    fill(data, sr, n);

    // Normalisation et fondu de fin : un tampon coupé net claque.
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    const norm = peak > 1e-6 ? 0.92 / peak : 0;
    const fade = Math.round(sr * 0.06);
    for (let i = 0; i < n; i++) {
      data[i] *= norm * (i > n - fade ? (n - i) / fade : 1);
    }

    const buf = this.ctx.createBuffer(1, n, sr);
    buf.copyToChannel(data, 0);
    // Le jeu n'utilise qu'une quinzaine de hauteurs : le cache reste petit, mais
    // on le borne quand même pour ne pas garder de la mémoire GPU pour rien.
    if (this._bufCache.size > 28) this._bufCache.delete(this._bufCache.keys().next().value);
    this._bufCache.set(key, buf);
    return buf;
  }

  // Générateur déterministe : le même instrument doit sonner pareil d'une partie
  // à l'autre, sinon ce n'est plus un instrument.
  _seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- La corde de piano, en guide d'onde ---
  //
  // Une ligne à retard rebouclée sur un filtre de pertes, c'est une corde. Et
  // tout ce que les versions additives essayaient de plaquer en sort gratuitement,
  // parce que c'est ce que fait une vraie corde :
  //   · les aigus meurent avant les graves, parce que la boucle est passe-bas ;
  //   · la DOUBLE DÉCROISSANCE — chute rapide puis longue traîne — naît du
  //     couplage des deux ou trois cordes d'un même chœur par le chevalet : en
  //     phase elles cèdent vite leur énergie, déphasées elles se la repassent ;
  //   · le battement ÉVOLUE au lieu d'être un chorus régulier ;
  //   · l'inharmonicité vient du passe-tout de dispersion, qui rend la corde raide.
  _pianoBuffer(semi) {
    return this._renderBuffer(`piano${semi}`, 2.7, (out, sr, n) => {
      const f0 = hz(semi);
      const w0 = (2 * Math.PI * f0) / sr;
      const rnd = this._seeded(semi * 7919 + 13);

      // Comme sur un vrai piano : une corde dans le grave, deux au médium, trois
      // à partir du médium-aigu.
      const nStrings = f0 < 110 ? 1 : f0 < 220 ? 2 : 3;
      const spread = [0, -2.4, 2.9]; // désaccord du chœur, en centièmes (battement ≈ 0,9 Hz)

      // Filtre de pertes de la boucle, et sa contribution au retard total.
      //
      // Il doit être BEAUCOUP plus doux que l'intuition ne le suggère, parce qu'il
      // s'applique à chaque aller-retour de l'onde — soit f0 fois par seconde.
      // À 0,36, l'atténuation par tour était de 0,88 sur le dixième partiel : au
      // bout de 0,15 s il avait fait 44 tours et se retrouvait 140 dB plus bas.
      // Mesuré, le son était devenu une sinusoïde pure. À 0,032 le huitième partiel
      // tient quatre secondes, le seizième une seconde et demie, la fondamentale
      // neuf — et c'est cet ÉCART de durée entre partiels, et lui seul, qui fait
      // qu'une note de piano s'assombrit en tenant au lieu de simplement baisser.
      //
      // ...et comme le couplage plus bas, il doit être INVERSEMENT PROPORTIONNEL à
      // la hauteur, pour exactement la même raison : la perte se compose par
      // aller-retour, et un fa5 en fait 2,4 fois plus par seconde qu'un ré4. À
      // valeur fixe, mesuré, le ré4 gardait onze partiels à l'attaque et le fa5
      // seulement quatre — or le fa5 est la note du sommet de la mélodie, celle
      // qui doit sonner le plus. On normalise donc la perte par SECONDE et non
      // par tour ; 9,4 est choisi pour retomber sur 0,032 au ré4.
      const a = Math.min(0.032, 9.4 / f0);
      const pdLoop = Math.atan2(a * Math.sin(w0), 1 - a * Math.cos(w0)) / w0;
      // Passe-tout de dispersion : son retard DIMINUE avec la fréquence, donc les
      // partiels aigus se retrouvent au-dessus de n·f0. C'est la raideur de corde.
      const ap = -0.11;
      const pdAp =
        -(
          Math.atan2(-Math.sin(w0), ap + Math.cos(w0)) -
          Math.atan2(-ap * Math.sin(w0), 1 + ap * Math.cos(w0))
        ) / w0;

      // Un grave tient bien plus longtemps qu'un aigu.
      const t60 = Math.min(14, Math.max(3, 11 * Math.pow(293 / f0, 0.5)));

      // Glissando d'attaque : la corde part légèrement haute et redescend, parce
      // que sa tension augmente avec l'amplitude. Sans ce petit affaissement de
      // hauteur, un piano sonne électronique. Déclaré ici parce que chaque corde
      // en reçoit sa propre dose au moment de sa construction.
      const glideAmt = 0.0042; // ≈ 7 centièmes
      const glideTau = sr * 0.045;

      const strings = [];
      for (let si = 0; si < nStrings; si++) {
        const f = f0 * Math.pow(2, (spread[si] || 0) / 1200);
        // Le retard TOTAL de la boucle doit valoir sr/f. Le filtre de pertes et le
        // passe-tout de dispersion en consomment une partie : on retranche.
        const N = Math.max(4, sr / f - pdLoop - pdAp);
        // Partie fractionnaire ramenée dans [1, 2[ : c'est la plage où un passe-tout
        // du premier ordre approche fidèlement un retard fractionnaire, et ça laisse
        // de la marge au glissando d'attaque qui va raccourcir la ligne.
        const ni = Math.floor(N - 1);
        const d = N - ni;
        strings.push({
          buf: new Float32Array(ni + 4),
          size: ni + 4,
          ni,
          d,
          w: 0,
          lp: 0,
          fx: 0,
          fy: 0,
          ax: 0,
          ay: 0,
          out: 0,
          // Désalignement du marteau : ±22 % d'énergie d'une corde à l'autre.
          glide: glideAmt * (1 + (si - 1) * 0.22),
          g: Math.pow(10, (-3 * (sr / f)) / (sr * t60)),
        });
      }

      // L'excitation. Une impulsion filtrée par un passe-bas du premier ordre :
      // sa pente spectrale en 1/n EST la répartition des partiels d'une corde
      // frappée. Un cosinus surélevé de 1 ms, lui, n'avait plus rien au-dessus de
      // 1,8 kHz — mesuré, il ne restait que quatre partiels audibles, ce qui donne
      // une sinusoïde et non un piano. Plus le feutre est mou (grave), plus le
      // filtre se ferme.
      const soft = Math.min(0.8, Math.max(0.42, 0.5 + (293 - f0) / 2400));
      // Le temps de contact du marteau décroît PROPORTIONNELLEMENT à la hauteur,
      // pas en racine : un marteau d'aigu est petit, dur, et rebondit presque
      // aussitôt. En racine, mesuré, le fa5 gardait un contact de 0,61 ms — assez
      // long pour n'exciter que ce qui est sous 1,6 kHz, d'où six partiels à
      // l'attaque contre quatorze au ré4.
      const contact = Math.max(3, Math.round(sr * 0.001 * (220 / f0)));

      // Le marteau frappe au huitième de la corde. Les modes qui ont un nœud à cet
      // endroit ne peuvent pas être mis en mouvement : le partiel 8 est donc
      // ANNULÉ, et le 16 avec lui. Ce trou dans le spectre est une signature du
      // piano — un spectre plein sonne orgue. Le peigne doit retarder de L/8 :
      // à L/4, comme je l'avais écrit, c'est le partiel 4 qu'on annule.
      const period = Math.max(4, Math.round(sr / f0));
      const strike = Math.max(1, Math.round(period / 8));
      const exLen = period + strike + 2;
      const raw = new Float32Array(exLen);
      let h = 0;
      let nz = 0;
      for (let i = 0; i < exLen; i++) {
        nz = nz * 0.4 + (rnd() * 2 - 1) * 0.6;
        const drive =
          (i === 0 ? 1 : 0) +
          (i < contact ? (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / contact)) * 0.5 : 0) +
          (i < contact ? nz * 0.24 : 0);
        h = h * soft + drive * (1 - soft);
        raw[i] = h;
      }
      const ex = new Float32Array(exLen);
      for (let i = 0; i < exLen; i++) ex[i] = raw[i] - (i >= strike ? raw[i - strike] : 0);

      // Couplage au chevalet. Il doit être BEAUCOUP plus faible qu'il n'y paraît :
      // les trois cordes d'un chœur sont désaccordées, donc dé-corrélées, et ce
      // qu'on réinjecte de l'une dans l'autre n'est pas en phase — le couplage se
      // comporte alors comme une PERTE. À 0,05, mesuré, il retirait 87 dB par
      // seconde aux partiels aigus et il ne restait plus que trois harmoniques au
      // bout d'une demi-seconde. À 0,006 l'échange met une demi-seconde à se
      // faire : c'est exactement la constante de temps de la double décroissance
      // d'un vrai piano, et le reste passe.
      // ...et il doit être inversement proportionnel à la hauteur : la perte agit
      // PAR ALLER-RETOUR, et un ré5 en fait deux fois plus par seconde qu'un ré4.
      // À valeur fixe, mesuré, l'aigu perdait 24 dB/s là où le grave en perdait 10.
      const k = Math.min(0.02, 1.4 / f0);

      for (let i = 0; i < n; i++) {
        let bridge = 0;
        for (let si = 0; si < strings.length; si++) {
          const s = strings[si];
          // Glissando PAR CORDE. Le marteau n'est jamais parfaitement aligné : il
          // touche les trois cordes du chœur avec des énergies légèrement
          // différentes, donc chacune part plus ou moins haute et redescend à son
          // rythme. C'est ce qui fait qu'un battement de piano ACCÉLÈRE puis se
          // stabilise. Avec un glissando commun, comme je l'avais écrit, le
          // désaccord relatif restait constant et le battement était parfaitement
          // régulier — c'est-à-dire un chorus de synthétiseur, reconnaissable
          // entre mille.
          const glide = 1 + s.glide * Math.exp(-i / glideTau);
          // Lecture à retard ENTIER, puis passe-tout pour la fraction. L'ancienne
          // version interpolait linéairement, ce qui est un passe-bas : appliqué
          // 294 fois par seconde, il retirait 68 dB par seconde au huitième
          // partiel et 280 au seizième. Mesuré, il ne restait que quatre partiels
          // — c'est LUI qui transformait la corde en sinusoïde, pas la décroissance.
          // Un passe-tout a un module de 1 : il retarde sans jamais atténuer.
          let r = s.w - s.ni;
          if (r < 0) r += s.size;
          const x0 = s.buf[r];

          const dNow = (s.ni + s.d) / glide - s.ni;
          const eta = (1 - dNow) / (1 + dNow);
          const fy = eta * x0 + s.fx - eta * s.fy;
          s.fx = x0;
          s.fy = fy;

          s.lp = (1 - a) * fy + a * s.lp;
          const x = s.lp * s.g;

          const y = ap * x + s.ax - ap * s.ay;
          s.ax = x;
          s.ay = y;
          s.out = y;
          bridge += y;
        }
        bridge /= strings.length;
        for (let si = 0; si < strings.length; si++) {
          const s = strings[si];
          let v = s.out * (1 - k) + bridge * k;
          if (i < exLen) v += ex[i] * 0.55;
          s.buf[s.w] = v;
          s.w = s.w + 1 >= s.size ? 0 : s.w + 1;
        }
        // LE COUP DE MARTEAU LUI-MÊME, en direct.
        //
        // C'était le défaut le plus grave et le plus invisible : l'excitation
        // n'était injectée que DANS la ligne à retard, après le calcul de la
        // sortie. Le marteau ne parvenait donc jamais à l'auditeur — on
        // n'entendait la corde qu'après un aller-retour complet, déjà filtrée par
        // la boucle. Le son APPARAISSAIT au lieu de DÉMARRER, et c'est
        // exactement ce qui le faisait sonner artificiel.
        //
        // Sur un vrai piano, le choc du feutre passe par le chevalet et arrive à
        // l'oreille immédiatement, avant même que l'onde ait parcouru la corde.
        out[i] = bridge + (i < exLen ? ex[i] * 0.5 : 0);
      }
    });
  }

  // La table d'harmonie. C'est elle qui fait qu'un piano reste le même instrument
  // du grave à l'aigu : un résonateur COMMUN à toutes les notes. Sans elle, chaque
  // note est un objet isolé — le symptôme exact de « ça ne sonne pas comme un
  // instrument ». On la partage donc entre toutes les notes, comme la vraie.
  _ensureBoard() {
    if (this.board) return;
    const input = this.ctx.createGain();

    // Deux chemins, et c'est la différence entre colorer et RÉSONNER.
    //
    // La version précédente n'avait que le premier : six filtres en cascade à Q
    // compris entre 0,8 et 1,9. Un Q aussi bas ne fait qu'égaliser — la caisse ne
    // sonne jamais, elle se contente de teinter. Or une table d'harmonie est un
    // objet qui VIBRE : frappez-la, elle continue quelques dixièmes de seconde.
    // C'est précisément ce prolongement commun à toutes les notes qui fait qu'un
    // piano est un instrument et non une collection de cordes indépendantes.

    // 1. Le corps : la réponse moyenne de la caisse, en cascade.
    let node = input;
    for (const [f, gain, q] of [
      [116, 4.5, 1.1],
      [198, 3, 1.3],
      [310, -3, 1.9],
      [575, 3.5, 1.1],
      [1220, 2, 0.9],
      [2700, -3.5, 0.8],
    ]) {
      const b = this.ctx.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f;
      b.gain.value = gain;
      b.Q.value = q;
      node.connect(b);
      node = b;
    }

    const out = this.ctx.createGain();
    out.gain.value = 0.5;
    node.connect(out);

    // 2. Les modes propres, en PARALLÈLE : des résonateurs à Q élevé qui tiennent
    // après l'attaque. Fréquences relevées sur les modes de plaque d'un piano
    // droit. Mélangés bas — on ne doit pas les entendre comme des notes, seulement
    // sentir que le son a un volume derrière lui.
    for (const [f, q, g] of [
      [93, 26, 0.1],
      [147, 22, 0.085],
      [232, 30, 0.07],
      [389, 24, 0.055],
      [612, 20, 0.04],
      [1010, 16, 0.028],
    ]) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const amp = this.ctx.createGain();
      amp.gain.value = g;
      input.connect(bp);
      bp.connect(amp);
      amp.connect(out);
    }

    out.connect(this.musicBus);
    if (this.revSend) {
      const s = this.ctx.createGain();
      s.gain.value = 0.24;
      out.connect(s);
      s.connect(this.revSend);
    }
    this.board = input;
  }

  _piano(when, semi, dur = 2.4, gain = 1) {
    if (!this.ctx) return;
    this._ensureBoard();
    const src = this.ctx.createBufferSource();
    src.buffer = this._pianoBuffer(semi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.38 * gain, when);
    // L'étouffoir retombe sur la corde : la note s'amortit, elle ne se coupe pas.
    g.gain.setTargetAtTime(0.0001, when + dur, 0.16);
    src.connect(g);
    g.connect(this.board);
    src.start(when);
    src.stop(when + dur + 1.4);
  }

  // --- La cymbale, en synthèse modale ---
  //
  // Du bruit blanc filtré ne fait pas une cymbale : ça fait un « pshhh ». Une
  // cymbale est une PLAQUE, donc des centaines de modes inharmoniques discrets
  // qui battent les uns contre les autres — c'est ce battement qui fait le
  // scintillement métallique, et le bruit n'en a aucun.
  //
  // Deux détails achèvent l'illusion :
  //   · les aigus TIENNENT longtemps, là où un bruit filtré s'éteint avec son
  //     filtre. Une cymbale reste brillante jusqu'au bout ;
  //   · le son se CONSTRUIT après la frappe au lieu d'être maximal au premier
  //     instant : sur une vraie plaque, l'énergie migre vers le haut du spectre.
  //     On le rend en faisant entrer les modes aigus légèrement en retard.
  //
  // Chaque mode est un résonateur du second ordre en récurrence — deux
  // multiplications par échantillon — plutôt qu'un appel à Math.sin : cent
  // quarante modes sur trois secondes tiennent ainsi en quelques dizaines de
  // millisecondes.
  _cymbalBuffer(variant = 0) {
    return this._renderBuffer(`cym${variant}`, 3.4, (out, sr, n) => {
      const rnd = this._seeded(1789 + variant * 977);
      const bright = variant === 0 ? 1 : 0.82;
      for (let k = 1; k < 200; k++) {
        // Répartition dense vers l'aigu, comme les modes d'une plaque circulaire.
        const f = 255 * Math.pow(k, 0.85) * (1 + (rnd() - 0.5) * 0.09);
        if (f > 15500) break;
        const w = (2 * Math.PI * f) / sr;
        const amp = (1 / Math.pow(k, 0.55)) * (0.55 + 0.45 * Math.sin(k * 1.7)) * bright;
        const t60 = (3.1 / (1 + k / 60)) * (0.75 + rnd() * 0.5);
        const r = Math.pow(10, -3 / (t60 * sr));
        const start = Math.round(sr * (0.001 + 0.055 * Math.pow(k / 200, 1.3) * rnd()));
        const phase = rnd() * Math.PI * 2;
        const c = 2 * r * Math.cos(w);
        const r2 = r * r;
        // Amorçage de la récurrence pour obtenir A·rⁿ·sin(ωn + φ) : deux
        // échantillons suffisent à fixer amplitude ET phase.
        let y1 = amp * Math.sin(phase);
        let y2 = (amp * Math.sin(phase - w)) / r;
        for (let i = start; i < n; i++) {
          const y = c * y1 - r2 * y2;
          y2 = y1;
          y1 = y;
          out[i] += y;
        }
      }
      // La baguette : un choc très court et large bande, qui donne le point
      // d'impact. Sans lui, la cymbale n'a pas de début.
      const stick = Math.round(sr * 0.012);
      let s = 0;
      for (let i = 0; i < stick; i++) {
        s = s * 0.55 + (rnd() * 2 - 1) * 0.45;
        out[i] += s * 0.9 * (1 - i / stick);
      }
    });
  }

  _cymbal(when, gain = 1, dur = 2.2) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._cymbalBuffer(dur > 2.6 ? 0 : 1);
    // Deux tampons seulement, mais une hauteur légèrement différente à chaque
    // coup : deux cymbales identiques d'affilée s'entendent immédiatement.
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.085 * gain, when);
    g.gain.setTargetAtTime(0.0001, when + dur * 0.7, dur * 0.3);
    src.connect(g);
    g.connect(this.musicBus);
    if (this.revSend) {
      const rev = this.ctx.createGain();
      rev.gain.value = 0.4;
      g.connect(rev);
      rev.connect(this.revSend);
    }
    src.start(when);
    src.stop(when + dur + 1);
  }

  // Célesta : le thème nu, cristallin. Deux partiels inharmoniques au-dessus de la
  // fondamentale — c'est ce petit écart au spectre harmonique qui fait entendre du
  // métal frappé plutôt qu'une flûte.
  _bell(when, semi, dur = 1.6) {
    if (!this.ctx) return;
    const t0 = when;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.055, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    g.connect(this.musicBus);
    if (this.dlySend) {
      const s = this.ctx.createGain();
      s.gain.value = 0.45;
      g.connect(s);
      s.connect(this.dlySend);
    }
    for (const [mul, amp] of [
      [1, 1],
      [2.76, 0.36],
      [5.4, 0.13],
    ]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(semi) * mul;
      const vg = this.ctx.createGain();
      vg.gain.value = amp;
      o.connect(vg);
      vg.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }

  // Montée : au lieu du bruit filtré des musiques électroniques, un roulement de
  // timbale qui accélère. C'est le seul crescendo qu'un orchestre connaisse.
  _roll(when, dur) {
    if (!this.ctx || this.rollUntil > when) return;
    this.rollUntil = when + dur;
    const semi = 14;
    let t = 0;
    while (t < dur) {
      const k = t / dur;
      this._timpani(when + t, semi, 0.1 + k * 0.28);
      t += 0.13 - k * 0.085; // les coups se resserrent
    }
    this._cymbal(when + dur * 0.55, 1.1, dur * 0.5);
  }

  _playStep(step, bar, when) {
    const section = this._form(bar).name;
    // Le boss ne respire pas : sa mesure calme redevient un sommet.
    const sec = boss(this.mode) && section === 'breakdown' ? 'drop' : section;
    const quiet = this.mode === 'title' || this.mode === 'shop';
    const chord = this._chordAt(bar);
    const isBoss = boss(this.mode);

    if (step === 0) this._setChord(chord, when);

    // Couches actives. Dans un orchestre, l'intensité n'est PAS le volume : c'est
    // le nombre de pupitres qui jouent. Un tutti à mi-nuance écrase un solo forte.
    const full = !quiet && sec !== 'intro' && sec !== 'breakdown';
    const peak = sec === 'drop' || (isBoss && sec !== 'intro');

    // Registre de la nappe et niveau des pupitres tenus.
    if (step === 0 && this.padFilter) {
      const cut = quiet
        ? 1300
        : ({ intro: 620, A: 1500, lift: 2600, drop: 5200, breakdown: 800, retour: 2400 }[sec] ??
          1400);
      this.padFilter.frequency.linearRampToValueAtTime(cut, when + 2.2);
      this.padGain.gain.linearRampToValueAtTime(this._padLevel(sec, quiet), when + 1.8);
      this.choirGain.gain.linearRampToValueAtTime(this._choirLevel(sec, quiet), when + 2);
      // La pédale de 32 pieds s'efface quand les contrebasses entrent : deux
      // fondamentales au même endroit du spectre ne s'additionnent pas, elles
      // se transforment en bouillie.
      this.subGain.gain.linearRampToValueAtTime(full ? 0.028 : 0.06, when + 1.5);
    }

    // --- L'HORLOGE. Un temps sur quatre, du début à la fin, y compris sur les
    // écrans calmes. C'est le seul élément qui ne s'arrête jamais : le voyage
    // continue même quand le joueur regarde un menu.
    if (TICK.includes(step)) {
      const vel = quiet ? 0.45 : sec === 'intro' ? 0.6 : sec === 'breakdown' ? 0.38 : 1;
      this._tick(when, vel);
    }

    // --- OSTINATO d'orgue. Le moteur du morceau. Il entre à la section A et ne
    // s'arrête qu'à la respiration.
    if (!quiet && sec !== 'intro' && sec !== 'breakdown' && step % 2 === 0) {
      const deg = OSTINATO[(step / 2) % OSTINATO.length];
      const semi = chord.pad[deg % chord.pad.length] + (deg >= chord.pad.length ? 12 : 0);
      this._organ(when, semi + 12, 0.34, peak ? 0.075 : 0.05);
      // Au sommet, l'ostinato est doublé à l'octave : c'est ce qui le fait passer
      // de motif à déferlante, sans changer une seule note.
      if (peak) this._organ(when, semi + 24, 0.3, 0.035);
    }
    // Sur les écrans calmes, l'ostinato tourne au ralenti, une note par temps.
    if (quiet && step % 4 === 0) {
      this._organ(when, chord.pad[(step / 4) % chord.pad.length] + 12, 0.6, 0.04);
    }

    // --- TIMBALES.
    if (full) {
      const pattern = peak ? TIMPANI_HEAVY : TIMPANI;
      if (pattern.includes(step)) {
        this._timpani(when, chord.sub + 14, step === 0 ? 1 : 0.62);
      }
    } else if (sec === 'intro' && bar >= 2 && step === 0) {
      this._timpani(when, chord.sub + 14, 0.4);
    }

    // --- CONTREBASSES, en notes tenues.
    if (full) {
      const note = (bar % 2 === 0 ? BASS_EVEN : BASS_ODD)[step];
      if (note) this._bass(when, chord.bass[note.i], note.len);
    } else if (sec === 'breakdown' && !quiet && step === 0 && bar % 2 === 0) {
      // Une seule contrebasse, tous les deux temps de mesure : la respiration doit
      // se VIDER, sinon le sommet suivant ne fait plus rien.
      this._bass(when, chord.bass[0] - 12, 32);
    }

    // --- LA MÉLODIE AU PIANO, dès la section A. Sans ça, la phrase n'était jouée
    // qu'une fois, au sommet, et arrivait de nulle part. Elle est ici intime, sous
    // l'ostinato — c'est la même mélodie que reprendront les cuivres, et c'est
    // précisément parce qu'on l'a déjà entendue que leur reprise fait de l'effet.
    if (!quiet && sec === 'A') {
      const local = bar - 4; // 0..7 : la phrase entière, une fois
      for (const ev of MELODY) {
        if (ev.b === local && ev.s === step) this._flute(when, ev.n, ev.d + 2, 0.85);
      }
    }

    // Cordes tenues sur chaque accord du sommet et du retour : c'est le corps du
    // tutti. Deux mesures par accord, exactement la durée de l'harmonie.
    if (!quiet && (sec === 'drop' || sec === 'retour') && step === 0 && bar % 2 === 0) {
      const voicing = [chord.pad[1], chord.pad[2], chord.pad[3], chord.pad[3] + 12];
      this._strings(when, voicing, 32, sec === 'drop' ? 1.5 : 0.8);
    }

    // --- CORDES EN TRÉMOLO : la montée, et rien d'autre. Les employer partout
    // les userait ; elles ne servent qu'à annoncer.
    if (!quiet && sec === 'lift' && step === 0) {
      const dur = (16 * 60) / TEMPO / 4;
      this._tremolo(
        when,
        [chord.pad[1] + 12, chord.pad[2] + 12, chord.pad[3] + 12],
        dur,
        0.55 + (bar - 12) * 0.28
      );
    }
    // Roulement de timbale sur les deux dernières mesures avant le sommet.
    if (!quiet && sec === 'lift' && bar === 14 && step === 0) {
      this._roll(when, (32 * 60) / TEMPO / 4);
    }

    // --- CYMBALE aux charnières : elle marque la coupe, elle ne rythme rien.
    if (step === 0 && !quiet && (bar === 4 || bar === 16 || bar === 28)) {
      this._cymbal(when, bar === 16 ? 1.4 : 0.8, bar === 16 ? 3.2 : 2);
    }

    // --- LA MÉLODIE, AUX CUIVRES. C'est le sommet du morceau, et c'est le seul
    // endroit où elle est jouée en entier. En mode boss, elle passe par darken() :
    // même contour, quinte et seconde abaissées.
    if (sec === 'drop' && !quiet) {
      const local = bar - 16; // 0..7, les huit mesures de la phrase
      for (const ev of MELODY) {
        if (ev.b !== local || ev.s !== step) continue;
        const n = isBoss ? darken(ev.n) - 12 : ev.n;
        this._horn(when, n - 12, ev.d, 1.9);
        // La seconde moitié de la phrase — la réponse — est doublée à l'octave :
        // le pupitre s'ouvre pile au moment où la mélodie va chercher son sommet.
        if (local >= 4) this._horn(when, n, ev.d, 1.05);
      }
      // Contre-chant : les cuivres graves tiennent la fondamentale sous la mélodie,
      // deux mesures d'affilée. C'est ce socle qui distingue un tutti d'un solo.
      if (step === 0 && local % 2 === 0) this._horn(when, chord.bass[0] - 12, 30, 1.3);
    }

    // Appel de cor pendant la montée : la mélodie s'annonce avant d'arriver, par
    // ses trois premières notes seulement. Citer la phrase entière ici gâcherait
    // l'arrivée — on n'a le droit de la jouer en entier qu'une fois.
    if (!quiet && sec === 'lift' && step === 0 && bar % 2 === 0) {
      this._horn(when, SIGNATURE[((bar - 12) / 2) % 3] - 12, 6, 0.6);
    }

    // --- LA MÉLODIE NUE. C'est la seule fois du morceau où on l'entend sans
    // orchestre, et c'est là qu'elle devient émouvante plutôt qu'héroïque. Quatre
    // mesures de respiration pour les quatre premières mesures de la phrase.
    if (sec === 'breakdown' && !quiet) {
      const local = bar - 24; // 0..3 : la question, sans sa réponse
      for (const ev of MELODY) {
        if (ev.b !== local || ev.s !== step) continue;
        // Célesta doublée d'une corde solo : le métal donne l'attaque, l'archet
        // donne la tenue. À deux, ils font ce que le piano devait faire seul.
        this._piano(when, ev.n, 2.6, 1);
        this._strings(when, [ev.n], ev.d + 4, 0.55);
      }
    }

    // Sur les écrans calmes, la même chose en deux fois plus lent : une note toutes
    // les deux positions. Le joueur apprend la mélodie pendant qu'il choisit ses
    // améliorations, et la reconnaît plus tard quand les cuivres la reprennent.
    if (quiet) {
      const local = Math.floor((bar % 8) / 1);
      for (const ev of MELODY) {
        if (ev.b !== local || ev.s !== step) continue;
        this._bell(when, ev.n + (this.mode === 'shop' ? 0 : 12), 2.8);
      }
    }
  }

  // Signatures d'ouverture de canal. Elles se jouent SOUS la voix, courtes et
  // discrètes : c'est un indicatif, pas un jingle. Chacune est un extrait littéral
  // du thème — le joueur associe le motif à la personne sans jamais le remarquer.

  // NOVA : la quarte ascendante, les deux premières notes du thème, à la célesta.
  novaSting() {
    const t0 = this.ctx?.currentTime;
    if (t0 == null) return;
    this._bell(t0, THEME[0] + 12, 0.9);
    this._bell(t0 + 0.11, THEME[1] + 12, 1.4);
  }

  // KORN : la même quarte, mais DIMINUÉE, et deux octaves plus bas. Le thème du
  // joueur passé de l'autre côté.
  kornSting() {
    const t0 = this.ctx?.currentTime;
    if (t0 == null) return;
    this._horn(t0, THEME_BOSS[0] - 24, 3, 0.9);
    this._horn(t0 + 0.13, THEME_BOSS[1] - 25, 5, 0.7);
  }
}
