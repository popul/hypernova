// Les secteurs traversés. Une vague = un lieu, et le lieu change à chaque vague.
//
// Le fond était le même du début à la fin : deux couches d'étoiles et trois taches
// de nébuleuse fixes. Au bout de six vagues, l'œil ne le regardait plus du tout —
// et un décor qu'on ne regarde plus ne raconte rien, ne situe rien, et ne donne
// aucune raison de continuer pour « voir la suite ».
//
// Chaque biome pilote quatre choses ensemble, et c'est leur cohérence qui fait le
// lieu : la lumière (teinte des lampes), l'air (couleur et densité du brouillard),
// la matière (nébuleuses) et un OBJET REMARQUABLE — une planète, une épave, un
// pulsar. C'est cet objet qui donne l'échelle : sans lui, un fond d'étoiles n'a ni
// distance ni taille.
//
// Contrainte non négociable : les projectiles ennemis sont roses et brillants, et
// doivent le rester seuls. Aucun biome ne pose donc de magenta saturé dans le fond.

export const BIOMES = [
  {
    id: 'derelict',
    name: "Cimetière d'Orion",
    sub: 'Épaves de la 3ᵉ flotte',
    bg: 0x05040f,
    fog: { color: 0x07061a, density: 0.0075 },
    star: { color: 0xbfe8ff, opacity: [0.55, 0.4] },
    hemi: { sky: 0x8fb8ff, ground: 0x1a0b2e, intensity: 1.1 },
    rim: 0x4ff2ff,
    exposure: 1.15,
    nebulas: [
      ['rgba(80,40,160,0.5)', [-35, -20, -90], 90],
      ['rgba(20,90,140,0.45)', [40, -10, -100], 110],
    ],
    landmark: 'derelict',
  },
  {
    id: 'ember',
    name: 'Brasier de Kepler',
    sub: 'Naine rouge instable',
    bg: 0x120406,
    fog: { color: 0x1c0508, density: 0.0088 },
    star: { color: 0xffd9c0, opacity: [0.45, 0.32] },
    hemi: { sky: 0xffb08a, ground: 0x2a0a06, intensity: 1.15 },
    rim: 0xff9a5c,
    exposure: 1.05,
    nebulas: [
      ['rgba(190,70,20,0.42)', [-30, -26, -95], 105],
      ['rgba(220,130,40,0.3)', [45, -16, -80], 80],
    ],
    landmark: 'star',
  },
  {
    id: 'ice',
    name: 'Anneaux de Vega',
    sub: 'Ceinture de glace',
    bg: 0x040c14,
    fog: { color: 0x061420, density: 0.0068 },
    star: { color: 0xdff4ff, opacity: [0.65, 0.5] },
    hemi: { sky: 0xa8dcff, ground: 0x0a1e2e, intensity: 1.25 },
    rim: 0x9fe8ff,
    exposure: 1.2,
    nebulas: [
      ['rgba(40,120,180,0.4)', [-40, -18, -100], 100],
      ['rgba(120,190,220,0.25)', [30, -30, -85], 90],
    ],
    landmark: { id: 'ringed', body: 0x2e5f86, band: 0xcfeeff, ring: 0xbfeaff, seed: 31 },
  },
  {
    id: 'asteroids',
    name: 'Champ de Hadès',
    sub: 'Débris de ceinture',
    bg: 0x0a0806,
    fog: { color: 0x120e0a, density: 0.0095 },
    star: { color: 0xd8ccb8, opacity: [0.4, 0.3] },
    hemi: { sky: 0xc9b48f, ground: 0x1c1208, intensity: 1.0 },
    rim: 0xffc98a,
    exposure: 1.1,
    nebulas: [['rgba(120,90,40,0.3)', [0, -30, -95], 110]],
    landmark: 'asteroids',
  },
  {
    id: 'pulsar',
    name: 'Phare de Lyra',
    sub: 'Pulsar milliseconde',
    bg: 0x06050e,
    fog: { color: 0x0a0818, density: 0.007 },
    star: { color: 0xcfd8ff, opacity: [0.5, 0.38] },
    hemi: { sky: 0xb9c8ff, ground: 0x120a24, intensity: 1.15 },
    rim: 0x7f9cff,
    exposure: 1.18,
    nebulas: [
      ['rgba(60,60,190,0.4)', [-25, -24, -92], 95],
      ['rgba(140,160,255,0.22)', [38, -12, -78], 70],
    ],
    landmark: 'pulsar',
  },
  {
    id: 'verdant',
    name: 'Jardin de Cygnus',
    sub: 'Nébuleuse à formation',
    bg: 0x03100c,
    fog: { color: 0x051a14, density: 0.0082 },
    star: { color: 0xd6ffe8, opacity: [0.55, 0.42] },
    hemi: { sky: 0x8fffd0, ground: 0x062018, intensity: 1.12 },
    rim: 0x5cffc0,
    exposure: 1.12,
    nebulas: [
      ['rgba(30,150,110,0.42)', [-32, -22, -95], 100],
      ['rgba(90,200,150,0.28)', [42, -14, -88], 85],
    ],
    // Même famille d'objet que Vega, mais une planète verte à anneau serré : c'est
    // la palette qui distingue les lieux, pas la liste des formes disponibles.
    landmark: {
      id: 'ringed',
      body: 0x1f5d43,
      band: 0x9fffd0,
      ring: 0x6effc0,
      seed: 88,
      tilt: 0.62,
    },
  },
  {
    id: 'void',
    name: 'La Gueule',
    sub: 'Anomalie gravitationnelle',
    bg: 0x020208,
    fog: { color: 0x03030c, density: 0.011 },
    star: { color: 0x9fb0d0, opacity: [0.35, 0.25] },
    hemi: { sky: 0x5a6fa0, ground: 0x08060f, intensity: 0.85 },
    rim: 0xb060ff,
    exposure: 0.95,
    nebulas: [['rgba(70,20,120,0.45)', [0, -20, -90], 120]],
    landmark: 'void',
  },
];

// Le boss a toujours lieu au même endroit. Ce n'est pas une économie : revenir dans
// le décor où il attend est ce qui le rend reconnaissable, et le silence de ce
// secteur-là fait plus pour l'ambiance que n'importe quelle réplique.
export const BOSS_BIOME = BIOMES[BIOMES.length - 1];

// Le secteur d'une vague. Décalé d'une vague sur deux pour qu'un aller-retour dans
// la boutique ne ramène jamais au même endroit, et déterministe : deux joueurs qui
// comparent leurs scores traversent la même chose au même moment.
export function biomeForWave(wave, isBoss = false) {
  if (isBoss) return BOSS_BIOME;
  return BIOMES[(wave - 1) % (BIOMES.length - 1)];
}
