// LA COMMANDE, ET SON ARRONDI.
//
// Tout le jeu en réseau et tout le rejeu reposent sur une seule promesse : deux
// machines qui appliquent la même commande calculent la même image. Cette
// promesse tient à la QUANTIFICATION — les valeurs sont arrondies à la source,
// donc identiques des deux côtés.
//
// Si un jour quelqu'un ajoute un champ à la commande sans l'arrondir, ou l'oublie
// dans la mise à plat pour le réseau, rien ne plantera : les parties à deux
// divergeront simplement, en silence, quelques secondes après le décollage. C'est
// exactement le genre de bogue que ces épreuves attrapent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commandeVide,
  commandeVersTableau,
  tableauVersCommande,
  quantifieDt,
  dtDepuis,
  quantifiePos,
  posDepuis,
  EV,
} from '../src/game/rejeu/commandes.js';

test('la mise à plat pour le réseau ne perd aucun champ', () => {
  const c = commandeVide();
  const champs = Object.keys(c);
  const plat = commandeVersTableau(c);
  assert.equal(
    plat.length,
    champs.length,
    `la commande a ${champs.length} champs mais le tableau en porte ${plat.length} — ` +
      `un champ ajouté sans être mis à plat fait diverger les parties à deux, en silence`
  );
});

test('une commande fait l’aller-retour sans rien perdre', () => {
  const c = commandeVide();
  Object.assign(c, {
    dt: dtDepuis(quantifieDt(1 / 60)),
    echelle: 1,
    dx: -1,
    dz: 1,
    vise: true,
    ax: posDepuis(quantifiePos(7.3)),
    az: posDepuis(quantifiePos(-2.9)),
    tir: true,
    ev: EV.PIROUETTE_DROITE,
  });
  const revenue = tableauVersCommande(commandeVersTableau(c), commandeVide());
  assert.deepEqual(revenue, c, 'la commande revenue du réseau diffère de celle qui est partie');
});

test('un tableau tronqué ne casse rien', () => {
  // Un pair plus vieux, un paquet abîmé : on garde la commande précédente plutôt
  // que d'appliquer n'importe quoi.
  const avant = commandeVide();
  avant.dx = 1;
  const apres = tableauVersCommande([1, 2], avant);
  assert.equal(apres.dx, 1, 'un tableau trop court ne doit pas écraser la commande');
  assert.equal(tableauVersCommande(null, avant), avant);
});

test('l’arrondi est idempotent : arrondir deux fois ne change rien', () => {
  // C'est la propriété qui fait tenir tout l'édifice. Sans elle, un client qui
  // arrondit une valeur déjà arrondie obtiendrait autre chose que son pair.
  for (const v of [1 / 60, 1 / 120, 0.0166, 0.02, 0.008]) {
    const une = dtDepuis(quantifieDt(v));
    const deux = dtDepuis(quantifieDt(une));
    assert.equal(deux, une, `le pas de temps ${v} n'est pas stable à l'arrondi`);
  }
  for (const v of [0, 7.3, -14.4, 13.999, -0.001]) {
    const une = posDepuis(quantifiePos(v));
    const deux = posDepuis(quantifiePos(une));
    assert.equal(deux, une, `la position ${v} n'est pas stable à l'arrondi`);
  }
});

test('les positions extrêmes restent dans les bornes', () => {
  // Une valeur aberrante venue du réseau ne doit pas téléporter un vaisseau hors
  // de l'arène ni faire déborder l'entier qui la transporte.
  for (const v of [1e9, -1e9, Infinity, -Infinity]) {
    const q = quantifiePos(v);
    assert.ok(Number.isFinite(q), `la position ${v} produit une valeur non finie`);
    assert.ok(Math.abs(posDepuis(q)) < 100, `la position ${v} sort de l'arène`);
  }
});
