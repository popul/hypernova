// BANC 2 — QUELLE CONDITION BLOQUE ? On rejoue la boucle de ajusteCadrage en
// désactivant une condition à la fois. Si retirer une condition ne change RIEN au
// serrage final, c'est que l'autre est la seule qui décide.

import * as THREE from 'three';
import { ARENA } from '../src/game/constants.js';

const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);
const MARGE_BORD = 0.035;
const MARGE_BAS = 0.04;

const v = new THREE.Vector3();
const bordG = (cam, z) => {
  v.set(-ARENA.playerXMax, 0, z).project(cam);
  return (v.x + 1) / 2;
};
const ecrY = (cam, z) => {
  v.set(0, 0, z).project(cam);
  return (1 - v.y) / 2;
};
const ecrX = (cam, x, z) => {
  v.set(x, 0, z).project(cam);
  return (v.x + 1) / 2;
};

function monte(aspect, { mode = 'les deux', fovCap = 72, pullCap = 1.85, home = HOME, cible = CIBLE } = {}) {
  const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  const camera = new THREE.PerspectiveCamera(Math.min(fovCap, 56 * Math.pow(squeeze, 0.4)), aspect, 0.1, 900);
  const pose = (s) => {
    const pullback = Math.min(pullCap, squeeze) * s;
    camera.position.copy(home).sub(cible).multiplyScalar(pullback).add(cible);
    camera.lookAt(cible);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  let serrage = aspect < 0.8 ? 0.75 : 1;
  pose(serrage);
  for (let i = 0; i < 30 && serrage < 1.85; i++) {
    const okBord = bordG(camera, ARENA.playerZMax) >= MARGE_BORD;
    const okBas = ecrY(camera, ARENA.playerZMax) < 1 - MARGE_BAS;
    const ok = mode === 'bord seul' ? okBord : mode === 'bas seul' ? okBas : okBord && okBas;
    if (ok) break;
    serrage *= 1.04;
    pose(serrage);
  }
  const yH = ecrY(camera, ARENA.playerZMin);
  const yB = ecrY(camera, ARENA.playerZMax);
  return {
    camera,
    serrage,
    bord: bordG(camera, ARENA.playerZMax),
    yH,
    yB,
    bande: yB - yH,
    larg: ecrX(camera, ARENA.playerXMax, ARENA.playerZMax) - ecrX(camera, -ARENA.playerXMax, ARENA.playerZMax),
  };
}

const ECR = [
  ['iPhone portrait', 430 / 932],
  ['iPhone SE portrait', 375 / 667],
  ['Android portrait', 412 / 915],
  ['iPad portrait', 820 / 1180],
  ['téléphone paysage', 932 / 430],
  ['ordinateur 16/9', 16 / 9],
  ['ordinateur 21/9', 21 / 9],
  ['iPad paysage', 1180 / 820],
];

console.log('== I. LA CONDITION BLOQUANTE : on retire une condition à la fois ==');
console.log(
  'écran'.padEnd(21) +
    'serr(2 cond)'.padEnd(14) +
    'serr(bord seul)'.padEnd(17) +
    'serr(bas seul)'.padEnd(16) +
    'bande% final'
);
for (const [n, a] of ECR) {
  const d = monte(a);
  const b = monte(a, { mode: 'bord seul' });
  const s = monte(a, { mode: 'bas seul' });
  console.log(
    n.padEnd(21) +
      d.serrage.toFixed(4).padEnd(14) +
      b.serrage.toFixed(4).padEnd(17) +
      s.serrage.toFixed(4).padEnd(16) +
      (d.bande * 100).toFixed(1) +
      '%   (bord seul -> ' +
      (b.bande * 100).toFixed(1) +
      '%, bas seul -> ' +
      (s.bande * 100).toFixed(1) +
      '%)'
  );
}

console.log('');
console.log('== J. MARGE DE CHAQUE CONDITION AU SERRAGE FINAL (0 = pile sur le seuil) ==');
console.log('écran'.padEnd(21) + 'bord - 0.035'.padEnd(15) + 'bas% (seuil 96%)'.padEnd(19) + 'réserve bas (pts)');
for (const [n, a] of ECR) {
  const d = monte(a);
  console.log(
    n.padEnd(21) +
      (d.bord - MARGE_BORD).toFixed(5).padEnd(15) +
      ((d.yB * 100).toFixed(2) + '%').padEnd(19) +
      (96 - d.yB * 100).toFixed(2)
  );
}

console.log('');
console.log('== K. GÉOMÉTRIE DU CHAMP AU CADRAGE FINAL ==');
console.log(
  'écran'.padEnd(21) +
    'hfov°'.padEnd(8) +
    'vfov°'.padEnd(8) +
    'dist(cam→z14)'.padEnd(15) +
    'larg vue @z14'.padEnd(15) +
    'z@haut écran'.padEnd(14) +
    'z@bas écran'
);
for (const [n, a] of ECR) {
  const { camera } = monte(a);
  const vfov = camera.fov;
  const hfov = (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * a) * 180) / Math.PI;
  const p = new THREE.Vector3(0, 0, ARENA.playerZMax);
  const dist = camera.position.distanceTo(p);
  // largeur du champ (unités monde) au plan y=0, à z=14
  const l = new THREE.Vector3(-1, 0, 0.5).unproject(camera).sub(camera.position);
  const r = new THREE.Vector3(1, 0, 0.5).unproject(camera).sub(camera.position);
  const inter = (dir) => {
    const t = -camera.position.y / dir.y;
    return t > 0 ? new THREE.Vector3().copy(camera.position).addScaledVector(dir, t) : null;
  };
  // rayons haut / bas de l'écran, au centre horizontal
  const hautDir = new THREE.Vector3(0, 1, 0.5).unproject(camera).sub(camera.position);
  const basDir = new THREE.Vector3(0, -1, 0.5).unproject(camera).sub(camera.position);
  const pH = inter(hautDir);
  const pB = inter(basDir);
  // largeur visible au plan, à la profondeur z=14 : on déprojette les deux coins à la
  // même profondeur écran que le point (0,0,14)
  const ndc = new THREE.Vector3(0, 0, ARENA.playerZMax).project(camera);
  const gg = new THREE.Vector3(-1, ndc.y, ndc.z).unproject(camera);
  const dd = new THREE.Vector3(1, ndc.y, ndc.z).unproject(camera);
  console.log(
    n.padEnd(21) +
      hfov.toFixed(1).padEnd(8) +
      vfov.toFixed(1).padEnd(8) +
      dist.toFixed(1).padEnd(15) +
      (dd.x - gg.x).toFixed(1).padEnd(15) +
      (pH ? pH.z.toFixed(1) : 'horizon').padEnd(14) +
      (pB ? pB.z.toFixed(1) : 'jamais')
  );
  void l;
  void r;
}

console.log('');
console.log('== L. OÙ TOMBE LA FORMATION (z=-17, ligne du fond) ET LE JOUEUR (z=13) ==');
console.log('écran'.padEnd(21) + 'y(z=-17)'.padEnd(11) + 'y(z=-8)'.padEnd(11) + 'y(z=0)'.padEnd(11) + 'y(z=13)'.padEnd(11) + 'y(z=14)');
for (const [n, a] of ECR) {
  const { camera } = monte(a);
  const f = (z) => (ecrY(camera, z) * 100).toFixed(1) + '%';
  console.log(n.padEnd(21) + f(-17).padEnd(11) + f(-8).padEnd(11) + f(0).padEnd(11) + f(13).padEnd(11) + f(14));
}

console.log('');
console.log('== M. SENSIBILITÉ À MARGE_BORD (iPhone portrait) ==');
console.log('MARGE_BORD'.padEnd(13) + 'serrage'.padEnd(10) + 'camY'.padEnd(9) + 'camZ'.padEnd(9) + 'bande%'.padEnd(9) + 'vide bas%'.padEnd(11) + 'larg%');
for (const m of [-0.05, 0.0, 0.02, 0.035, 0.06, 0.1]) {
  const aspect = 430 / 932;
  const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  const camera = new THREE.PerspectiveCamera(Math.min(72, 56 * Math.pow(squeeze, 0.4)), aspect, 0.1, 900);
  const pose = (s) => {
    camera.position.copy(HOME).sub(CIBLE).multiplyScalar(Math.min(1.85, squeeze) * s).add(CIBLE);
    camera.lookAt(CIBLE);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  let s = 0.75;
  pose(s);
  for (let i = 0; i < 30 && s < 1.85; i++) {
    if (bordG(camera, ARENA.playerZMax) >= m && ecrY(camera, ARENA.playerZMax) < 1 - MARGE_BAS) break;
    s *= 1.04;
    pose(s);
  }
  const yH = ecrY(camera, 0);
  const yB = ecrY(camera, ARENA.playerZMax);
  const larg = ecrX(camera, ARENA.playerXMax, ARENA.playerZMax) - ecrX(camera, -ARENA.playerXMax, ARENA.playerZMax);
  console.log(
    String(m).padEnd(13) +
      s.toFixed(4).padEnd(10) +
      camera.position.y.toFixed(2).padEnd(9) +
      camera.position.z.toFixed(2).padEnd(9) +
      ((yB - yH) * 100).toFixed(1).padEnd(9) +
      ((1 - yB) * 100).toFixed(1).padEnd(11) +
      (larg * 100).toFixed(1)
  );
}

console.log('');
console.log('== N. LE PRODUIT INVARIANT : bord bloquant => la largeur vue à z=14 est FIXÉE ==');
console.log('cas'.padEnd(24) + 'larg vue @z14'.padEnd(16) + 'larg arène/écran'.padEnd(19) + 'bande%');
for (const cap of [50, 56, 64, 72, 76]) {
  const { camera, bande } = monte(430 / 932, { fovCap: cap });
  const ndc = new THREE.Vector3(0, 0, ARENA.playerZMax).project(camera);
  const gg = new THREE.Vector3(-1, ndc.y, ndc.z).unproject(camera);
  const dd = new THREE.Vector3(1, ndc.y, ndc.z).unproject(camera);
  console.log(
    `fovCap=${cap}`.padEnd(24) +
      (dd.x - gg.x).toFixed(2).padEnd(16) +
      ((29 / (dd.x - gg.x)) * 100).toFixed(1).padEnd(19) +
      (bande * 100).toFixed(2) + '%'
  );
}
for (const [y, z] of [
  [12, 27],
  [21, 27],
  [32, 27],
]) {
  const { camera, bande } = monte(430 / 932, { home: new THREE.Vector3(0, y, z) });
  const ndc = new THREE.Vector3(0, 0, ARENA.playerZMax).project(camera);
  const gg = new THREE.Vector3(-1, ndc.y, ndc.z).unproject(camera);
  const dd = new THREE.Vector3(1, ndc.y, ndc.z).unproject(camera);
  console.log(
    `HOME(${y},${z})`.padEnd(24) +
      (dd.x - gg.x).toFixed(2).padEnd(16) +
      ((29 / (dd.x - gg.x)) * 100).toFixed(1).padEnd(19) +
      (bande * 100).toFixed(2) + '%'
  );
}
