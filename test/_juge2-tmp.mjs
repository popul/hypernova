import * as THREE from 'three';
import { ajusteCadrage, bordArene } from '../src/game/arena.js';
import { ARENA } from '../src/game/constants.js';
const HOME = new THREE.Vector3(0, 21, 27), CIBLE = new THREE.Vector3(0, 0, -3);
const _v = new THREE.Vector3();
function refCadre(aspect) {
  const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  const camera = new THREE.PerspectiveCamera(Math.min(72, 56 * Math.pow(squeeze, 0.4)), aspect);
  const pose = (s) => { const p = Math.min(1.85, squeeze) * s;
    camera.position.copy(HOME).sub(CIBLE).multiplyScalar(p).add(CIBLE);
    camera.lookAt(CIBLE); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); };
  ajusteCadrage(camera, pose, aspect < 0.8 ? 0.75 : 1);
  return { camera, base: camera.position.clone() };
}
const yE = (c, z, x = 0) => { _v.set(x, 0, z).project(c); return (1 - _v.y) / 2; };
const xE = (c, x, z) => { _v.set(x, 0, z).project(c); return (_v.x + 1) / 2; };
function montee(camera, bv) {
  const bas = yE(camera, 14); if (bas >= bv) return 0;
  const axe = camera.getWorldDirection(new THREE.Vector3());
  const d = new THREE.Vector3(0, 0, 14).sub(camera.position).dot(axe);
  return 2 * (bv - bas) * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
}
function regleB(camera, bande, bv) {
  const axe = camera.getWorldDirection(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const g = (z) => { const p = new THREE.Vector3(0, 0, z).sub(camera.position); return { l: p.dot(axe), y: p.dot(up) }; };
  const f = g(0), a = g(14), hv = bv - bande;
  const h = (2 * tv * (hv - bv) - (a.y / a.l - f.y / f.l)) / (1 / f.l - 1 / a.l);
  const hausse = Math.max(0, h);
  return { hausse, decalage: 2 * tv * (hv - 0.5) + (f.y - hausse) / f.l };
}
const poseB = (c, d) => { if (d.hausse) { c.translateY(d.hausse); c.updateMatrixWorld(true); }
  c.projectionMatrix.elements[9] = d.decalage / Math.tan(THREE.MathUtils.degToRad(c.fov) / 2);
  c.projectionMatrixInverse.copy(c.projectionMatrix).invert(); };
const pc = (x) => (x * 100).toFixed(1).padStart(5) + '%';

const ECRANS = [['iPhone', 430 / 932], ['SE', 375 / 667], ['Android', 412 / 915], ['iPadP', 820 / 1180], ['16/9', 16 / 9], ['tel.pays', 932 / 430]];

// --------- suivi latéral : joueur collé au bord gauche -----------------------
// variante 1 (auteur A) : la base MONTE, puis on lace autour de la base montée
// variante 2 (greffe B) : on lace autour de la base d'origine, PUIS translateY local
function avecSuivi(aspect, mode, bv = 0.8, bandeB = 0.18, bvB = 0.72) {
  const { camera, base } = refCadre(aspect);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const followX = -14.5 * 0.22;
  let d = null, m = 0;
  if (aspect < 0.8) { if (mode.startsWith('A')) m = montee(camera, bv); else d = regleB(camera, bandeB, bvB); }
  if (mode === 'A1') {
    camera.position.copy(base).addScaledVector(up, m);
    camera.position.x += followX;
    camera.lookAt(CIBLE.x + followX * 0.5 + up.x * m, CIBLE.y + up.y * m, CIBLE.z + up.z * m);
    camera.updateMatrixWorld(true);
  } else if (mode === 'A2') {
    camera.position.copy(base); camera.position.x += followX;
    camera.lookAt(CIBLE.x + followX * 0.5, CIBLE.y, CIBLE.z);
    camera.updateMatrixWorld(true);
    if (m) { camera.translateY(m); camera.updateMatrixWorld(true); }
  } else if (mode === 'REF') {
    camera.position.copy(base); camera.position.x += followX;
    camera.lookAt(CIBLE.x + followX * 0.5, CIBLE.y, CIBLE.z); camera.updateMatrixWorld(true);
  } else if (mode === 'B') {
    camera.position.copy(base); camera.position.x += followX;
    camera.lookAt(CIBLE.x + followX * 0.5, CIBLE.y, CIBLE.z); camera.updateMatrixWorld(true);
    if (d) poseB(camera, d);
  }
  return camera;
}
console.log('=== SUIVI LATÉRAL, joueur collé au bord GAUCHE (x=-14.5), à z=14 ===');
console.log('  bord longé (gauche) / bord opposé (droite, où ressort le fantôme)');
console.log('écran     REF longé  REF opposé | A1 longé  A1 opposé | A2 longé  A2 opposé | B longé   B opposé');
for (const [nom, a] of ECRANS) {
  const l = [], o = [];
  for (const mode of ['REF', 'A1', 'A2', 'B']) {
    const c = avecSuivi(a, mode);
    l.push(xE(c, -14.5, 14)); o.push(1 - xE(c, 14.5, 14));
  }
  console.log(`${nom.padEnd(9)} ${l.map((v, i) => v.toFixed(4).padStart(8) + ' ' + o[i].toFixed(4).padStart(9)).join(' |')}`);
}

// --------- match à MARGE BASSE ÉGALE : y(z=16.2) identique -------------------
console.log('\n=== A vs B À MARGE BASSE ÉGALE (coque z=16,2 posée au même endroit) ===');
for (const cible of [0.756, 0.79, 0.83]) {
  console.log(`-- coque à ${(cible * 100).toFixed(1)} % --`);
  for (const [nom, a] of [['iPhone', 430 / 932], ['SE', 375 / 667], ['iPadP', 820 / 1180]]) {
    // A : dichotomie sur BAS_VOULU pour atteindre y(16.2)=cible
    let lo = 0.5, hi = 0.99, cam;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const { camera, base } = refCadre(a);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(up, montee(camera, mid)); camera.updateMatrixWorld(true);
      if (yE(camera, 16.2) < cible) lo = mid; else hi = mid; cam = camera; }
    const bA = yE(cam, 14) - yE(cam, 0);
    // B : dichotomie sur bandeVoulue avec basVoulu tel que y(16.2)=cible
    let lo2 = 0.5, hi2 = 0.99, cam2;
    for (let i = 0; i < 40; i++) { const mid = (lo2 + hi2) / 2; const { camera } = refCadre(a);
      poseB(camera, regleB(camera, 0.18, mid));
      if (yE(camera, 16.2) < cible) lo2 = mid; else hi2 = mid; cam2 = camera; }
    console.log(`  ${nom.padEnd(8)} A: bande ${pc(bA)} vide ${pc(1 - yE(cam, 14))} camY ${cam.position.y.toFixed(1)}  |  B: bande ${pc(yE(cam2, 14) - yE(cam2, 0))} vide ${pc(1 - yE(cam2, 14))} camY ${cam2.position.y.toFixed(1)}`);
  }
}

// --------- étirement vertical du vaisseau ------------------------------------
console.log('\n=== ÉTIREMENT VERTICAL (1 unité monde en z vs 1 unité en x, au plan du joueur z=13) ===');
console.log('écran      REF     A(0.80)   B(18%/72%)');
for (const [nom, a] of ECRANS) {
  const r = [];
  for (const mode of ['REF', 'A1', 'B']) {
    const c = avecSuivi(a, mode === 'REF' ? 'REF' : mode);
    const dx = Math.abs(xE(c, 0.5, 13) - xE(c, -0.5, 13)) * (a >= 1 ? 1 : 1); // fraction de largeur
    const dz = Math.abs(yE(c, 13.5) - yE(c, 12.5)); // fraction de hauteur
    // en pixels : dx*W et dz*H, W/H = a  => ratio = (dz*H)/(dx*W) = dz/(dx*a)
    r.push(dz / (dx * a));
  }
  console.log(`${nom.padEnd(9)} ${r.map((v) => '×' + v.toFixed(3)).join('   ')}`);
}

// --------- où tombent les repères de profondeur ------------------------------
console.log('\n=== REPÈRES DE PROFONDEUR À L\'ÉCRAN (iPhone portrait) ===');
console.log('           z=-34   z=-17  z=-3.2   z=0    z=13   z=14   z=18   z=19   z=26   soleil(0,34,-150)');
for (const mode of ['REF', 'A1', 'B']) {
  const c = avecSuivi(430 / 932, mode);
  const s = new THREE.Vector3(0, 34, -150).project(c);
  console.log(mode.padEnd(10) + [-34, -17, -3.2, 0, 13, 14, 18, 19, 26].map((z) => pc(yE(c, z))).join(' ') + ' ' + pc((1 - s.y) / 2));
}
