// LES ESCALES. Le détour mène QUELQUE PART.
//
// Le reproche est venu tel quel : « c'est trop redondant l'espace ». Il est
// fondé. Onze secteurs se suivaient, et d'un bout à l'autre du voyage on
// combattait dans le même vide — seuls la couleur du fond et l'astre au loin
// changeaient. Or le jeu demandait au joueur, tous les trois paliers, de choisir
// entre la route directe et un DÉTOUR : aller voir ailleurs. Et « ailleurs »
// ressemblait exactement à « ici ».
//
// Le détour dépose donc maintenant le vaisseau dans un lieu, et on s'y bat : la
// surface d'une planète en rase-mottes, la nappe d'anneaux d'une géante, un champ
// de débris. Une seule vague — c'est une escale, pas un secteur —, puis on
// repart. Ce qu'on va chercher au bout du détour se voit désormais avant même
// d'avoir ramassé quoi que ce soit.
//
// Le lieu DÉCOULE du secteur, il ne s'y superpose pas au hasard : on ne se pose
// pas sur une géante gazeuse, et il n'y a pas d'anneaux à traverser dans le vide
// interstellaire. Chaque secteur déclare donc ce qu'il a à offrir, et le tirage
// se fait là-dedans.

// Ce que chaque type de lieu impose à la scène.
//
// Une escale est TOUJOURS plus fermée que le vide qu'elle remplace : on est dans
// quelque chose, donc le brouillard monte et les nébuleuses lointaines
// disparaissent — les voir à travers un sol serait absurde.
const LIEUX = {
  surface: {
    landmark: 'surface',
    fog: 2.1,
    // Le sol renvoie la lumière : c'est la seule escale où le bas de l'image
    // s'éclaircit, et c'est ce qui la rend reconnaissable en un dixième de seconde.
    hemi: 1.5,
    exposure: 1.06,
  },
  anneaux: {
    landmark: 'anneaux',
    fog: 1.6,
    hemi: 1.15,
    exposure: 1.02,
  },
  champ: {
    landmark: 'champ',
    fog: 1.35,
    // Un champ de cailloux est SOMBRE : rien n'y renvoie la lumière, et c'est ce
    // qui doit rendre les masses inquiétantes plutôt que décoratives.
    hemi: 0.78,
    exposure: 0.94,
  },
};

// Ce que chaque secteur peut offrir : le type de lieu, la couleur de sa matière,
// son nom et sa légende.
//
// Chaque escale porte un nom PROPRE, et pas « Surface de <secteur> » fabriqué à
// la volée : on ne se pose pas sur Jupiter mais sur Europe, et « Le cimetière de
// L2 » dit en trois mots ce qu'aucune formule générique ne dirait. C'est ce nom
// que le joueur voit s'afficher en arrivant, et c'est lui qui doit donner envie
// d'avoir pris le détour.
//
// La teinte est celle de la MATIÈRE du lieu, pas du ciel : la rouille de Mars, la
// glace sale de Saturne, le charbon des corps de Kuiper. C'est elle qui fait que
// deux escales du même type, à deux endroits du voyage, ne se ressemblent pas.
const PAR_SECTEUR = {
  terre: [['surface', 0x4f7a52, 'Rase-mottes', 'Haute atmosphère']],
  lagrange: [['champ', 0x8c8c94, 'Le cimetière de L2', 'Ce qu’on y a laissé']],
  transit: [['champ', 0x5f5a52, 'Débris de croisière', 'Personne ne les a ramassés']],
  mars: [
    ['surface', 0xb0603a, 'Valles Marineris', 'Quatre mille kilomètres de faille'],
    ['champ', 0x7a5a48, 'Poussières de Mars', 'Ce que la planète a perdu'],
  ],
  ceinture: [['champ', 0x6b5a48, 'Au cœur de la Ceinture', 'Densité maximale']],
  jupiter: [
    ['anneaux', 0xc09060, 'L’anneau de Jupiter', 'Si fin qu’on le croyait absent'],
    ['surface', 0xcfae86, 'Europe', 'Sous la glace, un océan'],
  ],
  saturne: [['anneaux', 0xd8c49a, 'Division de Cassini', 'Traversée du plan']],
  neptune: [
    ['anneaux', 0x7fa8c8, 'Les arcs de Neptune', 'Des anneaux incomplets'],
    ['surface', 0x8fb8d8, 'Triton', 'Les geysers d’azote'],
  ],
  kuiper: [
    ['champ', 0x5c5c68, 'Ceinture de Kuiper', 'Le dernier vrai peuplement'],
    ['surface', 0x9fb4c4, 'Arrokoth', 'Deux mondes collés'],
  ],
  heliopause: [['champ', 0x565c6b, 'Le choc terminal', 'Là où le vent s’arrête']],
  interstellaire: [['champ', 0x4c4c58, 'Épave sans nom', 'Elle n’est sur aucune carte']],
};

export const A_UNE_ESCALE = (stageId) => (PAR_SECTEUR[stageId] || []).length > 0;

// Le lieu où mène le détour vers ce secteur. `tirage` est un entier déjà dérivé
// de la graine de la partie : le lieu est donc REJOUABLE, et deux parties de même
// graine passent par les mêmes escales.
export function escalePourSecteur(stage, tirage = 0) {
  const offres = PAR_SECTEUR[stage.id];
  if (!offres || !offres.length) return null;
  const [type, teinte, nom, legende] = offres[Math.abs(tirage) % offres.length];
  const lieu = LIEUX[type];

  return {
    // L'identifiant porte le secteur : `setBiome` ne rebâtit la scène que si
    // l'identifiant change, et deux escales du même type à deux endroits
    // différents du voyage doivent bien être deux lieux différents.
    id: `escale-${type}-${stage.id}`,
    escale: type,
    name: nom,
    sub: legende,
    sun: stage.sun,
    bg: stage.bg,
    fog: { color: stage.fog.color, density: stage.fog.density * lieu.fog },
    star: { color: stage.star.color, opacity: stage.star.opacity.map((o) => o * 0.5) },
    hemi: {
      sky: stage.hemi.sky,
      ground: teinte, // le sol renvoie sa propre couleur vers le vaisseau
      // UN PLANCHER, et c'est la seule entorse à « l'escale hérite du secteur ».
      //
      // Les derniers paliers sont très sombres — 0,32 à l'interstellaire, contre
      // 1,35 en orbite terrestre — parce qu'il n'y a plus de soleil pour les
      // éclairer. La règle est juste pour du vide : on ne voit rien parce qu'il
      // n'y a rien. Appliquée telle quelle à une escale, elle produit un lieu
      // qu'on a fait le détour d'aller voir et qu'on ne voit pas. Or une escale
      // existe précisément pour être vue.
      //
      // On admet donc qu'il y a de quoi s'éclairer là où l'on se pose — les
      // projecteurs du vaisseau, la glace qui renvoie, peu importe : c'est le
      // genre de licence que le joueur ne remarquera jamais, et son absence, si.
      intensity: Math.max(0.62, stage.hemi.intensity * lieu.hemi),
    },
    rim: stage.rim,
    exposure: stage.exposure * lieu.exposure,
    // Aucune nébuleuse : elles sont peintes à l'infini, et on ne voit pas
    // l'infini quand on rase un sol.
    nebulas: [],
    landmark: [{ id: lieu.landmark, teinte, seed: (Math.abs(tirage) % 997) + 1 }],
  };
}
