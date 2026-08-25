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
  respawnInvulnAfterDeath: 1.6,
};

// Directeur de menace : la difficulté ne dépend plus seulement du numéro de vague.
// Tant que le joueur ne meurt pas, la pression monte ; une mort la fait retomber.
export const DIRECTOR = {
  heatPerSecond: 0.05,
  cleanStreakSeconds: 8, // il faut être indemne depuis N secondes pour chauffer
  heatPerCleanWave: 0.5,
  heatPerDeath: -1.0,
  heatPerShield: -0.4,
  fireBoost: 0.09,
  fireFloor: 0.3,
  diveBoost: 0.1,
  diveFloor: 0.6,
  bulletBoost: 0.04,
  bulletCeil: 34,
  diversPerHeat: 2.5,
  diversMax: 3,
  leadBoost: 0.02,
  leadBoostMax: 0.15,
};

// `shot` = signature de tir du type, appliquée aux volées visées et aux plongées.
// C'est ce qui donne un rôle tactique à chaque ennemi sans lui ajouter de PV.
export const ENEMY_TYPES = {
  drone: {
    hp: 1,
    radius: 0.72,
    score: 50,
    credits: 8,
    gemCount: 1,
    fireChance: 0.05,
    shot: { shots: 1, spread: 0.07, speedMul: 1.0 }, // le piqueur : une balle sèche
  },
  wasp: {
    hp: 1,
    radius: 0.78,
    score: 80,
    credits: 14,
    gemCount: 2,
    fireChance: 0.1,
    shot: { shots: 2, spread: 0.05, gap: 0.14, speedMul: 1.15 }, // double coup : le même couloir se referme
  },
  brute: {
    hp: 3,
    radius: 1.05,
    score: 150,
    credits: 26,
    gemCount: 3,
    fireChance: 0.08,
    shot: { shots: 3, spread: 0.26, speedMul: 0.8 }, // nappe large et lente : déni de zone
  },
  boss: { hp: 50, radius: 2.6, score: 1500, credits: 220, gemCount: 16, fireChance: 0 },
};

export const ENEMY = {
  bulletSpeedBase: 13,
  bulletSpeedPerWave: 0.55,
  bulletSpeedMax: 27,
  formationFireIntervalBase: 2.6, // secondes entre tirs venant de la formation
  formationFireIntervalMin: 0.65,

  // --- Visée prédictive ---
  // Une balle met 1,2 à 1,6 s à traverser l'arène : viser la position ACTUELLE du
  // joueur, c'est viser où il n'est déjà plus. On vise donc où il SERA, avec une
  // anticipation qui monte avec les vagues.
  leadBase: 0.3,
  leadPerWave: 0.06,
  leadMax: 1.0,
  leadJitter: 1.2, // bruit en unités : laisse une chance à celui qui zigzague
  aimSpread: 0.07,
  // Les tireurs d'une même volée se répartissent l'anticipation : l'un vise loin
  // devant, l'autre juste devant, un autre sur place (pour cueillir qui freine).
  volleyRoles: [1.0, 0.55, 0.0, 1.3, 0.75],
  diveRole: 0.85,

  // --- Volées de formation ---
  shootersPerVolley: 6, // 1 tireur de plus tous les 6 vivants éligibles
  shootersMaxBase: 2,
  shootersMaxCap: 5,
  wallCountEarly: 3,
  wallCountMid: 4,
  wallCountLate: 5,
  crossAngles: [0.22, 0.46],
  telegraphTime: 0.28, // préavis avant le départ d'une balle

  // Plafond de projectiles simultanés : garantit qu'aucun motif ne peut fermer
  // l'arène. C'est le bouton de réglage global de la difficulté.
  bulletBudgetBase: 10,
  bulletBudgetPerWave: 1.3,
  bulletBudgetMax: 34,

  // --- Plongées ---
  diveLead: 0.35, // anticipation au lancement
  diveTrackBase: 8, // guidage latéral (u/s), toujours < vitesse du joueur
  diveTrackPerWave: 0.25,
  diveTrackMax: 13,
  // Scaling des PV en fin de partie : +1 PV toutes les N vagues au-delà de hpScaleStartWave,
  // pour que le late-game résiste à un build complet (~33 dps).
  hpScaleStartWave: 6,
  hpEveryWavesSmall: 5,
  hpEveryWavesBrute: 3,
  diveIntervalBase: 3.4,
  diveIntervalMin: 1.1,
  diveSpeedBase: 0.42, // progression de t par seconde sur la courbe de plongée
  diveSpeedPerWave: 0.012,
  entryDuration: 1.7, // durée du trajet d'entrée en formation
  returnSpeed: 14,
  bulletColorAimed: 0xff3df0, // rose = balle visée, elle te suit
  bulletColorStraight: 0xffa23d, // ambre = balle droite, trouve le trou
};

// Trajectoires de plongée. Les instants de tir sont tirés au hasard dans une plage
// à chaque plongée : l'esquive apprise par cœur redevient de la lecture.
export const DIVES = {
  // Le plongeur corrige sa trajectoire entre trackFrom et trackUntil, puis la fige :
  // il pousse le joueur hors d'une zone sans jamais le « coller » au dernier instant.
  trackFrom: 0.35,
  trackUntil: 0.8,
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
  hpPerWave: 13,
  fanInterval: 2.1,
  aimedBurstInterval: 3.4,
  // Éventail MÉTRIQUE : l'écart entre branches est mesuré au plan du joueur, pas en
  // radians. Un écart angulaire fixe envoyait toutes les branches sauf une hors écran.
  fanSpacingU: 4.2,
  fanSpanBase: 16,
  fanSpanPerWave: 0.5,
  fanSpanMax: 29,
  fanCountMax: 9,
  fanSecondDelay: 0.35, // en phase enragée, la seconde nappe arrive décalée dans le temps
  burstRoles: [1.0, 0.6, 0.2],
};

export const COMBO = {
  killsPerTier: 6,
  maxMultiplier: 8,
  creditCap: 2, // et seulement si le joueur a frôlé : le bonus se mérite
  grazesForCreditBonus: 8,
  // Fenêtre d'enchaînement par palier (index = multiplicateur) : de plus en plus
  // serrée, tenable seulement en frôlant les balles (chaque graze rallonge).
  windows: [2.5, 2.5, 2.3, 2.1, 1.9, 1.7, 1.6, 1.5, 1.5],
};

// Frôlement : passer près d'une balle ennemie sans la toucher rapporte points,
// énergie et un sursis de combo. Crédité quand la balle DÉPASSE le joueur.
export const GRAZE = {
  radius: 2.0,
  score: 25,
  energy: 9, // le frôlement est désormais la principale source d'énergie
  comboRefill: 0.4,
  shieldRecharge: 1.0, // secondes gagnées sur la recharge du bouclier
};

// Une seule touche, deux dépenses : tap = bombe de panique, maintien = Overdrive.
export const OVERDRIVE = {
  max: 100,
  bombCost: 75, // un seul stock possible : la bombe redevient un choix, pas un réflexe
  odCost: 100,
  holdTime: 0.35, // maintien au-delà duquel on déclenche l'Overdrive
  odDuration: 4,
  odFireMul: 1.5,
  odPierce: 2,
  odBulletSlow: 0.6,
  odScoreMul: 2,
  bombDamage: 2,
  bombBossDamage: 8,
  bombCooldown: 6,
  bombRadius: 11, // n'efface que les tirs proches, pas tout l'écran
  bombZMax: 2, // ne frappe que ce qui est descendu vers le joueur
  energyPerDiverKill: 3, // uniquement les kills au canon (pas les missiles)
  energyPerComboTier: 4, // et une seule fois par palier et par vague
};

export const PICKUPS = {
  gemValueScale: 0.58, // multiplié par ENEMY_TYPES[type].credits / gemCount
  collectRadius: 1.5,
  baseMagnetRadius: 3.0,
  magnetRadiusPerLevel: 2.2,
  magnetPull: 46,
  lifetime: 9,
};

export const WAVES = {
  bossEvery: 4,
  // La vague arrive en deux assauts au lieu d'un compte-gouttes : sans ça, la
  // formation ne se remplit jamais et tous les leviers de menace restent éteints.
  assaultGap: 2.8,
  entryStagger: 0.08,
  twoAssaultsFromWave: 3,
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
