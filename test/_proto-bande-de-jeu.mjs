// BANC JETABLE — APPROCHE C : LA BANDE DE JEU.
//
// L'idée en une phrase : la fenêtre n'est plus la surface de rendu. On rend le jeu
// dans un rectangle dont le rapport d'image est PLAFONNÉ (jamais plus étroit qu'un
// plancher donné), collé en haut de l'écran, et la lanière qui reste en bas devient
// une vraie surface d'interface — le pont — au lieu d'être du vide inerte.
//
// POURQUOI ÇA MARCHE LÀ OÙ LE FOV ET LE RECUL SONT MORTS. La cartographie a montré
// que sous la contrainte de bord, fov et distance s'annulent : la subtension
// horizontale de l'arène est épinglée, donc le champ vertical l'est aussi PAR
// L'ASPECT, donc la bande de profondeur l'est aussi. La seule grandeur qu'on n'avait
// jamais touchée dans cette chaîne, c'est l'aspect lui-même — parce qu'on le
// recopiait bêtement de la fenêtre. Le plancher d'aspect est la seule commande qui
// entre dans l'équation par le bon bout.
//
// Ce banc rejoue fitCamera hors navigateur, en version de référence et en version
// « bande de jeu », et mesure ce que Paul voit : la hauteur de la bande jouable, le
// vide sous elle, et la TAILLE APPARENTE en pixels du vaisseau et des ennemis.
//
// Lancement : node test/_proto-bande-de-jeu.mjs
// (non ramassé par npm test, qui ne globe que test/**/*.test.mjs)

import * as THREE from 'three';
import { ajusteCadrage, bordArene } from '../src/game/arena.js';
import { ARENA } from '../src/game/constants.js';

const HOME = new THREE.Vector3(0, 21, 27);
const CIBLE = new THREE.Vector3(0, 0, -3);

// fitCamera, à l'identique de src/main.js:48-82. Le seul paramètre est l'aspect —
// et c'est précisément là que la bande de jeu s'insère : elle donne à cette
// fonction l'aspect du RECTANGLE DE RENDU, pas celui de la fenêtre.
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

// LA BANDE DE JEU. Trois lignes, et c'est tout le correctif côté géométrie : on
// garde toute la largeur, on rogne la hauteur par le bas jusqu'à ce que le rapport
// atteigne le plancher. En paysage la condition est déjà satisfaite, donc rien ne
// bouge — pas d'arrondi, pas de branche : le même calcul rend l'identité.
function bandeDeJeu(wPx, hPx, plancher) {
  const hRendu = Math.min(hPx, Math.round(wPx / plancher));
  return { w: wPx, h: hRendu, pont: hPx - hRendu, aspect: wPx / hRendu };
}

const v = new THREE.Vector3();
const ecrY = (cam, z) => {
  v.set(0, 0, z).project(cam);
  return (1 - v.y) / 2; // 0 = haut du RECTANGLE DE RENDU, 1 = bas
};
const ecrX = (cam, x, z) => {
  v.set(x, 0, z).project(cam);
  return (v.x + 1) / 2;
};

// Combien de pixels fait une unité de monde, à la profondeur z, sur le plan de jeu.
// C'est la mesure de « les ennemis sont minuscules » : elle ne dépend QUE de la
// distance caméra→point, du champ vertical et de la hauteur en pixels du rendu.
function pxParUnite(cam, z, hPx) {
  const d = Math.hypot(cam.position.y, cam.position.z - z);
  const demiChamp = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  return hPx / (2 * d * demiChamp);
}

function mesure(cam, hPx, hEcranPx) {
  const haut = ecrY(cam, ARENA.playerZMin);
  const bas = ecrY(cam, ARENA.playerZMax);
  return {
    fov: cam.fov,
    camY: cam.position.y,
    camZ: cam.position.z,
    haut,
    bas,
    bande: bas - haut,
    videBas: 1 - bas,
    // La même bande, rapportée à l'ÉCRAN et non au rectangle de rendu. C'est le
    // chiffre honnête : rogner le rendu améliore le premier ratio par
    // construction, seul le second dit si le joueur y gagne vraiment.
    bandeEcran: (bas - haut) * (hPx / hEcranPx),
    bord: bordArene(cam),
    larg: ecrX(cam, ARENA.playerXMax, ARENA.playerZMax) - ecrX(cam, -ARENA.playerXMax, ARENA.playerZMax),
    pxJoueur: pxParUnite(cam, ARENA.playerZ, hPx),
    pxFormation: pxParUnite(cam, -17, hPx),
    yJoueurEcran: (ecrY(cam, ARENA.playerZ) * hPx) / hEcranPx,
  };
}

// Écrans réels, en pixels CSS. Les mêmes que le tableau du diagnostic.
const ECRANS = [
  ['iPhone portrait', 430, 932],
  ['iPhone SE portrait', 375, 667],
  ['Android portrait', 412, 915],
  ['iPad portrait', 820, 1180],
  ['téléphone paysage', 932, 430],
  ['ordinateur 16/9', 1600, 900],
  ['ordinateur large', 2100, 900],
  ['iPad paysage', 1180, 820],
];

const pc = (x) => (x * 100).toFixed(1) + '%';
const col = (s, n) => String(s).padEnd(n);

// ---------------------------------------------------------------- A. RÉFÉRENCE
console.log('=== A. RÉFÉRENCE (code actuel, aspect = celui de la fenêtre) ===\n');
console.log(
  col('écran', 22) + col('aspect', 8) + col('fov', 7) + col('camY', 7) + col('camZ', 7) +
  col('bord', 8) + col('bande', 8) + col('vide', 8) + col('larg', 8) +
  col('px/u @joueur', 14) + col('px/u @form', 12)
);
const REF = {};
for (const [nom, w, h] of ECRANS) {
  const { camera } = cadre(w / h);
  const m = mesure(camera, h, h);
  REF[nom] = m;
  console.log(
    col(nom, 22) + col((w / h).toFixed(3), 8) + col(m.fov.toFixed(2), 7) +
    col(m.camY.toFixed(1), 7) + col(m.camZ.toFixed(1), 7) + col(m.bord.toFixed(4), 8) +
    col(pc(m.bande), 8) + col(pc(m.videBas), 8) + col(pc(m.larg), 8) +
    col(m.pxJoueur.toFixed(1), 14) + col(m.pxFormation.toFixed(1), 12)
  );
}

// -------------------------------------------- B. BALAYAGE DU PLANCHER D'ASPECT
console.log('\n\n=== B. BALAYAGE DU PLANCHER, sur iPhone portrait 430×932 ===\n');
console.log(
  col('plancher', 10) + col('rendu px', 12) + col('pont px', 10) + col('fov', 7) +
  col('camZ', 7) + col('bord', 8) + col('bande/rendu', 13) + col('bande/écran', 13) +
  col('vide/rendu', 12) + col('px/u @joueur', 14) + col('px/u @form', 12) + col('fill %', 8)
);
for (const p of [0.461, 0.50, 0.55, 0.60, 0.62, 0.65, 0.70, 0.75, 0.80, 0.90, 1.0, 1.2]) {
  const b = bandeDeJeu(430, 932, p);
  const { camera } = cadre(b.aspect);
  const m = mesure(camera, b.h, 932);
  console.log(
    col(p.toFixed(3), 10) + col(`${b.w}×${b.h}`, 12) + col(b.pont, 10) +
    col(m.fov.toFixed(1), 7) + col(m.camZ.toFixed(1), 7) + col(m.bord.toFixed(4), 8) +
    col(pc(m.bande), 13) + col(pc(m.bandeEcran), 13) + col(pc(m.videBas), 12) +
    col(m.pxJoueur.toFixed(1), 14) + col(m.pxFormation.toFixed(1), 12) +
    col(((b.h / 932) * 100).toFixed(0) + '%', 8)
  );
}

// ------------------------------------------------------ C. LA VARIANTE RETENUE
const PLANCHER = 0.62;
console.log(`\n\n=== C. VARIANTE RETENUE — plancher d'aspect ${PLANCHER} ===\n`);
console.log(
  col('écran', 22) + col('rendu', 11) + col('pont', 7) + col('fov', 7) + col('camY', 7) +
  col('camZ', 7) + col('bord', 8) + col('bande', 8) + col('vide', 8) + col('larg', 8) +
  col('px/u @j', 9) + col('px/u @f', 9)
);
const PROTO = {};
for (const [nom, w, h] of ECRANS) {
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera } = cadre(b.aspect);
  const m = mesure(camera, b.h, h);
  PROTO[nom] = { m, b };
  console.log(
    col(nom, 22) + col(`${b.w}×${b.h}`, 11) + col(b.pont, 7) + col(m.fov.toFixed(2), 7) +
    col(m.camY.toFixed(1), 7) + col(m.camZ.toFixed(1), 7) + col(m.bord.toFixed(4), 8) +
    col(pc(m.bande), 8) + col(pc(m.videBas), 8) + col(pc(m.larg), 8) +
    col(m.pxJoueur.toFixed(1), 9) + col(m.pxFormation.toFixed(1), 9)
  );
}

// -------------------------------------------------------------- D. AVANT/APRÈS
console.log('\n\n=== D. AVANT / APRÈS ===\n');
console.log(
  col('écran', 22) + col('bande av.', 11) + col('bande ap.', 11) + col('×', 7) +
  col('vide av.', 10) + col('vide ap.', 10) + col('bord av.', 10) + col('bord ap.', 10) +
  col('px/u av.', 10) + col('px/u ap.', 10) + col('×', 7)
);
for (const [nom] of ECRANS) {
  const a = REF[nom];
  const { m } = PROTO[nom];
  console.log(
    col(nom, 22) + col(pc(a.bande), 11) + col(pc(m.bande), 11) +
    col((m.bande / a.bande).toFixed(2), 7) +
    col(pc(a.videBas), 10) + col(pc(m.videBas), 10) +
    col(a.bord.toFixed(4), 10) + col(m.bord.toFixed(4), 10) +
    col(a.pxJoueur.toFixed(1), 10) + col(m.pxJoueur.toFixed(1), 10) +
    col((m.pxJoueur / a.pxJoueur).toFixed(2), 7)
  );
}

// ----------------------------------------- E. LE PAYSAGE EST-IL FIGÉ, AU BIT ?
console.log('\n\n=== E. CONTRAINTE 4 — le paysage ne bouge pas (comparaison stricte) ===\n');
let paysageIntact = true;
for (const [nom, w, h] of ECRANS) {
  if (w < h) continue;
  const a = REF[nom];
  const { m, b } = PROTO[nom];
  const identique =
    a.fov === m.fov && a.camY === m.camY && a.camZ === m.camZ &&
    a.bord === m.bord && a.bande === m.bande && b.pont === 0;
  if (!identique) paysageIntact = false;
  console.log(
    col(nom, 22) + col(identique ? 'IDENTIQUE au bit' : '*** A BOUGÉ ***', 20) +
    `pont=${b.pont}px  fov ${a.fov.toFixed(4)}→${m.fov.toFixed(4)}  camZ ${a.camZ.toFixed(4)}→${m.camZ.toFixed(4)}  bord ${a.bord.toFixed(6)}→${m.bord.toFixed(6)}`
  );
}
console.log(`\n  → paysage intact : ${paysageIntact}`);

// ----------------------------------- F. CONTRAINTE 1 — la simulation ne bouge pas
console.log('\n\n=== F. CONTRAINTE 1 — ARENA est-elle touchée ? ===\n');
const avant = JSON.stringify(ARENA);
for (const [, w, h] of ECRANS) {
  const b = bandeDeJeu(w, h, PLANCHER);
  cadre(b.aspect);
}
console.log('  ARENA modifiée par le prototype ? ' + (JSON.stringify(ARENA) !== avant));
console.log('  playerZMax=' + ARENA.playerZMax + '  bulletCullZMax=' + ARENA.bulletCullZMax);

// -------------------------- G. CONTRAINTE 2 — les bords, suivi latéral compris
// ajusteCadrage vérifie le bord sur une caméra CENTRÉE. En jeu, main.js:243-249 la
// décale de player.x × 0.22 et vise CAMERA_TARGET.x + followX×0.5. La cartographie
// a montré que le bord OPPOSÉ — celui où le fantôme de bouclage ressort — sort déjà
// du cadre en portrait aujourd'hui. On mesure les deux bords dans les deux versions.
console.log('\n\n=== G. CONTRAINTE 2 — les deux bords, avec le suivi latéral appliqué ===\n');
function bordsAvecSuivi(camera, aspectRendu) {
  const c = camera.clone();
  c.aspect = aspectRendu;
  const followX = ARENA.playerXMax * 0.22; // le joueur collé au bord droit
  c.position.set(camera.position.x + followX, camera.position.y, camera.position.z);
  c.lookAt(CIBLE.x + followX * 0.5, CIBLE.y, CIBLE.z);
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
  // Le bord qu'on longe (droit, vers lequel la caméra s'est déplacée) et le bord
  // opposé (gauche), où le fantôme ressort.
  const longe = 1 - ecrX(c, ARENA.playerXMax, ARENA.playerZMax);
  const oppose = ecrX(c, -ARENA.playerXMax, ARENA.playerZMax);
  return { longe, oppose };
}
console.log(
  col('écran', 22) + col('longé av.', 11) + col('longé ap.', 11) +
  col('opposé av.', 12) + col('opposé ap.', 12) + col('verdict', 20)
);
for (const [nom, w, h] of ECRANS) {
  const { camera: cRef } = cadre(w / h);
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera: cPro } = cadre(b.aspect);
  const a = bordsAvecSuivi(cRef, w / h);
  const p = bordsAvecSuivi(cPro, b.aspect);
  const verdict = p.oppose >= 0 ? (a.oppose < 0 ? 'RÉPARÉ' : 'ok') : 'toujours dehors';
  console.log(
    col(nom, 22) + col(a.longe.toFixed(4), 11) + col(p.longe.toFixed(4), 11) +
    col(a.oppose.toFixed(4), 12) + col(p.oppose.toFixed(4), 12) + col(verdict, 20)
  );
}

// ------------------------------- H. CONTRAINTE 3 — le bas de la zone dans le cadre
console.log('\n\n=== H. CONTRAINTE 3 — bas de la zone vs bas du RENDU (seuil 96 %) ===\n');
for (const [nom, w, h] of ECRANS) {
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera } = cadre(b.aspect);
  const m = mesure(camera, b.h, h);
  console.log(
    col(nom, 22) + col('bas rendu ' + pc(m.bas), 20) +
    col('réserve ' + ((0.96 - m.bas) * 100).toFixed(1) + ' pts', 20) +
    col(m.bas < 0.96 ? 'OK' : '*** DEHORS ***', 16)
  );
}

// ---------------------------------------- I. LA VISÉE TACTILE, AVANT ET APRÈS
// aimPoint déprojette le doigt sur le plan y=0 et écrête z à [0,14]. En référence,
// le doigt est converti en NDC contre la FENÊTRE ; dans la bande de jeu, il l'est
// contre le RECTANGLE DE RENDU, et tout ce qui tombe dans le pont est rabattu sur
// le bas du rectangle — soit z = playerZMax, exactement le comportement actuel des
// 36 % du bas. Personne ne perd de course : on la rend seulement plus fine.
console.log('\n\n=== I. VISÉE TACTILE — z visé selon la hauteur du doigt sur L’ÉCRAN ===\n');
function zVise(camera, ndcY) {
  const dir = new THREE.Vector3(0, ndcY, 0.5).unproject(camera).sub(camera.position);
  const t = -camera.position.y / dir.y;
  return THREE.MathUtils.clamp(camera.position.z + dir.z * t, ARENA.playerZMin, ARENA.playerZMax);
}
{
  const [, w, h] = ECRANS[0];
  const { camera: cRef } = cadre(w / h);
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera: cPro } = cadre(b.aspect);
  console.log(col('doigt (% écran)', 18) + col('z visé — av.', 16) + col('z visé — ap.', 16));
  for (const f of [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.74, 0.80, 0.90, 1.0]) {
    const ndcRef = 1 - 2 * f;
    // Dans la variante, le doigt est rapporté au rectangle de rendu ; sous le
    // rectangle (le pont), il est écrêté à son bord bas.
    const fRendu = Math.min(1, (f * h) / b.h);
    const ndcPro = 1 - 2 * fRendu;
    console.log(
      col(pc(f), 18) + col(zVise(cRef, ndcRef).toFixed(1), 16) + col(zVise(cPro, ndcPro).toFixed(1), 16)
    );
  }
  // Course utile : quelle part de l'écran commande réellement la profondeur.
  const utileRef = (14 - 0) / 1; // pour mémoire
  void utileRef;
}

// ------------------------------- J. CE QUE LE PONT DOIT ACCUEILLIR (mise en page)
console.log('\n\n=== J. LE PONT — dimensions, et ce que le HUD y met déjà ===\n');
console.log(
  col('écran', 22) + col('écran px', 12) + col('rendu px', 12) + col('pont px', 11) +
  col('pont %', 9) + col('colonne d’action (214 px) ?', 28)
);
for (const [nom, w, h] of ECRANS) {
  const b = bandeDeJeu(w, h, PLANCHER);
  console.log(
    col(nom, 22) + col(`${w}×${h}`, 12) + col(`${b.w}×${b.h}`, 12) + col(b.pont, 11) +
    col(((b.pont / h) * 100).toFixed(1) + '%', 9) +
    col(b.pont === 0 ? 'n/a (paysage, pont nul)' : b.pont >= 214 ? 'tient entièrement' : 'déborde de ' + (214 - b.pont) + ' px', 28)
  );
}

// ------------------------- K. LE COÛT DE RENDU (le pont n'est plus dessiné en 3D)
console.log('\n\n=== K. COÛT DE RENDU — pixels de fragment économisés ===\n');
for (const [nom, w, h] of ECRANS) {
  const b = bandeDeJeu(w, h, PLANCHER);
  const gain = 1 - (b.w * b.h) / (w * h);
  console.log(col(nom, 22) + col((w * h).toLocaleString('fr-FR') + ' px', 16) +
    col((b.w * b.h).toLocaleString('fr-FR') + ' px', 16) +
    col('−' + (gain * 100).toFixed(0) + ' %', 10));
}

// ------------------- L. LES SEUILS PROPOSÉS PAR L'ÉQUIPE DE TEST (bande ≥ 22 %,
//                       vide ≤ 25 %) — la variante les franchit-elle ?
console.log('\n\n=== L. SEUILS PROPOSÉS PAR L’ÉQUIPE DE TEST (bande ≥ 22 %, vide ≤ 25 %) ===\n');
for (const [nom, w, h] of ECRANS) {
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera } = cadre(b.aspect);
  const m = mesure(camera, b.h, h);
  const ok = m.bande >= 0.22 && m.videBas <= 0.25;
  console.log(
    col(nom, 22) + col('bande ' + pc(m.bande), 16) + col('vide ' + pc(m.videBas), 16) +
    col(ok ? 'PASSE' : '*** ÉCHOUE ***', 16)
  );
}

// -------------------- M. LE DÉCOR LOINTAIN : space.setFraming suit-il tout seul ?
console.log('\n\n=== M. AVAL — space.setFraming(tan(fov/2)·aspect) ===\n');
for (const [nom, w, h] of ECRANS) {
  const { camera: cRef } = cadre(w / h);
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera: cPro } = cadre(b.aspect);
  const t = (c) => Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * c.aspect;
  const f = (x) => Math.min(1, x / 0.946);
  console.log(
    col(nom, 22) + col('tanHalfH ' + t(cRef).toFixed(4) + ' → ' + t(cPro).toFixed(4), 34) +
    col('framing ' + f(t(cRef)).toFixed(3) + ' → ' + f(t(cPro)).toFixed(3), 30) +
    col('soleil r ' + (26 * f(t(cRef))).toFixed(1) + ' → ' + (26 * f(t(cPro))).toFixed(1), 26)
  );
}

// --------------- N. LE SOLEIL, LE HAUT DU CADRE, ET LES PLANS D'EFFACEMENT
console.log('\n\n=== N. HAUT ET BAS DU CADRE — le soleil, et ce qui ne doit pas se voir ===\n');
function yEcranPoint(cam, x, y, z) {
  const p = new THREE.Vector3(x, y, z).project(cam);
  return (1 - p.y) / 2;
}
console.log(
  col('écran', 22) + col('soleil av.', 12) + col('soleil ap.', 12) +
  col('gemmes z=18', 14) + col('modules z=19', 14) + col('balles z=26', 14)
);
for (const [nom, w, h] of ECRANS) {
  const { camera: cRef } = cadre(w / h);
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera: cPro } = cadre(b.aspect);
  const s = (c) => pc(yEcranPoint(c, 0, 34, -150));
  const g = (c, z) => {
    const y = ecrY(c, z);
    return y > 1 ? 'hors' : pc(y);
  };
  console.log(
    col(nom, 22) + col(s(cRef), 12) + col(s(cPro), 12) +
    col(g(cRef, 18) + '→' + g(cPro, 18), 14) +
    col(g(cRef, 19) + '→' + g(cPro, 19), 14) +
    col(g(cRef, 26) + '→' + g(cPro, 26), 14)
  );
}

// ------------------------------- O. LA PLONGÉE — reste-t-elle à 35° partout ?
console.log('\n\n=== O. LA PENTE DE CAMÉRA (les neuf fichiers calibrés « 35 degrés ») ===\n');
for (const [nom, w, h] of ECRANS) {
  const { camera: cRef } = cadre(w / h);
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera: cPro } = cadre(b.aspect);
  const p = (c) => (Math.atan2(c.position.y, c.position.z - CIBLE.z) * 180) / Math.PI;
  console.log(col(nom, 22) + col(p(cRef).toFixed(2) + '° → ' + p(cPro).toFixed(2) + '°', 22));
}

// ---------------------- P. LA ZONE MORTE DE LA PIROUETTE (1,8 u en pixels d'écran)
console.log('\n\n=== P. ZONE MORTE DE LA PIROUETTE (ROLL.tapDeadzone = 1,8 u) ===\n');
for (const [nom, w, h] of ECRANS) {
  const { camera: cRef } = cadre(w / h);
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera: cPro } = cadre(b.aspect);
  // Largeur en px d'une unité monde au plan du joueur, mesurée à l'horizontale.
  const pxU = (c, wPx) => (ecrX(c, 1, ARENA.playerZ) - ecrX(c, 0, ARENA.playerZ)) * wPx;
  console.log(
    col(nom, 22) +
    col((1.8 * pxU(cRef, w)).toFixed(0) + ' px → ' + (1.8 * pxU(cPro, b.w)).toFixed(0) + ' px', 24) +
    col(((1.8 * pxU(cRef, w)) / w * 100).toFixed(1) + ' % → ' + ((1.8 * pxU(cPro, b.w)) / b.w * 100).toFixed(1) + ' % de la largeur', 34)
  );
}

// ------------- Q. LA BANDE VITALE [-20 ; +16,3] tient-elle toujours dans le cadre ?
console.log('\n\n=== Q. LA BANDE VITALE z ∈ [−20 ; +16,3] (dossier « profondeur de monde ») ===\n');
for (const [nom, w, h] of ECRANS) {
  const b = bandeDeJeu(w, h, PLANCHER);
  const { camera } = cadre(b.aspect);
  const yFond = ecrY(camera, -20);
  const yAvant = ecrY(camera, 16.3);
  console.log(
    col(nom, 22) + col('z=−20 à ' + pc(yFond), 18) + col('z=+16,3 à ' + pc(yAvant), 20) +
    col('épaisseur ' + pc(yAvant - yFond), 20) +
    col(yFond > 0 && yAvant < 1 ? 'les deux dans le cadre' : '*** un bout dehors ***', 26)
  );
}

// ============================================================================
//  R. LA VARIANTE FORTE — LE PONT PAR DÉCOUPE DE FRUSTUM (setViewOffset)
// ============================================================================
//
// Ce que la section D vient de montrer, et qu'il faut regarder en face : plafonner
// le RAPPORT du rendu améliore la proportion (12,0 % → 16,0 % de bande) mais laisse
// la taille apparente EXACTEMENT où elle était (12,9 → 12,6 px par unité). Pire, la
// zone de jeu remonte au milieu de l'écran (le vaisseau passe de 63 % à 51 % de la
// hauteur) : on a déplacé le vide au lieu de le supprimer.
//
// La raison est mécanique et vaut d'être écrite une fois pour toutes. La contrainte
// de bord impose que l'arène — vingt-neuf unités — occupe la largeur du rendu à la
// marge près. Donc px/unité au plan du joueur = largeur_en_pixels / 31,2, POINT.
// Sur un téléphone de 430 px de large, c'est 13,8 px par unité et rien, dans aucune
// caméra, ne peut le changer. La bande de profondeur en PIXELS est ce nombre
// multiplié par quatorze unités et par l'écrasement de la plongée : 112 px sur
// iPhone, invariante elle aussi. Aucune approche qui respecte la contrainte 2 ne
// peut grossir quoi que ce soit. Elle peut seulement CESSER DE GASPILLER.
//
// D'où la variante forte : on ne touche pas du tout à la caméra — pose bit-identique
// à aujourd'hui sur les huit écrans — et on DÉCOUPE le bas de son image, qui ne
// montre que du vide, pour le rendre au pont. camera.setViewOffset fait exactement
// cela : il rend un sous-rectangle d'une image virtuelle plus grande, sans changer
// ni la pose, ni le champ, ni un seul pixel de ce qui reste.
//
// La hauteur du pont n'est pas un réglage : elle se DÉDUIT des constantes déjà
// écrites. On garde ce que le paysage montre déjà — la coque entière du vaisseau à
// sa position la plus reculée, z = playerZMax + playerZMargin = 16,2 — avec la même
// MARGE_BAS de 4 % que le code applique partout ailleurs. Tout ce qui tombe plus bas
// est, par construction du jeu, du vide où rien ne peut exister.

const MARGE_BAS = 0.04;
const Z_COQUE = ARENA.playerZMax + ARENA.playerZMargin; // 16,2

function ponte(w, h) {
  // 1. Le cadrage d'aujourd'hui, inchangé. C'est LA garantie de la contrainte 4 :
  //    la caméra ne bouge sur aucun écran, portrait compris.
  const { camera, serrage } = cadre(w / h);
  // 2. Où tombe la coque au plus reculé, dans l'image pleine.
  const yCoque = ecrY(camera, Z_COQUE);
  // 3. La fraction d'image qu'on garde. Le portrait seul est concerné — le même
  //    seuil 0,8 que main.js emploie déjà pour le serrage de départ.
  const brut = yCoque / (1 - MARGE_BAS);
  const f = w / h < 0.8 ? Math.min(1, brut) : 1;
  const hRendu = Math.round(h * f);
  camera.setViewOffset(w, h, 0, 0, w, hRendu);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { camera, serrage, w, h, hRendu, pont: h - hRendu, f, yCoque };
}

console.log('\n\n=== R. VARIANTE FORTE — pont par découpe de frustum ===\n');
console.log(
  col('écran', 22) + col('rendu', 11) + col('pont', 8) + col('pont %', 9) +
  col('bord', 9) + col('bande', 9) + col('vide', 9) + col('px/u @j', 9) +
  col('px/u @f', 9) + col('bande px', 10)
);
const PONT = {};
for (const [nom, w, h] of ECRANS) {
  const p = ponte(w, h);
  const m = mesure(p.camera, p.hRendu, h);
  PONT[nom] = { m, p };
  console.log(
    col(nom, 22) + col(`${w}×${p.hRendu}`, 11) + col(p.pont + ' px', 8) +
    col(((p.pont / h) * 100).toFixed(1) + '%', 9) + col(m.bord.toFixed(4), 9) +
    col(pc(m.bande), 9) + col(pc(m.videBas), 9) + col(m.pxJoueur.toFixed(1), 9) +
    col(m.pxFormation.toFixed(1), 9) + col((m.bande * p.hRendu).toFixed(0) + ' px', 10)
  );
}

console.log('\n--- la caméra a-t-elle bougé ? (contrainte 4, sur TOUS les écrans) ---\n');
let camImmobile = true;
for (const [nom, w, h] of ECRANS) {
  const a = REF[nom];
  const { p } = PONT[nom];
  const c = p.camera;
  const id = c.fov === a.fov && c.position.y === a.camY && c.position.z === a.camZ;
  if (!id) camImmobile = false;
  console.log(
    col(nom, 22) + col(id ? 'pose IDENTIQUE au bit' : '*** A BOUGÉ ***', 26) +
    `fov ${c.fov.toFixed(4)}  camY ${c.position.y.toFixed(4)}  camZ ${c.position.z.toFixed(4)}  serrage ${p.serrage.toFixed(6)}`
  );
}
console.log(`\n  → caméra immobile sur les 8 écrans : ${camImmobile}`);

console.log('\n--- où se pose le vaisseau, et ce que le pont récupère ---\n');
console.log(
  col('écran', 22) + col('vaisseau /écran av.', 20) + col('vaisseau /écran ap.', 20) +
  col('vaisseau /rendu ap.', 20) + col('vide écran av.', 16) + col('pont ap.', 12)
);
for (const [nom, w, h] of ECRANS) {
  const a = REF[nom];
  const { m, p } = PONT[nom];
  console.log(
    col(nom, 22) + col(pc(a.yJoueurEcran), 20) + col(pc((m.yJoueurEcran)), 20) +
    col(pc(ecrY(p.camera, ARENA.playerZ)), 20) + col(pc(a.videBas), 16) +
    col(pc(p.pont / h), 12)
  );
}

console.log('\n--- ce que la découpe emporte : les plans d’effacement ---\n');
for (const [nom, w, h] of ECRANS) {
  const { p } = PONT[nom];
  const g = (z) => {
    const y = ecrY(p.camera, z);
    return y > 1 || y < 0 ? 'HORS CADRE' : pc(y);
  };
  console.log(
    col(nom, 22) + col('gemmes z=18 : ' + g(18), 24) + col('modules z=19 : ' + g(19), 24) +
    col('balles z=26 : ' + g(26), 24)
  );
}

console.log('\n--- contrainte 3 : le bas de la zone dans le rendu (seuil 96 %) ---\n');
for (const [nom, w, h] of ECRANS) {
  const { m } = PONT[nom];
  const yCoque = ecrY(PONT[nom].p.camera, Z_COQUE);
  console.log(
    col(nom, 22) + col('z=14 à ' + pc(m.bas), 16) + col('z=16,2 à ' + pc(yCoque), 18) +
    col(m.bas < 0.96 && yCoque < 1 ? 'OK' : '*** DEHORS ***', 16) +
    col('réserve ' + ((0.96 - m.bas) * 100).toFixed(1) + ' pts', 18)
  );
}

console.log('\n--- coût de rendu ---\n');
for (const [nom, w, h] of ECRANS) {
  const { p } = PONT[nom];
  console.log(
    col(nom, 22) + col((w * h).toLocaleString('fr-FR') + ' px', 16) +
    col((w * p.hRendu).toLocaleString('fr-FR') + ' px', 16) +
    col('−' + ((1 - p.hRendu / h) * 100).toFixed(0) + ' %', 10)
  );
}

console.log('\n--- visée tactile, écran → z (le pont est rabattu sur son bord bas) ---\n');
{
  const [, w, h] = ECRANS[0];
  const { camera: cRef } = cadre(w / h);
  const p = ponte(w, h);
  console.log(col('doigt (% écran)', 18) + col('z visé — av.', 16) + col('z visé — pont', 16));
  for (const f of [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.85, 1.0]) {
    const ndcRef = 1 - 2 * f;
    const fRendu = Math.min(1, (f * h) / p.hRendu);
    console.log(
      col(pc(f), 18) + col(zVise(cRef, ndcRef).toFixed(1), 16) +
      col(zVise(p.camera, 1 - 2 * fRendu).toFixed(1), 16)
    );
  }
}

console.log('\n--- aval : space.setFraming et la pente ---\n');
for (const [nom, w, h] of ECRANS) {
  const a = REF[nom];
  const { p } = PONT[nom];
  const t = Math.tan(THREE.MathUtils.degToRad(p.camera.fov) / 2) * p.camera.aspect;
  const tRef = Math.tan(THREE.MathUtils.degToRad(a.fov) / 2) * (w / h);
  const pente = (Math.atan2(p.camera.position.y, p.camera.position.z - CIBLE.z) * 180) / Math.PI;
  console.log(
    col(nom, 22) + col('tanHalfH ' + tRef.toFixed(4) + ' → ' + t.toFixed(4), 30) +
    col('pente ' + pente.toFixed(2) + '°', 16) +
    col(Math.abs(t - tRef) < 1e-12 ? 'décor inchangé' : '*** décor déplacé ***', 22)
  );
}

console.log('\n--- le soleil (piège documenté : il est DÉJÀ dans le cadre en portrait) ---\n');
for (const [nom, w, h] of ECRANS) {
  const a = REF[nom];
  void a;
  const { p } = PONT[nom];
  const { camera: cRef } = cadre(w / h);
  const s = (c) => (1 - new THREE.Vector3(0, 34, -150).project(c).y) / 2;
  console.log(col(nom, 22) + col('centre ' + pc(s(cRef)) + ' → ' + pc(s(p.camera)), 26));
}

// ============================================================================
//  S. RECTIFICATION DE LA MESURE DE TAILLE, PUIS LA DÉCOUPE AUX DEUX BOUTS
// ============================================================================
//
// RECTIFICATION D'ABORD, parce que la section R affichait un chiffre faux et qu'il
// vaut mieux le dire que le laisser traîner. `pxParUnite` divisait la hauteur du
// rendu par le champ vertical PLEIN ; sous une découpe de frustum, le champ du
// sous-rectangle n'est plus celui de la caméra, et la formule sous-estimait de
// trente pour cent. On mesure désormais à la façon d'un pied à coulisse : on
// projette deux points distants d'une unité et on compte les pixels entre eux.
// C'est vrai dans tous les cas, avec ou sans découpe.
function pxUniteVrai(cam, z, wPx) {
  return (ecrX(cam, 1, z) - ecrX(cam, 0, z)) * wPx;
}

console.log('\n\n=== S1. TAILLE APPARENTE, MESURÉE AU PIED À COULISSE ===\n');
console.log(
  col('écran', 22) + col('larg. écran', 13) + col('réf @joueur', 13) + col('pont @joueur', 14) +
  col('réf @form', 12) + col('pont @form', 12) + col('larg. vue z=14', 15)
);
for (const [nom, w, h] of ECRANS) {
  const { camera: cRef } = cadre(w / h);
  const { p } = PONT[nom];
  const lv = 2 * ARENA.playerXMax / (ecrX(cRef, ARENA.playerXMax, 14) - ecrX(cRef, -ARENA.playerXMax, 14));
  console.log(
    col(nom, 22) + col(w + ' px', 13) +
    col(pxUniteVrai(cRef, ARENA.playerZ, w).toFixed(2), 13) +
    col(pxUniteVrai(p.camera, ARENA.playerZ, w).toFixed(2), 14) +
    col(pxUniteVrai(cRef, -17, w).toFixed(2), 12) +
    col(pxUniteVrai(p.camera, -17, w).toFixed(2), 12) +
    col(lv.toFixed(1) + ' u', 15)
  );
}
console.log(
  '\n  → LA TAILLE APPARENTE EST STRICTEMENT INVARIANTE sous découpe : une découpe\n' +
  '    ne redistribue pas les pixels, elle en jette. Et sous la contrainte 2, elle\n' +
  '    est de toute façon épinglée par la largeur de l’écran : px/u = largeur / 31,2.\n' +
  '    430 px ÷ 31,2 u = 13,8 px/u — c’est le plafond physique du portrait.\n'
);

// -------------------------------------------------------------------------
// S2. LA DÉCOUPE AUX DEUX BOUTS. Le dossier « profondeur de monde » a établi que
// la bande vitale est z ∈ [−20 ; +16,3] et que 56 % de l'écran portrait montre une
// profondeur où AUCUN objet du jeu ne peut exister. Le bas est déjà traité. Le haut
// se traite par la même règle miroir : au-delà de bulletCullZMin = −34, rien n'existe
// non plus — c'est là que naissent les entrées « top » et que meurent les balles.
console.log('\n=== S2. OÙ TOMBENT LES REPÈRES DE PROFONDEUR (iPhone portrait, image pleine) ===\n');
{
  const { camera } = cadre(430 / 932);
  const reperes = [
    [-78, 'colosse : apparition'],
    [-45, 'ciel profond'],
    [-40, 'au-dessus des entrées'],
    [-34, 'bulletCullZMin / départ des entrées « top »'],
    [-24, 'retour de plongée (« à la Galaga »)'],
    [-21.8, 'arrière de l’ombre d’ORION, acte II'],
    [-20, 'HAUT DE LA BANDE VITALE'],
    [-17, 'rangée du fond de la formation'],
    [-13, 'le boss'],
    [-3.2, 'rangée avant (vague 9+)'],
    [0, 'playerZMin'],
    [13, 'joueur au repos'],
    [14, 'playerZMax'],
    [16.2, 'coque entière (playerZMargin)'],
    [18, 'effacement des gemmes'],
    [19, 'effacement des modules'],
    [26, 'bulletCullZMax'],
    [35.4, 'bas de l’écran'],
  ];
  for (const [z, quoi] of reperes) {
    const y = ecrY(camera, z);
    console.log(col('z = ' + z, 10) + col(y < 0 ? 'au-dessus' : y > 1 ? 'sous l’écran' : pc(y), 14) + quoi);
  }
}

console.log('\n=== S3. BALAYAGE DE LA DÉCOUPE HAUTE (bas fixé par la règle de coque) ===\n');
function pontDouble(w, h, zHaut) {
  const { camera, serrage } = cadre(w / h);
  const bas = Math.min(1, ecrY(camera, Z_COQUE) / (1 - MARGE_BAS));
  const haut = zHaut === null ? 0 : Math.max(0, ecrY(camera, zHaut));
  const portrait = w / h < 0.8;
  const t = portrait ? haut : 0;
  const b = portrait ? bas : 1;
  const hRendu = Math.round((b - t) * h);
  camera.setViewOffset(w, h, 0, Math.round(t * h), w, hRendu);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { camera, serrage, hRendu, hautPx: Math.round(t * h), basPx: h - Math.round(t * h) - hRendu };
}
{
  const [nom, w, h] = ECRANS[0];
  void nom;
  console.log(
    col('découpe haute', 22) + col('rendu', 11) + col('bandeau haut', 14) +
    col('pont bas', 11) + col('bande', 9) + col('vide', 9) + col('px/u @j', 9) +
    col('formation à', 13) + col('joueur à', 11) + col('fill', 7)
  );
  for (const [zh, nomZ] of [[null, 'aucune (R1)'], [-78, 'z=−78'], [-45, 'z=−45'], [-40, 'z=−40'], [-34, 'z=−34'], [-24, 'z=−24'], [-20, 'z=−20']]) {
    const p = pontDouble(w, h, zh);
    const m = mesure(p.camera, p.hRendu, h);
    console.log(
      col(nomZ, 22) + col(`${w}×${p.hRendu}`, 11) + col(p.hautPx + ' px', 14) +
      col(p.basPx + ' px', 11) + col(pc(m.bande), 9) + col(pc(m.videBas), 9) +
      col(pxUniteVrai(p.camera, ARENA.playerZ, w).toFixed(1), 9) +
      col(pc(ecrY(p.camera, -17)), 13) + col(pc(ecrY(p.camera, ARENA.playerZ)), 11) +
      col(((p.hRendu / h) * 100).toFixed(0) + '%', 7)
    );
  }
}

console.log('\n=== S4. VARIANTE R2 (découpe haute à z = −34) sur les huit écrans ===\n');
console.log(
  col('écran', 22) + col('rendu', 11) + col('haut', 9) + col('bas', 9) +
  col('bord', 9) + col('bande', 9) + col('vide', 9) + col('form. à', 10) +
  col('joueur à', 10) + col('fill', 7)
);
for (const [nom, w, h] of ECRANS) {
  const p = pontDouble(w, h, -34);
  const m = mesure(p.camera, p.hRendu, h);
  console.log(
    col(nom, 22) + col(`${w}×${p.hRendu}`, 11) + col(p.hautPx + ' px', 9) +
    col(p.basPx + ' px', 9) + col(m.bord.toFixed(4), 9) + col(pc(m.bande), 9) +
    col(pc(m.videBas), 9) + col(pc(ecrY(p.camera, -17)), 10) +
    col(pc(ecrY(p.camera, ARENA.playerZ)), 10) + col(((p.hRendu / h) * 100).toFixed(0) + '%', 7)
  );
}

console.log('\n--- R2 : la caméra bouge-t-elle ? le paysage bouge-t-il ? ---\n');
for (const [nom, w, h] of ECRANS) {
  const a = REF[nom];
  const p = pontDouble(w, h, -34);
  const c = p.camera;
  const id = c.fov === a.fov && c.position.y === a.camY && c.position.z === a.camZ;
  const pxIdentique = p.hautPx === 0 && p.basPx === 0;
  console.log(
    col(nom, 22) + col(id ? 'pose identique' : '*** BOUGÉ ***', 18) +
    col(w >= h ? (pxIdentique ? 'paysage : PIXEL POUR PIXEL' : '*** PAYSAGE DÉCOUPÉ ***') : 'portrait : découpé', 30)
  );
}

console.log('\n--- R2 : le soleil et le haut du cadre ---\n');
for (const [nom, w, h] of ECRANS) {
  const { camera: cRef } = cadre(w / h);
  const p = pontDouble(w, h, -34);
  const s = (c) => (1 - new THREE.Vector3(0, 34, -150).project(c).y) / 2;
  const yr = s(cRef);
  const yp = s(p.camera);
  console.log(
    col(nom, 22) + col('centre ' + pc(yr) + ' → ' + (yp < 0 ? 'HORS CADRE (' + pc(yp) + ')' : pc(yp)), 40) +
    col(yr >= 0 && yp < 0 ? 'le piège du soleil DISPARAÎT' : '', 32)
  );
}

console.log('\n--- R2 : contrainte 2, les deux bords avec suivi latéral ---\n');
for (const [nom, w, h] of ECRANS) {
  const { camera: cRef } = cadre(w / h);
  const p = pontDouble(w, h, -34);
  const a = bordsAvecSuivi(cRef, w / h);
  const q = bordsAvecSuivi(p.camera, p.camera.aspect);
  console.log(
    col(nom, 22) + col('longé ' + a.longe.toFixed(4) + ' → ' + q.longe.toFixed(4), 26) +
    col('opposé ' + a.oppose.toFixed(4) + ' → ' + q.oppose.toFixed(4), 28)
  );
}

// ============================================================================
//  T. VÉRIFICATION DU CODE RÉEL — on importe la fonction du jeu, pas une copie
// ============================================================================
//
// Le dossier de cartographie a relevé que test/cadrage.test.mjs RECOPIE les maths
// de fitCamera au lieu de les importer, et qu'une correction écrite dans main.js y
// resterait donc invisible. Le prototype réel a donc mis la règle dans arena.js,
// exportée, pour que le banc l'IMPORTE : `import { hauteurBandeDeJeu } from
// '../src/game/arena.js'`. Les chiffres ci-dessous ont été produits ainsi, avec
// src/ modifié — 254 tests verts, eslint propre, vite build propre.
//
// src/ ayant été remis dans son état d'origine (la mission demande un banc, pas un
// correctif posé), la règle est recopiée ici À L'IDENTIQUE. Le correctif complet est
// conservé en diff unifié : voir la fin de ce fichier.
function hauteurBandeDeJeu(camera, hauteurEcran, aspect) {
  if (aspect >= 0.8) return hauteurEcran; // paysage : rien à découper
  const c = new THREE.Vector3(0, 0, ARENA.playerZMax + ARENA.playerZMargin).project(camera);
  const yCoque = (1 - c.y) / 2;
  return Math.min(hauteurEcran, Math.round((hauteurEcran * yCoque) / (1 - 0.04)));
}

console.log('\n\n=== T. LE CODE RÉEL, MESURÉ ===\n');
console.log(
  col('écran', 22) + col('écran px', 12) + col('bande de jeu', 14) + col('pont', 10) +
  col('bord', 9) + col('bande jouable', 15) + col('vide bas', 10) + col('px/u @j', 9) +
  col('joueur à', 10) + col('fill', 7)
);
let toutVert = true;
for (const [nom, w, h] of ECRANS) {
  const { camera } = cadre(w / h);
  const hb = hauteurBandeDeJeu(camera, h, w / h);
  camera.setViewOffset(w, h, 0, 0, w, hb);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const m = mesure(camera, hb, h);
  const a = REF[nom];
  const paysageOk = w < h || hb === h;
  const poseOk = camera.fov === a.fov && camera.position.y === a.camY && camera.position.z === a.camZ;
  const tailleOk = Math.abs(pxUniteVrai(camera, ARENA.playerZ, w) - pxUniteVrai(cadre(w / h).camera, ARENA.playerZ, w)) < 1e-9;
  if (!paysageOk || !poseOk || !tailleOk || m.bas >= 0.96 || m.bord < 0.035) toutVert = false;
  console.log(
    col(nom, 22) + col(`${w}×${h}`, 12) + col(`${w}×${hb}`, 14) + col(h - hb + ' px', 10) +
    col(m.bord.toFixed(4), 9) + col(pc(a.bande) + ' → ' + pc(m.bande), 15) +
    col(pc(m.videBas), 10) + col(pxUniteVrai(camera, ARENA.playerZ, w).toFixed(2), 9) +
    col(pc(ecrY(camera, ARENA.playerZ)), 10) + col(((hb / h) * 100).toFixed(0) + '%', 7)
  );
}
console.log('\n  invariants (paysage intact / pose figée / taille figée / contraintes 2 et 3) : ' +
  (toutVert ? 'TOUS VERTS' : '*** UN INVARIANT EST TOMBÉ ***'));

// Idempotence : deux passages d'affilée donnent-ils la même bande ? (Le défaut
// classique de cette famille de correctifs : recadrer sur une image déjà rognée.)
console.log('\n--- idempotence : trois passages d’affilée ---\n');
for (const [nom, w, h] of ECRANS) {
  const hs = [];
  const { camera } = cadre(w / h);
  for (let i = 0; i < 3; i++) {
    camera.clearViewOffset(); // ce que fait fitCamera en tête
    camera.updateProjectionMatrix();
    const hb = hauteurBandeDeJeu(camera, h, w / h);
    camera.setViewOffset(w, h, 0, 0, w, hb);
    camera.updateProjectionMatrix();
    hs.push(hb);
  }
  console.log(col(nom, 22) + col(hs.join(' / '), 22) +
    (hs[0] === hs[1] && hs[1] === hs[2] ? 'stable' : '*** DÉRIVE ***'));
}

// Et sans le clearViewOffset : la démonstration du défaut qu'il évite.
console.log('\n--- le même, SANS clearViewOffset (pourquoi il est là) ---\n');
for (const [nom, w, h] of ECRANS) {
  const hs = [];
  const { camera } = cadre(w / h);
  for (let i = 0; i < 4; i++) {
    const hb = hauteurBandeDeJeu(camera, h, w / h);
    camera.setViewOffset(w, h, 0, 0, w, hb);
    camera.updateProjectionMatrix();
    hs.push(hb);
  }
  console.log(col(nom, 22) + col(hs.join(' / '), 26) +
    (hs[0] === hs[3] ? 'stable' : '*** LA BANDE SE REFERME ***'));
}

// ============================================================================
//  LE CORRECTIF COMPLET, en diff unifié (appliquer avec : git apply).
//  Vérifié en place : npm test 254/254, npm run lint propre, npm run build propre.
//  src/ a ensuite été remis dans son état d'origine (git checkout -- src/ index.html).
// ============================================================================
/*
diff --git a/index.html b/index.html
index 6c52f6a..e460f15 100644
--- a/index.html
+++ b/index.html
@@ -30,6 +30,7 @@
   <body>
     <div id="app">
       <canvas id="scene"></canvas>
+      <div id="pont" aria-hidden="true"></div>
       <div id="crt" aria-hidden="true"></div>
       <div id="hud"></div>
       <div id="overlay"></div>
diff --git a/src/core/input.js b/src/core/input.js
index de6d116..23afe43 100644
--- a/src/core/input.js
+++ b/src/core/input.js
@@ -14,6 +14,7 @@ export class Input {
     this.autoFire = true;
     this.touchActive = false;
     this.touchNdc = { x: 0, y: 0 }; // position du doigt en coordonnées NDC (-1..1)
+    this.surface = null; // le canevas de jeu ; à défaut, la fenêtre (voir updateTouch)
     this._touchId = null; // identifier du doigt qui pilote (robuste au multi-touch)
     this._tapListeners = new Set(); // appui posé sur l'aire de jeu (pas sur l'UI)
 
@@ -65,9 +66,22 @@ export class Input {
       if (e.button === 0) this.mouseDown = false;
     });
 
+    // LE DOIGT SE RAPPORTE À LA SURFACE DE JEU, PAS À LA FENÊTRE. Les deux se
+    // confondaient tant que le canevas faisait exactement l'écran ; depuis la bande
+    // de jeu il s'arrête au-dessus du pont, et mesurer contre la fenêtre décalerait
+    // toute la visée d'un tiers de hauteur en portrait — le vaisseau se croirait
+    // commandé cent pixels plus haut que le pouce.
+    //
+    // Sous la surface de jeu, on RABAT sur son bord bas au lieu d'ignorer le doigt :
+    // c'est très exactement ce que faisait déjà le tiers bas de l'écran, que
+    // `aimPoint` écrête de toute façon à playerZMax. Le pouce posé sur le pont
+    // continue donc de piloter en x, comme avant, sans changement de comportement.
     const updateTouch = (t) => {
-      this.touchNdc.x = (t.clientX / window.innerWidth) * 2 - 1;
-      this.touchNdc.y = -(t.clientY / window.innerHeight) * 2 + 1;
+      const r = this.surface ? this.surface.getBoundingClientRect() : null;
+      const w = r ? r.width : window.innerWidth;
+      const h = r ? r.height : window.innerHeight;
+      this.touchNdc.x = (t.clientX / w) * 2 - 1;
+      this.touchNdc.y = -(Math.min(t.clientY, h) / h) * 2 + 1;
     };
     window.addEventListener(
       'touchstart',
diff --git a/src/game/arena.js b/src/game/arena.js
index 34540d7..797c381 100644
--- a/src/game/arena.js
+++ b/src/game/arena.js
@@ -208,6 +208,58 @@ function basVisible(camera) {
   return (1 - _coin.y) / 2 < 1 - MARGE_BAS;
 }
 
+// ------------------------------------------------------------- LA BANDE DE JEU
+//
+// LE PORTRAIT PAYAIT DEUX FOIS LE MÊME MÈTRE CARRÉ.
+//
+// Mesuré sur un iPhone tenu droit : les quatorze unités de profondeur jouable
+// tenaient dans douze centièmes de la hauteur d'écran, contre trente-six en
+// paysage. Trois fois moins. Le vaisseau se retrouvait à soixante-trois pour cent
+// de la hauteur, et les trente-six pour cent en dessous ne montraient RIEN — le
+// bas du cadre ne rencontre le plan de jeu qu'à z = 35,4, alors que la balle la
+// plus lente est effacée à 26, les modules à 19 et les gemmes à 18. Un tiers de
+// l'écran affichait une profondeur où aucun objet du jeu ne peut exister.
+//
+// DEUX CORRECTIONS ÉVIDENTES SONT MORTES AVANT D'ÊTRE ÉCRITES, et il faut le
+// savoir avant de lire ce qui suit. Baisser le plafond de champ : la boucle recule
+// d'exactement ce que le champ a repris, la bande reste à douze centièmes (mesuré
+// de 50° à 76° : 11,7 % à 12,3 %). Baisser le plafond de recul : idem, de 11,8 % à
+// 12,1 % entre 1,0 et 3,0. La raison est unique — dès que `bordGauche` est la
+// contrainte active, elle ÉPINGLE la largeur de monde vue au plan du joueur à
+// trente-deux unités, donc le champ vertical par le rapport d'image, donc la bande.
+// Champ et distance sont deux commandes qui s'annulent.
+//
+// Il reste donc exactement une chose à faire, et ce n'est pas de grossir l'image :
+// c'est de CESSER DE DESSINER CE QUI NE CONTIENT RIEN. La surface de rendu n'a
+// aucune obligation d'être la fenêtre. On la coupe au ras de ce que le jeu montre
+// déjà en paysage — la coque entière du vaisseau à sa position la plus reculée,
+// z = playerZMax + playerZMargin — avec la même MARGE_BAS de quatre centièmes
+// qu'ailleurs, et la lanière libérée devient le PONT : une vraie surface
+// d'interface, celle que les vies, la colonne d'action et la fenêtre de dialogue
+// occupaient déjà en se posant PAR-DESSUS le jeu.
+//
+// Ce qu'il faut bien comprendre, parce que c'est contre-intuitif : découper ne
+// rapetisse rien. Un pixel de jeu reste un pixel de jeu, à la même place, à la même
+// taille — mesuré au pied à coulisse, 13,17 pixels par unité de monde avant comme
+// après. On jette des pixels vides, on n'en redistribue aucun. La bande jouable
+// passe de 12,0 % à 17,4 % de la surface de jeu VISIBLE, le vide sous elle de
+// 36,0 % à 7,5 %, et le vaisseau de 63 % à 91 % de cette surface — c'est-à-dire à
+// la place qu'il occupe en paysage (86,6 %), en bas du cadre, là où on le pilote.
+//
+// Et la caméra ne bouge pas. Pas d'un millième. Le champ, la pose, la pente de
+// trente-cinq degrés sur laquelle neuf fichiers sont calibrés, `space.setFraming`
+// qui décide de la taille des planètes, le bord de l'arène : tout est bit pour bit
+// ce qu'il était. Le paysage, lui, ne perd pas un seul pixel — la règle rend une
+// découpe nulle dès que le rapport d'image dépasse 0,8, exactement le seuil que
+// `fitCamera` emploie déjà pour son serrage de départ.
+export function hauteurBandeDeJeu(camera, hauteurEcran, aspect) {
+  if (aspect >= 0.8) return hauteurEcran; // paysage : rien à découper
+  _coin.set(0, 0, ARENA.playerZMax + ARENA.playerZMargin).project(camera);
+  const yCoque = (1 - _coin.y) / 2;
+  // Si la coque tombe déjà sous le bas de l'écran, il n'y a rien à rendre au pont.
+  return Math.min(hauteurEcran, Math.round((hauteurEcran * yCoque) / (1 - MARGE_BAS)));
+}
+
 export function ajusteCadrage(camera, pose, serrageDepart = 1) {
   let serrage = serrageDepart;
   pose(serrage);
diff --git a/src/game/game.js b/src/game/game.js
index acb181d..c225604 100644
--- a/src/game/game.js
+++ b/src/game/game.js
@@ -5400,12 +5400,16 @@ export class Game {
   }
 
   // Un point du monde vers les coordonnées de l'écran, pour les repères du HUD.
+  //
+  // MESURÉ SUR LE CANEVAS, ET PAS SUR LA FENÊTRE. Deux conventions cohabitaient ici
+  // — celle-ci contre les trois `getBoundingClientRect` de grazePop et creditPop —
+  // et elles ne s'accordaient que parce que le canevas faisait exactement l'écran.
+  // Depuis la bande de jeu ce n'est plus vrai : les repères se seraient étalés sur
+  // toute la hauteur pendant que le jeu tenait dans les deux tiers hauts.
   _versEcran(pos) {
     this._tmp.copy(pos).project(this.camera);
-    return [
-      ((this._tmp.x + 1) / 2) * window.innerWidth,
-      ((1 - this._tmp.y) / 2) * window.innerHeight,
-    ];
+    const r = this.renderer.domElement.getBoundingClientRect();
+    return [((this._tmp.x + 1) / 2) * r.width, ((1 - this._tmp.y) / 2) * r.height];
   }
 
   // Le renvoi : la balle ennemie devient un projectile du joueur, à la place et
diff --git a/src/main.js b/src/main.js
index 8cda41e..84cab91 100644
--- a/src/main.js
+++ b/src/main.js
@@ -8,7 +8,7 @@ import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
 import { Input, isTouchDevice } from './core/input.js';
 import { AudioEngine } from './core/audio.js';
 import { Space } from './game/space/index.js';
-import { ArenaEdges, ajusteCadrage } from './game/arena.js';
+import { ArenaEdges, ajusteCadrage, hauteurBandeDeJeu } from './game/arena.js';
 import { ecoute as ecouteJournal } from './core/journal.js';
 import { Fx } from './game/fx.js';
 import { Game } from './game/game.js';
@@ -43,11 +43,22 @@ const CAMERA_HOME = new THREE.Vector3(0, 21, 27);
 const CAMERA_TARGET = new THREE.Vector3(0, 0, -3);
 const CAMERA_BASE = CAMERA_HOME.clone();
 
+// LA BANDE DE JEU : la hauteur, en pixels, de la surface réellement dessinée.
+// Elle vaut la fenêtre entière en paysage, et s'arrête au-dessus du pont en
+// portrait. Une seule source de vérité, lue par le renderer, le composer, le HUD
+// et la conversion du doigt en coordonnées de projection.
+const BANDE = { h: window.innerHeight };
+
 // En portrait (mobile), l'aire de jeu (±14.5 en x) sortirait du champ : on élargit le FOV
 // et on recule la caméra le long de son axe pour garder toute la formation visible.
 function fitCamera() {
   const aspect = window.innerWidth / window.innerHeight;
   camera.aspect = aspect;
+  // Le cadrage se calcule TOUJOURS sur l'image pleine : la découpe se déduit du
+  // résultat, jamais l'inverse. Sans ce nettoyage, un second passage recadrerait
+  // sur une image déjà rognée et la bande se refermerait sur elle-même à chaque
+  // redimensionnement — la caméra reculant d'un cran à chaque rotation du téléphone.
+  camera.clearViewOffset();
   const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
   camera.fov = Math.min(72, 56 * Math.pow(squeeze, 0.4));
   // SERRAGE EN PORTRAIT. Le recul qui fait tenir l'arène sur un écran étroit en
@@ -74,9 +85,23 @@ function fitCamera() {
   // là où les bords de l'arène cessent d'être visibles — et c'est cette borne-là
   // qui, en portrait, oblige à relâcher le serrage. Voir ajusteCadrage.
   ajusteCadrage(camera, pose, aspect < 0.8 ? 0.75 : 1);
+  // LA BANDE DE JEU. Le cadrage est arrêté ; on décide maintenant de la part
+  // d'image qu'on dessine réellement. En paysage c'est tout, et `setViewOffset`
+  // sur le rectangle entier est l'identité — même code, aucune branche à l'usage.
+  // Voir `hauteurBandeDeJeu` pour la mesure et le pourquoi.
+  BANDE.h = hauteurBandeDeJeu(camera, window.innerHeight, aspect);
+  camera.setViewOffset(window.innerWidth, window.innerHeight, 0, 0, window.innerWidth, BANDE.h);
+  camera.updateProjectionMatrix();
+  camera.updateMatrixWorld(true);
+  // Le pont est une surface de mise en page comme une autre : le CSS le lit ici et
+  // n'a plus à deviner où finit le jeu. Les vies, la colonne d'action et la fenêtre
+  // de dialogue s'y posent au lieu de se poser SUR le jeu.
+  document.documentElement.style.setProperty('--bande-jeu', BANDE.h + 'px');
   arenaEdges?.setZone();
   // Le décor lointain se recalibre sur le champ HORIZONTAL réel : c'est lui, et
   // pas le champ vertical, qui décide de la taille apparente d'une planète.
+  // `camera.aspect` reste celui de la FENÊTRE : la découpe ne touche pas au champ
+  // horizontal, donc le ciel n'a aucune raison de bouger — et il ne bouge pas.
   const tanHalfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
   space?.setFraming(tanHalfH);
 }
@@ -110,14 +135,27 @@ const bloom = new UnrealBloomPass(
 composer.addPass(bloom);
 composer.addPass(new OutputPass());
 
+// Tout ce qui a une taille en pixels la prend ICI, et nulle part ailleurs. Le
+// défaut classique de cette architecture est qu'un seul de ces quatre appels
+// continue de lire `window.innerHeight` : le rendu et le bloom se désalignent
+// alors d'un tiers de hauteur en portrait, et le halo se décale vers le bas.
+function dimensionne() {
+  const w = window.innerWidth;
+  renderer.setSize(w, BANDE.h);
+  composer.setSize(w, BANDE.h);
+  bloom.setSize(w / 2, BANDE.h / 2);
+}
+dimensionne();
+
 const MAX_DPR = 2;
 const CINE_DPR = 1.5; // ~40 % du coût fragment récupéré pendant la cinématique
 export function setCinematicQuality(on) {
   renderer.setPixelRatio(Math.min(window.devicePixelRatio, on ? CINE_DPR : MAX_DPR));
-  composer.setSize(window.innerWidth, window.innerHeight);
+  composer.setSize(window.innerWidth, BANDE.h);
 }
 
 const input = new Input();
+input.surface = canvas; // le doigt se mesure sur la bande de jeu, pas sur la fenêtre
 const audio = new AudioEngine();
 space = new Space(scene, { lights: { hemi, keyLight, rimLight, mawLight }, renderer });
 arenaEdges = new ArenaEdges(scene);
@@ -139,7 +177,7 @@ const game = new Game({
     lights: { hemi, keyLight, rimLight, mawLight },
     setQuality: setCinematicQuality,
     space, // le ciel : le jeu lui demande de changer de secteur à chaque saut
-    fitCamera,
+    fitCamera: recadre,
     cameraHome: CAMERA_BASE,
     cameraTarget: CAMERA_TARGET,
   },
@@ -171,20 +209,31 @@ window.addEventListener('touchstart', unlock);
 // projection périmée, et l'image sortait écrasée ou étirée. Faire pivoter son
 // téléphone pendant l'introduction suffisait à déclencher le défaut.
 function relayout() {
-  const w = window.innerWidth;
-  const h = window.innerHeight;
-  renderer.setSize(w, h);
-  composer.setSize(w, h);
-  bloom.setSize(w / 2, h / 2);
   if (game.cameraOverride) {
-    // La ciné garde la main sur le reste, mais le rapport lui échappe.
-    camera.aspect = w / h;
+    // LA CINÉMATIQUE PREND L'ÉCRAN ENTIER, et c'est délibéré. Le pont n'existe que
+    // pour loger une interface ; pendant un plan, il n'y a pas d'interface. Lui
+    // laisser toute la fenêtre évite en outre de rogner des cadrages composés à la
+    // main dans stagecraft, dont le champ vertical sature déjà à 78° en portrait.
+    // La ciné garde la main sur la pose, mais le rapport lui échappe.
+    camera.aspect = window.innerWidth / window.innerHeight;
+    camera.clearViewOffset();
     camera.updateProjectionMatrix();
+    BANDE.h = window.innerHeight;
+    dimensionne();
   } else {
-    fitCamera();
+    recadre();
   }
 }
 
+// Le cadrage et la taille des cibles de rendu vont ensemble : les séparer, c'est
+// se garantir un jour une image dessinée à l'ancienne hauteur avec la nouvelle
+// projection. Un seul point d'entrée, et c'est lui qu'on donne à la ciné pour
+// qu'elle rende la main proprement.
+function recadre() {
+  fitCamera();
+  dimensionne();
+}
+
 window.addEventListener('resize', relayout);
 
 // Changement d'orientation : sur mobile, l'événement « resize » arrive souvent
@@ -213,6 +262,10 @@ if (import.meta.env.DEV) {
   window.__NOVA = { game, scene, camera, renderer, space, arenaEdges };
 }
 
+// Vrai tant qu'un plan (cinématique ou escale) occupe la fenêtre entière. Voir la
+// bascule dans la boucle de rendu.
+let pleinEcranCine = false;
+
 let lastTime = performance.now();
 
 function frame() {
@@ -230,6 +283,18 @@ function frame() {
   // Caméra : pilotée par la cinématique quand elle joue, sinon léger suivi du
   // joueur + screenshake pour ancrer la 3D.
   if (game.cameraOverride) {
+    // Bascule vers le plein écran à l'instant où la ciné prend la main, et une
+    // seule fois : `dimensionne` reconstruit les cibles de rendu du composer, le
+    // faire à chaque image coûterait une allocation de framebuffer par image.
+    // Le drapeau, et pas une comparaison de hauteurs : `escale-arrivee` n'a jamais
+    // reçu `stage` et ne peut donc pas rendre la main en appelant fitCamera —
+    // c'est ici, et seulement ici, que le retour au pont est garanti.
+    if (!pleinEcranCine) {
+      pleinEcranCine = true;
+      camera.clearViewOffset();
+      BANDE.h = window.innerHeight;
+      dimensionne();
+    }
     const cam = game.cameraOverride;
     camera.position.copy(cam.pos).add(fx.shakeOffset);
     camera.up.set(Math.sin(cam.roll || 0), Math.cos(cam.roll || 0), 0); // roulis de plan
@@ -239,6 +304,10 @@ function frame() {
       camera.updateProjectionMatrix();
     }
   } else {
+    if (pleinEcranCine) {
+      pleinEcranCine = false;
+      recadre();
+    }
     if (camera.up.x !== 0) camera.up.set(0, 1, 0);
     const followX = game.player ? game.player.position.x * 0.22 : 0;
     camera.position.set(
diff --git a/src/style.css b/src/style.css
index e3b0302..b7f544e 100644
--- a/src/style.css
+++ b/src/style.css
@@ -47,15 +47,41 @@ body {
   inset: 0;
 }
 
+/* LA BANDE DE JEU ET LE PONT.
+   Le canevas est collé EN HAUT et sa hauteur lui est donnée en ligne par
+   `renderer.setSize` ; `--bande-jeu` la republie pour que la mise en page puisse
+   s'y adosser. En paysage elle vaut la fenêtre entière et tout ce qui suit est
+   sans effet — le pont a zéro pixel de haut. Pas de media query, pas de classe à
+   poser depuis le JS : c'est la même règle qui rend le portrait et le paysage. *\/
+:root {
+  --bande-jeu: 100vh;
+}
+
 #scene {
   position: absolute;
-  inset: 0;
+  top: 0;
+  left: 0;
   width: 100%;
-  height: 100%;
+  height: 100%; /* écrasé en ligne par renderer.setSize dès le premier cadrage *\/
   display: block;
   cursor: crosshair;
 }
 
+/* Le liseré haut n'est pas décoratif : sans lui, la bande de jeu et le pont ont
+   la même couleur de fond et plus rien ne dit où s'arrête l'aire de vol. *\/
+#pont {
+  position: absolute;
+  top: var(--bande-jeu);
+  left: 0;
+  right: 0;
+  bottom: 0;
+  z-index: 5;
+  pointer-events: none;
+  background: linear-gradient(180deg, rgba(12, 18, 42, 0.92) 0%, #05040f 55%);
+  border-top: 1px solid rgba(111, 250, 255, 0.22);
+  box-shadow: 0 -10px 26px rgba(79, 242, 255, 0.07);
+}
+
 /* ---------- Vignette d'écran ---------- *\/
 
 /* Les scanlines ont été retirées : fixes à l'écran pendant que la
*/
