// LA LENTILLE DIVERGENTE — le rayon d'HÉLIOS qui s'ouvre en cône.
//
// La demande portait une contrainte explicite : « avec un angle mesuré quand
// même, faut pas que ça soit cheaté ». C'est donc l'ÉQUILIBRE que ce fichier
// défend, et pas seulement le fonctionnement.
//
// Trois promesses, et aucune ne se lit dans le code :
//
// · Le cône ne gagne sa largeur qu'au LOIN. À bout portant il ne donne rien —
//   donc il ne protège pas des plongeurs, et il ne remplace jamais le fait de
//   bien se placer. C'est une arme de COUVERTURE, pas de puissance.
// · Il se paie. Un rayon qui couvre plus met plus de temps à saturer, exactement
//   comme un rayon large paie déjà sa largeur. Sans ce prix, élargir n'aurait
//   aucun inconvénient et le choix disparaîtrait.
// · CE QU'ON DESSINE EST CE QU'ON BRÛLE. Le trait et la collision se calculent
//   séparément — l'un par une géométrie, l'autre par une formule — et rien
//   n'empêche structurellement les deux de diverger. C'est le défaut le plus
//   probable de tout le fichier, et le seul qui serait invisible en jouant :
//   on brûlerait des ennemis en dehors du trait, ou l'on raterait ceux qui sont
//   dedans.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArmeHelios } from '../src/game/armes/helios.js';
import { UPGRADES } from '../src/game/upgrades.js';
import { Shop } from '../src/game/shop.js';

const NEZ = 11.8;
const arme = () => new ArmeHelios(new THREE.Scene());

// Les niveaux de canons tels que l'arme les connaît, lus sur ses géométries.
const NIVEAUX_CANONS = 3;
const NIVEAUX_CONE = 4;

test('le cône ne donne rien à bout portant', () => {
  // Là où arrivent les plongeurs, la largeur ne bouge pas d'un poil : le module
  // n'achète pas de la sécurité, il achète de la portée latérale.
  const a = arme();
  for (let k = 0; k < NIVEAUX_CONE; k++) {
    const evase = k * 0.45;
    const auNez = a._demiA(NEZ, NEZ, 1.5, evase);
    assert.ok(
      Math.abs(auNez - 1.5) < 0.01,
      `niveau ${k} : la largeur au nez passe à ${auNez.toFixed(2)}`
    );
  }
});

test('le cône s’ouvre en s’éloignant, jamais l’inverse', () => {
  const a = arme();
  let precedent = -Infinity;
  for (const z of [10, 5, 0, -5, -10, -18, -25]) {
    const d = a._demiA(z, NEZ, 1.5, 1.35);
    assert.ok(d >= precedent, `la largeur rétrécit en s’éloignant à z=${z}`);
    precedent = d;
  }
});

test('l’angle reste mesuré', () => {
  // « Faut pas que ça soit cheaté. » Au maximum, le rayon gagne moins de deux
  // degrés de demi-angle : le cône se voit, mais il ne balaie pas l'arène.
  const a = arme();
  const longueur = NEZ - -30;
  const gagne = a._demiA(-30, NEZ, 1.5, 1.35) - 1.5;
  const demiAngle = (Math.atan(gagne / longueur) * 180) / Math.PI;
  assert.ok(demiAngle < 3, `demi-angle de ${demiAngle.toFixed(2)}° : c’est un projecteur`);
  assert.ok(demiAngle > 0.5, `demi-angle de ${demiAngle.toFixed(2)}° : ça ne se verra pas`);
});

test('la couverture gagnée reste inférieure au double', () => {
  // À canons pleins et lentille pleine, à hauteur de formation. Au-delà du
  // double, le rayon couvrirait la moitié d'une rangée d'un coup et la coque
  // deviendrait la meilleure partout — la seule chose qu'on ne veut pas.
  const a = arme();
  const sans = a._demiA(-18, NEZ, 1.5, 0);
  const avec = a._demiA(-18, NEZ, 1.5, 1.35);
  assert.ok(avec / sans < 2, `couverture ×${(avec / sans).toFixed(2)} : c’est trop`);
  assert.ok(avec / sans > 1.3, `couverture ×${(avec / sans).toFixed(2)} : ça ne vaut pas son prix`);
});

test('ce qu’on dessine est exactement ce qu’on brûle', () => {
  // LE DÉFAUT LE PLUS PROBABLE DU FICHIER, et le seul invisible en jouant.
  //
  // Le trait est un tronc de cône : une géométrie qui ne connaît qu'un RAPPORT
  // entre son rayon proche et son rayon lointain. La brûlure, elle, ajoute un
  // nombre d'unités. Les deux doivent tomber sur la même largeur au bout, pour
  // toutes les combinaisons de canons et de lentille — c'est la raison pour
  // laquelle il y a douze géométries et pas quatre.
  const a = arme();
  const DEMI = [0.2, 0.85, 1.5];
  const EVAS = [0, 0.45, 0.9, 1.35];
  for (let c = 0; c < NIVEAUX_CANONS; c++) {
    for (let k = 0; k < NIVEAUX_CONE; k++) {
      const geo = a.tubes[c][k];
      // CylinderGeometry garde ses rayons dans ses paramètres : le haut est le
      // nez, le bas est le loin.
      const rapportDessine = geo.parameters.radiusBottom / geo.parameters.radiusTop;
      const rapportBrule = a._demiA(-30, NEZ, DEMI[c], EVAS[k]) / DEMI[c];
      assert.ok(
        Math.abs(rapportDessine - rapportBrule) < 0.001,
        `canons ${c}, cône ${k} : on dessine ×${rapportDessine.toFixed(3)} et on brûle ×${rapportBrule.toFixed(3)}`
      );
    }
  }
});

test('sans lentille, le rayon reste une colonne', () => {
  // Le comportement d'avant ne doit pas bouger d'un cheveu pour qui n'achète pas
  // le module : c'est la majorité des parties.
  const a = arme();
  for (const z of [10, 0, -18, -30]) {
    assert.equal(a._demiA(z, NEZ, 1.5, 0), 1.5, `z=${z} : la colonne s’est mise à s’ouvrir`);
  }
  assert.equal(a.tubes[2][0].parameters.radiusBottom, a.tubes[2][0].parameters.radiusTop);
});

// --- Le module lui-même -------------------------------------------------------

test('la lentille n’est proposée qu’à HÉLIOS', () => {
  const cone = UPGRADES.find((u) => u.id === 'cone');
  assert.ok(cone, 'le module n’existe pas');
  assert.deepEqual(cone.coques, ['helios'], 'le module ne se limite pas à HÉLIOS');
  // Et c'est le SEUL à être limité : les autres valent pour les trois coques,
  // quitte à s'y traduire différemment.
  const limites = UPGRADES.filter((u) => u.coques);
  assert.deepEqual(
    limites.map((u) => u.id),
    ['cone'],
    'un autre module s’est mis à ne servir qu’à une coque sans qu’on le dise'
  );
});

test('la lentille coûte assez pour être un choix', () => {
  const cone = UPGRADES.find((u) => u.id === 'cone');
  const canons = UPGRADES.find((u) => u.id === 'cannons');
  // Moins cher que les canons — elle donne moins — mais pas au point d'être
  // achetée par réflexe au premier hangar.
  assert.ok(cone.basePrice < canons.basePrice, 'la lentille coûte plus cher que les canons');
  assert.ok(cone.basePrice > 100, 'la lentille est achetée sans y penser');
  assert.equal(cone.maxLevel, 3);
});

test('la boutique n’offre jamais la lentille à une autre coque', () => {
  // CE QUE LA DONNÉE DIT NE SUFFIT PAS : encore faut-il que la boutique le lise.
  // Elle ne le lisait pas. Le filtre existait dans le tirage des modules de survie
  // et pas dans le hangar, et la carte est apparue en jeu, à la deuxième place,
  // sur une partie ORION. L'épreuve d'à côté vérifiait la fiche du module ; elle
  // n'aurait jamais vu ça.
  const shop = new Shop(null, {});
  const etat = (coque) => ({ credits: 9999, levels: {}, wave: 5, lives: 3, coque });

  for (const coque of ['orion', 'vulcain']) {
    const ids = shop._eligible(etat(coque)).map((o) => o.id);
    assert.ok(!ids.includes('cone'), `la lentille est proposée à ${coque.toUpperCase()}`);
  }
  const ids = shop._eligible(etat('helios')).map((o) => o.id);
  assert.ok(ids.includes('cone'), 'la lentille n’est plus proposée à HÉLIOS');
});

test('les modules communs restent proposés aux trois coques', () => {
  // Le filtre ne doit toucher QUE ce qui porte une restriction.
  const shop = new Shop(null, {});
  const communs = UPGRADES.filter((u) => !u.coques).map((u) => u.id);
  for (const coque of ['orion', 'helios', 'vulcain']) {
    const ids = shop
      ._eligible({ credits: 9999, levels: {}, wave: 5, lives: 3, coque })
      .map((o) => o.id);
    for (const id of communs) {
      assert.ok(ids.includes(id), `${id} a disparu pour ${coque}`);
    }
  }
});
