// Composition des vagues : qui entre, où, quand, par quelle trajectoire.
// La difficulté monte via le nombre, les PV, la fréquence des plongées et la vitesse des tirs.

import * as THREE from 'three';
import { WAVES, ENEMY } from './constants.js';

// Position de base d'un slot de formation (sans le balancement, appliqué en continu ailleurs).
export function slotBasePosition(row, col, cols, out) {
  out.set(
    (col - (cols - 1) / 2) * WAVES.colSpacing,
    0,
    WAVES.formationZTop + row * WAVES.rowSpacing
  );
  return out;
}

function makeEntryCurve(variant, end) {
  const e = end.clone();
  switch (variant) {
    case 'left':
      return new THREE.CubicBezierCurve3(
        new THREE.Vector3(-28, 0, -2),
        new THREE.Vector3(-16, 0, 16),
        new THREE.Vector3(12, 0, 10),
        e
      );
    case 'right':
      return new THREE.CubicBezierCurve3(
        new THREE.Vector3(28, 0, -2),
        new THREE.Vector3(16, 0, 16),
        new THREE.Vector3(-12, 0, 10),
        e
      );
    default:
      // Plongée en S depuis le fond.
      return new THREE.CubicBezierCurve3(
        new THREE.Vector3(e.x * 0.3, 0, -34),
        new THREE.Vector3(-14, 0, -12),
        new THREE.Vector3(14, 0, 2),
        e
      );
  }
}

const VARIANTS = ['left', 'right', 'top'];

// Générateur pseudo-aléatoire déterministe (mulberry32) : une même graine produit
// exactement les mêmes vagues. C'est ce qui rend le « défi du jour » comparable
// entre copains — et ce qui fait qu'aucune vague ne se déroule plus dans l'ordre appris.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Graine du jour : tous les joueurs affrontent les mêmes vagues le même jour.
export function dailySeed(date = new Date()) {
  const key = date.toISOString().slice(0, 10); // AAAA-MM-JJ
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Renvoie { spawns: [{type, row, col, cols, curve, delay}], boss: bool }
// opts.forceBoss / opts.noBoss : contrôle du boss par les missions de campagne
// (en arcade, le boss revient toutes les WAVES.bossEvery vagues).
// opts.seed : graine de la partie ; la vague n en dérive la sienne.
export function makeWave(n, opts = {}) {
  const isBossWave = opts.forceBoss || (!opts.noBoss && n % WAVES.bossEvery === 0);
  const cols = Math.min(WAVES.colsBase + Math.floor(n / 3), WAVES.colsMax);
  const rng = mulberry32((opts.seed ?? 1) * 7919 + n * 104729);
  const spawns = [];
  const tmp = new THREE.Vector3();

  const rows = [];
  if (isBossWave) {
    rows.push({ type: 'wasp', count: cols }, { type: 'wasp', count: cols - 2 });
  } else {
    if (n >= 2) rows.push({ type: 'brute', count: Math.min(cols - 2, 2 + Math.floor(n / 2)) });
    rows.push({ type: 'wasp', count: cols });
    if (n >= 4) rows.push({ type: 'wasp', count: cols });
    rows.push({ type: 'drone', count: cols });
    rows.push({ type: 'drone', count: cols });
  }

  // Chorégraphie tirée au sort : plus jamais gauche → droite → fond dans cet ordre.
  const variants = shuffled(VARIANTS, rng);
  let squadIndex = 0;
  let clock = 0;
  rows.forEach((rowDef, rowIdx) => {
    const start = Math.floor((cols - rowDef.count) / 2);
    // Une rangée = un escadron qui entre d'un bloc, par une trajectoire tirée.
    const variant = variants[squadIndex % variants.length];
    for (let i = 0; i < rowDef.count; i++) {
      const col = start + i;
      const end = slotBasePosition(rowIdx, col, cols, tmp).clone();
      spawns.push({
        type: rowDef.type,
        row: rowIdx,
        col,
        cols,
        curve: makeEntryCurve(variant, end),
        delay: clock + i * 0.16,
      });
    }
    clock += 1.2 + rng() * 0.6; // cadence d'arrivée irrégulière
    squadIndex++;
  });

  if (isBossWave) {
    spawns.push({
      type: 'boss',
      row: -1,
      col: 0,
      cols,
      curve: makeEntryCurve('top', new THREE.Vector3(0, 0, -13)),
      delay: clock + 1.2,
    });
  }

  return { spawns, boss: isBossWave };
}

// Paramètres de difficulté dérivés du numéro de vague, modulés par les
// modificateurs de mission (campagne) : fire = densité de tir, dive = agressivité.
export function difficulty(n, mods = { fire: 1, dive: 1 }) {
  return {
    diveInterval: Math.max(
      ENEMY.diveIntervalMin / mods.dive,
      (ENEMY.diveIntervalBase - n * 0.18) / mods.dive
    ),
    diveSpeed: (ENEMY.diveSpeedBase + n * ENEMY.diveSpeedPerWave) * Math.sqrt(mods.dive),
    formationFireInterval: Math.max(
      ENEMY.formationFireIntervalMin / mods.fire,
      (ENEMY.formationFireIntervalBase - n * 0.14) / mods.fire
    ),
    bulletSpeed: Math.min(
      ENEMY.bulletSpeedMax,
      ENEMY.bulletSpeedBase + n * ENEMY.bulletSpeedPerWave
    ),
    // Rampe dégelée jusqu'à la vague 22 : l'ancien plafond de 4 à la vague 12
    // faisait cesser toute montée en tension. La bombe est la soupape.
    simultaneousDivers: n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : n < 15 ? 4 : n < 22 ? 5 : 6,
    diveWeights: diveWeights(n),
  };
}

// Répartition des styles de plongée selon l'avancement : le vocabulaire de menace
// s'enrichit au lieu de se répéter.
function diveWeights(n) {
  if (n < 5) return { sweep: 1 };
  if (n < 10) return { sweep: 0.6, strafe: 0.4 };
  return { sweep: 0.45, strafe: 0.3, squad: 0.25 };
}

// Tire un style de plongée selon les poids de la vague.
export function pickDiveStyle(weights, rand = Math.random()) {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let acc = rand * total;
  for (const [style, w] of Object.entries(weights)) {
    acc -= w;
    if (acc <= 0) return style;
  }
  return 'sweep';
}
