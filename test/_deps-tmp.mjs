// BANC D'INVENTAIRE DES DÉPENDANCES AU CADRAGE (jetable).
// Rejoue fitCamera hors navigateur et mesure tout ce qui, ailleurs dans le code,
// a été calibré sur la pose ou le champ de la caméra.
import * as THREE from 'three';
import { ajusteCadrage } from '../src/game/arena.js';
import { ARENA } from '../src/game/constants.js';

const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);
function cadre(a) {
  const sq = Math.max(1, Math.pow(1.78 / a, 0.55));
  const c = new THREE.PerspectiveCamera(Math.min(72, 56 * Math.pow(sq, 0.4)), a);
  const pose = (s) => {
    const pb = Math.min(1.85, sq) * s;
    c.position.copy(HOME).sub(CIBLE).multiplyScalar(pb).add(CIBLE);
    c.lookAt(CIBLE); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
  };
  ajusteCadrage(c, pose, a < 0.8 ? 0.75 : 1);
  return c;
}
const v = new THREE.Vector3();
const Y = (c, x, y, z) => { v.set(x, y, z).project(c); return (1 - v.y) / 2; };
const X = (c, x, y, z) => { v.set(x, y, z).project(c); return (v.x + 1) / 2; };
const ECRANS = [
  ['iPhone portrait', 430 / 932, 430, 932],
  ['Android portrait', 412 / 915, 412, 915],
  ['iPhone SE portrait', 375 / 667, 375, 667],
  ['iPad portrait', 820 / 1180, 820, 1180],
  ['téléphone paysage', 932 / 430, 932, 430],
  ['16/9', 16 / 9, 1600, 900],
];
for (const [n, a, W, H] of ECRANS) {
  const c = cadre(a);
  const tanHalfH = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * c.aspect;
  const framing = Math.min(1, tanHalfH / 0.946); // space.setFraming
  const rSun = 26 * framing, rHalo = Math.max(3.5, rSun * 4.2);
  const dist = c.position.distanceTo(new THREE.Vector3(0, 0, 13));
  const dxpx = (X(c, 1, 0, 13) - X(c, 0, 0, 13)) * W;
  const nz = (f) => { const r = new THREE.Vector3(0, 1 - 2 * f, 0.5).unproject(c).sub(c.position); const t = -c.position.y / r.y; return c.position.z + r.z * t; };
  console.log(`\n== ${n}  ${W}x${H}  fov=${c.fov.toFixed(1)}  cam=(0,${c.position.y.toFixed(1)},${c.position.z.toFixed(1)})  dist plan=${dist.toFixed(1)}`);
  console.log(`   space.setFraming -> ${framing.toFixed(3)} | soleil r=${rSun.toFixed(1)} halo=${rHalo.toFixed(1)} | centre soleil y=${(Y(c, 0, 34, -150) * 100).toFixed(1)}% | bas du halo y=${(Y(c, 0, 34 - rHalo, -150) * 100).toFixed(1)}%`);
  console.log(`   fx.Points(size .5) = ${(0.5 * (H / 2) / dist).toFixed(1)} px | 1 u en x = ${dxpx.toFixed(1)} px | deadzone pirouette 1,8 u = ${(1.8 * dxpx).toFixed(0)} px (${(1.8 * dxpx / W * 100).toFixed(1)} %)`);
  console.log(`   y écran : z=-45 ${(Y(c, 0, 0, -45) * 100).toFixed(1)}% | z=-17 ${(Y(c, 0, 0, -17) * 100).toFixed(1)}% | z=0 ${(Y(c, 0, 0, 0) * 100).toFixed(1)}% | z=14 ${(Y(c, 0, 0, 14) * 100).toFixed(1)}%`);
  console.log(`   plans d'effacement : gemmes z=${ARENA.playerZMax + 4} -> ${(Y(c, 0, 0, 18) * 100).toFixed(1)}% | modules z=${ARENA.playerZMax + 5} -> ${(Y(c, 0, 0, 19) * 100).toFixed(1)}% | balles z=${ARENA.bulletCullZMax} -> ${(Y(c, 0, 0, 26) * 100).toFixed(1)}%`);
  console.log(`   visée tactile : doigt 50%→z=${nz(0.5).toFixed(1)} 60%→${nz(0.6).toFixed(1)} 70%→${nz(0.7).toFixed(1)} 90%→${nz(0.9).toFixed(1)} 100%→${nz(1).toFixed(1)}`);
  console.log(`   marges décor derrière la caméra : Z_RECYCLAGE champ 52 -> ${(52 - c.position.z).toFixed(1)} u | Z_AVANT nappe 70 -> ${(70 - c.position.z).toFixed(1)} u`);
}
