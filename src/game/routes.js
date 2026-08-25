// Le choix de trajectoire, à chaque fin de palier.
//
// Le jeu n'offrait aucune décision entre deux vagues : on encaissait des crédits
// et on rouvrait la même boutique. Ici, tous les trois combats, le joueur choisit
// par où il passe — et les deux routes ne donnent PAS la même chose.
//
//   La route DIRECTE  paie en crédits et en matériel. On s'équipe.
//   La route LONGUE   rapporte un FRAGMENT de l'épave élide. On comprend.
//
// Le fragment n'est pas un objet de collection : il fait deux choses à la fois. Il
// ouvre un souvenir — donc un morceau de l'histoire — et il compte pour l'évolution
// de la coque : trois fragments font passer au palier II, sept au palier III.
//
// C'est donc un vrai dilemme, et il est le même que celui du scénario : s'équiper
// ou comprendre. Un joueur qui prend toujours au plus court finit riche et en
// palier I ; celui qui prend toujours au long finit pauvre et en palier III. Les
// deux se jouent, et ne se ressemblent pas.
//
// Le risque est ce qui empêche la route longue d'être un choix gratuit : elle
// applique un modificateur au palier suivant. On ne paie pas la connaissance en
// crédits, on la paie en difficulté.

import { STAGES } from './space/biomes.js';

const DIRECTE = [
  {
    nom: 'Couloir balisé',
    desc: 'La route que tout le monde emprunte. Rien à voir, rien à craindre.',
  },
  {
    nom: 'Transfert court',
    desc: 'Poussée minimale, cap direct. On économise le carburant et le reste.',
  },
  { nom: 'Sillage dégagé', desc: 'Le passage a déjà été nettoyé. Par qui, on ne sait pas.' },
  { nom: 'Approche basse', desc: 'On rase le plan de l’écliptique. Personne ne regarde par là.' },
];

const LONGUE = [
  {
    nom: 'Écho de coque',
    desc: 'Un signal métallique, faible, à l’écart de la route. Élide, sans doute.',
  },
  {
    nom: 'Champ de dérive',
    desc: 'Des débris qui ne dérivent pas dans le bon sens. Quelque chose les retient.',
  },
  {
    nom: 'Relais muet',
    desc: 'Une balise qui répond encore, dix mille ans après. Il faut aller la chercher.',
  },
  {
    nom: 'Ombre longue',
    desc: 'Un corps assez gros pour faire de l’ombre. Il n’est sur aucune carte.',
  },
];

// Les modificateurs de risque. Ils portent tous sur la vague SUIVANTE, jamais sur
// celle en cours : un choix doit se payer après, pour qu'on ait le temps de le
// regretter.
const RISQUES = [
  { id: 'dense', label: 'Formation dense', mods: { hp: 1.15 } },
  { id: 'nerveux', label: 'Tirs plus nourris', mods: { fire: 1.2 } },
  { id: 'piques', label: 'Piqués plus fréquents', mods: { dive: 1.25 } },
];

function pick(list, seed) {
  return list[Math.abs(seed) % list.length];
}

// Génère les deux options d'un palier. Déterministe : deux joueurs qui comparent
// leurs parties ont eu le même choix au même moment, ce qui rend la comparaison
// honnête — c'est tout l'intérêt du classement.
export function routesForStage(stageIdx, seed = 0) {
  const s = stageIdx * 7919 + seed;
  const dest = STAGES[Math.min(stageIdx + 1, STAGES.length - 1)];
  const risque = pick(RISQUES, s + 3);
  const credits = 90 + stageIdx * 45;

  return {
    destination: dest,
    courte: {
      ...pick(DIRECTE, s),
      type: 'courte',
      gain: `+${credits} crédits`,
      credits,
      fragment: false,
      risque: null,
    },
    longue: {
      ...pick(LONGUE, s + 1),
      type: 'longue',
      gain: 'Un fragment du Registre',
      credits: Math.round(credits * 0.35),
      fragment: true,
      risque,
    },
  };
}

// Paliers de coque. Ils ne s'achètent pas : ils se méritent en allant voir.
export const PALIERS_COQUE = [0, 3, 7];

export function palierDeCoque(fragments) {
  let p = 0;
  for (let i = 0; i < PALIERS_COQUE.length; i++) if (fragments >= PALIERS_COQUE[i]) p = i;
  return p;
}

export function fragmentsAvantPalierSuivant(fragments) {
  const suivant = PALIERS_COQUE.find((n) => n > fragments);
  return suivant == null ? null : suivant - fragments;
}
