import * as THREE from 'three';
import { ajusteCadrage } from '../src/game/arena.js';
const HOME = new THREE.Vector3(0, 21, 27), CIBLE = new THREE.Vector3(0, 0, -3);
const _v = new THREE.Vector3();
function refCadre(aspect) {
  const sq = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  const c = new THREE.PerspectiveCamera(Math.min(72, 56 * Math.pow(sq, 0.4)), aspect);
  const pose = (s) => { c.position.copy(HOME).sub(CIBLE).multiplyScalar(Math.min(1.85, sq) * s).add(CIBLE);
    c.lookAt(CIBLE); c.updateProjectionMatrix(); c.updateMatrixWorld(true); };
  ajusteCadrage(c, pose, aspect < 0.8 ? 0.75 : 1); return c;
}
const yE = (c, z) => { _v.set(0, 0, z).project(c); return (1 - _v.y) / 2; };
const xE = (c, x, z) => { _v.set(x, 0, z).project(c); return (_v.x + 1) / 2; };
function montee(c, bv) { const bas = yE(c, 14); if (bas >= bv) return 0;
  const axe = c.getWorldDirection(new THREE.Vector3());
  const d = new THREE.Vector3(0, 0, 14).sub(c.position).dot(axe);
  return 2 * (bv - bas) * d * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2); }
function applique(c, m) { const up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
  c.position.addScaledVector(up, m); c.updateMatrixWorld(true); }
const pc = (x) => (x * 100).toFixed(1).padStart(5) + '%';
const ECRANS = [['iPhone 430x932', 430, 932], ['iPhone14 390x844', 390, 844], ['SE 375x667', 375, 667],
  ['Android 412x915', 412, 915], ['iPad P 820x1180', 820, 1180], ['petit 360x640', 360, 640],
  ['16/9 1600x900', 1600, 900], ['tel.pays 932x430', 932, 430], ['iPadPays 1180x820', 1180, 820]];

function rapport(c, a) { // isotropie profondeur/latéral en pixels, au plan du joueur
  const dx = Math.abs(xE(c, 0.5, 13) - xE(c, -0.5, 13));
  const dz = Math.abs(yE(c, 13.5) - yE(c, 12.5));
  return dz / (dx * a);
}
// La colonne d'action : haut du bouton ◉ appel = max(20,safe) + 76 + 62.
const RESERVE = (h) => 20 + 76 + 62; // sans safe-area (cas le plus favorable au jeu)
const RESERVE_SAFE = 34 + 76 + 62;   // iPhone à encoche

for (const mode of ['fixe 0.74', 'fixe 0.76', 'fixe 0.80', 'px 158', 'px 172']) {
  console.log(`\n=== ${mode} ===`);
  console.log('écran               BAS_V  monte  bande  videBas  y(z13)  y(16.2)  px sous coque  isotropie  y(z-17)  ecart form-vaiss  soleil');
  for (const [nom, w, h] of ECRANS) {
    const a = w / h; const c = refCadre(a);
    const iso0 = rapport(c, a);
    let bv;
    if (mode.startsWith('fixe')) bv = parseFloat(mode.split(' ')[1]);
    else bv = 1 - (parseInt(mode.split(' ')[1], 10) + 2.2 / 14 * 0) / h; // cible sur z=14 ; on corrige via coque ensuite
    let m = 0;
    if (a < 0.8) {
      if (mode.startsWith('px')) {
        // on veut la COQUE (z=16.2) juste au-dessus de la réserve
        const res = parseInt(mode.split(' ')[1], 10);
        const cible = 1 - res / h;
        // dichotomie sur la montée pour amener y(16.2) = cible
        let lo = 0, hi = 60;
        for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; const c2 = refCadre(a); applique(c2, mid);
          if (yE(c2, 16.2) < cible) lo = mid; else hi = mid; }
        m = Math.max(0, lo);
      } else m = montee(c, bv);
      applique(c, m);
    }
    const bande = yE(c, 14) - yE(c, 0);
    const s = new THREE.Vector3(0, 34, -150).project(c);
    console.log(`${nom.padEnd(19)} ${(a < 0.8 ? (mode.startsWith('px') ? (1 - parseInt(mode.split(' ')[1], 10) / h) : bv) : 0).toFixed(3)} ${m.toFixed(1).padStart(5)} ${pc(bande)} ${pc(1 - yE(c, 14))}  ${pc(yE(c, 13))} ${pc(yE(c, 16.2))}  ${Math.round((1 - yE(c, 16.2)) * h).toString().padStart(4)} px      ×${rapport(c, a).toFixed(3)} (${iso0.toFixed(3)})  ${pc(yE(c, -17))}  ${((yE(c, 13) - yE(c, -17)) * 100).toFixed(1).padStart(5)} pts  ${pc((1 - s.y) / 2)}`);
  }
}
