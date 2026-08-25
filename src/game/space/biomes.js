// Le voyage, en onze paliers.
//
// Avant, sept secteurs inventés tournaient en boucle : « Cimetière d'Orion »,
// « Brasier de Kepler »… De jolis noms sans rapport avec quoi que ce soit, et
// surtout sans DIRECTION. Or le sujet du jeu est de s'éloigner de la Terre.
//
// Ici, chaque palier est une étape réelle du système solaire, dans l'ordre, et
// c'est la traînée de l'épave élide qu'on remonte. Le joueur ne lit jamais une
// distance : il la VOIT, parce que trois choses bougent ensemble à chaque saut.
//
//  1. LE SOLEIL RÉTRÉCIT. C'est l'indicateur central, et le seul qu'on n'ait
//     jamais besoin d'expliquer. Il passe d'un disque de vingt-six unités en
//     orbite terrestre à un point de douze centièmes dans l'espace interstellaire
//     — la décroissance suit la distance réelle en unités astronomiques.
//  2. LA LUMIÈRE FAIBLIT. L'éclairage hémisphérique et l'exposition baissent avec
//     le Soleil : au-delà de Neptune, on ne voit plus que par les feux de bord.
//  3. LE FROID MONTE. Les teintes passent du bleu chaud de la Terre au violet
//     mort de l'héliopause.
//
// Contrainte non négociable : les projectiles ennemis sont roses et brillants, et
// doivent le rester seuls. Aucun palier ne pose de magenta saturé dans le fond.
//
// Chaque palier dure trois vagues (voir stageForWave).

export const STAGES = [
  {
    id: 'terre',
    name: 'Orbite terrestre basse',
    sub: 'Départ — 0 UA',
    sun: 26,
    bg: 0x04070f,
    fog: { color: 0x061020, density: 0.0068 },
    star: { color: 0xcfe4ff, opacity: [0.5, 0.36] },
    hemi: { sky: 0x9fc4ff, ground: 0x11203a, intensity: 1.35 },
    rim: 0x6fd8ff,
    exposure: 1.2,
    nebulas: [['rgba(40,90,170,0.28)', [-30, -18, -95], 90]],
    landmark: [{ id: 'planet', kind: 'earth', radius: 233, pos: [-94, -144, -346] }],
  },
  {
    id: 'lagrange',
    name: 'Point de Lagrange L2',
    sub: 'Le relais — 0,01 UA',
    sun: 24,
    bg: 0x04060e,
    fog: { color: 0x070e1c, density: 0.0064 },
    star: { color: 0xd4e6ff, opacity: [0.58, 0.42] },
    hemi: { sky: 0x9dbdf0, ground: 0x0e1830, intensity: 1.25 },
    rim: 0x7fd0ff,
    exposure: 1.18,
    nebulas: [['rgba(35,80,150,0.22)', [34, -22, -100], 80]],
    landmark: [
      { id: 'planet', kind: 'earth', radius: 20, pos: [-120, -70, -300] },
      { id: 'moon', radius: 7, pos: [-86, -58, -250] },
    ],
  },
  {
    id: 'transit',
    name: 'Traversée Terre–Mars',
    sub: 'Le vide — 0,5 UA',
    sun: 20,
    bg: 0x05050c,
    fog: { color: 0x080810, density: 0.0058 },
    star: { color: 0xe0e8ff, opacity: [0.66, 0.5] },
    hemi: { sky: 0x8fa4d8, ground: 0x0c0e1c, intensity: 1.05 },
    rim: 0x8fb4ff,
    exposure: 1.15,
    // Rien à voir. C'est le propos du palier : le premier contact a lieu dans un
    // endroit où il n'y a strictement rien pour se raccrocher.
    nebulas: [],
    landmark: [],
  },
  {
    id: 'mars',
    name: 'Mars — Valles Marineris',
    sub: 'La tuyère — 1,5 UA',
    sun: 17,
    bg: 0x0d0604,
    fog: { color: 0x1a0a06, density: 0.0086 },
    star: { color: 0xffd9c0, opacity: [0.44, 0.32] },
    hemi: { sky: 0xffa878, ground: 0x2a0d05, intensity: 1.15 },
    rim: 0xff9455,
    exposure: 1.08,
    nebulas: [['rgba(170,70,25,0.3)', [-28, -26, -92], 95]],
    landmark: [
      { id: 'planet', kind: 'mars', radius: 246, pos: [122, -151, -360] },
      { id: 'hulk', variant: 'nozzle', pos: [-30, -20, -76], scale: 0.56 },
    ],
  },
  {
    id: 'ceinture',
    name: "Ceinture d'astéroïdes",
    sub: "Là où l'arche s'est ouverte — 2,7 UA",
    sun: 11,
    bg: 0x090705,
    fog: { color: 0x120e0a, density: 0.0098 },
    star: { color: 0xd8ccb8, opacity: [0.4, 0.3] },
    hemi: { sky: 0xc0a882, ground: 0x1a1108, intensity: 0.95 },
    rim: 0xffc07a,
    exposure: 1.05,
    nebulas: [['rgba(110,80,40,0.26)', [0, -30, -95], 105]],
    landmark: [
      { id: 'asteroids', tint: 0x6b5a48 },
      { id: 'hulk', variant: 'torn', pos: [26, -24, -88], scale: 0.57 },
    ],
  },
  {
    id: 'jupiter',
    name: "Jupiter — ombre d'Io",
    sub: "La section d'habitat — 5,2 UA",
    sun: 6,
    bg: 0x0a0806,
    fog: { color: 0x140f09, density: 0.0088 },
    star: { color: 0xf0e0c8, opacity: [0.5, 0.38] },
    hemi: { sky: 0xe8c89a, ground: 0x1e1408, intensity: 0.9 },
    rim: 0xffcf9a,
    exposure: 1.02,
    nebulas: [['rgba(150,110,60,0.24)', [-34, -20, -98], 100]],
    landmark: [
      { id: 'planet', kind: 'jupiter', radius: 256, pos: [-122, -166, -374] },
      { id: 'moon', radius: 9, pos: [70, -44, -240], tint: 0xd8c07a },
      { id: 'hulk', variant: 'habitat', pos: [22, -26, -84], scale: 0.62 },
    ],
  },
  {
    id: 'saturne',
    name: 'Anneaux de Saturne',
    sub: 'La soute — 9,5 UA',
    sun: 3.2,
    bg: 0x070810,
    fog: { color: 0x0c101c, density: 0.0074 },
    star: { color: 0xdfeaff, opacity: [0.6, 0.46] },
    hemi: { sky: 0xc8d8f0, ground: 0x0e1424, intensity: 0.85 },
    rim: 0xa8d0ff,
    exposure: 1.06,
    nebulas: [['rgba(70,90,140,0.22)', [36, -24, -96], 90]],
    landmark: [
      {
        id: 'planet',
        kind: 'saturn',
        radius: 34,
        pos: [-32, -36, -104],
        rings: { inner: 1.4, outer: 2.3, tilt: 0.3, color: 0xe0d6b8 },
      },
      { id: 'hulk', variant: 'hold', pos: [28, -22, -82], scale: 0.5 },
    ],
  },
  {
    id: 'neptune',
    name: 'Neptune',
    sub: 'Le dernier relais — 30 UA',
    sun: 1,
    bg: 0x030710,
    fog: { color: 0x050c1a, density: 0.0072 },
    star: { color: 0xd0e0ff, opacity: [0.66, 0.52] },
    hemi: { sky: 0x6f95d8, ground: 0x060e1e, intensity: 0.62 },
    rim: 0x6fa8ff,
    exposure: 1.0,
    nebulas: [['rgba(30,60,130,0.24)', [-26, -24, -98], 85]],
    landmark: [
      { id: 'planet', kind: 'neptune', radius: 246, pos: [115, -137, -367] },
      { id: 'hulk', variant: 'relay', pos: [-26, -18, -74], scale: 1.0 },
    ],
  },
  {
    id: 'kuiper',
    name: 'Ceinture de Kuiper',
    sub: 'La trente-neuvième — 45 UA',
    sun: 0.6,
    bg: 0x03050c,
    fog: { color: 0x050912, density: 0.0082 },
    star: { color: 0xe4f0ff, opacity: [0.72, 0.58] },
    hemi: { sky: 0x8fb0d8, ground: 0x060a14, intensity: 0.5 },
    rim: 0x9fd8ff,
    exposure: 0.98,
    nebulas: [],
    landmark: [
      { id: 'asteroids', tint: 0x7d90a4, count: 70 },
      { id: 'hulk', variant: 'relay', pos: [18, -16, -66], scale: 0.92 },
    ],
  },
  {
    id: 'heliopause',
    name: 'Héliopause',
    sub: 'Lui — 120 UA',
    sun: 0.25,
    bg: 0x020209,
    fog: { color: 0x030410, density: 0.0104 },
    star: { color: 0xa8b4d8, opacity: [0.4, 0.3] },
    hemi: { sky: 0x5a68a0, ground: 0x05060e, intensity: 0.38 },
    rim: 0x9a68ff,
    exposure: 0.92,
    nebulas: [['rgba(60,20,110,0.34)', [0, -22, -92], 120]],
    landmark: [{ id: 'korn' }],
  },
  {
    id: 'interstellaire',
    name: 'Espace interstellaire',
    sub: 'Le morceau de tête',
    sun: 0.12,
    bg: 0x010106,
    fog: { color: 0x02020a, density: 0.0112 },
    star: { color: 0xc8d4f0, opacity: [0.8, 0.64] },
    hemi: { sky: 0x4a5680, ground: 0x03040a, intensity: 0.32 },
    rim: 0xb888ff,
    exposure: 0.95,
    nebulas: [['rgba(50,25,95,0.3)', [-20, -26, -100], 110]],
    landmark: [{ id: 'hulk', variant: 'head', pos: [0, -30, -96], scale: 0.52 }],
  },
];

const WAVES_PAR_PALIER = 3;

// Le palier d'une vague. Au-delà du onzième, on reste dans l'espace interstellaire :
// le voyage a une fin, la partie non — et rebrousser chemin n'aurait aucun sens.
export function stageForWave(wave) {
  const i = Math.floor((Math.max(1, wave) - 1) / WAVES_PAR_PALIER);
  return STAGES[Math.min(i, STAGES.length - 1)];
}

// Compat : le jeu appelle encore biomeForWave. Un palier de boss assombrit le lieu
// au lieu d'en changer — c'est KORN qui arrive, pas le décor qui se remplace.
export function biomeForWave(wave, isBoss = false) {
  const stage = stageForWave(wave);
  if (!isBoss) return stage;
  return {
    ...stage,
    id: `${stage.id}-boss`,
    sub: 'Il est là',
    fog: { color: stage.fog.color, density: stage.fog.density * 1.5 },
    hemi: { ...stage.hemi, intensity: stage.hemi.intensity * 0.55 },
    rim: 0xb060ff,
    exposure: stage.exposure * 0.86,
  };
}
