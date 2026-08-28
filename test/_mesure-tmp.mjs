import * as THREE from 'three';
import { ajusteCadrage, bordArene } from '../src/game/arena.js';
import { ARENA } from '../src/game/constants.js';

const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);

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
  return { camera, serrage, squeeze };
}

const v = new THREE.Vector3();
// y écran : 0 = haut, 1 = bas
const ecrY = (cam, x, z) => { v.set(x, 0, z).project(cam); return (1 - v.y) / 2; };
const ecrX = (cam, x, z) => { v.set(x, 0, z).project(cam); return (v.x + 1) / 2; };

const ECRANS = [
  ['iPhone 14/15 portrait', 393 / 852],
  ['iPhone Pro Max portrait', 430 / 932],
  ['iPhone SE portrait', 375 / 667],
  ['Android portrait', 412 / 915],
  ['iPad portrait', 820 / 1180],
  ['téléphone paysage', 932 / 430],
  ['ordinateur 16/9', 16 / 9],
];

console.log('ARENA: x=±' + ARENA.playerXMax + '  z=[' + ARENA.playerZMin + ',' + ARENA.playerZMax + ']  playerZ=' + ARENA.playerZ);
console.log('');
const head = ['écran', 'aspect', 'fov', 'serr', 'camY', 'camZ', 'haut z=0', 'bas z=14', 'bande', 'vide bas', 'larg arène'];
console.log(head.map((h,i)=>h.padEnd(i===0?24:11)).join(''));
for (const [nom, aspect] of ECRANS) {
  const { camera, serrage } = cadre(aspect);
  const yHaut = ecrY(camera, 0, ARENA.playerZMin);   // fond de la zone (loin)
  const yBas  = ecrY(camera, 0, ARENA.playerZMax);   // avant de la zone (près)
  const bande = yBas - yHaut;                         // hauteur écran occupée par la zone
  const videBas = 1 - yBas;
  const xg = ecrX(camera, -ARENA.playerXMax, ARENA.playerZMax);
  const xd = ecrX(camera,  ARENA.playerXMax, ARENA.playerZMax);
  const larg = xd - xg;
  const row = [
    nom,
    aspect.toFixed(3),
    camera.fov.toFixed(1),
    serrage.toFixed(3),
    camera.position.y.toFixed(1),
    camera.position.z.toFixed(1),
    (yHaut*100).toFixed(1)+'%',
    (yBas*100).toFixed(1)+'%',
    (bande*100).toFixed(1)+'%',
    (videBas*100).toFixed(1)+'%',
    (larg*100).toFixed(1)+'%',
  ];
  console.log(row.map((c,i)=>String(c).padEnd(i===0?24:11)).join(''));
}
