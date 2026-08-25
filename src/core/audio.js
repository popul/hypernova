// Tout l'audio est synthétisé en WebAudio : aucun fichier son.
// SFX ponctuels, un séquenceur musical (basse / kick / arpège) avec scheduling lookahead,
// des ambiances par mode (titre / jeu / boutique / boss) en fondu-enchaîné, et des
// nappes cinématiques scriptées pour l'intro.

import { STORAGE_KEYS } from '../game/constants.js';

const SCALE = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66]; // la mineur pentatonique étendue

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

// Volume du bus musique et tempo par ambiance.
const MODES = {
  off: { gain: 0, tempo: 116 },
  title: { gain: 0.2, tempo: 108 },
  play: { gain: 0.24, tempo: 116 },
  shop: { gain: 0.17, tempo: 104 },
  boss: { gain: 0.27, tempo: 138 },
  cinematic: { gain: 0, tempo: 116 }, // la cinématique joue ses propres nappes sur cineBus
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(STORAGE_KEYS.muted) === '1';
    this.mode = 'off';
    this.step = 0;
    this.nextStepTime = 0;
    this.tempo = 116;
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
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.5;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = MODES[this.mode]?.gain ?? 0;
    const musicFilter = this.ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 2400;
    this.musicBus.connect(musicFilter);
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
  setMode(mode) {
    this.mode = mode;
    const def = MODES[mode] ?? MODES.off;
    this.tempo = def.tempo;
    if (this.ctx) {
      this.musicBus.gain.setTargetAtTime(def.gain, this.ctx.currentTime, 0.6);
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

  comboUp(tier) {
    for (let i = 0; i < tier + 1; i++) {
      this._tone({
        type: 'square',
        freq: 440 * Math.pow(1.335, i),
        dur: 0.1,
        gain: 0.1,
        when: i * 0.06,
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
    [330, 440, 550, 660].forEach((f, i) =>
      this._tone({ type: 'square', freq: f, dur: 0.14, gain: 0.12, when: i * 0.09 })
    );
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

  // ---- Musique : séquenceur 16 pas avec lookahead ----

  _scheduler() {
    if (!this.ctx) return;
    const lookahead = 0.12;
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      if (this.mode !== 'off' && this.mode !== 'cinematic' && !this.muted) {
        this._playStep(this.step, this.nextStepTime);
      }
      const stepDur = 60 / this.tempo / 4; // double-croche
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
    this.schedulerId = setTimeout(() => this._scheduler(), 40);
  }

  _playStep(step, when) {
    const delay = Math.max(0, when - this.ctx.currentTime);
    const intense = this.mode === 'play' || this.mode === 'boss';
    const boss = this.mode === 'boss';

    // Kick sur les temps (tous les temps en mode boss : martèlement).
    if (intense && step % (boss ? 2 : 4) === 0) {
      this._tone({
        type: 'sine',
        freq: 150,
        freqEnd: 40,
        dur: 0.16,
        gain: boss ? 0.55 : 0.5,
        when: delay,
        dest: this.musicBus,
      });
    }
    // Basse : croches. Motif sombre et insistant en mode boss.
    if (step % 2 === 0) {
      const pattern = boss ? [0, 0, 0, 1, 0, 0, 3, 1] : [0, 0, 2, 0, 4, 4, 2, 0];
      const f = SCALE[pattern[(step / 2) | 0]] / 2;
      this._tone({
        type: 'sawtooth',
        freq: boss ? f * 0.75 : f, // quinte grave : plus menaçant
        dur: 0.18,
        gain: intense ? 0.16 : 0.1,
        when: delay,
        dest: this.musicBus,
      });
    }
    // Arpège scintillant (jeu), descendant et pressant (boss), nappe clairsemée (titre/boutique).
    if (intense) {
      const arp = boss
        ? [7, 6, 5, 4, 7, 6, 5, 3, 7, 6, 5, 4, 7, 6, 5, 2]
        : [4, 6, 7, 6, 5, 7, 6, 4, 4, 6, 7, 6, 5, 7, 6, 5];
      this._tone({
        type: 'square',
        freq: SCALE[arp[step]] * 2,
        dur: 0.09,
        gain: boss ? 0.06 : 0.05,
        when: delay,
        dest: this.musicBus,
      });
    } else if (step % 8 === 0) {
      this._tone({
        type: 'triangle',
        freq: SCALE[step === 0 ? 4 : 5] * 2,
        dur: 0.9,
        gain: 0.06,
        when: delay,
        dest: this.musicBus,
      });
    }
  }
}
