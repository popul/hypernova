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

// Tempo UNIQUE. Changer de tempo entre les écrans cassait l'illusion d'un seul
// morceau ; l'intensité passe désormais par l'instrumentation et le filtre.
// 150 BPM → un pas de 0,100 s pile, une mesure de 1,600 s.
const TEMPO = 150;

// Le thème d'HYPERNOVA, cinq notes. Quarte juste ascendante (l'élan), ♭6 (le doute),
// retour, chute sur la tierce. Tout le reste du jeu en est une déclinaison.
const THEME = [36, 41, 42, 41, 37]; // ré4 la4 si♭4 la4 fa4
// Variante boss : une octave plus bas, quinte ABAISSÉE. Même mélodie, monde pourri.
const THEME_BOSS = [24, 28, 30, 28, 25];
// Deux demi-phrases : la mélodie ne se répète jamais deux mesures de suite.
const THEME_L1 = [
  { step: 0, i: 0, dur: 6 },
  { step: 6, i: 1, dur: 4 },
  { step: 10, i: 2, dur: 2 },
  { step: 12, i: 1, dur: 4 },
];
const THEME_L2 = [
  { step: 0, i: 4, dur: 8 },
  { step: 8, i: 1, dur: 4 },
  { step: 12, i: 0, dur: 4 },
];

// Accords : voicings en demi-tons depuis ré1, quatre voix + fondamentale sub.
const CHORDS = {
  Dm: { root: 26, sub: 2, pad: [26, 29, 33, 38] },
  Bb: { root: 22, sub: 10, pad: [22, 26, 29, 34] },
  F: { root: 29, sub: 5, pad: [24, 29, 33, 36] },
  C: { root: 24, sub: 0, pad: [24, 28, 31, 36] },
  Gm: { root: 31, sub: 7, pad: [22, 26, 31, 34] },
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

// Rythmique. Le clap sur 2 et 4 était purement et simplement absent — c'est lui
// qui fait avancer un morceau, pas le kick.
const KICK = [0, 4, 8, 12];
const CLAP = [4, 12];
const TAIKO = [0, 3, 6, 8, 11, 14]; // 3+3+2, la pulsation des grands espaces
const HAT_VEL = [
  1, 0.35, 0.6, 0.35, 0.85, 0.35, 0.6, 0.45, 1, 0.35, 0.6, 0.35, 0.9, 0.4, 0.7, 0.55,
];

// Basse, en degrés relatifs à la fondamentale de l'accord. A2 finit sur ♭2 :
// la note napolitaine qui annonce le mode du boss dix minutes avant qu'il arrive.
const BASS_A1 = { 0: 0, 3: 0, 6: 0, 8: 0, 11: 3, 12: 0, 14: 10, 15: 0 };
const BASS_A2 = { 0: 0, 3: 0, 6: 12, 8: 0, 11: 3, 12: 0, 14: 1, 15: 0 };

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
// la fondamentale de VORAX — ils sont harmoniquement verrouillés.
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
  vorax: {
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
  title: { gain: 0.22 },
  play: { gain: 0.26 },
  shop: { gain: 0.18 },
  paused: { gain: 0.07 }, // en sourdine, pas coupée : la grille doit continuer d'avancer
  boss: { gain: 0.3 },
  cinematic: { gain: 0 }, // la cinématique joue ses propres nappes sur cineBus
};

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

    // Compression de bus : sans elle, le kick culminait 17 dB au-dessus du reste.
    // Les percussions s'entendaient, la MUSIQUE non. Le compresseur retient les
    // transitoires et laisse remonter tout ce qui tient entre deux coups — c'est
    // exactement la différence entre « des bips synthétisés » et « un morceau ».
    const glue = this.ctx.createDynamicsCompressor();
    glue.threshold.value = -17;
    glue.knee.value = 10;
    glue.ratio.value = 3.5;
    glue.attack.value = 0.004; // assez lent pour laisser passer le claquement du kick
    glue.release.value = 0.15; // assez rapide pour que le pompage reste audible
    const makeup = this.ctx.createGain();
    makeup.gain.value = 2.1;

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
    this.W = {
      strings: mk(strings),
      vox: mk(vox),
      growl: mk(growl),
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

    // NOVA est sèche, dans le casque ; VORAX est loin et réverbéré. C'est l'ESPACE
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

  voiceVorax(text = 'transmission') {
    return this._speak(text, 'vorax');
  }

  waveStart() {
    // Les quatre notes montantes du thème, pas une gamme quelconque : chaque vague
    // s'ouvre sur le motif que le joueur connaît déjà par l'écran-titre.
    [THEME[0], THEME[1], THEME[2], THEME[1] + 12].forEach((s, i) =>
      this._tone({ type: 'triangle', freq: hz(s), dur: 0.15, gain: 0.11, when: i * 0.09 })
    );
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
    this._tone({ type: 'sine', freq: hz(38), freqEnd: hz(14), dur: 0.75, gain: 0.3 });
    this._noise({ dur: 0.9, gain: 0.26, filterFreq: 9000, filterEnd: 200 });
    this._tone({ type: 'triangle', freq: hz(50), freqEnd: hz(26), dur: 0.5, gain: 0.12 });
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

  bossAlarm() {
    for (let i = 0; i < 3; i++) {
      this._tone({
        type: 'sawtooth',
        freq: 440,
        freqEnd: 220,
        dur: 0.32,
        gain: 0.18,
        when: i * 0.38,
      });
    }
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

  // Voix de nappe persistantes : on rampe les fréquences (portamento) au lieu de
  // créer et détruire quatre oscillateurs toutes les 3,2 secondes.
  //
  // La nappe et le sub sont les seules sources CONTINUES du morceau. Une source
  // continue gagne toujours contre une source percussive à énergie égale : à 0,045
  // par voix elle rendait le kick inaudible, et le morceau ne « poussait » pas.
  // D'où le gain de section piloté plus bas : elle s'efface quand la batterie entre.
  _ensurePad() {
    if (this.padVoices) return;
    this.padVoices = [];
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 1;
    this.padGain.connect(this.musicBus);
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 1.2;
    this.padFilter.connect(this.padGain);
    const padRev = this.ctx.createGain();
    padRev.gain.value = 0.28;
    this.padFilter.connect(padRev);
    if (this.revSend) padRev.connect(this.revSend);
    for (let i = 0; i < 4; i++) {
      // Deux oscillateurs par voix, désaccordés de ±11 cents : à 4 cents un unisson
      // est inaudible, il en faut 8 à 20 pour qu'il respire.
      const g = this.ctx.createGain();
      g.gain.value = 0.016;
      g.connect(this.padFilter);
      const pair = [-11, 11].map((det) => {
        const o = this.ctx.createOscillator();
        o.setPeriodicWave(this.W.strings);
        o.detune.value = det;
        o.frequency.value = 220;
        o.connect(g);
        o.start();
        return o;
      });
      this.padVoices.push({ oscs: pair, gain: g });
    }
    // Sub : la fondamentale que seul un casque restitue, mais qui porte tout.
    // Il doit être senti et non entendu — au-delà, il mange le kick.
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = ROOT;
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.055;
    this.subOsc.connect(this.subGain);
    this.subGain.connect(this.musicBus);
    this.subOsc.start();
  }

  // Gain de nappe par section : c'est le RETRAIT de la nappe qui laisse entrer la
  // batterie, et son retour qui fait la respiration. Sans ça, tout le morceau se
  // joue au même niveau du début à la fin, quelles que soient les notes.
  _padLevel(sec, quiet) {
    if (quiet) return 1;
    return { intro: 1, A: 0.45, lift: 0.5, drop: 0.6, breakdown: 0.8, retour: 0.55 }[sec] ?? 0.5;
  }

  _setChord(chord, when) {
    this._ensurePad();
    chord.pad.forEach((semi, i) => {
      const v = this.padVoices[i];
      if (!v) return;
      for (const o of v.oscs) o.frequency.linearRampToValueAtTime(hz(semi), when + 0.025);
    });
    this.subOsc.frequency.linearRampToValueAtTime(hz(chord.sub), when + 0.025);
  }

  // Sidechain : le kick creuse tout le mix et le laisse remonter. C'est le marqueur
  // n°1 de « musique moderne » pour une oreille de douze ans, et il manquait.
  _duck(when, depth = 0.5, release = 0.26) {
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(when);
    g.setValueAtTime(1 - depth, when);
    g.linearRampToValueAtTime(1, when + release);
  }

  // --- Percussions, en couches : un seul sinus n'est pas un kick, c'est un bip ---

  _kick(when, gain = 0.9) {
    const t = when - this.ctx.currentTime;
    this._tone({
      type: 'sine',
      freq: 150,
      freqEnd: 42,
      dur: 0.16,
      gain: 0.5 * gain,
      when: t,
      dest: this.musicBus,
    });
    this._tone({
      type: 'triangle',
      freq: 74,
      freqEnd: 36,
      dur: 0.3,
      gain: 0.34 * gain,
      when: t,
      dest: this.musicBus,
    });
    this._noise({
      dur: 0.02,
      gain: 0.16 * gain,
      filterFreq: 5200,
      filterEnd: 1800,
      when: t,
      dest: this.musicBus,
    });
    this._duck(when);
  }

  _clap(when, gain = 1) {
    const t = when - this.ctx.currentTime;
    // Trois éclats très rapprochés puis une queue : c'est ce qui fait un clap et
    // non un « pshh ». Le backbeat sur 2 et 4 est ce qui pousse le corps.
    for (let i = 0; i < 3; i++) {
      this._noise({
        dur: 0.02,
        gain: 0.2 * gain,
        filterFreq: 2400,
        filterEnd: 1400,
        when: t + i * 0.009,
        dest: this.musicBus,
      });
    }
    this._noise({
      dur: 0.16,
      gain: 0.13 * gain,
      filterFreq: 2000,
      filterEnd: 900,
      when: t + 0.026,
      dest: this.musicBus,
    });
  }

  _hat(when, vel, open = false) {
    const t = when - this.ctx.currentTime;
    this._noise({
      dur: open ? 0.16 : 0.035,
      gain: 0.17 * vel,
      filterFreq: 11000,
      filterEnd: open ? 5000 : 7000,
      when: t,
      dest: this.musicBus,
    });
  }

  _taiko(when, gain = 1) {
    const t = when - this.ctx.currentTime;
    this._tone({
      type: 'sine',
      freq: 96,
      freqEnd: 52,
      dur: 0.34,
      gain: 0.32 * gain,
      when: t,
      dest: this.musicBus,
    });
    this._noise({
      dur: 0.09,
      gain: 0.14 * gain,
      filterFreq: 900,
      filterEnd: 300,
      when: t,
      dest: this.musicBus,
    });
  }

  // --- Voix mélodiques ---

  _bass(when, semi, dur = 0.16) {
    const t = when - this.ctx.currentTime;
    this._tone({ type: 'sawtooth', freq: hz(semi), dur, gain: 0.3, when: t, dest: this.musicBus });
    this._tone({
      type: 'sine',
      freq: hz(semi - 12),
      dur: dur * 1.2,
      gain: 0.12,
      when: t,
      dest: this.musicBus,
    });
  }

  _lead(when, semi, steps) {
    const t = when - this.ctx.currentTime;
    const dur = (steps * 60) / TEMPO / 4;
    // Supersaw : trois voix légèrement désaccordées, c'est ce qui donne l'ampleur.
    for (const det of [-14, 0, 14]) {
      const t0 = this.ctx.currentTime + t;
      const o = this.ctx.createOscillator();
      o.setPeriodicWave(this.W.brass);
      o.detune.value = det;
      o.frequency.setValueAtTime(hz(semi), t0);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 4;
      f.frequency.setValueAtTime(1200, t0);
      f.frequency.linearRampToValueAtTime(4200, t0 + 0.06);
      f.frequency.exponentialRampToValueAtTime(1600, t0 + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.02);
      g.gain.setValueAtTime(0.05, t0 + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
      o.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      if (this.dlySend) {
        const s = this.ctx.createGain();
        s.gain.value = 0.22;
        g.connect(s);
        s.connect(this.dlySend);
      }
      o.start(t0);
      o.stop(t0 + dur + 0.06);
    }
  }

  _arp(when, semi) {
    const t = when - this.ctx.currentTime;
    this._tone({
      type: 'triangle',
      freq: hz(semi),
      dur: 0.09,
      gain: 0.05,
      when: t,
      dest: this.musicBus,
    });
  }

  // Montée : le bruit filtré qui s'ouvre pendant quatre mesures et arrive PILE sur
  // le drop. C'est cette anticipation — pas le drop lui-même — qui fait l'effet.
  _riser(when, dur) {
    if (!this.ctx || this.riserUntil > when) return;
    this.riserUntil = when + dur;
    const t0 = when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3.5;
    f.frequency.setValueAtTime(300, t0);
    f.frequency.exponentialRampToValueAtTime(7000, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.1, t0 + dur * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  _crash(when, gain = 1) {
    const t = when - this.ctx.currentTime;
    this._noise({
      dur: 1.4,
      gain: 0.12 * gain,
      filterFreq: 9000,
      filterEnd: 2600,
      when: t,
      dest: this.musicBus,
    });
    this._noise({
      dur: 0.08,
      gain: 0.1 * gain,
      filterFreq: 12000,
      filterEnd: 6000,
      when: t,
      dest: this.musicBus,
    });
  }

  // Cloche : le thème sur les écrans calmes. C'est là que le joueur l'APPREND,
  // pour le reconnaître plus tard quand il arrive au lead sur le drop.
  _bell(when, semi, dur = 0.9) {
    const t0 = when;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.055, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    g.connect(this.musicBus);
    if (this.dlySend) {
      const s = this.ctx.createGain();
      s.gain.value = 0.4;
      g.connect(s);
      s.connect(this.dlySend);
    }
    // Deux partiels inharmoniques au-dessus de la fondamentale : c'est ce petit
    // écart au spectre harmonique qui fait entendre « métal » et non « flûte ».
    [
      [1, 1],
      [2.76, 0.4],
      [5.4, 0.16],
    ].forEach(([mul, amp]) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(semi) * mul;
      const vg = this.ctx.createGain();
      vg.gain.value = amp;
      o.connect(vg);
      vg.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    });
  }

  _playStep(step, bar, when) {
    const section = this._form(bar).name;
    const boss = this.mode === 'boss';
    // Le boss ne respire pas : sa mesure calme redevient un drop.
    const sec = boss && section === 'breakdown' ? 'drop' : section;
    const quiet = this.mode === 'title' || this.mode === 'shop';
    const chord = this._chordAt(bar);

    if (step === 0) this._setChord(chord, when);

    // Couches actives. C'est l'arrivée et le RETRAIT des couches qui fabriquent une
    // forme — pas le volume, qu'on ne perçoit presque pas.
    const full = !quiet && sec !== 'intro' && sec !== 'breakdown';
    const halfKick = sec === 'intro' && bar >= 2;

    // Le balayage du filtre de nappe EST la sensation de forme : c'est lui qui dit
    // « ça monte » sans qu'aucune note ne change.
    if (step === 0 && this.padFilter) {
      const cut = quiet
        ? 1100
        : sec === 'intro'
          ? 600 + (bar / 4) * 700
          : sec === 'A'
            ? 1500
            : sec === 'lift'
              ? 1500 + ((bar - 12) / 4) * 4500
              : sec === 'drop'
                ? 6500
                : sec === 'breakdown'
                  ? 900
                  : 3400;
      this.padFilter.frequency.linearRampToValueAtTime(cut, when + 1.5);
      this.padGain.gain.linearRampToValueAtTime(this._padLevel(sec, quiet), when + 1.2);
      // Le sub se retire aussi quand la basse entre : deux fondamentales au même
      // endroit du spectre ne s'additionnent pas, elles s'annulent en bouillie.
      this.subGain.gain.linearRampToValueAtTime(full ? 0.03 : 0.07, when + 1.2);
    }

    if (full && KICK.includes(step)) this._kick(when, boss ? 1.05 : 1);
    else if ((halfKick || quiet) && (step === 0 || step === 8))
      this._kick(when, quiet ? 0.55 : 0.8);
    // Contretemps du boss : la seizième avant le temps, celle qui empêche de respirer.
    if (full && boss && sec === 'drop' && step === 14) this._kick(when, 0.7);

    // Le contretemps sur 2 et 4. Son absence était la raison n°1 pour laquelle
    // rien ne poussait : sans lui, un morceau reste posé sur place.
    if (full && CLAP.includes(step)) this._clap(when);
    if (sec === 'breakdown' && !quiet && step === 12) this._clap(when, 0.6);

    if (full || (!quiet && sec === 'intro' && bar === 3)) {
      const vel = HAT_VEL[step] * (0.85 + this._rnd(bar, step, 3) * 0.3);
      const jitter = (this._rnd(bar, step, 7) - 0.5) * 0.012; // le micro-décalage : le swing
      this._hat(when + jitter, vel, sec === 'drop' && (step === 2 || step === 10));
    } else if (quiet && step % 4 === 2) {
      this._hat(when, 0.3);
    }

    // Taiko en 3+3+2 : la pulsation des grands espaces, réservée au drop et au boss.
    if (full && (sec === 'drop' || boss) && TAIKO.includes(step)) this._taiko(when, 0.9);

    // Cymbale sur les arrivées de section — le marqueur de coupe.
    if (step === 0 && !quiet && (bar === 4 || bar === 16 || bar === 28)) {
      this._crash(when, bar === 16 ? 1.2 : 0.8);
    }

    // Montée sur les quatre mesures de « lift », calée pour atteindre le drop.
    if (sec === 'lift' && bar === 12 && step === 0 && !quiet) this._riser(when, 6.4);

    // --- Basse. La note de passage de A2 est un ♭2 napolitain : dix minutes avant
    // le boss, elle annonce déjà son mode. Personne ne le remarque, tout le monde l'entend.
    if (full) {
      const note = (bar % 2 === 0 ? BASS_A1 : BASS_A2)[step];
      if (note != null) this._bass(when, chord.root + note - 12);
    } else if (sec === 'breakdown' && !quiet && step === 0) {
      this._bass(when, chord.root - 12, 1.4);
      // Le thème nu, à la cloche, pendant la respiration : c'est le seul endroit
      // du morceau où on l'entend seul. Quatre mesures de vide n'auraient pas fait
      // une respiration, seulement une panne de son.
      this._bell(when, THEME[(bar - 24) % THEME.length], 1.6);
    }

    // --- Arpège : les notes de l'accord, doublé en doubles-croches sur le drop.
    if (!quiet && sec !== 'intro' && sec !== 'breakdown') {
      if (sec === 'drop' || step % 2 === 0) {
        const seq = [0, 3, 7, 12, 7, 3];
        this._arp(when, chord.pad[0] + seq[(step + bar) % seq.length] + 12);
      }
    }

    // --- LE THÈME. Cinq notes, six habits.
    // Sur le drop, au lead supersaw : la version héroïque.
    // En mode boss, la MÊME mélodie une octave plus bas et la quinte abaissée — la
    // quinte juste du joueur devient diminuée. Aucun texte ne dit « il te dévore »
    // aussi bien que ça.
    if (sec === 'drop' && !quiet) {
      const line = (bar - 16) % 2 === 0 ? THEME_L1 : THEME_L2;
      const notes = boss ? THEME_BOSS : THEME;
      for (const ev of line) if (ev.step === step) this._lead(when, notes[ev.i], ev.dur);
    }

    // Sur les écrans calmes, à la cloche, une note par mesure : le joueur apprend
    // le thème pendant qu'il choisit ses améliorations, et le reconnaît au combat.
    if (quiet && step === 0) {
      this._bell(when, THEME[bar % 5] + (this.mode === 'shop' ? -12 : 0), 1.5);
    }
    // Appel-réponse pendant le « lift » : la mélodie s'annonce avant d'arriver.
    if (!quiet && sec === 'lift' && step === 0 && bar % 2 === 0) {
      this._bell(when, THEME[((bar - 12) / 2) % THEME.length] + 12, 1.2);
    }
  }

  // Signatures d'ouverture de canal. Elles se jouent SOUS la voix, courtes et
  // discrètes : c'est un indicatif, pas un jingle. Chacune est un extrait littéral
  // du thème — le joueur associe le motif à la personne sans jamais le remarquer.

  // NOVA : la quarte ascendante, les deux premières notes du thème.
  novaSting() {
    this._tone({ type: 'sine', freq: hz(THEME[0]), dur: 0.22, gain: 0.055 });
    this._tone({ type: 'sine', freq: hz(THEME[1]), dur: 0.5, gain: 0.045, when: 0.11 });
  }

  // VORAX : la même quarte, mais DIMINUÉE, et deux octaves plus bas. Le thème du
  // joueur passé de l'autre côté.
  voraxSting() {
    this._tone({ type: 'sawtooth', freq: hz(THEME_BOSS[0] - 12), dur: 0.35, gain: 0.09 });
    this._tone({
      type: 'sawtooth',
      freq: hz(THEME_BOSS[1] - 13),
      dur: 0.7,
      gain: 0.07,
      when: 0.13,
    });
  }
}
