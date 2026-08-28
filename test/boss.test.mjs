// LES TROIS ACTES DE KORN, ET CELUI QUI FIGEAIT LA PARTIE.
//
// Le combat de boss est la seule partie du jeu qui change de code selon l'état :
// chaque acte remplace le VERBE du boss — patrouiller, bondir, traquer — donc
// chaque acte emprunte une branche différente. Les deux premières se jouent à
// toutes les parties ; la troisième ne s'atteint qu'après avoir entamé deux tiers
// d'une coque de boss, c'est-à-dire à peu près jamais quand on relit du code.
//
// C'est là que la partie s'est arrêtée. Sur la ligne
//
//     const cible = THREE.MathUtils.clamp(cible(game).position.x, …)
//
// la variable masque la FONCTION `cible()` dans tout le bloc, y compris dans sa
// propre initialisation — ce que JavaScript refuse à l'exécution. ReferenceError
// à la première image de l'acte III, à chaque image suivante, et le jeu figé pile
// sur « IL DESCEND SUR VOUS ». Rien dans les deux premiers actes ne pouvait le
// laisser voir.
//
// Ces épreuves traversent donc les trois, dans l'ordre, comme une vraie partie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Enemies } from '../src/game/enemies.js';
import { BOSS_PHASES, BOSS_BASCULE } from '../src/game/constants.js';

// Le strict nécessaire pour que le boss ait quelqu'un à viser et quelque part où
// tirer. Aucun rendu, aucune scène : on éprouve la mécanique, pas les pixels.
const muet = (noms) => Object.fromEntries(noms.map((n) => [n, () => {}]));

function banc({ joueur2 = null } = {}) {
  const enemies = new Enemies(new THREE.Scene());
  const balles = [];
  const game = {
    player: { position: new THREE.Vector3(3, 0, 8), alive: true },
    joueur2,
    // Le boss tire pour de vrai : on ramasse ses balles au lieu de les dessiner.
    enemyBullets: { spawn: (from, dir, kind) => balles.push({ from, dir, kind }) },
    onBossPhase: () => {},
    // Le son, les particules et la barre de vie : le boss les appelle, on les
    // laisse tomber. Ce qu'on éprouve ici est sa MÉCANIQUE, pas sa mise en scène.
    audio: muet(['bossAlarm', 'enemyShoot', 'explosionBig', 'explosionSmall', 'setMode']),
    fx: muet(['burst', 'explosionBig', 'explosionSmall', 'shockwave', 'addShake']),
    hud: muet(['hideBossBar', 'setBossHp', 'showBossBar']),
  };
  const boss = {
    group: new THREE.Group(),
    // `def` porte la fiche de l'ennemi ; le boss s'en sert pour sa rafale visée.
    def: {},
    hp: 100,
    maxHp: 100,
    time: 0,
    bascule: 0,
  };
  return { enemies, game, boss, balles };
}

// Fait tourner le boss quelques secondes à un niveau de coque donné, comme la
// boucle de jeu le ferait.
function joue(enemies, boss, game, hp, secondes = 3) {
  boss.hp = hp;
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(secondes * 60); i++) {
    boss.time += dt;
    enemies._bossPhase(boss, dt, game);
  }
}

test('les trois actes du boss se jouent sans jeter', () => {
  const { enemies, game, boss } = banc();
  // Les seuils des trois actes : pleine coque, sous les deux tiers, sous le tiers.
  for (const [acte, hp] of [
    [1, 100],
    [2, 50],
    [3, 20],
  ]) {
    assert.doesNotThrow(
      () => joue(enemies, boss, game, hp),
      `l’acte ${acte} fait tomber la partie`
    );
  }
});

test('l’acte III descend sur le joueur et le suit', () => {
  const { enemies, game, boss } = banc();
  joue(enemies, boss, game, 100, 1); // il commence son combat normalement
  joue(enemies, boss, game, 20, BOSS_BASCULE + 3);

  assert.equal(boss.phase, 2, 'le boss n’est pas passé au troisième acte');
  // « Il descend sur vous » : le boss avance vers le joueur, donc son z remonte
  // vers -8,5 depuis les -13 de la patrouille.
  assert.ok(boss.group.position.z > -10, `il n’est pas descendu (z = ${boss.group.position.z})`);
  // Et il suit le joueur en x, sans jamais l'atteindre tout à fait.
  assert.ok(
    Math.abs(boss.group.position.x - game.player.position.x) < 1,
    'il ne suit pas le joueur'
  );
});

test('à deux, l’acte III vise le joueur le plus avancé', () => {
  // La fonction masquée par la variable était justement celle qui choisit lequel
  // des deux joueurs le boss traque. C'est ce que le duo avait ajouté, et c'est
  // ce que le masquage a cassé.
  const joueur2 = { position: new THREE.Vector3(-6, 0, 9), alive: true };
  const { enemies, game, boss } = banc({ joueur2 });
  joue(enemies, boss, game, 100, 1);
  joue(enemies, boss, game, 20, BOSS_BASCULE + 3);

  // Le second joueur est plus avancé (z plus grand) : c'est lui que le boss suit.
  assert.ok(
    boss.group.position.x < -4,
    `le boss suit le mauvais joueur (x = ${boss.group.position.x})`
  );
});

test('le boss traverse bien les trois actes en perdant sa coque', () => {
  const { enemies, game, boss } = banc();
  const vus = [];
  game.onBossPhase = (n) => vus.push(n);
  // On l'use progressivement, comme le ferait un joueur.
  for (let hp = 100; hp >= 5; hp -= 5) joue(enemies, boss, game, hp, BOSS_BASCULE + 0.2);
  assert.deepEqual(vus, [1, 2, 3], `les actes annoncés : ${vus.join(', ')}`);
  assert.equal(BOSS_PHASES.length, 3);
});
