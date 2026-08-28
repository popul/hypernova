// LE CADRAGE, ET LES BORDS QU'IL FAUT POUVOIR ATTEINDRE.
//
// L'arène boucle : on sort par la gauche, on rentre par la droite. C'est une des
// manœuvres qui sauvent une vie, et elle demande de piloter JUSQU'AU BORD.
//
// Le serrage du portrait l'avait rendue impraticable. Il avait été introduit pour
// une bonne raison — sur un téléphone tenu droit, quarante pour cent de l'écran
// partaient en vide latéral pendant que le vaisseau se réduisait d'autant — mais
// il reculait moins la caméra, et les bords de l'arène sortaient du cadre.
//
// Mesuré avant correction, sur un iPhone en portrait (430 × 932) : le bord gauche
// tombait à -8,6 % de la largeur d'écran à la profondeur la plus proche du joueur.
// Il fallait piloter à un douzième d'écran dans le noir pour franchir la couture,
// sans voir ni où l'on allait ni quand on repasserait.
//
// Ces épreuves passent en revue les écrans réels sur lesquels le jeu se joue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ajusteCadrage, bordArene } from '../src/game/arena.js';
import { ARENA } from '../src/game/constants.js';

// Les mêmes valeurs que main.js : c'est le cadrage réel qu'on éprouve.
const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);

// Rejoue exactement ce que fait fitCamera, pour un rapport d'écran donné.
function cadre(aspect) {
  const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  const camera = new THREE.PerspectiveCamera(Math.min(72, 56 * Math.pow(squeeze, 0.4)), aspect);
  const pose = (serrage) => {
    const pullback = Math.min(1.85, squeeze) * serrage;
    camera.position.copy(HOME).sub(CIBLE).multiplyScalar(pullback).add(CIBLE);
    camera.lookAt(CIBLE);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  const serrage = ajusteCadrage(camera, pose, aspect < 0.8 ? 0.75 : 1);
  return { camera, serrage, bord: bordArene(camera), zMax: ARENA.playerZMax };
}

const ECRANS = [
  ['iPhone portrait', 430 / 932],
  ['iPhone étroit portrait', 390 / 844],
  ['Android portrait', 412 / 915],
  ['iPad portrait', 820 / 1180],
  ['iPad paysage', 1180 / 820],
  ['téléphone paysage', 932 / 430],
  ['ordinateur 16/9', 16 / 9],
  ['ordinateur large', 21 / 9],
];

test('les bords de l’arène sont dans le cadre, sur tous les écrans', () => {
  for (const [nom, aspect] of ECRANS) {
    const { bord } = cadre(aspect);
    assert.ok(bord > 0, `${nom} : le bord de l’arène est HORS du cadre (${bord.toFixed(3)})`);
    assert.ok(
      bord >= 0.03,
      `${nom} : le bord est à ${(bord * 100).toFixed(1)} % de l’écran, trop près du vide`
    );
  }
});

test('le portrait rend une vraie zone de jeu, pas un couloir', () => {
  // IL FAUT LES DEUX LEVIERS, et c'est la leçon des deux corrections ratées.
  // Borner la zone à ce qu'on voit, seul, écrasait la course à deux unités.
  // Reculer la caméra, seul, empirait le bord (-0,086 → -0,117) puisque la zone
  // s'étendait vers la partie la plus étroite du champ.
  const { serrage, zMax, bord } = cadre(430 / 932);
  assert.ok(zMax >= 13, `la course en portrait tombe à ${zMax.toFixed(1)} unités`);
  assert.ok(bord >= 0.03, `le bord est à ${bord.toFixed(3)} : toujours hors d’atteinte`);
  assert.ok(serrage <= 1, 'le serrage a dépassé son maximum');
});

test('le paysage n’est pas touché', () => {
  // La correction ne doit rien changer là où rien n’était cassé : en paysage, les
  // bords tiennent jusqu'en bas de l'écran, donc la borne visuelle ne mord pas.
  for (const aspect of [16 / 9, 21 / 9, 1180 / 820]) {
    const { bord } = cadre(aspect);
    assert.ok(bord > 0.1, `le paysage ${aspect.toFixed(2)} : bord à ${bord.toFixed(3)}`);
  }
});

test('la limite arrière du joueur reste dans le champ', () => {
  // fitPlayZone la déduit du cadrage, et ajusteCadrage la relit à chaque tour :
  // c’est ce qui rend la boucle nécessaire, puisque reculer la déplace.
  for (const [nom, aspect] of ECRANS) {
    cadre(aspect);
    assert.ok(ARENA.playerZMax > ARENA.playerZMin + 4, `${nom} : la zone de jeu s’est effondrée`);
    assert.ok(ARENA.playerZMax < 40, `${nom} : la zone de jeu part à ${ARENA.playerZMax}`);
  }
});

// --- LA SIMULATION NE DÉPEND PAS DE L'ÉCRAN -----------------------------------
//
// C'est la promesse la plus lourde du fichier, parce que trois choses reposent
// dessus : le spectateur voit la MÊME partie, le jeu à deux avance au pas
// verrouillé, et un rejeu rejoue la partie enregistrée.
//
// Elle était fausse. La zone de jeu se déduisait du cadrage, donc de la taille de
// la fenêtre. Mesuré sur le banc à deux origines, 1280×683 contre 500×811 :
//
//     playerZMax        14,096   contre   13,557
//     bulletCullZMax    26,296   contre   37,235
//
// Le spectateur créditait un frôlement de plus que l'hôte — vingt-cinq points —
// pour une balle que l'hôte avait déjà effacée et que lui gardait en vol jusqu'à
// z = 30,5. Vingt-cinq points, c'est peu ; la cause ne l'est pas.

test('la zone de jeu ne bouge pas d’un écran à l’autre', () => {
  const releve = ECRANS.map(([nom, aspect]) => {
    cadre(aspect);
    return { nom, zMax: ARENA.playerZMax, cull: ARENA.bulletCullZMax };
  });
  const premier = releve[0];
  for (const r of releve) {
    assert.equal(
      r.zMax,
      premier.zMax,
      `${r.nom} joue jusqu’à ${r.zMax} quand ${premier.nom} joue jusqu’à ${premier.zMax}`
    );
    assert.equal(
      r.cull,
      premier.cull,
      `${r.nom} efface ses balles à ${r.cull} et ${premier.nom} à ${premier.cull}`
    );
  }
});

test('le cadrage montre toute la zone de jeu, bas compris', () => {
  // L’autre moitié de l’échange : puisque la zone ne s’adapte plus, c’est la
  // caméra qui doit la montrer entièrement — sinon le vaisseau sort du champ par
  // le bas, ce qui se ressent comme un bug puisque plus rien ne dit où sont les
  // limites.
  const coin = new THREE.Vector3();
  for (const [nom, aspect] of ECRANS) {
    const { camera } = cadre(aspect);
    coin.set(0, 0, ARENA.playerZMax).project(camera);
    const y = (1 - coin.y) / 2; // 0 en haut, 1 en bas
    assert.ok(y < 0.97, `${nom} : le bas de la zone tombe à ${(y * 100).toFixed(1)} % de l’écran`);
  }
});
