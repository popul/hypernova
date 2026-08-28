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
import { ajusteCadrage, bordArene, monteePortrait } from '../src/game/arena.js';
import { ARENA } from '../src/game/constants.js';

// Les mêmes valeurs que main.js : c'est le cadrage réel qu'on éprouve.
const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);

// Rejoue exactement ce que fait fitCamera, pour un écran donné.
//
// CE BANC RECOPIE UNE PARTIE DU CADRAGE, ET IL FAUT SAVOIR LAQUELLE. Le serrage
// (`1.78 / aspect`), le champ de base et son plafond, le plafond de recul et le
// serrage de départ 0,75 vivent dans `fitCamera` (main.js) et sont dupliqués à la
// main ci-dessous : une correction écrite là-bas sur l'un de ces quatre nombres
// passerait au travers de tous les écrans sans jamais être vue. Ce qui est
// IMPORTÉ, et donc réellement éprouvé, c'est `ajusteCadrage` et `monteePortrait` —
// la boucle de dégagement et le décentrement. Le jour où l'on touche aux quatre
// autres, il faut les changer aux DEUX endroits, ou les extraire.
//
// La taille en PIXELS est passée dans la signature, et pas seulement le rapport
// d'image : le butoir du bas d'écran est une colonne de boutons, qui ne change
// pas de taille avec l'écran. Un rapport ne suffit plus à décrire un cadrage.
function cadre(w, h) {
  const aspect = w / h;
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
  camera.translateY(monteePortrait(camera, aspect, h));
  camera.updateMatrixWorld(true);
  return { camera, serrage, bord: bordArene(camera), zMax: ARENA.playerZMax };
}

const ECRANS = [
  ['iPhone portrait', 430, 932],
  ['iPhone étroit portrait', 390, 844],
  ['Android portrait', 412, 915],
  ['iPhone SE portrait', 375, 667],
  // Le portrait le plus étroit du marché. Il manquait, et c'est précisément là que
  // la bande jouable est la plus menacée : un seuil calibré sans lui passait au
  // vert en promettant ce que le code ne tenait pas.
  ['Sony Xperia 21:9 portrait', 360, 840],
  ['iPad portrait', 820, 1180],
  ['iPad paysage', 1180, 820],
  ['téléphone paysage', 932, 430],
  ['ordinateur 16/9', 1600, 900],
  ['ordinateur large', 2100, 900],
];

const _p = new THREE.Vector3();
// Où tombe cette profondeur dans le cadre. 0 en haut de l'écran, 1 en bas.
const ecranY = (camera, z) => {
  _p.set(0, 0, z).project(camera);
  return (1 - _p.y) / 2;
};

test('les bords de l’arène sont dans le cadre, sur tous les écrans', () => {
  for (const [nom, w, h] of ECRANS) {
    const { bord } = cadre(w, h);
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
  const { serrage, zMax, bord } = cadre(430, 932);
  assert.ok(zMax >= 13, `la course en portrait tombe à ${zMax.toFixed(1)} unités`);
  assert.ok(bord >= 0.03, `le bord est à ${bord.toFixed(3)} : toujours hors d’atteinte`);
  assert.ok(serrage <= 1, 'le serrage a dépassé son maximum');
});

test('le paysage n’est pas touché', () => {
  // La correction ne doit rien changer là où rien n’était cassé : en paysage, les
  // bords tiennent jusqu'en bas de l'écran, donc la borne visuelle ne mord pas.
  for (const [w, h] of [
    [1600, 900],
    [2100, 900],
    [1180, 820],
  ]) {
    const { bord } = cadre(w, h);
    assert.ok(bord > 0.1, `le paysage ${(w / h).toFixed(2)} : bord à ${bord.toFixed(3)}`);
  }
});

test('la limite arrière du joueur reste dans le champ', () => {
  // fitPlayZone la déduit du cadrage, et ajusteCadrage la relit à chaque tour :
  // c’est ce qui rend la boucle nécessaire, puisque reculer la déplace.
  for (const [nom, w, h] of ECRANS) {
    cadre(w, h);
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
  const releve = ECRANS.map(([nom, w, h]) => {
    cadre(w, h);
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
  for (const [nom, w, h] of ECRANS) {
    const y = ecranY(cadre(w, h).camera, ARENA.playerZMax); // 0 en haut, 1 en bas
    assert.ok(y < 0.97, `${nom} : le bas de la zone tombe à ${(y * 100).toFixed(1)} % de l’écran`);
  }
});

// --- L'AIRE DE JEU ÉTAIT TROP HAUTE -------------------------------------------
//
// Les six épreuves ci-dessus défendaient UNE chose : la largeur. Que les bords de
// l'arène soient atteignables, et que la zone ne sorte pas par le bas. Rien ne
// disait que la profondeur devait se LIRE, et c'est par là que le portrait s'est
// dégradé sans qu'aucune alarme ne sonne.
//
// Mesuré sur la capture qui a ouvert le dossier, un iPhone en portrait : les
// quatorze unités de profondeur tenaient dans 12,0 % de la hauteur d'écran contre
// 35,6 % en 16/9 — trois fois moins — le vaisseau était relégué à 63,0 % de la
// hauteur, et les 36,0 % en dessous ne montraient rien du tout. L'épreuve du bas
// de zone ne surveillait qu'un seul sens : « pas trop bas ». Elle laissait donc
// passer l'excès inverse, qui est celui qu'on avait.

test('la zone de jeu occupe une vraie bande de l’écran, pas un fil', () => {
  // Avancer et reculer sont deux des trois axes du jeu ; sur un fil, ils ne se
  // voient plus. Et ce n'est pas qu'une affaire de confort : `aimPoint`
  // déprojette le doigt sur le plan de jeu, donc TOUTE la commande de profondeur
  // au pouce tient dans cette bande, et tout ce qui est en dessous se rabat sur
  // la même valeur.
  //
  // LE SEUIL EST PROPORTIONNEL AU RAPPORT D'IMAGE, et ce n'est pas un raffinement :
  // c'est la loi du défaut. Dès que la contrainte de bord est active — c'est-à-dire
  // sur tout le parc portrait — elle épingle la largeur de monde vue, donc le champ
  // vertical par le rapport d'image, donc la bande. On ne rattrapera JAMAIS les
  // 35,6 % du paysage par un recadrage de caméra.
  //
  // Une constante mentait donc par construction. Mesuré sur douze écrans portrait
  // de 0,362 à 0,790, le rapport bande/aspect vaut AU PLUS 0,2668 en défaut et AU
  // MOINS 0,2776 une fois corrigé : la frontière est nette et elle est une droite.
  // Un seuil constant à 14 % passait sur l'iPhone et échouait sur un Xperia 21:9 —
  // il promettait ce que le code ne tient pas, avec pour message d'échec celui du
  // défaut de Paul. Le jour où 0,27 casse, c'est que le portrait est reparti vers
  // le fil, sur n'importe quel écran.
  //
  // CE QUE CETTE ÉPREUVE NE COUVRE PAS, ET CE N'EST PAS UN OUBLI. `monteePortrait`
  // rend zéro dès 0,8, mais la bande n'y est pas encore confortable pour autant :
  // mesurée sur un balayage, elle tombe de 21,7 % à 0,799 à 14,8 % à 0,800, et ne
  // repasse au-dessus de 25 % que vers 1,35. Toute cette fenêtre — tablette presque
  // carrée, fenêtre de bureau redimensionnée, pliable ouvert — reste donc moins bien
  // servie que le portrait qu'on vient de corriger. C'est PRÉEXISTANT et rigoureusement
  // inchangé par le décentrement, qui n'y fait rien du tout ; aucun écran du parc ne
  // s'y trouve, et le plancher plat de 0,25 ne prétend pas la garder. Le jour où l'on
  // s'en occupe, c'est le seuil 0,8 lui-même qu'il faudra adoucir, pas ce nombre.
  for (const [nom, w, h] of ECRANS) {
    const { camera } = cadre(w, h);
    const bande = ecranY(camera, ARENA.playerZMax) - ecranY(camera, ARENA.playerZMin);
    // Deux régimes, parce qu'il y a deux lois. Sous 0,8 la contrainte de bord mord
    // et la bande est épinglée proportionnelle au rapport ; au-dessus elle ne mord
    // plus et la bande est confortable partout — un plancher plat suffit.
    const plancher = w / h < 0.8 ? 0.27 * (w / h) : 0.25;
    assert.ok(
      bande >= plancher,
      `${nom} : les quatorze unités de profondeur tiennent dans ${(bande * 100).toFixed(1)} % de la hauteur, plancher ${(plancher * 100).toFixed(1)} %`
    );
  }
});

test('la colonne d’action garde ses pixels, et rien de plus', () => {
  // L'autre bout de la même mesure, et la raison pour laquelle on ne le dit pas
  // en pourcentage. Ce qui interdit de descendre l'aire de jeu plus bas, c'est une
  // CIBLE TACTILE : le bouton ◉ appel, dont le sommet est à 158 px du bas sans
  // encoche et 172 avec (style.css:2704-2709), et sur lequel `input.js:76` refuse
  // de piloter. Il ne change pas de taille avec l'écran, donc la réserve non plus.
  //
  // Ce n'est PAS la hauteur de la colonne visible : la jauge ✦ énergie monte vers
  // 298 px (style.css:232 et 245) et l'aire de jeu passe désormais derrière elle.
  // Elle laisse en revanche passer le doigt — `#hud` est en `pointer-events: none`
  // et elle ne réactive pas le pointeur — donc elle ne borne rien ici. Voir
  // arena.js pour l'arbitrage : la réserve qui la couvrirait annulerait la
  // correction entière.
  //
  // Une consigne en centièmes donnait deux fois plus de garde sur un grand
  // téléphone que sur un petit, pour un bouton qui réclame le même compte partout.
  // On vérifie donc les pixels eux-mêmes, ce qui dit d'un coup les deux choses :
  // rien ne descend sur le bouton, et rien de plus n'est gaspillé au-dessus.
  for (const [nom, w, h] of ECRANS) {
    if (w / h >= 0.8) continue;
    const { camera } = cadre(w, h);
    // La coque ENTIÈRE à sa position la plus reculée : c'est ce que le paysage
    // montre déjà au ras de son bord bas, à z ≈ 16,3.
    const px = (1 - ecranY(camera, ARENA.playerZMax + ARENA.playerZMargin)) * h;
    assert.ok(
      px >= 160 && px <= 200,
      `${nom} : la coque tombe à ${px.toFixed(0)} px du bas, la colonne d’action en réclame 168`
    );
  }
});

test('le paysage est FIGÉ, au dixième d’unité près', () => {
  // « Le paysage ne doit pas bouger » n'était gardé que par un bord > 0,1, si
  // lâche qu'un plafond de champ ramené à 50° le franchit encore tout en
  // déplaçant la caméra de z 27,0 à 28,2 — et qu'une plongée plus franche
  // l'emmène à 20,9 sans que rien ne s'en aperçoive. On épingle donc la pose
  // elle-même. Ces nombres ne sont pas à ajuster quand ils cassent : s'ils
  // cassent, c'est que le paysage a bougé.
  const TEMOINS = [
    ['ordinateur 16/9', 1600, 900, 56.0, 21.0, 27.0],
    ['ordinateur large', 2100, 900, 56.0, 21.0, 27.0],
    ['téléphone paysage', 932, 430, 56.0, 21.0, 27.0],
    ['iPad paysage', 1180, 820, 58.7, 23.6, 30.7],
  ];
  for (const [nom, w, h, fov, y, z] of TEMOINS) {
    const { camera } = cadre(w, h);
    assert.ok(
      Math.abs(camera.fov - fov) < 0.05,
      `${nom} : champ ${camera.fov.toFixed(2)} au lieu de ${fov}`
    );
    assert.ok(
      Math.abs(camera.position.y - y) < 0.05,
      `${nom} : l’œil est à y ${camera.position.y.toFixed(2)} au lieu de ${y}`
    );
    assert.ok(
      Math.abs(camera.position.z - z) < 0.05,
      `${nom} : l’œil est à z ${camera.position.z.toFixed(2)} au lieu de ${z}`
    );
  }
});
