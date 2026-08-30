// LE LANCIER ET LE POSEUR — deux menaces qui ne sont pas des balles.
//
// Tout le reste du jeu tire des projectiles : un point qui avance, qu'on esquive
// en n'étant pas là. Ces deux-là occupent une ZONE, et changent donc la question
// posée au joueur. Le lancier interdit un couloir ; le poseur encombre le bas de
// l'arène et laisse sa menace derrière lui après sa mort.
//
// Ce qui se vérifie ici, c'est ce qui ne se voit pas en jouant vite : les temps.
// Un rayon qui part trop tôt n'est pas « difficile », il est injouable — et la
// différence entre les deux tient à quelques dixièmes de seconde que personne ne
// peut mesurer à l'œil.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Enemies } from '../src/game/enemies.js';
import { LANCIER, MINE, ENEMY_TYPES } from '../src/game/constants.js';

const muet = (noms) => Object.fromEntries(noms.map((n) => [n, () => {}]));

function banc(vague = 1) {
  const enemies = new Enemies(new THREE.Scene());
  enemies.waveNumber = vague;
  const game = {
    player: { position: new THREE.Vector3(0, 0, 8), alive: true },
    joueursDistants: [],
    enemyBullets: { spawn: () => {} },
    audio: muet(['enemyShoot', 'explosionSmall', 'hit', 'bossAlarm', 'setMode']),
    fx: muet(['burst', 'explosionSmall', 'explosionBig', 'shockwave', 'addShake']),
    hud: muet(['setBossHp', 'showBossBar', 'hideBossBar']),
    _onEnemyKilled: () => {},
  };
  return { enemies, game };
}

// Un ennemi de papier : ce que la mécanique lit sur lui, et rien d'autre. Il
// porte `dispose` et `curve` parce que le moteur les appelle — le premier quand
// il meurt, la seconde quand il plonge.
function faux(enemies, type, id, x) {
  const e = {
    type,
    def: ENEMY_TYPES[type],
    alive: true,
    state: 'formation',
    id,
    group: new THREE.Group(),
    hp: 2,
    maxHp: 2,
    time: 0,
    t: 0,
    dispose() {
      e.jete = true;
    },
    curve: new THREE.LineCurve3(new THREE.Vector3(x, 0, -14), new THREE.Vector3(x, 0, 8)),
  };
  e.group.position.set(x, 0, -14);
  enemies.list.push(e);
  return e;
}

// Un lancier posé en formation, prêt à viser.
function lancier(enemies, x = 0) {
  return faux(enemies, 'lancier', 1, x);
}

// Fait tourner le lancier pendant `secondes`, et rend le temps écoulé avant que
// son rayon ne devienne mortel.
function tempsAvantBrulure(enemies, e, game, secondes = 12) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(secondes * 60); i++) {
    enemies._lancier(e, dt, game);
    if (e.tir > 0) return (i + 1) * dt;
  }
  return null;
}

// --- Le plancher d'une seconde ------------------------------------------------

test('l’amorçage du lancier ne descend JAMAIS sous une seconde', () => {
  // La contrainte est absolue et vaut pour toute la campagne : sous une seconde,
  // il n'y a pas le temps de voir le télégraphe, de décider et de bouger. Le
  // rayon cesserait d'être une punition pour devenir un piège.
  const { enemies } = banc();
  for (let vague = 1; vague <= 200; vague++) {
    enemies.waveNumber = vague;
    const t = enemies._amorceLancier();
    assert.ok(t >= LANCIER.amorceMin, `vague ${vague} : amorçage de ${t.toFixed(2)} s`);
    assert.ok(t >= 1, `vague ${vague} : ${t.toFixed(2)} s, c’est sous la seconde`);
  }
});

test('l’amorçage raccourcit bien avec la difficulté, jusqu’au plancher', () => {
  // Le plancher ne doit pas rendre la difficulté inerte : elle doit se sentir
  // avant de buter dessus.
  const { enemies } = banc();
  enemies.waveNumber = 1;
  const tot = enemies._amorceLancier();
  enemies.waveNumber = 12;
  const tard = enemies._amorceLancier();
  assert.ok(tard < tot, 'le lancier ne devient jamais plus pressant');
  enemies.waveNumber = 500;
  assert.equal(enemies._amorceLancier(), LANCIER.amorceMin, 'le plancher n’est pas atteint');
});

// --- Les trois temps ----------------------------------------------------------

test('le lancier vise, charge, puis brûle — dans cet ordre', () => {
  const { enemies, game } = banc(1);
  const e = lancier(enemies, 0);
  const attendu = enemies._amorceLancier() + LANCIER.charge;

  const t = tempsAvantBrulure(enemies, e, game);
  assert.ok(t !== null, 'le rayon n’a jamais brûlé');
  // À une image près : la boucle avance par pas de 1/60.
  assert.ok(
    Math.abs(t - attendu) < 0.05,
    `brûlure à ${t.toFixed(2)} s, attendue à ${attendu.toFixed(2)} s`
  );
});

test('un pas de côté annule la visée, à n’importe quel moment', () => {
  const { enemies, game } = banc(1);
  const e = lancier(enemies, 0);
  const dt = 1 / 60;

  // On reste dans le couloir presque assez longtemps…
  for (let i = 0; i < Math.round((enemies._amorceLancier() - 0.1) * 60); i++) {
    enemies._lancier(e, dt, game);
  }
  assert.ok(e.visee > 0, 'le lancier ne visait pas');
  assert.ok(!(e.tir > 0), 'il a brûlé trop tôt');

  // …puis on sort. La visée doit repartir de zéro, pas se mettre en pause.
  game.player.position.x = LANCIER.couloir + 2;
  enemies._lancier(e, dt, game);
  assert.equal(e.visee, 0, 'sortir du couloir ne remet pas la visée à zéro');
  assert.equal(e.rayon?.visible, false, 'le rayon reste affiché alors qu’il ne vise plus');
});

test('le rayon ne touche que dans son couloir, et jamais derrière l’émetteur', () => {
  const { enemies, game } = banc(1);
  const e = lancier(enemies, 0);
  tempsAvantBrulure(enemies, e, game);
  assert.ok(e.tir > 0, 'le rayon devait brûler');

  assert.equal(
    enemies.rayonTouche(new THREE.Vector3(0, 0, 8)),
    true,
    'dans l’axe : ça doit brûler'
  );
  assert.equal(
    enemies.rayonTouche(new THREE.Vector3(6, 0, 8)),
    false,
    'à six unités de côté, on est hors du rayon'
  );
  // Derrière l'émetteur, le rayon n'existe pas : il part vers le joueur.
  assert.equal(
    enemies.rayonTouche(new THREE.Vector3(0, 0, -20)),
    false,
    'le rayon frappe derrière son propre émetteur'
  );
});

test('un lancier qui quitte sa place éteint son rayon', () => {
  // Sans cette remise à zéro, un lancier parti en plongée laissait derrière lui
  // une colonne immobile et mortelle, au milieu de l’arène.
  const { enemies, game } = banc(1);
  const e = lancier(enemies, 0);
  tempsAvantBrulure(enemies, e, game);
  assert.ok(e.tir > 0);

  e.state = 'diving';
  enemies._updateEnemy(e, 1 / 60, game);
  assert.equal(e.tir, 0, 'le rayon brûle encore alors que le lancier a plongé');
  assert.equal(enemies.rayonTouche(new THREE.Vector3(0, 0, 8)), false);
});

// --- Les mines ----------------------------------------------------------------

function poseur(enemies, x = 0) {
  return faux(enemies, 'poseur', 2, x);
}

test('le poseur pose des mines, mais jamais plus que sa part', () => {
  const { enemies, game } = banc(12);
  const e = poseur(enemies);
  // Assez longtemps pour en poser bien plus que le plafond s'il n'existait pas.
  for (let i = 0; i < Math.round(60 * 60); i++) enemies._poseur(e, 1 / 60, game);
  assert.ok(enemies.mines.length > 0, 'le poseur n’a rien posé');
  assert.ok(
    enemies.mines.length <= MINE.maxParPoseur,
    `${enemies.mines.length} mines : il remplit l’arène`
  );
});

test('une mine se tire, et saute après un court délai', () => {
  const { enemies, game } = banc(12);
  const e = poseur(enemies);
  enemies._poseMine(e, game);
  const m = enemies.mines[0];

  // Le tir l'amorce, il ne l'efface pas : cette demi-seconde est ce qui laisse
  // le temps de s'écarter de ce qu'on vient de déclencher.
  enemies.amorceMine(m, game);
  assert.ok(m.amorce > 0, 'la mine n’est pas amorcée');
  assert.equal(enemies.mines.length, 1, 'la mine a disparu au lieu de s’amorcer');

  for (let i = 0; i < Math.round((MINE.amorce + 0.1) * 60); i++) enemies._updateMines(1 / 60, game);
  assert.equal(enemies.mines.length, 0, 'la mine n’a jamais sauté');
});

test('le souffle d’une mine emporte les ennemis autour', () => {
  const { enemies, game } = banc(12);
  const e = poseur(enemies);
  enemies._poseMine(e, game);
  const m = enemies.mines[0];

  // Une victime juste à côté de la mine.
  const voisin = lancier(enemies, 0);
  voisin.id = 9;
  voisin.group.position.copy(m.group.position);
  voisin.hp = 1;

  enemies.amorceMine(m, game);
  for (let i = 0; i < Math.round((MINE.amorce + 0.1) * 60); i++) enemies._updateMines(1 / 60, game);
  assert.equal(voisin.alive, false, 'le souffle n’a pas touché le voisin');
});

test('le souffle ne reste pas mortel pour le restant de la vague', () => {
  const { enemies, game } = banc(12);
  const e = poseur(enemies);
  enemies._poseMine(e, game);
  const m = enemies.mines[0];
  const ou = m.group.position.clone();

  enemies.amorceMine(m, game);
  for (let i = 0; i < Math.round((MINE.amorce + 0.02) * 60); i++)
    enemies._updateMines(1 / 60, game);
  assert.equal(enemies.souffleTouche(ou), true, 'le souffle n’a pas eu lieu');

  // Il s'éteint : sinon cet endroit resterait un piège invisible jusqu'à la fin.
  for (let i = 0; i < 30; i++) {
    if (enemies._souffleEnCours) enemies._souffleEnCours.temps -= 1 / 60;
    if (enemies._souffleEnCours?.temps <= 0) enemies._souffleEnCours = null;
  }
  assert.equal(enemies.souffleTouche(ou), false, 'le souffle est resté mortel sur place');
});

test('les mines ne survivent pas à leur vague', () => {
  // Elles descendent lentement : certaines sont encore en l'air au changement de
  // tableau, et sauteraient au visage d'un joueur qui vient d'arriver ailleurs.
  const { enemies, game } = banc(12);
  const e = poseur(enemies);
  enemies._poseMine(e, game);
  enemies._poseMine(e, game);
  assert.equal(enemies.mines.length, 2);

  enemies.clear();
  assert.equal(enemies.mines.length, 0, 'des mines ont traversé le changement de vague');
});

test('les mines ne comptent pas pour la fin de vague', () => {
  // Sinon une mine oubliée dans un coin bloquerait la partie, et le joueur
  // chercherait un ennemi qui n'existe pas.
  const { enemies, game } = banc(12);
  const e = poseur(enemies);
  enemies._poseMine(e, game);
  e.alive = false;
  assert.equal(enemies.aliveCount(), 0, 'une mine est comptée comme un ennemi vivant');
});

// --- L'ÉQUIPAGE CHANGE EN PLEINE VAGUE ---------------------------------------
//
// Quand un pilote tombe pour de bon, la vague en cours se recale sur les
// survivants. Ce qui se vérifie ici : la cadence s'adoucit VRAIMENT (pas juste
// un champ réécrit), et les prochains entrants prendront la coque adoucie —
// c'est `mods.hp` au moment de l'entrée qui décide de leurs points de vie.

test("reequilibre : la vague en cours s'adoucit quand un pilote tombe", () => {
  const { enemies } = banc(8);
  const aTrois = { hp: 1.7, fire: 1.45, dive: 1.45, credits: 1 };
  const aDeux = { hp: 1.35, fire: 1.25, dive: 1.25, credits: 1 };
  enemies.mods = aTrois;
  enemies.setHeat(0.5);
  const avant = enemies.diff;
  enemies.reequilibre(aDeux, 0.5);
  assert.ok(
    enemies.diff.formationFireInterval > avant.formationFireInterval,
    'à deux survivants, la formation doit tirer moins souvent'
  );
  assert.ok(enemies.diff.diveInterval > avant.diveInterval, 'et plonger moins souvent');
  assert.equal(enemies.mods.hp, 1.35, 'les prochains entrants prennent la coque adoucie');
  assert.equal(enemies.heat, 0.5, 'la chaleur du directeur est conservée telle quelle');
});
