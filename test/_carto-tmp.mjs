// BANC DE CARTOGRAPHIE — jetable. Instrumente la chaîne de cadrage de bout en bout :
// on rejoue fitCamera hors navigateur, mais en ouvrant la boucle de ajusteCadrage
// pour voir, à chaque tour, LAQUELLE des deux conditions est encore fausse.

import * as THREE from 'three';
import { ARENA } from '../src/game/constants.js';

const HOME_DEF = new THREE.Vector3(0, 21, 27);
const CIBLE_DEF = new THREE.Vector3(0, 0, -3);
const MARGE_BORD = 0.035;
const MARGE_BAS = 0.04;

const v = new THREE.Vector3();
const bordGauche = (cam, z) => {
  v.set(-ARENA.playerXMax, 0, z).project(cam);
  return (v.x + 1) / 2;
};
const ecrY = (cam, x, z) => {
  v.set(x, 0, z).project(cam);
  return (1 - v.y) / 2;
};
const ecrX = (cam, x, z) => {
  v.set(x, 0, z).project(cam);
  return (v.x + 1) / 2;
};
const basY = (cam) => ecrY(cam, 0, ARENA.playerZMax);

// Réplique paramétrée de fitCamera + ajusteCadrage. Les valeurs par défaut sont
// EXACTEMENT celles du jeu ; chaque paramètre est un des leviers qu'on veut sonder.
function cadre(
  aspect,
  {
    fovCap = 72,
    fovBase = 56,
    fovExp = 0.4,
    pullCap = 1.85,
    squeezeRef = 1.78,
    squeezeExp = 0.55,
    home = HOME_DEF,
    cible = CIBLE_DEF,
    serrageDepart = null,
    pasSerrage = 1.04,
    serrageMax = 1.85,
    trace = false,
  } = {}
) {
  const squeeze = Math.max(1, Math.pow(squeezeRef / aspect, squeezeExp));
  const fov = Math.min(fovCap, fovBase * Math.pow(squeeze, fovExp));
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 900);
  const pose = (serrage) => {
    const pullback = Math.min(pullCap, squeeze) * serrage;
    camera.position.copy(home).sub(cible).multiplyScalar(pullback).add(cible);
    camera.lookAt(cible);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  let serrage = serrageDepart ?? (aspect < 0.8 ? 0.75 : 1);
  pose(serrage);
  const tours = [];
  for (let i = 0; i < 30 && serrage < serrageMax; i++) {
    const b = bordGauche(camera, ARENA.playerZMax);
    const y = basY(camera);
    const okBord = b >= MARGE_BORD;
    const okBas = y < 1 - MARGE_BAS;
    tours.push({ i, serrage, b, y, okBord, okBas });
    if (okBord && okBas) break;
    serrage *= pasSerrage;
    pose(serrage);
  }
  if (trace) {
    console.log(
      `   squeeze=${squeeze.toFixed(4)}  fovBrut=${(fovBase * Math.pow(squeeze, fovExp)).toFixed(2)}  fov=${fov.toFixed(2)}  pullCap actif=${squeeze > pullCap}`
    );
    for (const t of tours) {
      console.log(
        `   tour ${String(t.i).padStart(2)} serrage=${t.serrage.toFixed(5)} pullback=${(Math.min(pullCap, squeeze) * t.serrage).toFixed(4)}` +
          `  bord=${t.b.toFixed(5)} ${t.okBord ? 'OK ' : 'NON'}` +
          `  bas=${(t.y * 100).toFixed(2)}% ${t.okBas ? 'OK ' : 'NON'}`
      );
    }
  }
  const yHaut = ecrY(camera, 0, ARENA.playerZMin);
  const yBas = basY(camera);
  return {
    camera,
    squeeze,
    fov: camera.fov,
    serrage,
    pullback: Math.min(pullCap, squeeze) * serrage,
    bord: bordGauche(camera, ARENA.playerZMax),
    bordFond: bordGauche(camera, ARENA.playerZMin),
    yHaut,
    yBas,
    bande: yBas - yHaut,
    videBas: 1 - yBas,
    larg: ecrX(camera, ARENA.playerXMax, ARENA.playerZMax) - ecrX(camera, -ARENA.playerXMax, ARENA.playerZMax),
    tours,
    camY: camera.position.y,
    camZ: camera.position.z,
  };
}

const IPH = 430 / 932; // 0.4614
const PAYSAGE = [
  ['téléphone paysage', 932 / 430],
  ['ordinateur 16/9', 16 / 9],
  ['ordinateur 21/9', 21 / 9],
  ['iPad paysage', 1180 / 820],
];
const PORTRAITS = [
  ['iPhone portrait', 430 / 932],
  ['iPhone 14 portrait', 393 / 852],
  ['iPhone SE portrait', 375 / 667],
  ['Android portrait', 412 / 915],
  ['iPad portrait', 820 / 1180],
];

const ligne = (nom, r) =>
  [
    nom.padEnd(22),
    r.fov.toFixed(2).padEnd(7),
    r.serrage.toFixed(4).padEnd(8),
    r.pullback.toFixed(3).padEnd(8),
    r.camY.toFixed(2).padEnd(8),
    r.camZ.toFixed(2).padEnd(8),
    r.bord.toFixed(4).padEnd(8),
    (r.yHaut * 100).toFixed(1).padEnd(7),
    (r.yBas * 100).toFixed(1).padEnd(7),
    (r.bande * 100).toFixed(1).padEnd(7),
    (r.videBas * 100).toFixed(1).padEnd(7),
    (r.larg * 100).toFixed(1).padEnd(7),
    String(r.tours.length).padEnd(6),
  ].join('');
const ENTETE =
  'cas'.padEnd(22) +
  'fov'.padEnd(7) +
  'serr'.padEnd(8) +
  'pull'.padEnd(8) +
  'camY'.padEnd(8) +
  'camZ'.padEnd(8) +
  'bord'.padEnd(8) +
  'haut%'.padEnd(7) +
  'bas%'.padEnd(7) +
  'bande%'.padEnd(7) +
  'vide%'.padEnd(7) +
  'larg%'.padEnd(7) +
  'tours';

console.log('=========================================================================');
console.log('A. RÉFÉRENCE — le cadrage actuel, tel quel');
console.log('=========================================================================');
console.log(ENTETE);
for (const [n, a] of [...PORTRAITS, ...PAYSAGE]) console.log(ligne(n, cadre(a)));

console.log('');
console.log('=========================================================================');
console.log('B. LA BOUCLE, OUVERTE — iPhone portrait (aspect 0.4614)');
console.log('=========================================================================');
cadre(IPH, { trace: true });

console.log('');
console.log('  Seuils de serrage : à partir de quel serrage chaque condition passe ?');
{
  let sBord = null;
  let sBas = null;
  for (let s = 0.2; s <= 3.0; s += 0.0005) {
    const r = cadre(IPH, { serrageDepart: s, serrageMax: 0 }); // serrageMax=0 : pose seule, pas de boucle
    if (sBord === null && r.bord >= MARGE_BORD) sBord = s;
    if (sBas === null && r.yBas < 1 - MARGE_BAS) sBas = s;
    if (sBord !== null && sBas !== null) break;
  }
  console.log(`   bordGauche >= ${MARGE_BORD} dès serrage = ${sBord === null ? 'JAMAIS' : sBord.toFixed(4)}`);
  console.log(`   basVisible (bas < ${(100 * (1 - MARGE_BAS)).toFixed(0)}%) dès serrage = ${sBas === null ? 'JAMAIS' : sBas.toFixed(4)}`);
  const r0 = cadre(IPH, { serrageDepart: 0.75, serrageMax: 0 });
  console.log(
    `   au serrage de départ 0.75 : bord=${r0.bord.toFixed(5)} (seuil ${MARGE_BORD}), bas=${(r0.yBas * 100).toFixed(2)}% (seuil 96%)`
  );
}

console.log('');
console.log('  Le même diagnostic sur tous les écrans : seuil de chaque condition');
console.log('  (serrage minimal qui la satisfait ; « — » = satisfaite dès 0.20)');
for (const [n, a] of [...PORTRAITS, ...PAYSAGE]) {
  let sBord = '—';
  let sBas = '—';
  for (let s = 0.2; s <= 3.0; s += 0.001) {
    const r = cadre(a, { serrageDepart: s, serrageMax: 0 });
    if (sBord === '—' && s === 0.2 && r.bord < MARGE_BORD) sBord = null;
    if (sBas === '—' && s === 0.2 && r.yBas >= 1 - MARGE_BAS) sBas = null;
    if (sBord === null && r.bord >= MARGE_BORD) sBord = s.toFixed(3);
    if (sBas === null && r.yBas < 1 - MARGE_BAS) sBas = s.toFixed(3);
  }
  console.log(`   ${n.padEnd(22)} bord: ${String(sBord).padEnd(8)} bas: ${String(sBas).padEnd(8)}`);
}

console.log('');
console.log('=========================================================================');
console.log('C. LEVIER 1 — le plafond de fov (72 aujourd’hui), iPhone portrait');
console.log('=========================================================================');
console.log(ENTETE);
for (const cap of [50, 56, 60, 64, 68, 72, 76, 80, 85, 90, 100]) {
  console.log(ligne(`fovCap=${cap}`, cadre(IPH, { fovCap: cap })));
}
console.log('  effet sur le paysage 16/9 (fov brut y vaut 56, donc sous tout plafond >= 56) :');
for (const cap of [50, 56, 72, 90]) console.log(ligne(`  16/9 fovCap=${cap}`, cadre(16 / 9, { fovCap: cap })));

console.log('');
console.log('=========================================================================');
console.log('D. LEVIER 2 — le plafond de pullback (1.85 aujourd’hui), iPhone portrait');
console.log('=========================================================================');
console.log(ENTETE);
for (const cap of [1.0, 1.2, 1.4, 1.6, 1.85, 2.1, 2.5, 3.0]) {
  console.log(ligne(`pullCap=${cap}`, cadre(IPH, { pullCap: cap })));
}
console.log('  (squeeze vaut ' + cadre(IPH).squeeze.toFixed(4) + ' : le plafond ne mord que sous cette valeur)');
console.log('  effet sur le paysage 16/9 (squeeze=1, donc min(cap,1)=1 tant que cap>=1) :');
for (const cap of [0.8, 1.0, 1.85, 3.0]) console.log(ligne(`  16/9 pullCap=${cap}`, cadre(16 / 9, { pullCap: cap })));

console.log('');
console.log('=========================================================================');
console.log('E. LEVIER 3 — CAMERA_HOME (0, 21, 27), iPhone portrait puis 16/9');
console.log('=========================================================================');
console.log(ENTETE);
for (const [y, z] of [
  [12, 27],
  [16, 27],
  [21, 27],
  [26, 27],
  [32, 27],
  [21, 20],
  [21, 24],
  [21, 30],
  [21, 34],
  [14, 20],
  [28, 34],
]) {
  const h = new THREE.Vector3(0, y, z);
  console.log(ligne(`HOME(${y},${z}) portrait`, cadre(IPH, { home: h })));
}
console.log('  --- le même en 16/9, pour voir ce que le paysage encaisse ---');
for (const [y, z] of [
  [12, 27],
  [16, 27],
  [21, 27],
  [26, 27],
  [21, 20],
  [21, 34],
]) {
  const h = new THREE.Vector3(0, y, z);
  console.log(ligne(`HOME(${y},${z}) 16/9`, cadre(16 / 9, { home: h })));
}

console.log('');
console.log('=========================================================================');
console.log('F. LEVIER 4 — CAMERA_TARGET (0, 0, -3), iPhone portrait puis 16/9');
console.log('=========================================================================');
console.log(ENTETE);
for (const z of [-12, -8, -3, 0, 3, 7, 10]) {
  const c = new THREE.Vector3(0, 0, z);
  console.log(ligne(`TARGET z=${z} portrait`, cadre(IPH, { cible: c })));
}
for (const z of [-12, -3, 3, 10]) {
  const c = new THREE.Vector3(0, 0, z);
  console.log(ligne(`TARGET z=${z} 16/9`, cadre(16 / 9, { cible: c })));
}
console.log('  TARGET y (la caméra vise le plan de jeu ; monter la cible fait piquer) :');
for (const y of [-6, -3, 0, 3, 6]) {
  const c = new THREE.Vector3(0, y, -3);
  console.log(ligne(`TARGET y=${y} portrait`, cadre(IPH, { cible: c })));
}

console.log('');
console.log('=========================================================================');
console.log('G. CONTRÔLE — le serrage de départ (0.75 en portrait) et le pas (1.04)');
console.log('=========================================================================');
console.log(ENTETE);
for (const s of [0.5, 0.6, 0.75, 0.9, 1.0, 1.2]) {
  console.log(ligne(`départ=${s}`, cadre(IPH, { serrageDepart: s })));
}
console.log('  (la boucle converge toujours vers le même serrage utile : le départ ne');
console.log('   décide que du pas de quantification, sauf s’il part DÉJÀ au-dessus)');

console.log('');
console.log('=========================================================================');
console.log('H. LE FOV EST-IL SATURÉ ? fov brut = 56*squeeze^0.4 par écran');
console.log('=========================================================================');
for (const [n, a] of [...PORTRAITS, ...PAYSAGE]) {
  const sq = Math.max(1, Math.pow(1.78 / a, 0.55));
  const brut = 56 * Math.pow(sq, 0.4);
  console.log(
    `   ${n.padEnd(22)} aspect=${a.toFixed(4)} squeeze=${sq.toFixed(4)} fovBrut=${brut.toFixed(2)} -> fov=${Math.min(72, brut).toFixed(2)} ${brut > 72 ? '(PLAFONNÉ)' : ''} ${sq > 1.85 ? '  pullback PLAFONNÉ' : ''}`
  );
}
