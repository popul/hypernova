// Directeur de menace : mesure en continu si le joueur domine, et fait monter la
// pression tant qu'il ne meurt pas. C'est ce qui empêche la difficulté de plafonner —
// un très bon joueur affronte à la vague 20 une menace qu'un joueur moyen ne verra
// qu'à la vague 35, voire jamais.

import { DIRECTOR } from './constants.js';

export class Director {
  constructor() {
    this.reset();
  }

  reset() {
    this.heat = 0;
    this.cleanTime = 0; // secondes écoulées depuis le dernier dégât subi
    this._lastTier = 0;
  }

  update(dt) {
    this.cleanTime += dt;
    if (this.cleanTime >= DIRECTOR.cleanStreakSeconds) {
      this.heat += DIRECTOR.heatPerSecond * dt;
    }
  }

  onWaveCleared(tookDamage) {
    if (!tookDamage) this.heat += DIRECTOR.heatPerCleanWave;
  }

  onDeath() {
    this.heat = Math.max(0, this.heat + DIRECTOR.heatPerDeath);
    this.cleanTime = 0;
  }

  onShieldBroken() {
    this.heat = Math.max(0, this.heat + DIRECTOR.heatPerShield);
    this.cleanTime = 0;
  }

  // Le directeur se photographie EN ENTIER. La chaleur ne suffit pas : le temps
  // calme décide de l'image où elle recommence à monter, et le dernier palier
  // décide de l'image où `setHeat` refrappe les ennemis. Un rejoignant qui
  // repartirait à zéro sur ces deux-là recalibrerait sa vague à un autre moment
  // que les autres — une désynchronisation sans aucun coupable visible.
  instantane() {
    return [this.heat, this.cleanTime, this._lastTier];
  }

  restaure(d) {
    this.heat = d?.[0] || 0;
    this.cleanTime = d?.[1] || 0;
    this._lastTier = d?.[2] || 0;
  }

  // Renvoie le palier entier franchi depuis le dernier appel, ou 0.
  pollTier() {
    const tier = Math.floor(this.heat);
    if (tier > this._lastTier) {
      this._lastTier = tier;
      return tier;
    }
    this._lastTier = Math.min(this._lastTier, tier);
    return 0;
  }
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function romanTier(n) {
  return ROMAN[n] || `×${n}`;
}
