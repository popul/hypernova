// Les séquences du récit.
//
// L'histoire ne se raconte PAS en un bloc au démarrage. Une introduction de
// cinquante secondes qui explique tout avant la première vague est un mur : le
// joueur veut jouer, et il ne retient rien de ce qu'il n'a pas encore de raison
// de comprendre.
//
// Elle se donne donc par éclats, aux paliers du voyage, et chaque éclat est un
// SOUVENIR — pas une explication. On remonte l'épave élide, et chaque morceau
// rouvert montre ce qui s'est passé dessus dix mille ans plus tôt. Le joueur
// reconstitue la trahison dans l'ordre où il la déterre, ce qui est exactement
// l'ordre où NOVA la découvre.
//
// Chaque séquence déclare : ses plans, ses répliques, ce qui doit être visible, et
// sa durée. Le lecteur (cinematic.js) ne connaît rien d'autre.
//
// Les distances de caméra sont CALCULÉES, pas devinées : ANDEL fait deux cents
// unités de long, et une emprise d'écran vaut taille / (2·distance·tan(hfov/2)).
// La première version plaçait la caméra à cinquante unités d'un objet de deux
// cents : il occupait cent fois la largeur du cadre, autrement dit on filmait
// l'intérieur de sa coque sans le savoir.

// ---------------------------------------------------------------- INTRODUCTION
//
// Dix-huit secondes, et elle ne dit RIEN des Élides. Uniquement ce dont le joueur
// a besoin tout de suite : qui il est, ce qu'il part chercher, et que trente-neuf
// sont morts avant lui. Le reste s'apprendra en chemin.
export const INTRO = {
  id: 'intro',
  duration: 18,
  show: { earth: true, sun: true, wreck: true, relay: true, ship: true },
  shots: [
    {
      id: 'I1', // La Terre, de nuit. On part de ce qu'on laisse.
      t0: 0,
      t1: 5,
      pos: [26, 10, 30],
      posTo: [10, 4, 6],
      look: [0, -8, -130],
      hfov: 58,
      ease: 'inOutSine',
    },
    {
      id: 'I2', // L'épave élide en orbite. On ne dit pas encore ce que c'est.
      t0: 5,
      t1: 10,
      pos: [26, 12, 6],
      posTo: [8, 4, -6],
      look: [-14, -14, -84],
      hfov: 54,
      ease: 'inOutSine',
    },
    {
      id: 'I3', // Le vaisseau. Bâti avec ces morceaux-là.
      t0: 10,
      t1: 14.5,
      pos: [4.4, 2.2, 13],
      posTo: [1.8, 1.1, 7.4],
      lookTarget: (ctx) => ctx.player.position,
      roll: 0.07,
      rollTo: -0.02,
      hfov: 44,
      ease: 'outCubic',
    },
    {
      id: 'I4', // Le départ, et le titre.
      t0: 14.5,
      t1: 18,
      pos: [1.8, 1.1, 7.4],
      posTo: [0.6, 2.6, 18],
      lookTarget: (ctx) => ctx.player.position,
      hfov: 52,
      ease: 'inCubic',
    },
  ],
  lines: [
    { t: 0.6, who: 'nova', text: 'Orbite basse. Regarde-la une fois — une seule.' },
    {
      t: 4.6,
      who: 'nova',
      text: 'Ce qui flotte là-haut n’est pas à nous. On l’a trouvé, et on l’a démonté.',
    },
    {
      t: 9.4,
      who: 'nova',
      text: 'Ton réacteur, ton bouclier, ton déviateur : tout vient de cette épave.',
    },
    { t: 13.2, who: 'nova', text: 'Trente-neuf sont partis la remonter. Aucun n’est revenu.' },
    { t: 15.6, who: 'nova', text: 'La quarantième ligne est vide. Ne me force pas à l’écrire.' },
  ],
  beats: [
    { t: 0.2, do: 'padHope' },
    { t: 12.8, do: 'hero' },
    { t: 15.4, do: 'title' },
  ],
};

// ------------------------------------------------------------------ SOUVENIRS
//
// Chacun se déclenche à l'entrée d'un palier, quand le joueur vient de récupérer
// le morceau d'épave correspondant. Huit à douze secondes : le temps d'une image
// forte et de deux phrases, jamais plus.

// Réglage commun aux souvenirs. Chacun surcharge `show` avec ce qu'il montre, et
// RIEN de plus : un décor présent mais hors propos finit toujours par se mettre
// devant le sujet — mesuré, l'arche occupait quarante-deux fois la largeur du
// cadre dans un souvenir qui ne parle que d'une étoile.
const MEMOIRE = {};

export const SOUVENIRS = {
  // Palier 4 — Mars. Le premier fragment. On découvre qu'il y avait une étoile.
  etoile: {
    id: 'etoile',
    stage: 3,
    duration: 10,
    ...MEMOIRE,
    show: { star: true },
    shots: [
      {
        id: 'M1',
        t0: 0,
        t1: 5,
        pos: [-40, 70, -40],
        posTo: [-20, 54, -70],
        look: [-120, 30, -260],
        hfov: 52,
        ease: 'inOutSine',
      },
      {
        id: 'M2', // Elle gonfle. Trois secondes, et on a compris qu'ils vont mourir.
        t0: 5,
        t1: 10,
        pos: [-60, 46, -120],
        posTo: [-84, 40, -150],
        look: [-120, 30, -260],
        hfov: 44,
        ease: 'outCubic',
      },
    ],
    lines: [
      { t: 0.5, who: 'nova', text: 'Le fragment contient un enregistrement. Très vieux.' },
      {
        t: 3.4,
        who: 'nova',
        text: 'Leur étoile mourait. Ils le savaient depuis deux générations.',
      },
      { t: 7.0, who: 'nova', text: 'Ils ont construit deux arches.' },
    ],
    beats: [
      { t: 0.1, do: 'padDark' },
      { t: 6.6, do: 'riser' },
    ],
  },

  // Palier 5 — la ceinture. Là où l'arche s'est ouverte. On voit le chargement.
  fleuve: {
    id: 'fleuve',
    stage: 4,
    duration: 12,
    ...MEMOIRE,
    show: { star: true, andel: true, river: true },
    shots: [
      {
        id: 'F1', // Plan large : deux cents unités d'arche, donc la caméra à deux cent dix.
        t0: 0,
        t1: 6,
        pos: [-40, 44, 62],
        posTo: [-24, 30, 40],
        look: [-20, -4, -150],
        hfov: 55,
        ease: 'inOutSine',
      },
      {
        id: 'F2', // On suit le fleuve jusqu'à la fente. Il entre. Il n'en sort rien.
        t0: 6,
        t1: 12,
        pos: [-96, 20, -60],
        posTo: [-52, 12, -92],
        lookFn: (e) => ({ x: -60 + e * 55, y: 0, z: -148 }),
        hfov: 46,
        ease: 'linear',
      },
    ],
    lines: [
      {
        t: 0.5,
        who: 'nova',
        text: 'Dans la grande, ils ont chargé les ouvriers. Les malades. Les vieux.',
      },
      { t: 5.4, who: 'nova', text: 'On leur a dit que c’était un honneur.' },
      { t: 8.6, who: 'nova', text: 'Ils sont tous entrés là-dedans, {PILOTE}. Tous.' },
    ],
    beats: [
      { t: 0.1, do: 'padHope' },
      { t: 8.2, do: 'padDark' },
    ],
  },

  // Palier 7 — Saturne. La trahison, enfin nommée.
  fuite: {
    id: 'fuite',
    stage: 6,
    duration: 11,
    ...MEMOIRE,
    show: { star: true, andel: true, fleet: true },
    shots: [
      {
        id: 'T1', // La petite flotte. Cadrée petite, exprès.
        t0: 0,
        t1: 5,
        pos: [70, 16, -20],
        posTo: [86, 22, 6],
        look: [16, 4, -104],
        hfov: 50,
        ease: 'inOutSine',
      },
      {
        id: 'T2', // La couture qui se ferme, cadrée de trois quarts pour qu'on lise
        t0: 5, // à la fois la fente ET la longueur de coque qu'elle referme.
        t1: 11,
        pos: [-120, 62, -60],
        posTo: [-92, 48, -84],
        look: [-10, 16, -150],
        hfov: 46,
        ease: 'outCubic',
      },
    ],
    lines: [
      { t: 0.5, who: 'nova', text: 'Dans la petite, ils sont montés, eux. Ceux qui décidaient.' },
      {
        t: 4.4,
        who: 'nova',
        text: 'Puis ils ont effacé la clé qui aurait permis de rouvrir la grande.',
      },
      { t: 8.4, who: 'nova', text: '… Il ne s’est jamais ouvert. Il les porte encore.' },
    ],
    beats: [
      { t: 3.8, do: 'riser' },
      { t: 6.4, do: 'seal' },
    ],
  },

  // Palier 10 — l'héliopause. Il est là, et on comprend ce qu'on regarde.
  lui: {
    id: 'lui',
    stage: 9,
    duration: 10,
    show: { andel: true },
    shots: [
      {
        id: 'L1', // Deux cents unités d'arche à cadrer : la caméra doit être à deux
        t0: 0, // cent dix, pas à trente. C'est de l'arithmétique, pas du goût.
        t1: 5,
        pos: [30, 46, 80],
        posTo: [14, 30, 44],
        look: [0, -4, -150],
        hfov: 58,
        ease: 'inOutSine',
      },
      {
        id: 'L2', // La couture, encore. On la reconnaît, et c'est le but.
        t0: 5,
        t1: 10,
        pos: [-110, 56, -66],
        posTo: [-84, 44, -88],
        look: [-8, 18, -150],
        hfov: 44,
        ease: 'outCubic',
      },
    ],
    lines: [
      { t: 0.4, who: 'korn', text: 'Tu remontes la traînée. Comme les autres.' },
      {
        t: 3.6,
        who: 'nova',
        text: 'Ce que tu as devant toi n’est pas un vaisseau. C’est l’arche.',
      },
      { t: 7.0, who: 'nova', text: 'Ils sont encore dedans. Tous. Depuis dix mille ans.' },
    ],
    beats: [
      { t: 0.1, do: 'padDark' },
      { t: 6.6, do: 'impact' },
    ],
  },
};

export function souvenirPourPalier(i) {
  return Object.values(SOUVENIRS).find((s) => s.stage === i) || null;
}
