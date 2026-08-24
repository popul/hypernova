// Tout l'audio est synthétisé en WebAudio : aucun fichier son.
// SFX ponctuels + un petit séquenceur musical (basse / kick / arpège) avec scheduling lookahead.

import { STORAGE_KEYS } from '../game/constants.js';

const SCALE = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66]; // la mineur pentatonique étendue

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(STORAGE_KEYS.muted) === '1';
    this.mode = 'off'; // 'off' | 'title' | 'play' | 'shop'
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
    this.musicBus.gain.value = 0.24;
    const musicFilter = this.ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 2400;
    this.musicBus.connect(musicFilter);
    musicFilter.connect(this.master);

    // Buffer de bruit blanc partagé (explosions, percussions).
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

  setMode(mode) {
    this.mode = mode;
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
      this._tone({ type: 'square', freq: 440 * Math.pow(1.335, i), dur: 0.1, gain: 0.1, when: i * 0.06 });
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

  waveStart() {
    [330, 440, 550, 660].forEach((f, i) =>
      this._tone({ type: 'square', freq: f, dur: 0.14, gain: 0.12, when: i * 0.09 })
    );
  }

  bossAlarm() {
    for (let i = 0; i < 3; i++) {
      this._tone({ type: 'sawtooth', freq: 440, freqEnd: 220, dur: 0.32, gain: 0.18, when: i * 0.38 });
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
      if (this.mode !== 'off' && !this.muted) this._playStep(this.step, this.nextStepTime);
      const stepDur = 60 / this.tempo / 4; // double-croche
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
    this.schedulerId = setTimeout(() => this._scheduler(), 40);
  }

  _playStep(step, when) {
    const delay = Math.max(0, when - this.ctx.currentTime);
    const intense = this.mode === 'play';

    // Kick sur les temps (mode jeu uniquement).
    if (intense && step % 4 === 0) {
      this._tone({ type: 'sine', freq: 150, freqEnd: 40, dur: 0.16, gain: 0.5, when: delay, dest: this.musicBus });
    }
    // Basse : croches, motif la - la - do - sol.
    if (step % 2 === 0) {
      const bassNotes = [0, 0, 2, 0, 4, 4, 2, 0];
      const f = SCALE[bassNotes[(step / 2) | 0]] / 2;
      this._tone({
        type: 'sawtooth',
        freq: f,
        dur: 0.18,
        gain: intense ? 0.16 : 0.1,
        when: delay,
        dest: this.musicBus,
      });
    }
    // Arpège scintillant (mode jeu), ou nappe clairsemée (titre/boutique).
    if (intense) {
      const arp = [4, 6, 7, 6, 5, 7, 6, 4, 4, 6, 7, 6, 5, 7, 6, 5];
      this._tone({
        type: 'square',
        freq: SCALE[arp[step]] * 2,
        dur: 0.09,
        gain: 0.05,
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
