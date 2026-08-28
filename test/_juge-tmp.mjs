// BANC D'ARBITRAGE — rejoue les trois approches sur le MÊME code de référence.
import * as THREE from 'three';
import { ajusteCadrage, bordArene } from '../src/game/arena.js';
import { ARENA } from '../src/game/constants.js';

const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);
const _v = new THREE.Vector3();

function refCadre(aspect) {
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
  return { camera, serrage, base: camera.position.clone() };
}

const yEcran = (cam, z, x = 0) => { _v.set(x, 0, z).project(cam); return (1 - _v.y) / 2; };
const xEcran = (cam, x, z) => { _v.set(x, 0, z).project(cam); return (_v.x + 1) / 2; };

// --- A : décentrement pur (translation perpendiculaire), forme close ---------
function monteePour(camera, basVoulu) {
  const bas = yEcran(camera, ARENA.playerZMax);
  if (bas >= basVoulu) return 0;
  const axe = camera.getWorldDirection(new THREE.Vector3());
  const d = new THREE.Vector3(0, 0, ARENA.playerZMax).sub(camera.position).dot(axe);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return 2 * (basVoulu - bas) * d * tanV;
}
function hautImage(camera) {
  // verticale de l'IMAGE = up local de la caméra
  return new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
}

// --- B : décentrement + décalage de frustum (2 inconnues, forme close) -------
function regleB(camera, bandeVoulue, basVoulu) {
  const axe = camera.getWorldDirection(new THREE.Vector3());
  const up = hautImage(camera);
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const geo = (z) => { const p = new THREE.Vector3(0, 0, z).sub(camera.position); return { l: p.dot(axe), y: p.dot(up) }; };
  const fond = geo(ARENA.playerZMin);
  const avant = geo(ARENA.playerZMax);
  const hautVoulu = basVoulu - bandeVoulue;
  const h = (2 * tv * (hautVoulu - basVoulu) - (avant.y / avant.l - fond.y / fond.l)) / (1 / fond.l - 1 / avant.l);
  const hausse = Math.max(0, h);
  const decalage = 2 * tv * (hautVoulu - 0.5) + (fond.y - hausse) / fond.l;
  return { hausse, decalage };
}
function poseB(camera, d) {
  if (d.hausse) { camera.translateY(d.hausse); camera.updateMatrixWorld(true); }
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.projectionMatrix.elements[9] = d.decalage / tv;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

const ECRANS = [
  ['iPhone portrait', 430, 932], ['iPhone SE portrait', 375, 667],
  ['Android portrait', 412, 915], ['iPad portrait', 820, 1180],
  ['telephone paysage', 932, 430], ['ordi 16/9', 1600, 900],
  ['ordi 21/9', 2100, 900], ['iPad paysage', 1180, 820],
];

const pc = (x) => (x * 100).toFixed(1).padStart(5) + '%';

console.log('=== A) RÉFÉRENCE (code actuel) ===');
console.log('écran                asp    fov   camY  camZ   bord    bande  videBas  y(z13) y(16.2)');
for (const [nom, w, h] of ECRANS) {
  const a = w / h; const { camera } = refCadre(a);
  const haut = yEcran(camera, 0), bas = yEcran(camera, 14);
  console.log(`${nom.padEnd(20)} ${a.toFixed(3)} ${camera.fov.toFixed(1).padStart(5)} ${camera.position.y.toFixed(1).padStart(5)} ${camera.position.z.toFixed(1).padStart(5)}  ${bordArene(camera).toFixed(4)} ${pc(bas - haut)} ${pc(1 - bas)}  ${pc(yEcran(camera, 13))} ${pc(yEcran(camera, 16.2))}`);
}

for (const BV of [0.76, 0.80, 0.84]) {
  console.log(`\n=== B) APPROCHE A — décentrement, BAS_VOULU = ${BV} ===`);
  console.log('écran                monte  camY  camZ   bord     Δbord    bande  videBas  y(16.2) angleVue');
  for (const [nom, w, h] of ECRANS) {
    const a = w / h; const { camera } = refCadre(a);
    const bordAvant = bordArene(camera);
    const m = a < 0.8 ? monteePour(camera, BV) : 0;
    const up = hautImage(camera);
    camera.position.addScaledVector(up, m);
    camera.updateMatrixWorld(true);
    const haut = yEcran(camera, 0), bas = yEcran(camera, 14);
    const dir = new THREE.Vector3(0, 0, 13).sub(camera.position);
    const ang = THREE.MathUtils.radToDeg(Math.atan2(-dir.y, -dir.z));
    console.log(`${nom.padEnd(20)} ${m.toFixed(1).padStart(5)} ${camera.position.y.toFixed(1).padStart(5)} ${camera.position.z.toFixed(1).padStart(5)}  ${bordArene(camera).toFixed(6)} ${(bordArene(camera) - bordAvant).toExponential(1).padStart(9)} ${pc(bas - haut)} ${pc(1 - bas)}  ${pc(yEcran(camera, 16.2))} ${ang.toFixed(1).padStart(5)}°`);
  }
}

console.log('\n=== C) APPROCHE B — décentrement + frustum, bande 18 % / bas 72 % ===');
console.log('écran                hausse decal  camY  camZ   bord     Δbord    bande  videBas  y(16.2) angleVue');
for (const [nom, w, h] of ECRANS) {
  const a = w / h; const { camera } = refCadre(a);
  const bordAvant = bordArene(camera);
  let d = { hausse: 0, decalage: 0 };
  if (a < 0.8) { d = regleB(camera, 0.18, 0.72); poseB(camera, d); }
  const haut = yEcran(camera, 0), bas = yEcran(camera, 14);
  const dir = new THREE.Vector3(0, 0, 13).sub(camera.position);
  const ang = THREE.MathUtils.radToDeg(Math.atan2(-dir.y, -dir.z));
  console.log(`${nom.padEnd(20)} ${d.hausse.toFixed(1).padStart(5)} ${d.decalage.toFixed(3).padStart(6)} ${camera.position.y.toFixed(1).padStart(5)} ${camera.position.z.toFixed(1).padStart(5)}  ${bordArene(camera).toFixed(6)} ${(bordArene(camera) - bordAvant).toExponential(1).padStart(9)} ${pc(bas - haut)} ${pc(1 - bas)}  ${pc(yEcran(camera, 16.2))} ${ang.toFixed(1).padStart(5)}°`);
}

console.log('\n=== D) APPROCHE C — découpe du canevas au ras de la coque ===');
console.log('écran                bande_px pont_px  bande%surf videBas%surf  y(z13)%surf px/u');
for (const [nom, w, h] of ECRANS) {
  const a = w / h; const { camera } = refCadre(a);
  const yCoque = yEcran(camera, 16.2);
  const hb = a >= 0.8 ? h : Math.min(h, Math.round((h * yCoque) / 0.96));
  const f = h / hb; // facteur de conversion écran -> surface de jeu
  const haut = yEcran(camera, 0) * f, bas = yEcran(camera, 14) * f;
  // px/unité au plan du joueur
  const x0 = xEcran(camera, 0, 13) * w, x1 = xEcran(camera, 1, 13) * w;
  console.log(`${nom.padEnd(20)} ${String(hb).padStart(6)} ${String(h - hb).padStart(7)}   ${pc(bas - haut)}      ${pc(1 - bas)}      ${pc(yEcran(camera, 13) * f)} ${(x1 - x0).toFixed(2)}`);
}
