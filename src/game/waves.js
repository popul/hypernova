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

// Renvoie { spawns: [{type, row, col, cols, curve, delay}], boss: bool }
export function makeWave(n) {
  const isBossWave = n % WAVES.bossEvery === 0;
  const cols = Math.min(WAVES.colsBase + Math.floor(n / 3), WAVES.colsMax);
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

  let squadIndex = 0;
  rows.forEach((rowDef, rowIdx) => {
    const start = Math.floor((cols - rowDef.count) / 2);
    // Une rangée = un escadron qui entre d'un bloc, trajectoires alternées.
    const variant = VARIANTS[squadIndex % VARIANTS.length];
    for (let i = 0; i < rowDef.count; i++) {
      const col = start + i;
      const end = slotBasePosition(rowIdx, col, cols, tmp).clone();
      spawns.push({
        type: rowDef.type,
        row: rowIdx,
        col,
        cols,
        curve: makeEntryCurve(variant, end),
        delay: squadIndex * 1.5 + i * 0.16,
      });
    }
    squadIndex++;
  });

  if (isBossWave) {
    spawns.push({
      type: 'boss',
      row: -1,
      col: 0,
      cols,
      curve: makeEntryCurve('top', new THREE.Vector3(0, 0, -13)),
      delay: squadIndex * 1.5 + 1.2,
    });
  }

  return { spawns, boss: isBossWave };
}

// Paramètres de difficulté dérivés du numéro de vague.
export function difficulty(n) {
  return {
    diveInterval: Math.max(ENEMY.diveIntervalMin, ENEMY.diveIntervalBase - n * 0.18),
    diveSpeed: ENEMY.diveSpeedBase + n * ENEMY.diveSpeedPerWave,
    formationFireInterval: Math.max(
      ENEMY.formationFireIntervalMin,
      ENEMY.formationFireIntervalBase - n * 0.14
    ),
    bulletSpeed: Math.min(ENEMY.bulletSpeedMax, ENEMY.bulletSpeedBase + n * ENEMY.bulletSpeedPerWave),
    simultaneousDivers: n < 3 ? 1 : n < 7 ? 2 : 3,
  };
}
