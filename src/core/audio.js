// Tout l'audio est synthétisé en WebAudio : aucun fichier son.
// SFX ponctuels, un séquenceur musical (basse / kick / arpège) avec scheduling lookahead,
// des ambiances par mode (titre / jeu / boutique / boss) en fondu-enchaîné, et des
// nappes cinématiques scriptées pour l'intro.

import { STORAGE_KEYS } from '../game/constants.js';

const SCALE = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66]; // la mineur pentatonique étendue

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

  // Voix de NOVA : gazouillis mélodique aigu (gentille IA de bord).
  voiceNova() {
    const base = 880 + Math.random() * 220;
    for (let i = 0; i < 4; i++) {
      this._tone({
        type: 'sine',
        freq: base * (1 + Math.random() * 0.6),
        dur: 0.06,
        gain: 0.08,
        when: i * 0.07,
      });
    }
  }

  // Voix de KRRK : grondement saccadé grave (amiral vexé).
  voiceKrrk() {
    for (let i = 0; i < 3; i++) {
      this._tone({
        type: 'sawtooth',
        freq: 110 + Math.random() * 60,
        freqEnd: 70,
        dur: 0.14,
        gain: 0.14,
        when: i * 0.12,
      });
    }
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
