// L'ÉCONOMIE, ET L'ÉQUIPEMENT DE L'ENTRAÎNEMENT.
//
// Les prix ont été calibrés par une mesure — deux achats et demi par niveau — et
// cette mesure ne se refait pas à chaque modification. Ce qui suit ne rejoue pas
// la mesure : il garde les propriétés dont elle dépend, celles qu'un réglage
// futur casserait sans le dire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES,
  priceOf,
  emptyLevels,
  computeStats,
  equipementPourVague,
  niveauxPourPart,
} from '../src/game/upgrades.js';
import { PLAYER } from '../src/game/constants.js';

test('un module coûte de plus en plus cher à chaque palier', () => {
  for (const u of UPGRADES) {
    for (let n = 1; n < u.maxLevel; n++) {
      assert.ok(
        priceOf(u, n) > priceOf(u, n - 1),
        `${u.name} : le palier ${n} ne coûte pas plus que le précédent`
      );
    }
  }
});

test('le premier hangar est atteignable', () => {
  // La vague 1 rapporte une quarantaine de crédits. Si le module le moins cher
  // passe au-dessus, le tout premier passage en boutique se fait les mains vides
  // — et c'est celui qui donne le ton de la partie.
  const moinsCher = Math.min(...UPGRADES.map((u) => priceOf(u, 0)));
  assert.ok(moinsCher <= 40, `le module le moins cher coûte ${moinsCher}, hors de portée vague 1`);
});

test('la panoplie de l’entraînement va du vaisseau nu au maximum', () => {
  const nu = niveauxPourPart(0);
  assert.deepEqual(nu, emptyLevels(), 'à zéro pour cent, le vaisseau doit être nu');

  const plein = niveauxPourPart(1);
  for (const u of UPGRADES) {
    assert.equal(plein[u.id], u.maxLevel, `${u.name} n'est pas au maximum à cent pour cent`);
  }
});

test('la panoplie ne recule jamais quand la part monte', () => {
  let total = -1;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const n = niveauxPourPart(p);
    const somme = Object.values(n).reduce((a, b) => a + b, 0);
    assert.ok(somme >= total, `à ${Math.round(p * 100)} % la panoplie a rétréci`);
    total = somme;
  }
});

test('l’équipement conseillé suit la vague et se plafonne', () => {
  assert.equal(equipementPourVague(1), 0, 'la vague 1 part nue');
  let precedent = -1;
  for (let v = 1; v <= 40; v++) {
    const p = equipementPourVague(v);
    assert.ok(p >= precedent, `vague ${v} : l'équipement conseillé a reculé`);
    assert.ok(p <= 1, `vague ${v} : plus de cent pour cent`);
    precedent = p;
  }
  assert.equal(equipementPourVague(40), 1, 'vers la fin, tout devrait être acheté');
});

test('les statistiques montent avec les niveaux, sans surprise', () => {
  const nu = computeStats(emptyLevels(), 0);
  const plein = computeStats(niveauxPourPart(1), 0);
  assert.ok(plein.speed > nu.speed, 'les propulseurs ne font plus rien');
  assert.ok(plein.fireRate > nu.fireRate, 'le surcadenceur ne fait plus rien');
  // La cadence maximale reste dans un ordre de grandeur connu : au-delà, ce n'est
  // plus un tir mais un mur, et l'équilibrage de la vague ne tient plus.
  assert.ok(plein.fireRate / nu.fireRate < 3.2, 'la cadence a plus que triplé');
});

test('la Coque renforcée ne dépasse pas le nombre de vies permis', () => {
  const hull = UPGRADES.find((u) => u.id === 'hull');
  assert.equal(
    PLAYER.baseLives + hull.maxLevel,
    PLAYER.maxLives,
    'le module donne plus de vies que le plafond du jeu'
  );
});
