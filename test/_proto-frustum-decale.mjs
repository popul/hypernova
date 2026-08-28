// BANC JETABLE — APPROCHE B : FRUSTUM DÉCALÉ (projection asymétrique).
//
// Question posée : peut-on récupérer le vide bas du portrait, et surtout étirer la
// bande jouable, en décalant le FRUSTUM au lieu de bouger la caméra ?
//
// Le banc rejoue fitCamera hors navigateur, applique la variante, et mesure. Il
// n'est pas ramassé par `npm test` (qui ne globe que test/**/*.test.mjs).
//
//   node test/_proto-frustum-decale.mjs

import * as THREE from 'three';
import { ajusteCadrage } from '../src/game/arena.js';
import { ARENA } from '../src/game/constants.js';

const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const ECRANS = [
  ['iPhone portrait', 430 / 932],
  ['iPhone SE portrait', 375 / 667],
  ['Android portrait', 412 / 915],
  ['iPad portrait', 820 / 1180],
  ['téléphone paysage', 932 / 430],
  ['ordinateur 16/9', 16 / 9],
  ['ordinateur large', 21 / 9],
  ['iPad paysage', 1180 / 820],
];

// ------------------------------------------------------------------ fitCamera
// Recopie fidèle de src/main.js:48-82. Vérifiée contre le tableau de référence.
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
  return { camera, serrage, squeeze, fovBase: camera.fov };
}

// -------------------------------------------------- LE DÉCALAGE, DEUX ROUTES
//
// Route 1 — setViewOffset (API sanctionnée de Three). On rend une fenêtre de
// hauteur H dans une image virtuelle de hauteur H·K : le champ vertical RENDU
// vaut alors fov/K, et il faut donc gonfler camera.fov d'autant. camera.aspect
// devient A/K pour que le rectangle rendu garde le rapport de l'écran. Effet de
// bord : camera.fov et camera.aspect ne décrivent plus l'image.
//
// Route 2 — un seul terme de la matrice. Pour un frustum [l,r,t,b] la matrice
// perspective porte (t+b)/(t−b) en elements[9] ; le poser à `delta/Tv` décale le
// frustum de `delta` (en unités de tangente) sans toucher ni fov ni aspect.
//
// Les deux donnent la MÊME matrice — le banc le vérifie. La route 2 est celle
// qu'on recommanderait : elle laisse camera.fov honnête pour les cinq lecteurs
// de src/ qui le lisent.
function decaleParViewOffset(camera, aspectEcran, fovVoulu, delta) {
  const Tv = Math.tan(D2R * fovVoulu * 0.5);
  if (!delta) {
    camera.clearViewOffset();
    camera.fov = fovVoulu;
    camera.aspect = aspectEcran;
    camera.updateProjectionMatrix();
    return;
  }
  const K = 1 + (2 * Math.abs(delta)) / Tv;
  camera.fov = 2 * R2D * Math.atan(K * Tv);
  // PIÈGE : setViewOffset ÉCRIT camera.aspect = fullWidth/fullHeight (Three,
  // PerspectiveCamera.js). On ne peut donc pas le poser à part — il faut choisir
  // fullWidth pour que le quotient tombe juste, soit A/K.
  const fH = 1000 * K;
  const fW = 1000 * aspectEcran;
  const fracY = (1 - (Tv + delta) / (K * Tv)) / 2;
  camera.setViewOffset(fW, fH, 0, fracY * fH, fW, 1000);
  camera.updateProjectionMatrix();
}

function decaleParMatrice(camera, delta) {
  const Tv = Math.tan(D2R * camera.fov * 0.5);
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = delta / Tv;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

// --------------------------------------------------------------- LA MÉTRIQUE
const _v = new THREE.Vector3();
const ecrY = (cam, x, z) => {
  _v.set(x, 0, z).project(cam);
  return (1 - _v.y) / 2;
};
const ecrX = (cam, x, z) => {
  _v.set(x, 0, z).project(cam);
  return (_v.x + 1) / 2;
};
const bordG = (cam, z) => ecrX(cam, -ARENA.playerXMax, z);

// Repère de vue de la caméra : axe optique et « haut » perpendiculaire.
function repere(camera) {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const droite = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const haut = new THREE.Vector3().crossVectors(droite, dir).normalize().negate();
  // haut = y_view : cross(y,z) = x donc y = cross(z,x) avec z = -dir
  const yView = new THREE.Vector3().crossVectors(dir.clone().negate(), droite).normalize();
  return { dir, droite, haut: yView, _h: haut };
}

// Distance AXIALE (le long de l'axe optique) d'un point du plan de jeu.
function axiale(camera, z, x = 0) {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return new THREE.Vector3(x, 0, z).sub(camera.position).dot(dir);
}

function mesures(camera) {
  const yHaut = ecrY(camera, 0, ARENA.playerZMin);
  const yBas = ecrY(camera, 0, ARENA.playerZMax);
  const xg = ecrX(camera, -ARENA.playerXMax, ARENA.playerZMax);
  const xd = ecrX(camera, ARENA.playerXMax, ARENA.playerZMax);
  return {
    fov: camera.fov,
    camY: camera.position.y,
    camZ: camera.position.z,
    bord: bordG(camera, ARENA.playerZMax),
    haut: yHaut,
    bas: yBas,
    bande: yBas - yHaut,
    videBas: 1 - yBas,
    larg: xd - xg,
    joueur: ecrY(camera, 0, ARENA.playerZ),
    formation: ecrY(camera, 0, -17),
    zMinVital: ecrY(camera, 0, -20),
    zMaxVital: ecrY(camera, 0, 16.3),
    cull34: ecrY(camera, 0, -34),
    cull26: ecrY(camera, 0, 26),
    soleil: (() => {
      _v.set(0, 34, -150).project(camera);
      return (1 - _v.y) / 2;
    })(),
  };
}

const pc = (x) => (x * 100).toFixed(1) + '%';
const col = (s, n = 10) => String(s).padEnd(n);

// ============================================================================
console.log('\n=== A — RÉFÉRENCE (contrôle de non-régression) ===\n');
console.log(
  col('écran', 22) +
    col('aspect', 8) +
    col('fov', 7) +
    col('serr', 8) +
    col('camY', 7) +
    col('camZ', 7) +
    col('bord', 8) +
    col('bande', 8) +
    col('videBas', 9) +
    col('larg', 8)
);
const REF = {};
for (const [nom, a] of ECRANS) {
  const { camera, serrage } = cadre(a);
  const m = mesures(camera);
  REF[nom] = m;
  console.log(
    col(nom, 22) +
      col(a.toFixed(3), 8) +
      col(m.fov.toFixed(2), 7) +
      col(serrage.toFixed(4), 8) +
      col(m.camY.toFixed(2), 7) +
      col(m.camZ.toFixed(2), 7) +
      col(m.bord.toFixed(4), 8) +
      col(pc(m.bande), 8) +
      col(pc(m.videBas), 9) +
      col(pc(m.larg), 8)
  );
}

// ============================================================================
console.log('\n=== B — LES DEUX ROUTES DONNENT LA MÊME MATRICE ===\n');
{
  const a = 430 / 932;
  const c1 = cadre(a).camera;
  const c2 = cadre(a).camera;
  const delta = -0.25;
  decaleParViewOffset(c1, a, c1.fov, delta);
  decaleParMatrice(c2, delta);
  let ecart = 0;
  for (let i = 0; i < 16; i++) ecart = Math.max(ecart, Math.abs(c1.projectionMatrix.elements[i] - c2.projectionMatrix.elements[i]));
  console.log('écart max entre les 16 éléments de la matrice :', ecart.toExponential(2));
  console.log('viewOffset  -> fov', c1.fov.toFixed(2), 'aspect', c1.aspect.toFixed(4));
  console.log('matrice     -> fov', c2.fov.toFixed(2), 'aspect', c2.aspect.toFixed(4), '(inchangés)');
  console.log('tanHalfH (space.setFraming) : réf', (Math.tan(D2R * cadre(a).camera.fov / 2) * a).toFixed(5),
    '| viewOffset', (Math.tan(D2R * c1.fov / 2) * c1.aspect).toFixed(5),
    '| matrice', (Math.tan(D2R * c2.fov / 2) * c2.aspect).toFixed(5));
}

// ============================================================================
console.log('\n=== C — LE DÉCALAGE PUR EST UN PANORAMIQUE : LA BANDE NE BOUGE PAS ===\n');
{
  const a = 430 / 932;
  console.log(col('delta', 9) + col('haut z=0', 10) + col('bas z=14', 10) + col('bande', 9) + col('videBas', 9) + col('bord', 9) + col('soleil', 9) + col('z=-34', 9));
  for (const delta of [0.3, 0.15, 0, -0.15, -0.3, -0.45]) {
    const { camera } = cadre(a);
    decaleParMatrice(camera, delta);
    const m = mesures(camera);
    console.log(
      col(delta.toFixed(2), 9) + col(pc(m.haut), 10) + col(pc(m.bas), 10) + col(pc(m.bande), 9) +
      col(pc(m.videBas), 9) + col(m.bord.toFixed(4), 9) + col(pc(m.soleil), 9) + col(pc(m.cull34), 9)
    );
  }
}

// ============================================================================
console.log('\n=== D — LA TAILLE DU FRUSTUM EST NEUTRE (crop vertical = changement de fov) ===\n');
{
  const a = 430 / 932;
  // Un « crop » vertical par setViewOffset revient exactement à réduire le fov.
  const c1 = cadre(a).camera;
  const fov0 = c1.fov;
  c1.aspect = a / 1; // crop d'un facteur 1/1.2 => on rend 1/1.2 de la hauteur
  const K = 1 / 1.2;
  c1.fov = 2 * R2D * Math.atan(K * Math.tan(D2R * fov0 / 2));
  c1.aspect = a / K;
  c1.updateProjectionMatrix();
  const c2 = cadre(a).camera;
  c2.setViewOffset(1000, 1000 / K, 0, ((1 / K - 1) / 2) * 1000 / K, 1000, 1000);
  c2.aspect = a * K;
  c2.updateProjectionMatrix();
  console.log('un crop vertical est un fov réduit : le rapport horizontal/vertical du frustum');
  console.log('vaut TOUJOURS l’aspect du canevas — sinon l’image est déformée.');
  console.log('conséquence : la seule liberté nouvelle du décalage est la POSITION, pas la taille.');
}

// ============================================================================
console.log('\n=== E — LE DÉCENTREMENT COMPLET : translation perpendiculaire + décalage ===\n');
console.log('Translation de la caméra le long de son axe « haut » : la distance AXIALE de');
console.log('tout point est inchangée, donc bordGauche est EXACTEMENT invariant.\n');

// (poseDecentree est definie plus bas, en section F : les declarations sont hissees.)

{
  const a = 430 / 932;
  console.log(col('t', 7) + col('camY', 8) + col('camZ', 8) + col('bord', 9) + col('bande(δ=0)', 12) + col('Δv/2Tv', 10));
  for (const t of [0, 5, 10, 20, 30, 36, 50]) {
    const { camera } = poseDecentree(a, t, 0);
    const m = mesures(camera);
    console.log(col(t.toFixed(0), 7) + col(m.camY.toFixed(2), 8) + col(m.camZ.toFixed(2), 8) +
      col(m.bord.toFixed(6), 9) + col(pc(m.bande), 12) + col((m.bas - m.haut).toFixed(5), 10));
  }
  console.log('\n(bord identique au 1e-6 près sur toute la plage : la translation perpendiculaire');
  console.log(' est le SEUL mouvement de caméra qui échappe à la boucle d’ajusteCadrage.)');
}

// ============================================================================
console.log('\n=== F — RÉSOLUTION EXACTE : viser une bande ET une position ===\n');
// y%(z) = 1/2 − v(z)/(2Tv) + delta/(2Tv),  avec v(z) = (y_v0(z) − t)/L(z)
// Deux profondeurs, deux fractions d'écran voulues : le système est LINÉAIRE en
// (t, delta) parce que L(z) ne dépend pas de t. Il se résout en forme close, sans
// boucle, sans itération, sans risque de divergence.
function resout(aspect, z1, a1, z2, a2) {
  const { camera } = cadre(aspect);
  const r = repere(camera);
  const Tv = Math.tan(D2R * camera.fov * 0.5);
  const geo = (z) => {
    const p = new THREE.Vector3(0, 0, z).sub(camera.position);
    return { L: p.dot(r.dir), y0: p.dot(r.haut) };
  };
  const g1 = geo(z1);
  const g2 = geo(z2);
  const num = 2 * Tv * (a1 - a2) - (g2.y0 / g2.L - g1.y0 / g1.L);
  const den = 1 / g1.L - 1 / g2.L;
  const t = num / den;
  const delta = 2 * Tv * (a1 - 0.5) + (g1.y0 - t) / g1.L;
  return { t, delta, Tv };
}

// Pose décentrée : même axe optique, caméra translatée de t le long de y_view,
// frustum décalé de delta.
function poseDecentree(aspect, t, delta) {
  const { camera, serrage } = cadre(aspect);
  const r = repere(camera);
  camera.position.addScaledVector(r.haut, t);
  camera.lookAt(camera.position.clone().add(r.dir));
  camera.updateMatrixWorld(true);
  if (delta) decaleParMatrice(camera, delta);
  return { camera, serrage, t, delta, dir: r.dir, haut: r.haut };
}

// ------------------------------------------------- MESURES EN PIXELS RÉELS
// Étirement optique : une petite sphère au bord d'un objectif se rend en ellipse.
// On la MESURE au lieu de la déduire : on projette une couronne de points autour
// d'un point du plan de jeu et on regarde le rapport de la boîte englobante, en
// PIXELS (donc en tenant compte de l'aspect de l'écran).
function tailleEnPixels(camera, z, r = 0.5, W = 430, H = 932) {
  const centre = new THREE.Vector3(0, 0, z);
  const vue = new THREE.Vector3().subVectors(centre, camera.position).normalize();
  const e1 = new THREE.Vector3(1, 0, 0).sub(vue.clone().multiplyScalar(vue.x)).normalize();
  const e2 = new THREE.Vector3().crossVectors(vue, e1).normalize();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const p = centre.clone().addScaledVector(e1, r * Math.cos(a)).addScaledVector(e2, r * Math.sin(a));
    p.project(camera);
    const px = ((p.x + 1) / 2) * W;
    const py = ((1 - p.y) / 2) * H;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px);
    y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  return { larg: x1 - x0, haut: y1 - y0, etire: (y1 - y0) / (x1 - x0) };
}

// FogExp2(0.0075) : ce que la distance coûte en voile.
const brume = (d) => 1 - Math.exp(-Math.pow(0.0075 * d, 2));

{
  const a = 430 / 932;
  console.log('iPhone portrait. On garde le HAUT de la scène où il est (le décor ne bouge pas)');
  console.log('et on descend le BAS de la zone dans le vide qui ne servait à rien.\n');
  console.log(col('bande', 8) + col('bas', 7) + col('t', 8) + col('delta', 8) + col('camY', 7) + col('camZ', 7) +
    col('bord', 8) + col('videBas', 9) + col('z=-20', 8) + col('z=-17', 8) + col('soleil', 9) +
    col('étirem.', 9) + col('joueur px', 11) + col('brume -17', 10));
  for (const [bande, bas] of [[0.120, 0.640], [0.140, 0.660], [0.160, 0.680], [0.180, 0.700],
                              [0.180, 0.720], [0.200, 0.740], [0.220, 0.760], [0.260, 0.800]]) {
    const { t, delta } = resout(a, 0, bas - bande, ARENA.playerZMax, bas);
    const { camera } = poseDecentree(a, t, delta);
    const m = mesures(camera);
    const px = tailleEnPixels(camera, ARENA.playerZ);
    const dForm = new THREE.Vector3(0, 0, -17).distanceTo(camera.position);
    console.log(
      col(pc(m.bande), 8) + col(pc(m.bas), 7) + col(t.toFixed(1), 8) + col(delta.toFixed(3), 8) +
      col(m.camY.toFixed(1), 7) + col(m.camZ.toFixed(1), 7) + col(m.bord.toFixed(4), 8) +
      col(pc(m.videBas), 9) + col(pc(m.zMinVital), 8) + col(pc(m.formation), 8) + col(pc(m.soleil), 9) +
      col('x' + px.etire.toFixed(2), 9) + col(px.larg.toFixed(1) + 'x' + px.haut.toFixed(1), 11) +
      col(pc(brume(dForm)), 10));
  }
  console.log('\n(référence, ligne 1 : t et delta doivent sortir a zero — controle du solveur)');
}

// ============================================================================
console.log('\n=== G — PLAFOND THÉORIQUE DE LA ROTATION (pour comparaison) ===\n');
{
  const a = 430 / 932;
  const { camera } = cadre(a);
  const W = (2 * 14.5) / (1 - 2 * bordG(camera, ARENA.playerZMax));
  console.log('largeur de monde vue au plan z=14 : ' + W.toFixed(2) + ' unites (epinglee par MARGE_BORD)');
  console.log('bande ~ aspect x 14.sin(plongee) / largeur vue');
  for (const p of [21.8, 35, 46.8, 60, 75, 90]) {
    console.log('  plongee ' + col(p.toFixed(0) + ' deg', 8) + '-> bande ' + pc((a * 14 * Math.sin(D2R * p)) / W));
  }
  console.log('\nPLAFOND A 90 DEG (vue a la verticale) : ' + pc((a * 14) / W) + '.');
  console.log('Aucune rotation de camera, si franche soit-elle, ne peut faire mieux en portrait.');
}

// ============================================================================
console.log('\n=== H — LA PROPOSITION, SUR LES HUIT ÉCRANS ===\n');
// Portrait seulement. On vise : bande >= 18 % de la hauteur, bas de zone a 72 %.
// t est ecrete a >= 0 : un ecran deja meilleur que la cible ne bouge pas.
const BANDE_CIBLE = 0.18;
const BAS_CIBLE = 0.72;
function proposition(aspect) {
  if (aspect >= 0.8) {
    const c = cadre(aspect);
    return { ...c, t: 0, delta: 0, haut: new THREE.Vector3(0, 1, 0), dir: new THREE.Vector3(0, 0, -1) };
  }
  let { t, delta } = resout(aspect, 0, BAS_CIBLE - BANDE_CIBLE, ARENA.playerZMax, BAS_CIBLE);
  if (t < 0) {
    // deja plus large que la cible : on ne fait que reposer la zone.
    t = 0;
    const { camera } = cadre(aspect);
    const r = repere(camera);
    const Tv = Math.tan(D2R * camera.fov * 0.5);
    const p = new THREE.Vector3(0, 0, ARENA.playerZMax).sub(camera.position);
    delta = 2 * Tv * (BAS_CIBLE - 0.5) + p.dot(r.haut) / p.dot(r.dir);
  }
  return poseDecentree(aspect, t, delta);
}
console.log(
  col('écran', 22) + col('t', 7) + col('delta', 8) + col('camY', 7) + col('camZ', 7) +
  col('bord', 9) + col('(réf)', 9) + col('bande', 8) + col('(réf)', 8) + col('videBas', 9) + col('(réf)', 8) + col('larg', 8));
const PROP = {};
for (const [nom, a] of ECRANS) {
  const p = proposition(a);
  const m = mesures(p.camera);
  PROP[nom] = m;
  const r = REF[nom];
  console.log(
    col(nom, 22) + col(p.t.toFixed(1), 7) + col(p.delta.toFixed(3), 8) + col(m.camY.toFixed(1), 7) +
    col(m.camZ.toFixed(1), 7) + col(m.bord.toFixed(5), 9) + col(r.bord.toFixed(5), 9) + col(pc(m.bande), 8) + col(pc(r.bande), 8) +
    col(pc(m.videBas), 9) + col(pc(r.videBas), 8) + col(pc(m.larg), 8));
}

console.log('\n--- ou tombent les reperes de profondeur (0 % = haut d ecran). PROPOSITION ---\n');
const enteteZ = col('écran', 22) + col('z=-34', 9) + col('z=-20', 9) + col('z=-17', 9) + col('z=0', 9) +
  col('joueur', 9) + col('z=14', 9) + col('z=16.3', 9) + col('z=26', 9) + col('soleil', 9);
console.log(enteteZ);
for (const [nom, a] of ECRANS) {
  const m = mesures(proposition(a).camera);
  console.log(col(nom, 22) + col(pc(m.cull34), 9) + col(pc(m.zMinVital), 9) + col(pc(m.formation), 9) +
    col(pc(m.haut), 9) + col(pc(m.joueur), 9) + col(pc(m.bas), 9) + col(pc(m.zMaxVital), 9) +
    col(pc(m.cull26), 9) + col(pc(m.soleil), 9));
}
console.log('\n--- les memes AUJOURD HUI ---\n');
console.log(enteteZ);
for (const [nom] of ECRANS) {
  const m = REF[nom];
  console.log(col(nom, 22) + col(pc(m.cull34), 9) + col(pc(m.zMinVital), 9) + col(pc(m.formation), 9) +
    col(pc(m.haut), 9) + col(pc(m.joueur), 9) + col(pc(m.bas), 9) + col(pc(m.zMaxVital), 9) +
    col(pc(m.cull26), 9) + col(pc(m.soleil), 9));
}

// ============================================================================
console.log('\n=== I — CONTRAINTE 4 : LE PAYSAGE EST-IL BIT-IDENTIQUE ? ===\n');
for (const [nom, a] of ECRANS) {
  if (a < 0.8) continue;
  const r = cadre(a).camera;
  const p = proposition(a).camera;
  let ecart = 0;
  for (let i = 0; i < 16; i++) ecart = Math.max(ecart, Math.abs(r.projectionMatrix.elements[i] - p.projectionMatrix.elements[i]));
  console.log(col(nom, 22) + 'ecart matrice ' + ecart.toExponential(1) + '  |  ecart position ' + r.position.distanceTo(p.position).toExponential(1));
}

// ============================================================================
console.log('\n=== J — CONTRAINTE 2 : LES DEUX BORDS, AVEC LE SUIVI LATÉRAL ===\n');
// main.js:243-249 : camera decalee de player.x x 0,22, visee decalee de la moitie.
function avecSuivi(aspect, decentre, playerX) {
  const { camera, squeeze } = cadre(aspect);
  const serrage = ajusteCadrage(camera, (s) => {
    const pull = Math.min(1.85, squeeze) * s;
    camera.position.copy(HOME).sub(CIBLE).multiplyScalar(pull).add(CIBLE);
    camera.lookAt(CIBLE);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }, aspect < 0.8 ? 0.75 : 1);
  void serrage;
  const followX = playerX * 0.22;
  camera.position.x += followX;
  camera.lookAt(CIBLE.x + followX * 0.5, CIBLE.y, CIBLE.z);
  camera.updateMatrixWorld(true);
  if (decentre) {
    const r = repere(camera);
    camera.position.addScaledVector(r.haut, decentre.t);
    camera.lookAt(camera.position.clone().add(r.dir));
    camera.updateMatrixWorld(true);
    if (decentre.delta) decaleParMatrice(camera, decentre.delta);
  }
  return camera;
}
console.log(col('écran', 22) + col('longé', 10) + col('(réf)', 10) + col('opposé', 10) + col('(réf)', 10));
for (const [nom, a] of ECRANS) {
  const p = proposition(a);
  const cRef = avecSuivi(a, null, -ARENA.playerXMax);
  const cPro = avecSuivi(a, { t: p.t, delta: p.delta }, -ARENA.playerXMax);
  const bg = (c) => ecrX(c, -ARENA.playerXMax, ARENA.playerZMax);
  const bd = (c) => 1 - ecrX(c, ARENA.playerXMax, ARENA.playerZMax);
  console.log(col(nom, 22) + col(bg(cPro).toFixed(4), 10) + col(bg(cRef).toFixed(4), 10) +
    col(bd(cPro).toFixed(4), 10) + col(bd(cRef).toFixed(4), 10));
}

// ============================================================================
console.log('\n=== K — LA VISÉE TACTILE (aimPoint) SOUS LA PROPOSITION ===\n');
function aimZ(camera, fracY) {
  const d = new THREE.Vector3(0, 1 - 2 * fracY, 0.5).unproject(camera).sub(camera.position);
  const t = -camera.position.y / d.y;
  return camera.position.z + d.z * t;
}
console.log(col('doigt', 8) + col('réf z', 10) + col('prop z', 10) + '   (zone utile : z de 0 a 14)');
for (const f of [0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0]) {
  const a = 430 / 932;
  console.log(col(pc(f), 8) + col(aimZ(cadre(a).camera, f).toFixed(1), 10) + col(aimZ(proposition(a).camera, f).toFixed(1), 10));
}
{
  const course = (c) => {
    let h = 1, b = 0;
    for (let f = 0; f <= 1.0001; f += 0.0005) {
      const z = aimZ(c, f);
      if (z >= ARENA.playerZMin && z <= ARENA.playerZMax) { h = Math.min(h, f); b = Math.max(b, f); }
    }
    return b - h;
  };
  console.log('');
  for (const [nom, a] of ECRANS) {
    console.log(col(nom, 22) + 'course utile du doigt : ' + col(pc(course(cadre(a).camera)), 9) + ' -> ' + pc(course(proposition(a).camera)));
  }
}

// ============================================================================
console.log('\n=== L — LE PRIX : ANGLE DE VUE RÉEL, ÉTIREMENT, DISTANCE, BRUME ===\n');
console.log(col('écran', 22) + col('axe opt.', 10) + col('vue reelle', 12) + col('etirem.', 9) +
  col('vaisseau px', 13) + col('(réf)', 13) + col('dist -17', 10) + col('(réf)', 9) + col('brume -17', 10) + col('(réf)', 9));
for (const [nom, a] of ECRANS) {
  const p = proposition(a);
  const c = p.camera;
  const r = repere(c);
  const plongeeAxe = R2D * Math.asin(-r.dir.y);
  const versJoueur = new THREE.Vector3(0, 0, ARENA.playerZ).sub(c.position);
  const vueReelle = R2D * Math.asin(-versJoueur.clone().normalize().y);
  const W = a < 1 ? 430 : 932;
  const H = a < 1 ? Math.round(430 / a) : Math.round(932 / a);
  const px = tailleEnPixels(c, ARENA.playerZ, 0.5, W, H);
  const pxr = tailleEnPixels(cadre(a).camera, ARENA.playerZ, 0.5, W, H);
  const d = new THREE.Vector3(0, 0, -17).distanceTo(c.position);
  const dr = new THREE.Vector3(0, 0, -17).distanceTo(cadre(a).camera.position);
  console.log(col(nom, 22) + col(plongeeAxe.toFixed(1) + ' deg', 10) + col(vueReelle.toFixed(1) + ' deg', 12) +
    col('x' + px.etire.toFixed(2), 9) + col(px.larg.toFixed(1) + 'x' + px.haut.toFixed(1), 13) +
    col(pxr.larg.toFixed(1) + 'x' + pxr.haut.toFixed(1), 13) +
    col(d.toFixed(1), 10) + col(dr.toFixed(1), 9) + col(pc(brume(d)), 10) + col(pc(brume(dr)), 9));
}

console.log('\n=== M — MARGES DE DÉCOR DERRIÈRE LA CAMÉRA (Z_RECYCLAGE = 52) ===\n');
for (const [nom, a] of ECRANS) {
  const m = mesures(proposition(a).camera);
  console.log(col(nom, 22) + 'camZ ' + col(m.camZ.toFixed(1), 8) + '-> marge ' + (52 - m.camZ).toFixed(1) +
    ' u   (ref : ' + (52 - REF[nom].camZ).toFixed(1) + ')');
}

// ============================================================================
console.log('\n=== N — LE DÉCALAGE SEUL (t = 0), QUI EST GRATUIT ===\n');
console.log('Ce que le panoramique pur rend si on ne veut RIEN toucher a la camera :');
console.log(col('écran', 22) + col('delta', 9) + col('bande', 8) + col('bas', 8) + col('videBas', 9) + col('(réf)', 9) + col('soleil', 9) + col('(réf)', 9) + col('z=-20', 8));
for (const [nom, a] of ECRANS) {
  if (a >= 0.8) continue;
  const { camera } = cadre(a);
  const r = repere(camera);
  const Tv = Math.tan(D2R * camera.fov * 0.5);
  const p = new THREE.Vector3(0, 0, ARENA.playerZMax).sub(camera.position);
  const delta = 2 * Tv * (BAS_CIBLE - 0.5) + p.dot(r.haut) / p.dot(r.dir);
  const c2 = cadre(a).camera;
  decaleParMatrice(c2, delta);
  const m = mesures(c2);
  console.log(col(nom, 22) + col(delta.toFixed(3), 9) + col(pc(m.bande), 8) + col(pc(m.bas), 8) +
    col(pc(m.videBas), 9) + col(pc(REF[nom].videBas), 9) + col(pc(m.soleil), 9) + col(pc(REF[nom].soleil), 9) + col(pc(m.zMinVital), 8));
}
console.log('');

// ============================================================================
console.log('\n=== O — CE QUE MONTRE LE HAUT DU CADRE (le decor est-il ampute ?) ===\n');
// Profondeur ou le rayon du haut de l ecran rencontre le plan de jeu. Si le rayon
// passe au-dessus de l horizontale, il ne le rencontre jamais : c est l horizon.
function zAuBord(camera, fracY) {
  const d = new THREE.Vector3(0, 1 - 2 * fracY, 0.5).unproject(camera).sub(camera.position);
  if (d.y >= -1e-9) return null; // au-dessus de l horizon
  const t = -camera.position.y / d.y;
  return camera.position.z + d.z * t;
}
const zTxt = (z) => (z === null ? 'horizon' : z.toFixed(0));
console.log(col('écran', 22) + col('haut prop', 11) + col('haut réf', 11) + col('bas prop', 11) + col('bas réf', 11));
for (const [nom, a] of ECRANS) {
  const p = proposition(a).camera;
  const r = cadre(a).camera;
  console.log(col(nom, 22) + col(zTxt(zAuBord(p, 0)), 11) + col(zTxt(zAuBord(r, 0)), 11) +
    col(zTxt(zAuBord(p, 1)), 11) + col(zTxt(zAuBord(r, 1)), 11));
}

console.log('\n=== P — L ÉTIREMENT EST-IL UNIFORME SUR LA ZONE ? ===\n');
console.log(col('écran', 22) + col('z=-17', 20) + col('z=0', 20) + col('z=14', 20) + '   (larg x haut px, etirement)');
for (const [nom, a] of ECRANS) {
  const c = proposition(a).camera;
  const W = a < 1 ? 430 : 932;
  const H = Math.round(W / a);
  const s = (z) => {
    const q = tailleEnPixels(c, z, 0.5, W, H);
    return q.larg.toFixed(1) + 'x' + q.haut.toFixed(1) + ' x' + q.etire.toFixed(2);
  };
  console.log(col(nom, 22) + col(s(-17), 20) + col(s(0), 20) + col(s(14), 20));
}
console.log('\n--- les memes AUJOURD HUI ---\n');
for (const [nom, a] of ECRANS) {
  const c = cadre(a).camera;
  const W = a < 1 ? 430 : 932;
  const H = Math.round(W / a);
  const s = (z) => {
    const q = tailleEnPixels(c, z, 0.5, W, H);
    return q.larg.toFixed(1) + 'x' + q.haut.toFixed(1) + ' x' + q.etire.toFixed(2);
  };
  console.log(col(nom, 22) + col(s(-17), 20) + col(s(0), 20) + col(s(14), 20));
}

console.log('\n=== Q — L ÉCART VERTICAL FORMATION / VAISSEAU (le defaut de Paul) ===\n');
console.log(col('écran', 22) + col('prop', 10) + col('réf', 10) + col('gain', 10));
for (const [nom, a] of ECRANS) {
  const p = mesures(proposition(a).camera);
  const r = REF[nom];
  const dp = p.joueur - p.formation;
  const dr = r.joueur - r.formation;
  console.log(col(nom, 22) + col((dp * 100).toFixed(1) + ' pts', 10) + col((dr * 100).toFixed(1) + ' pts', 10) +
    col('x' + (dp / dr).toFixed(2), 10));
}

console.log('\n=== R — LA BANDE VITALE [-20 ; +16,3] TIENT-ELLE DANS LE CADRE ? ===\n');
console.log(col('écran', 22) + col('z=-20', 10) + col('z=16.3', 10) + col('occupe', 10) + col('(réf)', 10));
for (const [nom, a] of ECRANS) {
  const p = mesures(proposition(a).camera);
  const r = REF[nom];
  const ok = p.zMinVital > 0 && p.zMaxVital < 1 ? 'ok' : 'HORS';
  console.log(col(nom, 22) + col(pc(p.zMinVital), 10) + col(pc(p.zMaxVital), 10) +
    col(pc(p.zMaxVital - p.zMinVital) + ' ' + ok, 10) + col(pc(r.zMaxVital - r.zMinVital), 10));
}
console.log('');
