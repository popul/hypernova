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
  bulletSpeedMax: 27,
  formationFireIntervalBase: 2.6, // secondes entre tirs venant de la formation
  formationFireIntervalMin: 0.65,
  // Nombre de tireurs par volée : une grosse formation doit MENACER, pas seulement
  // offrir des crédits. 1 + vivants/14, plafonné.
  shootersPerVolley: 14,
  shootersMax: 3,
  // Scaling des PV en fin de partie : +1 PV toutes les N vagues au-delà de hpScaleStartWave,
  // pour que le late-game résiste à un build complet (~33 dps).
  hpScaleStartWave: 6,
  hpEveryWavesSmall: 5,
  hpEveryWavesBrute: 3,
  diveIntervalBase: 3.4,
  diveIntervalMin: 1.1,
  diveSpeedBase: 0.42, // progression de t par seconde sur la courbe de plongée
  diveSpeedPerWave: 0.012,
  entryDuration: 2.3, // durée du trajet d'entrée en formation
  returnSpeed: 14,
};

// Trajectoires de plongée. Les instants de tir sont tirés au hasard dans une plage
// à chaque plongée : l'esquive apprise par cœur redevient de la lecture.
export const DIVES = {
  sweep: { speedMul: 1, shots: 2, t1: [0.25, 0.4], t2: [0.5, 0.7], spread: 0.05 },
  strafe: {
    speedMul: 0.85,
    shots: 3,
    t1: [0.25, 0.35],
    t2: [0.45, 0.6],
    t3: [0.65, 0.8],
    spread: 0,
  },
  squad: { speedMul: 1, shots: 1, t1: [0.35, 0.45], spread: 0.05, count: 3, offsets: [-3, 0, 3] },
};

export const BOSS = {
  hpPerWave: 20,
  fanInterval: 2.1,
  fanCount: 5,
  fanSpread: 0.5, // radians
  aimedBurstInterval: 3.4,
  fanCountPerWaves: 8, // +1 branche toutes les N vagues
  fanCountMax: 9,
};

export const COMBO = {
  killsPerTier: 6,
  maxMultiplier: 8,
  creditCap: 3, // le score monte jusqu'à ×8, les crédits plafonnent à ×3
  // Fenêtre d'enchaînement par palier (index = multiplicateur) : de plus en plus
  // serrée, tenable seulement en frôlant les balles (chaque graze rallonge).
  windows: [2.5, 2.5, 2.3, 2.1, 1.9, 1.7, 1.6, 1.5, 1.5],
};

// Frôlement : passer près d'une balle ennemie sans la toucher rapporte points,
// énergie et un sursis de combo. Crédité quand la balle DÉPASSE le joueur.
export const GRAZE = {
  radius: 2.0,
  score: 25,
  energy: 6,
  comboRefill: 0.4,
};

// Une seule touche, deux dépenses : tap = bombe de panique, maintien = Overdrive.
export const OVERDRIVE = {
  max: 100,
  bombCost: 50,
  odCost: 100,
  holdTime: 0.35, // maintien au-delà duquel on déclenche l'Overdrive
  odDuration: 4,
  odFireMul: 1.5,
  odPierce: 2,
  odBulletSlow: 0.6,
  odScoreMul: 2,
  bombDamage: 5,
  bombBossDamage: 12,
  energyPerDiverKill: 5, // uniquement les kills au canon (pas les missiles)
  energyPerComboTier: 10,
};

export const PICKUPS = {
  gemValueScale: 0.85, // multiplié par ENEMY_TYPES[type].credits / gemCount
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
