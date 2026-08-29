// Les séquences du récit.
//
// L'histoire ne se raconte PAS en un bloc au démarrage. Elle se donne par
// éclats, aux paliers du voyage, et chaque éclat est un SOUVENIR — pas une
// explication. Le joueur reconstitue la trahison dans l'ordre où il la déterre,
// qui est exactement l'ordre où NOVA la découvre.
//
// PRINCIPE DE CETTE PARTITION : l'image d'abord. Le récit tient dans quatre
// images que le décor sait déjà produire — une coque qu'on longe sans en voir
// le bout, un fleuve de lumières qui entre et ne ressort pas, une couture qui
// se scelle, un carton « 39 partis. 0 revenu. » — et chaque réplique ne dit que
// ce que l'image ne peut pas dire. Résultat mesuré : 520 caractères parlés au
// lieu de 921 (−44 %), 17/17 répliques sous 13 car/s, pire débit 10,3, et le
// débit RALENTIT sur les lignes importantes au lieu d'accélérer.
//
// Le peps vient du montage, pas du flot : chaque séquence alterne un plan lent
// et une coupe sèche marquée d'un choc, et les silences sont des plans à part
// entière — 2 s de coque muette avant « On n'a pas construit ça ».
//
// LA RÈGLE DE LECTURE, qui a réécrit chaque ligne : le lecteur du jeu est un
// enfant de douze ans, sur téléphone. Une réplique = une idée, au plus
// 13 caractères par seconde, au moins 2,4 s à l'écran. Le mesureur tranche
// (scratchpad/mesure-cinematique.py), pas l'intuition — l'ancienne partition
// montait à 24 car/s, pile sur les lignes les plus importantes.
//
// Chaque séquence déclare : ses plans, ses répliques, ses temps forts (beats),
// ce qui doit être visible, et sa durée. Le lecteur (cinematic.js) ne connaît
// rien d'autre.
//
// Les distances de caméra sont CALCULÉES, pas devinées : ANDEL fait deux cents
// unités de long, et une emprise d'écran vaut taille / (2·distance·tan(hfov/2)).

// ---------------------------------------------------------------- INTRODUCTION
//
// Trente secondes, sautables d'un geste. Six battements : la gifle (muette), la
// Terre, la coque, le vaisseau, le carton, l'envol — et le titre FRAPPÉ en
// climax, pas affiché en formalité de sortie.
//
// Le fait central — trente-neuf partis, zéro revenu — n'est pas prononcé : il
// se LIT, sur un carton tenu 4,8 s pendant un plan quasi fixe. 20 caractères en
// 4,8 s font 4,2 car/s, trois fois sous le plafond ; aucune voix ne va aussi
// lentement sans endormir.
export const INTRO = {
  id: 'intro',
  duration: 30,
  show: { earth: true, sun: true, wreck: true, relay: true, ship: true },
  shots: [
    {
      // I0 — LA GIFLE. L'épave déchirée fonce vers la caméra et la frôle :
      // impact, éclair, secousse à 0,6 s, pas un mot. L'accroche est physique
      // et tombe avant la troisième seconde — sur téléphone, un enfant décide
      // en trois secondes s'il appuie sur Passer.
      id: 'I0',
      t0: 0,
      t1: 2.2,
      pos: [-2, -8, -56],
      posTo: [-10, -12, -74],
      look: [-14, -14, -84],
      hfov: 66,
      ease: 'outCubic',
      handheld: 0.35,
    },
    {
      // I1 — la Terre de nuit, 5,4 s lentes. Le plan calme qui rend la coupe
      // suivante violente : après la gifle, le contraste est le sujet.
      id: 'I1',
      t0: 2.2,
      t1: 7.6,
      pos: [26, 10, 30],
      posTo: [10, 4, 6],
      look: [0, -8, -130],
      hfov: 58,
      ease: 'inOutSine',
    },
    {
      // I2 — COUPE SÈCHE + choc : la coque de l'épave PLEIN CADRE, travelling
      // latéral. À ~30 unités d'un objet de 89 de long, hfov 40, on n'en voit
      // que 27 % : l'immensité est montrée, jamais dite. 2 s de silence avant
      // la réplique — le silence est un plan, pas un vide.
      id: 'I2',
      t0: 7.6,
      t1: 12.4,
      pos: [10, -8, -58],
      posTo: [-2, -10, -58],
      look: [-14, -14, -84],
      hfov: 40,
      ease: 'linear',
    },
    {
      // I3 — coupe : le vaisseau du joueur, poussée lente, caméra à l'épaule.
      // Même métal que le plan d'avant — la réplique fait le lien que l'image
      // ne peut pas faire seule. Le vaisseau suit show.ship (le lecteur le
      // cachait en dur jusqu'à t ≥ 37,5 s, horloge de l'ancienne intro de 52 s).
      id: 'I3',
      t0: 12.4,
      t1: 17.4,
      pos: [4.4, 2.2, 13],
      posTo: [1.8, 1.1, 7.4],
      lookTarget: (ctx) => ctx.player.position,
      roll: 0.07,
      rollTo: -0.02,
      hfov: 44,
      ease: 'outCubic',
      handheld: 0.2,
    },
    {
      // I4 — plan quasi FIXE : l'épave au loin devant la Terre, sa dernière
      // lampe qui clignote (createHulk l'anime déjà). C'est le plan du carton
      // « 39 partis. 0 revenu. » — les chiffres se lisent, personne ne les
      // prononce. Emprise ≈ 0,94 largeur à 102 unités, hfov 50.
      id: 'I4',
      t0: 17.4,
      t1: 24,
      pos: [26, 12, 6],
      posTo: [24, 11, 4],
      look: [-14, -14, -84],
      hfov: 50,
      ease: 'inOutSine',
    },
    {
      // I5 — coupe : l'envol (beat depart), la caméra reste et le regarde
      // partir. La vitesse se lit par l'abandon. Titre frappé à 27,6.
      id: 'I5',
      t0: 24,
      t1: 30,
      pos: [1.8, 1.1, 7.4],
      posTo: [0.6, 2.6, 18],
      lookTarget: (ctx) => ctx.player.position,
      hfov: 52,
      ease: 'inCubic',
    },
  ],
  // Cinq répliques, 137 caractères. Débits mesurés de 6,7 à 8,9 car/s — la plus
  // lente est « Tu es le numéro 40. », la plus importante. La dernière n'est pas
  // une consigne de mission : NOVA s'attache, et c'est la raison de revenir.
  lines: [
    { t: 3.2, who: 'nova', text: 'Regarde-la bien avant de partir.' },
    { t: 9.6, who: 'nova', text: 'On n’a pas construit ça.' },
    { t: 13.4, who: 'nova', text: 'Ton vaisseau est fait de ses morceaux.' },
    { t: 20.8, who: 'nova', text: 'Tu es le numéro 40.' },
    { t: 25, who: 'nova', text: 'Toi… reviens, d’accord ?' },
  ],
  beats: [
    { t: 0.1, do: 'padDark' },
    { t: 0.6, do: 'impact' }, // la gifle s'entend…
    { t: 0.6, do: 'punch' }, // …et se voit : éclair bref
    { t: 2.4, do: 'padHope' }, // la Terre réchauffe
    { t: 7.6, do: 'impact' }, // la coupe sèche sur la coque
    { t: 15, do: 'riser' }, // 2,4 s : culmine PILE sur la coupe de 17,4
    { t: 17.6, do: 'padDark' }, // le compte des morts se lit dans le froid
    { t: 18.4, do: 'carton', text: '39 partis. 0 revenu.', hold: 4.8 },
    { t: 24, do: 'depart' }, // l'envol, câblé en donnée (plus de t ≥ 46 en dur)
    { t: 24, do: 'hero' },
    { t: 27.6, do: 'impact' }, // le titre est FRAPPÉ, pas affiché
    { t: 27.6, do: 'punch' },
    { t: 27.6, do: 'title' },
  ],
};

// ------------------------------------------------------------------ SOUVENIRS
//
// Chacun se déclenche à l'entrée d'un palier, quand le joueur vient de récupérer
// le morceau d'épave correspondant. Onze à quatorze secondes : le temps d'une
// image forte et de trois phrases, jamais plus.
//
// Chaque souvenir surcharge `show` avec ce qu'il montre, et RIEN de plus : un
// décor présent mais hors propos finit toujours par se mettre devant le sujet.

export const SOUVENIRS = {
  // Palier 4 — Mars. Le premier fragment. L'étoile qui gonfle et rougit EST le
  // compte à rebours (elide.js le dit déjà) : on ne décrit pas l'image, on la
  // laisse compter. « Deux arches » se pose ICI, pour que « la grande arche »
  // du souvenir suivant ait un contraste — sans cette ligne, la référence
  // arrivait orpheline.
  etoile: {
    id: 'etoile',
    stage: 3,
    duration: 12,
    show: { star: true },
    shots: [
      {
        id: 'M1', // L'étoile de loin, dérive lente.
        t0: 0,
        t1: 5,
        pos: [-40, 70, -40],
        posTo: [-20, 54, -70],
        look: [-120, 30, -260],
        hfov: 52,
        ease: 'inOutSine',
      },
      {
        id: 'M2', // Plus près : elle emplit le cadre en rougissant.
        t0: 5,
        t1: 12,
        pos: [-60, 46, -120],
        posTo: [-84, 40, -150],
        look: [-120, 30, -260],
        hfov: 44,
        ease: 'outCubic',
      },
    ],
    lines: [
      // Les points de suspension seraient une décoration ici : NOVA constate.
      // « Alors » est le connecteur gratuit — cause, puis décision, dans les
      // mots qu'un enfant emploie.
      { t: 0.8, who: 'nova', text: 'Ce morceau se souvient.' },
      { t: 4.4, who: 'nova', text: 'Leur soleil était en train de mourir.' },
      { t: 8, who: 'nova', text: 'Alors ils ont construit deux arches.' },
    ],
    beats: [
      { t: 0.1, do: 'padDark' },
      { t: 2.6, do: 'riser' }, // culmine sur la coupe de 5,0
      { t: 7.4, do: 'starDie' }, // le glissando triste (audio.js), juste avant la réponse
    ],
  },

  // Palier 5 — la ceinture. « Chaque lumière est une personne » est LA phrase
  // de service d'image du jeu : après elle, le fleuve n'est plus un effet,
  // c'est un peuple. Le fleuve se tarit juste après « Tous. » — l'image
  // ponctue la phrase, l'absence se remarque parce qu'on vient de la nommer.
  fleuve: {
    id: 'fleuve',
    stage: 4,
    duration: 13,
    show: { star: true, andel: true, river: true },
    shots: [
      {
        id: 'F1', // Plan large : deux cents unités d'arche, caméra à deux cent dix.
        t0: 0,
        t1: 6,
        pos: [-40, 44, 62],
        posTo: [-24, 30, 40],
        look: [-20, -4, -150],
        hfov: 55,
        ease: 'inOutSine',
      },
      {
        id: 'F2', // On suit le fleuve jusqu'à la fente ; il entre, rien ne ressort.
        t0: 6,
        t1: 13,
        pos: [-96, 20, -60],
        posTo: [-52, 12, -92],
        lookFn: (e) => ({ x: -60 + e * 55, y: 0, z: -148 }),
        hfov: 46,
        ease: 'linear',
      },
    ],
    lines: [
      { t: 1, who: 'nova', text: 'Voici la grande arche.' },
      { t: 4.6, who: 'nova', text: 'Chaque lumière est une personne.' },
      { t: 9.2, who: 'nova', text: 'Ils sont tous entrés. Tous.' },
    ],
    beats: [
      // Musique d'espoir sur image sinistre : c'est le mensonge de l'honneur,
      // sans un mot. La bascule au froid tombe après la phrase qui compte.
      { t: 0.1, do: 'padHope' },
      { t: 8.8, do: 'padDark' },
      { t: 11.2, do: 'fleuveTarit' }, // la dernière lumière entre, la fente reste seule
    ],
  },

  // Palier 7 — Saturne. La trahison. La flotte des chefs part enfin VRAIMENT
  // (fleet.launch existait dans elide.js, jamais branché), la couture se scelle
  // sur le beat seal, et « Et ils ont jeté la clé » arme le carton-titre de
  // l'intro (« Rapporte la clé ») : la mission du joueur devient la réponse à
  // cette phrase-là.
  fuite: {
    id: 'fuite',
    stage: 6,
    duration: 14,
    show: { star: true, andel: true, fleet: true },
    shots: [
      {
        id: 'T1', // La petite flotte, cadrée petite, exprès — et elle DÉCOLLE.
        t0: 0,
        t1: 5,
        pos: [70, 16, -20],
        posTo: [86, 22, 6],
        look: [16, 4, -104],
        hfov: 50,
        ease: 'inOutSine',
      },
      {
        id: 'T2', // La couture de trois quarts : on lit la fente ET la longueur
        t0: 5, // de coque qu'elle referme. Le seal tombe à 9,6, puis 1 s de
        t1: 14, // silence avant la dernière phrase — et 0,8 s de couture morte
        pos: [-120, 62, -60], // pour finir.
        posTo: [-92, 48, -84],
        look: [-10, 16, -150],
        hfov: 46,
        ease: 'outCubic',
      },
    ],
    lines: [
      { t: 1, who: 'nova', text: 'L’autre arche, c’était pour les chefs.' },
      { t: 5.6, who: 'nova', text: 'Les chefs sont partis. Sans le peuple.' },
      { t: 10.6, who: 'nova', text: 'Et ils ont jeté la clé.' },
    ],
    beats: [
      // L'accord « tension » — un demi-ton au-dessus, ça serre — sous toute la
      // séquence : la seule des cinq à ne pas mériter le calme du « dark ».
      { t: 0.1, do: 'padTension' },
      { t: 1, do: 'fleetGo' }, // elide.js:launch(), écrit pour ça
      { t: 7.2, do: 'riser' }, // 2,4 s : culmine PILE sur le seal de 9,6
      { t: 9.6, do: 'seal' }, // un choc sourd et un silence, pas une explosion
    ],
  },

  // Palier 10 — l'héliopause. KORN ne s'adresse jamais au joueur : il compte
  // les moteurs dans sa traînée, au passé — et « le quarantième » reste neutre,
  // c'est le moteur qu'il compte. Boucle avec le « numéro 40 » de l'intro : le
  // joueur comprend que KORN parle de LUI sans que personne ne le lui dise.
  lui: {
    id: 'lui',
    stage: 9,
    duration: 14,
    show: { andel: true },
    shots: [
      {
        id: 'L1', // L'arche entière — caméra à ~210 pour 200 unités de long.
        t0: 0,
        t1: 5.5,
        pos: [30, 46, 80],
        posTo: [14, 30, 44],
        look: [0, -4, -150],
        hfov: 58,
        ease: 'inOutSine',
      },
      {
        id: 'L2', // La couture, reconnue — celle de « fuite », et c'est le but.
        t0: 5.5, // 8,5 s tenues, légère dérive à l'épaule : c'est lui qui nous
        t1: 14, // examine. La révélation, l'impact, puis le silence final.
        pos: [-110, 56, -66],
        posTo: [-84, 44, -88],
        look: [-8, 18, -150],
        hfov: 44,
        ease: 'outCubic',
        handheld: 0.15,
      },
    ],
    lines: [
      // Les deux dernières lignes portaient le pire débit de la partition
      // précédente (11,1 et 11,3 car/s) pile sur la révélation : elles sont
      // recalées à 9,1 et 8,9 — les lignes lourdes vont LENTEMENT.
      { t: 1, who: 'korn', text: 'Encore un moteur. Le quarantième.' },
      { t: 5.8, who: 'nova', text: 'Ce n’est pas un vaisseau. C’est l’arche.' },
      { t: 10.2, who: 'nova', text: 'Tous dedans. Depuis dix mille ans.' },
    ],
    beats: [
      { t: 0.1, do: 'padDark' },
      { t: 9.7, do: 'impact' }, // le choc dans le creux, juste avant la dernière ligne
    ],
  },
};

export function souvenirPourPalier(i) {
  return Object.values(SOUVENIRS).find((s) => s.stage === i) || null;
}
