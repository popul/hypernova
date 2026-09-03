// L'ENCLUME — VULCAIN tire quand il s'arrête.
//
// La demande était explicite : « je préfère avoir un gameplay où je n'ai pas
// besoin d'appuyer pour tirer ». Il n'y a donc pas de détente, et il ne doit pas
// y en avoir : c'est la VITESSE du vaisseau qui ouvre le lanceur. Ce fichier
// défend ce contrat, et surtout les trois choses qui le rendraient injouable si
// elles cassaient en silence :
//
// · UN DEMI-TOUR N'EST PAS UNE POSE. La vitesse passe par zéro quand on change de
//   direction. Sans le calage, le ventre se viderait à chaque coup de manche et
//   la coque n'aurait plus de mécanique du tout — elle tirerait tout le temps.
// · CELUI QUI NE S'ARRÊTE JAMAIS TIRE QUAND MÊME. C'est un jeu pour un enfant de
//   douze ans : ne pas comprendre la règle doit rendre médiocre, jamais inerte.
// · UNE CHARGE À LA FOIS, TOUJOURS. L'éventail latéral de `cannons` faisait de
//   VULCAIN un ORION lent, et il consommait autant de tirages semés qu'il posait
//   de missiles — donc le hasard commun de deux machines dépendait des ACHATS de
//   chacune. C'est la seule des trois qui casse une partie en réseau.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArmeVulcain } from '../src/game/armes/vulcain.js';
import { UPGRADES, computeStats, emptyLevels } from '../src/game/upgrades.js';
import { fluxDe } from '../src/game/player.js';

const SEUIL_POSE = 3;
const CALAGE = 0.12;
const DT = 1 / 60;

// Un jeu de laboratoire : juste ce que la forge lit. Les ennemis sont posés au
// même endroit que dans le jeu — devant le vaisseau, dans la veille.
function banc({ vx = 0, vz = 0, ennemis = 1, levels = {} } = {}) {
  const vaisseau = {
    vx,
    vz,
    position: new THREE.Vector3(0, 0, 0),
  };
  const liste = [];
  for (let i = 0; i < ennemis; i++) {
    liste.push({
      alive: true,
      type: 'drone',
      def: { radius: 0.8 },
      group: { position: new THREE.Vector3(i * 2.35, 0, -8) },
    });
  }
  const jeu = {
    levels,
    odTimer: 0,
    numero: 0,
    enemies: { list: liste, damage: () => false },
    fx: { burst() {}, shockwave() {}, addShake() {} },
    audio: {},
    characters: { teachOnce() {} },
    _vaisseauDu: () => vaisseau,
    _addEnergy() {},
    _onEnemyKilled() {},
  };
  return { jeu, vaisseau };
}

const arme = () => new ArmeVulcain(new THREE.Scene());
const enVol = (a) => a.charges.filter((c) => c.active).length;

// COMPTER LES DÉPARTS, ET NON LES MISSILES EN VOL. Un missile qui rencontre une
// coque détone et quitte la liste au bout d'une seconde de montée : compter ce
// qui vole, c'est compter ce qui n'a pas encore touché, ce qui n'est pas la
// question. Le premier jet de ce fichier faisait cette erreur et rendait zéro là
// où la forge avait sorti neuf charges.
function compteur(a) {
  const vrai = a._pose.bind(a);
  const c = { poses: 0 };
  a._pose = (...args) => {
    c.poses++;
    return vrai(...args);
  };
  return c;
}

// Fait tourner la forge assez longtemps pour remplir le ventre, en gardant le
// vaisseau EN MOUVEMENT — donc sans que rien ne sorte.
// CE QU'UN SEUL ARRÊT CRACHE, et rien d'autre. Sans ça, la forge rend une charge
// au bout de 1,7 s et le tapis n'a plus de fin nette : la mesure dépendrait de la
// durée choisie pour la boucle, ce qui n'est pas une mesure.
function eteintLaForge(a) {
  a.tProduction = 1e9;
}

function remplit(a, jeu, vaisseau, capacite) {
  vaisseau.vx = 12;
  for (let i = 0; i < 60 * 20 && a.reserve < capacite; i++) a.update(DT, jeu);
  assert.equal(a.reserve, capacite, 'le ventre ne s’est pas rempli en vingt secondes');
}

test('en mouvement, la forge remplit et ne tire pas', () => {
  const a = arme();
  const c = compteur(a);
  const { jeu } = banc({ vx: 12 });
  // Huit secondes : une charge toutes les 1,7 s en donne quatre, et la cinquième
  // n'arrive qu'à 8,5 — donc le ventre n'a pas encore débordé et rien ne doit
  // avoir de raison de sortir.
  for (let i = 0; i < 60 * 8; i++) a.update(DT, jeu);
  assert.equal(a.reserve, 4, `le ventre contient ${a.reserve} charges au lieu de quatre`);
  assert.equal(c.poses, 0, 'une charge est partie alors que le vaisseau roulait à 12 u/s');
});

test('à l’arrêt, tout le ventre part', () => {
  const a = arme();
  const { jeu, vaisseau } = banc();
  remplit(a, jeu, vaisseau, 5);
  eteintLaForge(a);
  const c = compteur(a);
  vaisseau.vx = 0;
  // Cinq charges à 0,22 s d'intervalle, plus le calage : une seconde et demie.
  for (let i = 0; i < 60 * 1.5; i++) a.update(DT, jeu);
  assert.equal(a.reserve, 0, 'le ventre ne s’est pas vidé à l’arrêt');
  assert.equal(c.poses, 5, `${c.poses} charges sorties au lieu de cinq`);
});

test('le calage : un demi-tour ne déclenche pas le lanceur', () => {
  // LE DÉFAUT QUE CETTE ÉPREUVE EXISTE POUR ATTRAPER. Sans le calage, la seule
  // image où la vitesse passe par zéro suffirait à ouvrir le lanceur — et comme
  // on change de direction sans arrêt, la coque tirerait en permanence.
  const a = arme();
  const { jeu, vaisseau } = banc();
  remplit(a, jeu, vaisseau, 5);
  // Deux images sous le seuil, comme un vrai demi-tour, puis on repart.
  for (const v of [12, 8, 2, -1, -8, -12, -12, -12]) {
    vaisseau.vx = v;
    a.update(DT, jeu);
  }
  assert.equal(enVol(a), 0, 'le demi-tour a fait partir une charge');
});

test('le seuil de pose est bien celui qu’on annonce', () => {
  const a = arme();
  const { jeu, vaisseau } = banc();
  remplit(a, jeu, vaisseau, 5);
  // Juste au-dessus du seuil : on dérive, on ne se pose pas.
  vaisseau.vx = SEUIL_POSE + 0.5;
  for (let i = 0; i < 60; i++) a.update(DT, jeu);
  assert.equal(enVol(a), 0, 'la coque a tiré alors qu’elle dérivait au-dessus du seuil');
  // Juste en dessous : elle est posée.
  vaisseau.vx = SEUIL_POSE - 0.5;
  for (let i = 0; i < 60; i++) a.update(DT, jeu);
  assert.ok(enVol(a) > 0, 'la coque n’a pas tiré alors qu’elle était sous le seuil');
});

test('celui qui ne s’arrête jamais tire quand même, mais mal', () => {
  // Le filet. À ventre plein, la forge ne peut plus rien contenir : ce qu'elle
  // fait sort par le tube, en marche ou non. Une charge par intervalle de forge,
  // là où un pilote posé en sort une toutes les 0,22 s.
  const a = arme();
  const c = compteur(a);
  const { jeu } = banc({ vx: 12 });
  for (let i = 0; i < 60 * 20; i++) a.update(DT, jeu);
  // Le ventre est plein à 8,5 s ; ensuite une charge déborde à chaque tour de
  // forge. Six en vingt secondes, là où un pilote posé en sort cinq en une.
  assert.ok(c.poses >= 5, `seulement ${c.poses} charges sorties : le joueur nerveux est inerte`);
  assert.ok(c.poses <= 7, `${c.poses} charges sorties : le trop-plein tire trop`);
  assert.equal(a.reserve, 5, 'le trop-plein a puisé dans le ventre au lieu de sortir seul');
});

test('sous un ciel vide, se poser ne gâche pas le ventre', () => {
  const a = arme();
  const { jeu, vaisseau } = banc({ ennemis: 0 });
  remplit(a, jeu, vaisseau, 5);
  const c = compteur(a);
  vaisseau.vx = 0;
  for (let i = 0; i < 60 * 3; i++) a.update(DT, jeu);
  assert.equal(a.reserve, 5, 'le ventre s’est vidé dans le vide');
  assert.equal(c.poses, 0, 'une charge est partie sous un ciel vide');
});

test('une charge à la fois, quel que soit le niveau de canons', () => {
  // L'ÉVENTAIL EST MORT. C'est ce qui faisait de VULCAIN un ORION lent, et c'est
  // aussi ce qui liait le nombre de tirages semés aux achats de chacun.
  for (const cannons of [0, 1, 2]) {
    const a = arme();
    const { jeu, vaisseau } = banc({ levels: { cannons } });
    const capacite = a._capacite(jeu);
    remplit(a, jeu, vaisseau, capacite);
    vaisseau.vx = 0;
    // Juste après le calage et la toute première sortie.
    for (let i = 0; i < Math.ceil((CALAGE + 0.01) / DT); i++) a.update(DT, jeu);
    assert.equal(enVol(a), 1, `niveau ${cannons} : ${enVol(a)} charges pour une seule sortie`);
    assert.equal(
      a.reserve,
      capacite - 1,
      `niveau ${cannons} : le ventre a perdu plus d’une charge`
    );
  }
});

test('les canons achètent la contenance, et le ventre a de quoi la montrer', () => {
  const a = arme();
  assert.equal(a._capacite({ levels: { cannons: 0 } }), 5);
  assert.equal(a._capacite({ levels: { cannons: 1 } }), 7);
  assert.equal(a._capacite({ levels: { cannons: 2 } }), 9);
  // La coque taille ses braises une fois pour toutes : il en faut autant que la
  // contenance maximale ACHETABLE, sinon le dernier niveau ne se voit pas.
  const max = UPGRADES.find((u) => u.id === 'cannons').maxLevel;
  assert.equal(
    a.braises.length,
    a._capacite({ levels: { cannons: max } }),
    'le ventre n’a pas autant de braises que de charges achetables'
  );
});

test('le ventre plein tire plus longtemps quand on a payé pour', () => {
  // Ce que l'achat donne VRAIMENT : un tapis plus long pour un même arrêt.
  const longueurs = [0, 2].map((cannons) => {
    const a = arme();
    const { jeu, vaisseau } = banc({ levels: { cannons } });
    remplit(a, jeu, vaisseau, a._capacite(jeu));
    eteintLaForge(a);
    const c = compteur(a);
    vaisseau.vx = 0;
    // Trois secondes : neuf charges à 0,22 s tiennent largement dedans.
    for (let i = 0; i < 60 * 3; i++) a.update(DT, jeu);
    return c.poses;
  });
  assert.equal(longueurs[0], 5);
  assert.equal(longueurs[1], 9);
});

test('l’instantané rend le pied et le trop-plein', () => {
  // Le calage vaut jusqu'à douze centièmes de tir : une vague restaurée pied levé
  // rendrait une charge à celui qui était déjà posé, et les deux machines ne
  // poseraient pas leurs missiles à la même image.
  const a = arme();
  const { jeu, vaisseau } = banc();
  remplit(a, jeu, vaisseau, 5);
  vaisseau.vx = 0;
  for (let i = 0; i < 20; i++) a.update(DT, jeu);
  const photo = a.instantane();

  const b = arme();
  b.restaure(photo);
  assert.equal(b.reserve, a.reserve, 'la réserve n’est pas revenue');
  assert.ok(Math.abs(b.tCalage - a.tCalage) < 1e-9, 'le calage n’est pas revenu');
  assert.equal(b.trop, a.trop, 'le trop-plein n’est pas revenu');
  assert.equal(enVol(b), enVol(a), 'les missiles en vol ne sont pas revenus');
});

test('deux forges identiques puisent le même nombre de tirages', () => {
  // Le vrai risque en réseau. Deux postes avec des ACHATS différents doivent
  // sortir le même nombre de missiles pour un même arrêt — un seul — sans quoi
  // le générateur semé se décale et tout le hasard commun décroche.
  const sorties = [0, 2].map((cannons) => {
    const a = arme();
    const { jeu, vaisseau } = banc({ levels: { cannons } });
    a.reserve = 3;
    vaisseau.vx = 0;
    for (let i = 0; i < Math.ceil((CALAGE + 0.01) / DT); i++) a.update(DT, jeu);
    return enVol(a);
  });
  assert.deepEqual(sorties, [1, 1], 'le nombre de missiles dépend encore des achats');
});

test('le canon de VULCAIN ne double jamais ses flux', () => {
  // LE DÉFAUT QUE CETTE ÉPREUVE EXISTE POUR ATTRAPER, et il avait déjà été livré
  // une fois. On avait retiré l'éventail au LANCEUR sans le retirer au CANON :
  // « Canons jumelés » continuait donc de faire sortir trois traits cyan
  // parallèles du nez de VULCAIN — c'est-à-dire ORION, sur la seule de ses armes
  // qui lui ressemblait déjà. Le module ne doit plus rien lui donner d'autre que
  // la contenance de son ventre.
  for (const cannons of [0, 1, 2]) {
    const stats = computeStats({ ...emptyLevels(), cannons }, 0);
    assert.equal(stats.streams, 1 + cannons, 'la statistique elle-même a changé');
    assert.equal(
      fluxDe('vulcain', stats),
      1,
      `VULCAIN sort ${fluxDe('vulcain', stats)} flux au niveau ${cannons}`
    );
    // ORION, lui, garde son module intact : la règle est une exception, pas une
    // suppression.
    assert.equal(
      fluxDe('orion', stats),
      1 + cannons,
      `ORION a perdu son module au niveau ${cannons}`
    );
  }
});
