// BANC JETABLE — approche A : recadrage caméra pur.
//
// On ne touche ni au viewport, ni au HTML, ni au CSS. Uniquement la pose de la
// caméra. Le banc rejoue fitCamera hors navigateur, applique la variante, et
// mesure ce que Paul voit : la bande jouable, le vide sous elle, le bord d'arène.
//
// Le cadrage de référence est RECOPIÉ depuis HEAD (bordGauche, basVisible,
// ajusteCadrage) et non importé : d'autres approches modifient arena.js en
// parallèle, et une mesure de référence qui bouge ne mesure rien.
//
// Lancer : node test/_proto-recadrage-camera.mjs

import * as THREE from 'three';
import { ARENA } from '../src/game/constants.js';

// ------------------------------------------------- LE CADRAGE DE RÉFÉRENCE
// (copie littérale de src/game/arena.js à HEAD)
const MARGE_BORD = 0.035;
const MARGE_BAS = 0.04;
const _coin = new THREE.Vector3();

function bordGauche(camera, z) {
  _coin.set(-ARENA.playerXMax, 0, z).project(camera);
  return (_coin.x + 1) / 2;
}
function bordArene(camera) {
  return bordGauche(camera, ARENA.playerZMax);
}
function basVisible(camera) {
  _coin.set(0, 0, ARENA.playerZMax).project(camera);
  return (1 - _coin.y) / 2 < 1 - MARGE_BAS;
}
function ajusteCadrage(camera, pose, serrageDepart = 1) {
  let serrage = serrageDepart;
  pose(serrage);
  for (let i = 0; i < 30 && serrage < 1.85; i++) {
    if (bordGauche(camera, ARENA.playerZMax) >= MARGE_BORD && basVisible(camera)) break;
    serrage *= 1.04;
    pose(serrage);
  }
  return serrage;
}

const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);

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

// Copie fidèle de fitCamera (src/main.js:48-82 à HEAD), sans le décor.
function reference(aspect) {
  const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  const camera = new THREE.PerspectiveCamera(Math.min(72, 56 * Math.pow(squeeze, 0.4)), aspect);
  const base = HOME.clone();
  const pose = (serrage) => {
    const pullback = Math.min(1.85, squeeze) * serrage;
    base.copy(HOME).sub(CIBLE).multiplyScalar(pullback).add(CIBLE);
    camera.position.copy(base);
    camera.lookAt(CIBLE);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  const serrage = ajusteCadrage(camera, pose, aspect < 0.8 ? 0.75 : 1);
  return { camera, serrage, cible: CIBLE.clone() };
}

// ------------------------------------------------------------ LA PROPOSITION
//
// LE DÉCENTREMENT. On ne bascule pas l'objectif, on le monte.
//
// L'œil et le point visé montent ENSEMBLE, perpendiculairement à l'axe de visée.
// La direction de visée ne bouge donc pas d'un degré, la profondeur caméra de
// chaque point du monde non plus — donc ni le champ, ni le bord d'arène, ni la
// taille apparente de quoi que ce soit. Seule l'image glisse vers le bas, et
// elle glisse d'autant plus vite que le point est proche : c'est ce différentiel
// qui DILATE la bande jouable.
const HAUT = new THREE.Vector3(1, 0, 0).cross(CIBLE.clone().sub(HOME).normalize()).normalize();

const _t = new THREE.Vector3();
const _axe = new THREE.Vector3();

function ecranY(camera, z, x = 0, y = 0) {
  _t.set(x, y, z).project(camera);
  return (1 - _t.y) / 2;
}

// De combien faut-il monter pour amener le fond de la zone de jeu à `basVoulu` ?
// L'image d'un point à la profondeur caméra d descend de h / (2·d·tan(fov/2))
// quand l'œil monte de h : la relation est exacte, donc pas de boucle.
function decentrage(camera, aspect, basVoulu) {
  const portrait = THREE.MathUtils.smoothstep(1 - aspect, 0, 0.2);
  if (portrait <= 0) return 0;
  const bas = ecranY(camera, ARENA.playerZMax);
  if (bas >= basVoulu) return 0;
  camera.getWorldDirection(_axe);
  const d = _t.set(0, 0, ARENA.playerZMax).sub(camera.position).dot(_axe);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return 2 * (basVoulu - bas) * d * tanV * portrait;
}

const BAS_VOULU = 0.8;

function variante(aspect, basVoulu = BAS_VOULU) {
  const { camera, serrage } = reference(aspect);
  const monte = decentrage(camera, aspect, basVoulu);
  const cible = CIBLE.clone().addScaledVector(HAUT, monte);
  camera.position.addScaledVector(HAUT, monte);
  camera.lookAt(cible);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { camera, serrage, cible, monte };
}

// ---------------------------------------------------------------- MESURES

function mesure(camera) {
  const haut = ecranY(camera, ARENA.playerZMin);
  const bas = ecranY(camera, ARENA.playerZMax);
  camera.getWorldDirection(_axe);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dist = (z) => _t.set(0, 0, z).sub(camera.position).dot(_axe);
  return {
    haut,
    bas,
    bande: bas - haut,
    videBas: 1 - bas,
    bord: bordArene(camera),
    fov: camera.fov,
    camY: camera.position.y,
    camZ: camera.position.z,
    plongee: (Math.atan2(-_axe.y, -_axe.z) * 180) / Math.PI,
    largeur: 1 - 2 * bordArene(camera),
    echelle14: 1 / (2 * dist(14) * tanV),
    echelleFond: 1 / (2 * dist(-17) * tanV),
    framing: Math.min(1, (tanV * camera.aspect) / 0.946),
    soleil: ecranY(camera, -150, 0, 34),
    soleilBas: ecranY(camera, -150, 0, 34 - 38.7),
    // la bande VITALE : tout ce qui doit rester à l'écran, [-20 ; +16,3]
    vitale: ecranY(camera, 16.3) - ecranY(camera, -20),
    z_17: ecranY(camera, -17),
    z_34: ecranY(camera, -34),
    z0: ecranY(camera, 0),
    z13: ecranY(camera, 13),
    z26: ecranY(camera, 26),
  };
}

function viseeZ(camera, fractionEcran) {
  const p = new THREE.Vector3(0, 1 - 2 * fractionEcran, 0.5).unproject(camera);
  const dir = p.sub(camera.position).normalize();
  if (dir.y >= -1e-6) return Infinity;
  const t = -camera.position.y / dir.y;
  return camera.position.z + dir.z * t;
}

const pc = (x) => `${(x * 100).toFixed(1)} %`;
const n = (x, d = 2) => x.toFixed(d);

// ---------------------------------------------------------------- A. RÉFÉRENCE
console.log('\n=== A. RÉFÉRENCE (état actuel, contrôle de non-régression) ===');
console.log(
  'écran                 aspect   fov   camY   camZ   plongée  bord    bande   vide-bas  larg   vitale'
);
const REF = {};
for (const [nom, aspect] of ECRANS) {
  const m = mesure(reference(aspect).camera);
  REF[nom] = m;
  console.log(
    `${nom.padEnd(20)} ${n(aspect, 3)}  ${n(m.fov, 1).padStart(5)} ${n(m.camY, 1).padStart(6)} ${n(m.camZ, 1).padStart(6)}  ${n(m.plongee, 2).padStart(6)}°  ${n(m.bord, 4)}  ${pc(m.bande).padStart(6)}  ${pc(m.videBas).padStart(7)}  ${pc(m.largeur)}  ${pc(m.vitale)}`
  );
}

// ------------------------------------------------- B. LA LOI DE LA BANDE
console.log('\n=== B. LA LOI DE LA BANDE (vérification analytique) ===');
console.log('    bande = 14 · (aspect / 2W) · sin(φ0) / cos(φ0 − θ)     W = 14,5 / (1 − 2·bord)');
console.log('écran                  φ0      θ     φ0−θ    W      mesurée    par la loi   écart');
for (const [nom, aspect] of ECRANS) {
  const { camera } = reference(aspect);
  const m = mesure(camera);
  const phi0 = Math.atan2(camera.position.y, camera.position.z);
  const theta = (m.plongee * Math.PI) / 180;
  const W = 14.5 / (1 - 2 * m.bord);
  const loi = (14 * (aspect / (2 * W)) * Math.sin(phi0)) / Math.cos(phi0 - theta);
  console.log(
    `${nom.padEnd(20)} ${n((phi0 * 180) / Math.PI, 1).padStart(5)}° ${n(m.plongee, 1).padStart(5)}° ${n(((phi0 - theta) * 180) / Math.PI, 1).padStart(5)}° ${n(W, 2).padStart(6)}  ${pc(m.bande).padStart(7)}   ${pc(loi).padStart(7)}   ${((loi - m.bande) * 100).toFixed(4)} pt`
  );
}

// -------------------------------- C. LE PLAFOND STRUCTUREL DE L'APPROCHE A
console.log('\n=== C. PLAFOND DE L’APPROCHE A (bande maximale atteignable) ===');
console.log('   cos(φ0−θ) ≤ 1 et sin(φ0) ≤ 1 : la bande ne peut pas dépasser 0,4490 · aspect');
console.log('écran                 aspect   bande à 35°   plafond absolu (œil à la verticale)');
for (const [nom, aspect] of ECRANS) {
  const base = 0.48276 * (1 - 2 * MARGE_BORD) * aspect;
  console.log(
    `${nom.padEnd(20)} ${n(aspect, 3)}   ${pc(base * Math.sin((35 * Math.PI) / 180)).padStart(7)}      ${pc(base)}`
  );
}
console.log('\nbande en fonction de φ0 (iPhone portrait, aspect 0,461, θ = φ0) :');
for (const deg of [35, 40, 45, 50, 55, 60, 70, 80, 90]) {
  const b = 0.48276 * (1 - 2 * MARGE_BORD) * 0.4614 * Math.sin((deg * Math.PI) / 180);
  console.log(`   φ0 = ${String(deg).padStart(2)}° -> bande ${pc(b)}`);
}

// -------------------------------- D. LES LEVIERS, UN PAR UN
function cadreLibre(aspect, { home = HOME, cible = CIBLE, fovCap = 72, pullCap = 1.85 } = {}) {
  const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  const camera = new THREE.PerspectiveCamera(Math.min(fovCap, 56 * Math.pow(squeeze, 0.4)), aspect);
  const pose = (serrage) => {
    const pullback = Math.min(pullCap, squeeze) * serrage;
    camera.position.copy(home).sub(cible).multiplyScalar(pullback).add(cible);
    camera.lookAt(cible);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  ajusteCadrage(camera, pose, aspect < 0.8 ? 0.75 : 1);
  return camera;
}

console.log('\n=== D. LES LEVIERS DE L’APPROCHE A, UN PAR UN ===');
const A = 430 / 932;
const P = 16 / 9;
console.log(
  'variante                            bande  vide-bas    bord    fov   camY   camZ  |  16/9 : bande  camY  camZ  bord'
);
const pousse = (nom, cam, cam169) => {
  const m = mesure(cam);
  const l = mesure(cam169);
  console.log(
    `${nom.padEnd(34)} ${pc(m.bande).padStart(7)} ${pc(m.videBas).padStart(8)} ${n(m.bord, 3).padStart(7)} ${n(m.fov, 1).padStart(6)} ${n(m.camY, 1).padStart(6)} ${n(m.camZ, 1).padStart(6)}  |  ${pc(l.bande).padStart(7)} ${n(l.camY, 1).padStart(5)} ${n(l.camZ, 1).padStart(5)} ${n(l.bord, 3).padStart(6)}`
  );
};
pousse('référence', cadreLibre(A), cadreLibre(P));
pousse('fov plafonné à 60', cadreLibre(A, { fovCap: 60 }), cadreLibre(P, { fovCap: 60 }));
pousse('fov plafonné à 84', cadreLibre(A, { fovCap: 84 }), cadreLibre(P, { fovCap: 84 }));
pousse('recul plafonné à 1.2', cadreLibre(A, { pullCap: 1.2 }), cadreLibre(P, { pullCap: 1.2 }));
pousse('recul plafonné à 3.0', cadreLibre(A, { pullCap: 3.0 }), cadreLibre(P, { pullCap: 3.0 }));
for (const y of [26, 32, 40]) {
  pousse(
    `œil plus haut : HOME(0,${y},27)`,
    cadreLibre(A, { home: new THREE.Vector3(0, y, 27) }),
    cadreLibre(P, { home: new THREE.Vector3(0, y, 27) })
  );
}
for (const z of [20, 34]) {
  pousse(
    `œil en z : HOME(0,21,${z})`,
    cadreLibre(A, { home: new THREE.Vector3(0, 21, z) }),
    cadreLibre(P, { home: new THREE.Vector3(0, 21, z) })
  );
}
for (const z of [-20, 4]) {
  pousse(
    `cible reculée/avancée : CIBLE(0,0,${z})`,
    cadreLibre(A, { cible: new THREE.Vector3(0, 0, z) }),
    cadreLibre(P, { cible: new THREE.Vector3(0, 0, z) })
  );
}
for (const y of [10, 20]) {
  pousse(
    `cible relevée : CIBLE(0,${y},-3)`,
    cadreLibre(A, { cible: new THREE.Vector3(0, y, -3) }),
    cadreLibre(P, { cible: new THREE.Vector3(0, y, -3) })
  );
}
console.log('\n   -- le décentrement, à titre de comparaison sur la même ligne --');
pousse('DÉCENTREMENT (bas voulu 0,80)', variante(A).camera, variante(P).camera);

// -- match à vide-bas égal : décentrer contre basculer/reculer ---------------
console.log('\n=== D bis. À VIDE-BAS ÉGAL (≈ 20 %), QUI REND LE PLUS DE BANDE ? ===');
console.log('variante                            bande  vide-bas   bord    fov    16/9 bougé ?');
const dit = (nom, cam) => {
  const m = mesure(cam);
  const l = mesure(cam === variante(A).camera ? variante(P).camera : cam);
  void l;
  console.log(
    `${nom.padEnd(34)} ${pc(m.bande).padStart(7)} ${pc(m.videBas).padStart(8)} ${n(m.bord, 3).padStart(7)} ${n(m.fov, 1).padStart(6)}`
  );
};
dit('décentrement (bas voulu 0,80)', variante(A, 0.8).camera);
// cible relevée : le seul autre réglage qui descend la zone à ~20 % de vide
dit('cible relevée CIBLE(0,20,-3)', cadreLibre(A, { cible: new THREE.Vector3(0, 20, -3) }));
dit('cible relevée CIBLE(0,17,-3)', cadreLibre(A, { cible: new THREE.Vector3(0, 17, -3) }));

// -------------------------------- E. LE DÉCENTREMENT : BALAYAGE
console.log('\n=== E. LE DÉCENTREMENT : balayage de la hauteur voulue (iPhone portrait) ===');
console.log(
  'bas voulu   montée   camY   camZ  plongée   bord     fov    bande   vide-bas   z=13    vitale  Soleil  bas-halo'
);
for (const s of [0.64, 0.7, 0.76, 0.8, 0.84, 0.9, 0.96]) {
  const v = variante(A, s);
  const m = mesure(v.camera);
  console.log(
    `${n(s, 2).padStart(6)}   ${n(v.monte, 1).padStart(6)} ${n(m.camY, 1).padStart(6)} ${n(m.camZ, 1).padStart(6)} ${n(m.plongee, 2).padStart(7)}° ${n(m.bord, 4)} ${n(m.fov, 1).padStart(6)}  ${pc(m.bande).padStart(6)}  ${pc(m.videBas).padStart(7)}  ${pc(m.z13).padStart(6)}  ${pc(m.vitale).padStart(6)}  ${pc(m.soleil).padStart(6)}  ${pc(m.soleilBas)}`
  );
}

// -------------------------------- F. LA PROPOSITION, ÉCRAN PAR ÉCRAN
console.log(`\n=== F. PROPOSITION (bas de zone visé à ${pc(BAS_VOULU)}) ===`);
console.log(
  'écran                  bande av→ap        vide-bas av→ap      bord av→ap        fov      camY→        camZ→'
);
const APRES = {};
for (const [nom, aspect] of ECRANS) {
  const a = REF[nom];
  const v = variante(aspect);
  const m = mesure(v.camera);
  APRES[nom] = { m, monte: v.monte, cible: v.cible, serrage: v.serrage };
  console.log(
    `${nom.padEnd(20)} ${pc(a.bande).padStart(6)} → ${pc(m.bande).padStart(6)}   ${pc(a.videBas).padStart(6)} → ${pc(m.videBas).padStart(6)}   ${n(a.bord, 4)} → ${n(m.bord, 4)}   ${n(m.fov, 1)}  ${n(a.camY, 1)}→${n(m.camY, 1)}  ${n(a.camZ, 1)}→${n(m.camZ, 1)}`
  );
}

console.log('\n--- contrôle : ce qui doit rester IDENTIQUE, au bit près ---');
for (const [nom] of ECRANS) {
  const a = REF[nom];
  const m = APRES[nom].m;
  console.log(
    `${nom.padEnd(20)} Δbord ${Math.abs(m.bord - a.bord).toExponential(1)}  Δfov ${Math.abs(m.fov - a.fov).toExponential(1)}  Δplongée ${Math.abs(m.plongee - a.plongee).toExponential(1)}  Δframing ${Math.abs(m.framing - a.framing).toExponential(1)}  Δéchelle(z=-17) ${Math.abs(m.echelleFond - a.echelleFond).toExponential(1)}  montée ${n(APRES[nom].monte, 3)}`
  );
}

console.log('\n--- bande VITALE [-20 ; +16,3] : tout ce qui doit être vu ---');
for (const [nom] of ECRANS) {
  console.log(
    `${nom.padEnd(20)} ${pc(REF[nom].vitale)} → ${pc(APRES[nom].m.vitale)}  (${(((APRES[nom].m.vitale / REF[nom].vitale) * 100 - 100) | 0).toFixed(0)} %)`
  );
}

console.log('\n--- où tombent les objets, avant → après (fraction de hauteur) ---');
console.log('écran                  z=-34        z=-17         z=0         z=13        z=26      Soleil');
for (const [nom] of ECRANS) {
  const a = REF[nom];
  const m = APRES[nom].m;
  const d = (k) => `${pc(a[k]).padStart(6)}→${pc(m[k]).padStart(6)}`;
  console.log(
    `${nom.padEnd(20)} ${d('z_34')} ${d('z_17')} ${d('z0')} ${d('z13')} ${d('z26')} ${d('soleil')}`
  );
}

console.log('\n--- taille apparente (fraction de hauteur d’écran par unité de monde) ---');
for (const [nom] of ECRANS) {
  const a = REF[nom];
  const m = APRES[nom].m;
  console.log(
    `${nom.padEnd(20)} z=14 : ${n(a.echelle14 * 100, 3)} → ${n(m.echelle14 * 100, 3)} %/u   z=-17 : ${n(a.echelleFond * 100, 3)} → ${n(m.echelleFond * 100, 3)} %/u`
  );
}

console.log('\n--- la visée tactile (player.js:426-435), z rendu par le doigt ---');
console.log('écran                 doigt 50 %   60 %    70 %    80 %    90 %   100 %   course utile');
for (const [nom, aspect] of ECRANS) {
  const ref = reference(aspect).camera;
  const app = variante(aspect).camera;
  const ligne = (cam) =>
    [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
      .map((f) => {
        const z = viseeZ(cam, f);
        return (z === Infinity ? '∞' : n(z, 1)).padStart(6);
      })
      .join(' ');
  console.log(`${nom.padEnd(20)} av ${ligne(ref)}   ${pc(REF[nom].bande)}`);
  console.log(`${''.padEnd(20)} ap ${ligne(app)}   ${pc(APRES[nom].m.bande)}`);
}

// -------------------------------- G. LE HUD, EN PIXELS
console.log('\n=== G. LA COLONNE D’ACTION (iPhone 430 × 932, style.css) ===');
{
  const H = 932;
  const el = [
    ['✦ énergie (bouton)', 20, 84],
    ['◉ appel (bouton)', 96, 158],
    ['jauge de furie (décor)', 170, 300],
    ['fenêtre de dialogue (17 %)', 0, 0.17 * H],
  ];
  for (const [nom, bas, haut] of el) {
    console.log(
      `${nom.padEnd(28)} ${pc((H - haut) / H).padStart(7)} → ${pc((H - bas) / H).padStart(7)} de la hauteur`
    );
  }
  const a = REF['iPhone portrait'];
  const m = APRES['iPhone portrait'].m;
  console.log(`fond de zone (z=14)          ${pc(a.bas)} → ${pc(m.bas)}`);
  console.log(`vaisseau au repos (z=13)     ${pc(a.z13)} → ${pc(m.z13)}`);
  console.log(
    `marge sous le fond de zone jusqu'au premier BOUTON : ${((0.829 - m.bas) * H).toFixed(0)} px (avant : ${((0.829 - a.bas) * H).toFixed(0)} px)`
  );
}

// -------------------------------- H. LES ÉPREUVES
console.log('\n=== H. LES SIX ÉPREUVES DE test/cadrage.test.mjs, REJOUÉES ===');
let ko = 0;
for (const [nom, aspect] of ECRANS) {
  const m = APRES[nom].m;
  const s = APRES[nom].serrage;
  const ok1 = m.bord > 0 && m.bord >= 0.03;
  const ok3 = aspect < 1 || m.bord > 0.1;
  const ok6 = m.bas < 0.97;
  const ok2 = aspect > 0.8 || s <= 1;
  if (!ok1 || !ok3 || !ok6 || !ok2) ko++;
  console.log(
    `${nom.padEnd(20)} bord ${n(m.bord, 4)} ${ok1 ? 'OK' : 'ÉCHEC'} | paysage ${ok3 ? 'OK' : 'ÉCHEC'} | bas ${pc(m.bas)} ${ok6 ? 'OK' : 'ÉCHEC'} | serrage ${n(s, 3)} ${ok2 ? 'OK' : 'ÉCHEC'}`
  );
}
console.log(`épreuves en échec : ${ko}`);
console.log(
  `zone de jeu inchangée : playerZMax=${ARENA.playerZMax} bulletCullZMax=${ARENA.bulletCullZMax}`
);

// -------------------------------- I. CE QUE COÛTE LE PAS DE 4 % DE LA BOUCLE
console.log('\n=== I. LE QUANTUM DE LA BOUCLE (portrait seulement) ===');
for (const [nom, aspect] of ECRANS) {
  if (aspect >= 0.8) continue;
  const m = REF[nom];
  const exact = (m.bande * (1 - 2 * MARGE_BORD)) / (1 - 2 * m.bord);
  console.log(
    `${nom.padEnd(20)} bord obtenu ${n(m.bord, 4)} au lieu de ${MARGE_BORD} demandé → bande ${pc(m.bande)}, elle vaudrait ${pc(exact)} en résolvant exactement (+${((exact - m.bande) * 100).toFixed(2)} pt)`
  );
}

// -------------------------------- J. IDEMPOTENCE
console.log('\n=== J. IDEMPOTENCE (fitCamera rejoué trois fois) ===');
for (const [nom, aspect] of ECRANS) {
  const r = [0, 1, 2].map(() => {
    const v = variante(aspect);
    return `${n(v.camera.position.y, 6)}/${n(v.camera.position.z, 6)}`;
  });
  console.log(`${nom.padEnd(20)} ${r[0]} ${r[0] === r[1] && r[1] === r[2] ? '= = ' : 'DÉRIVE'}`);
}
