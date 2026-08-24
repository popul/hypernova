// Tout le tuning gameplay est centralisé ici : une seule source de vérité pour l'équilibrage.

export const ARENA = {
  playerZ: 13,
  playerXMax: 14.5,
  bulletCullZMin: -34,
  bulletCullZMax: 26,
  bulletCullXMax: 26,
};

export const PLAYER = {
  baseSpeed: 16,
  baseFireRate: 3.4, // tirs / seconde
  bulletSpeed: 34,
  radius: 0.9,
  respawnInvuln: 2.4, // secondes d'invulnérabilité après une mort
  baseLives: 3,
  maxLives: 5,
};

export const ENEMY_TYPES = {
  drone: { hp: 1, radius: 0.72, score: 50, credits: 8, gemCount: 1, fireChance: 0.05 },
  wasp: { hp: 1, radius: 0.78, score: 80, credits: 14, gemCount: 2, fireChance: 0.1 },
  brute: { hp: 3, radius: 1.05, score: 150, credits: 26, gemCount: 3, fireChance: 0.08 },
  boss: { hp: 60, radius: 2.6, score: 1500, credits: 220, gemCount: 16, fireChance: 0 },
};

export const ENEMY = {
  bulletSpeedBase: 13,
  bulletSpeedPerWave: 0.55,
  bulletSpeedMax: 24,
  formationFireIntervalBase: 2.6, // secondes entre tirs venant de la formation
  formationFireIntervalMin: 0.65,
  // Scaling des PV en fin de partie : +1 PV toutes les N vagues au-delà de hpScaleStartWave,
  // pour que le late-game résiste à un build complet (~33 dps).
  hpScaleStartWave: 8,
  hpEveryWavesSmall: 5,
  hpEveryWavesBrute: 3,
  diveIntervalBase: 3.4,
  diveIntervalMin: 1.3,
  diveSpeedBase: 0.42, // progression de t par seconde sur la courbe de plongée
  diveSpeedPerWave: 0.012,
  entryDuration: 2.3, // durée du trajet d'entrée en formation
  returnSpeed: 14,
};

export const BOSS = {
  hpPerWave: 24,
  fanInterval: 2.1,
  fanCount: 5,
  fanSpread: 0.5, // radians
  aimedBurstInterval: 3.4,
};

export const COMBO = {
  window: 2.5, // secondes pour enchaîner
  killsPerTier: 6,
  maxMultiplier: 5,
};

export const PICKUPS = {
  gemValueScale: 1, // multiplié par ENEMY_TYPES[type].credits / gemCount
  collectRadius: 1.5,
  baseMagnetRadius: 3.0,
  magnetRadiusPerLevel: 2.2,
  magnetPull: 46,
  lifetime: 9,
};

export const WAVES = {
  bossEvery: 4,
  colsBase: 6,
  colsMax: 10,
  colSpacing: 2.35,
  rowSpacing: 2.3,
  formationZTop: -17,
  swayAmpX: 2.1,
  swaySpeed: 0.55,
  breathAmp: 0.045,
  breathSpeed: 0.9,
};

export const FX = {
  hitStopScale: 0.15,
  hitStopDuration: 0.07,
  shakeDecay: 2.6,
};

export const STORAGE_KEYS = {
  hiscore: 'novaswarm.hiscore',
  bestWave: 'novaswarm.bestwave',
  muted: 'novaswarm.muted',
  introSeen: 'novaswarm.introseen',
};
