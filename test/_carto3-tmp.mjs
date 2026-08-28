// BANC 3 — CE QUE ajusteCadrage NE MESURE PAS.
//
// ajusteCadrage vérifie le bord avec la caméra POSÉE EXACTEMENT sur CAMERA_BASE et
// visant CAMERA_TARGET. Or main.js, à chaque image, DÉCALE la caméra latéralement
// pour suivre le joueur (followX = x * 0.22) et vise un point décalé de la moitié.
// Le bord réellement vu quand on colle au bord n'est donc pas celui qui a été
// vérifié. On mesure l'écart.

import * as THREE from 'three';
import { ARENA } from '../src/game/constants.js';
import { ajusteCadrage, bordArene } from '../src/game/arena.js';

const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);
const BASE = new THREE.Vector3();

const v = new THREE.Vector3();
const bordG = (cam, z) => {
  v.set(-ARENA.playerXMax, 0, z).project(cam);
  return (v.x + 1) / 2;
};
const bordD = (cam, z) => {
  v.set(ARENA.playerXMax, 0, z).project(cam);
  return (v.x + 1) / 2;
};

function cadre(aspect) {
  const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  const camera = new THREE.PerspectiveCamera(Math.min(72, 56 * Math.pow(squeeze, 0.4)), aspect, 0.1, 900);
  const pose = (s) => {
    BASE.copy(HOME).sub(CIBLE).multiplyScalar(Math.min(1.85, squeeze) * s).add(CIBLE);
    camera.position.copy(BASE);
    camera.lookAt(CIBLE);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  const serrage = ajusteCadrage(camera, pose, aspect < 0.8 ? 0.75 : 1);
  return { camera, serrage, base: BASE.clone() };
}

// Reproduit main.js:243-249 pour une position joueur donnée.
function suit(camera, base, playerX) {
  const followX = playerX * 0.22;
  camera.position.set(base.x + followX, base.y, base.z);
  camera.lookAt(CIBLE.x + followX * 0.5, CIBLE.y, CIBLE.z);
  camera.updateMatrixWorld(true);
}

const ECR = [
  ['iPhone portrait', 430 / 932],
  ['iPhone SE portrait', 375 / 667],
  ['Android portrait', 412 / 915],
  ['iPad portrait', 820 / 1180],
  ['téléphone paysage', 932 / 430],
  ['ordinateur 16/9', 16 / 9],
];

console.log('== O. LE SUIVI LATÉRAL (main.js:243-249) DÉPLACE LE BORD VÉRIFIÉ ==');
console.log(
  'écran'.padEnd(21) +
    'bord vérifié'.padEnd(15) +
    'bord réel x=-14.5'.padEnd(20) +
    'bord réel x=+14.5'.padEnd(20) +
    'pire'
);
for (const [n, a] of ECR) {
  const { camera, base } = cadre(a);
  const verifie = bordArene(camera);
  suit(camera, base, -ARENA.playerXMax);
  const gaucheQuandAGauche = bordG(camera, ARENA.playerZMax);
  suit(camera, base, ARENA.playerXMax);
  const droiteQuandADroite = 1 - bordD(camera, ARENA.playerZMax);
  console.log(
    n.padEnd(21) +
      verifie.toFixed(4).padEnd(15) +
      gaucheQuandAGauche.toFixed(4).padEnd(20) +
      droiteQuandADroite.toFixed(4).padEnd(20) +
      Math.min(gaucheQuandAGauche, droiteQuandADroite).toFixed(4)
  );
}

console.log('');
console.log('== P. LE BORD LE PLUS PROCHE DU JOUEUR : z=13 (ARENA.playerZ) et z=14 ==');
console.log('écran'.padEnd(21) + 'bord@z=0'.padEnd(12) + 'bord@z=13'.padEnd(12) + 'bord@z=14'.padEnd(12) + '(caméra centrée)');
for (const [n, a] of ECR) {
  const { camera } = cadre(a);
  console.log(
    n.padEnd(21) +
      bordG(camera, 0).toFixed(4).padEnd(12) +
      bordG(camera, 13).toFixed(4).padEnd(12) +
      bordG(camera, 14).toFixed(4).padEnd(12)
  );
}

console.log('');
console.log('== Q. LE SECOND PASSAGE DE fitCamera EST-IL IDEMPOTENT ? ==');
// main.js appelle fitCamera() deux fois (l.83 et l.124), et relayout() le rappelle.
// ajusteCadrage repart TOUJOURS de serrageDepart, donc le résultat ne dérive pas.
for (const [n, a] of ECR) {
  const r1 = cadre(a);
  const r2 = cadre(a);
  const r3 = cadre(a);
  console.log(
    `   ${n.padEnd(21)} serrage 1er=${r1.serrage.toFixed(6)} 2e=${r2.serrage.toFixed(6)} 3e=${r3.serrage.toFixed(6)} ${r1.serrage === r3.serrage ? 'IDEMPOTENT' : 'DÉRIVE'}`
  );
}

console.log('');
console.log('== R. setFraming : le facteur passé au décor (main.js:80-81) ==');
for (const [n, a] of ECR) {
  const { camera } = cadre(a);
  const tanHalfH = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
  console.log(`   ${n.padEnd(21)} fov=${camera.fov.toFixed(2)} aspect=${a.toFixed(4)} tanHalfH=${tanHalfH.toFixed(4)}  (hfov=${((2 * Math.atan(tanHalfH) * 180) / Math.PI).toFixed(1)}°)`);
}

console.log('');
console.log('== S. aimPoint (player.js:426-435) : la profondeur atteignable au doigt ==');
// Le doigt en bas de l'écran vise-t-il z=14, ou le clamp mange-t-il de la course ?
for (const [n, a] of ECR) {
  const { camera } = cadre(a);
  const inter = (ndcY) => {
    const d = new THREE.Vector3(0, ndcY, 0.5).unproject(camera).sub(camera.position);
    const t = -camera.position.y / d.y;
    return t > 0 ? camera.position.z + d.z * t : NaN;
  };
  console.log(
    `   ${n.padEnd(21)} doigt en bas d'écran -> z=${inter(-1).toFixed(1)}   doigt en haut -> z=${inter(1).toFixed(1)}`
  );
}

console.log('');
console.log('== T. QUAND ON COLLE À UN BORD, VOIT-ON L’AUTRE (le bouclage) ? ==');
console.log('écran'.padEnd(21) + 'joueur x=-14.5 : bord gauche'.padEnd(30) + 'bord DROIT (où l’on ressort)');
for (const [n, a] of ECR) {
  const { camera, base } = cadre(a);
  suit(camera, base, -ARENA.playerXMax);
  const g = bordG(camera, ARENA.playerZMax);
  const d = 1 - bordD(camera, ARENA.playerZMax);
  console.log(n.padEnd(21) + g.toFixed(4).padEnd(30) + d.toFixed(4) + (d < 0 ? '   HORS CADRE' : ''));
}

console.log('');
console.log('== U. COURSE DU DOIGT EN PROFONDEUR (fraction d’écran pour z=0 -> z=14) ==');
for (const [n, a] of ECR) {
  const { camera } = cadre(a);
  const y = (z) => { const t = new THREE.Vector3(0,0,z).project(camera); return (1 - t.y) / 2; };
  console.log(`   ${n.padEnd(21)} z=0 à ${(y(0)*100).toFixed(1)}%, z=14 à ${(y(14)*100).toFixed(1)}%  -> course doigt = ${((y(14)-y(0))*100).toFixed(1)}% de la hauteur; sous z=14 il reste ${((1-y(14))*100).toFixed(1)}% d'écran mort (clamp aimPoint)`);
}

console.log('');
console.log('== V. LE FANTÔME DE BOUCLAGE (x=+14.5) VU DEPUIS LE BORD GAUCHE, PAR PROFONDEUR ==');
console.log('écran'.padEnd(21) + 'z=0'.padEnd(11) + 'z=10'.padEnd(11) + 'z=13'.padEnd(11) + 'z=14');
for (const [n, a] of ECR) {
  const { camera, base } = cadre(a);
  suit(camera, base, -ARENA.playerXMax);
  const f = (z) => (1 - bordD(camera, z)).toFixed(4);
  console.log(n.padEnd(21) + f(0).padEnd(11) + f(10).padEnd(11) + f(13).padEnd(11) + f(14));
}
