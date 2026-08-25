// Le hasard de la SIMULATION, et lui seul.
//
// Tout ce qui décide de l'issue d'une partie — quel ennemi plonge, où part une
// balle, si une grosse pièce tombe — passe par ce générateur. Il est semé au début
// de chaque vague, donc reproductible : c'est la condition sans laquelle un replay
// n'existe pas. Rejouer les mêmes commandes ne redonne la même partie que si le
// hasard, lui aussi, se répète.
//
// Ce qui n'a AUCUN effet sur l'issue — les étincelles, le clignement des yeux d'un
// visage, le choix d'une réplique, le grain d'un son — continue d'utiliser
// Math.random. Deux lectures d'un même replay ne feront donc pas exactement les
// mêmes étincelles, et c'est très bien : la contrainte de déterminisme coûte cher,
// on ne la paie que là où elle achète quelque chose.

// mulberry32 : rapide, une seule variable d'état, distribution correcte. Suffisant
// pour un jeu — ce n'est pas de la cryptographie.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let tirage = mulberry32(1);
let graine = 1;
// Combien de fois on a puisé depuis le dernier semis. Sert à VÉRIFIER qu'un replay
// consomme exactement le même hasard que la partie : deux simulations qui n'ont pas
// tiré le même nombre de fois ne racontent déjà plus la même histoire.
let puises = 0;

// Semer redémarre la suite à l'identique. Appelé au début de chaque vague avec une
// graine dérivée de celle de la partie : une vague qui repart d'un même état rejoue
// exactement le même hasard, ce qui empêche une erreur d'arrondi de se propager
// d'une vague à l'autre pendant un replay.
export function semer(seed) {
  graine = seed >>> 0;
  tirage = mulberry32(graine);
  puises = 0;
}

export function tirages() {
  return puises;
}

export function graineCourante() {
  return graine;
}

export function alea() {
  puises++;
  return tirage();
}

// Dans [lo, hi[.
export function entre(lo, hi) {
  puises++;
  return lo + tirage() * (hi - lo);
}

// Dans [-amplitude, +amplitude[ — la forme la plus fréquente dans le jeu.
export function ecart(amplitude) {
  puises++;
  return (tirage() - 0.5) * 2 * amplitude;
}
