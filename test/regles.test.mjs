// LA COURBE DE DIFFICULTÉ, ET LA PENTE QUI L'ÉTALE.
//
// Ce sont les chiffres qui décident si le jeu est jouable, et ils se règlent à
// l'aveugle : personne ne voit qu'une constante a bougé de dix pour cent avant
// d'avoir joué vingt minutes. D'où ces épreuves, qui ne jugent pas du goût mais
// des PROPRIÉTÉS qu'on ne veut jamais perdre — une courbe qui monte, des
// planchers respectés, une première vague qui ne bouge pas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { difficulty } from '../src/game/waves.js';
import { DIRECTOR, ENEMY, PENTE_ARCADE } from '../src/game/constants.js';

const MODS = { hp: 1, fire: 1, dive: 1, credits: 1 };
const etalee = (n) => Math.max(1, Math.round(1 + (n - 1) * PENTE_ARCADE));

test('la difficulté monte à chaque vague, sans exception', () => {
  let precedent = null;
  for (let n = 1; n <= 30; n++) {
    const d = difficulty(n, MODS, 0);
    if (precedent) {
      // Un intervalle plus COURT veut dire plus de tirs : il ne doit jamais
      // remonter. C'est la propriété qu'un réglage maladroit casse en premier.
      assert.ok(
        d.formationFireInterval <= precedent.formationFireInterval,
        `vague ${n} : la formation tire moins souvent qu'à la vague ${n - 1}`
      );
      assert.ok(d.diveInterval <= precedent.diveInterval, `vague ${n} : moins de piqués`);
      assert.ok(d.bulletSpeed >= precedent.bulletSpeed, `vague ${n} : balles plus lentes`);
      assert.ok(d.bulletBudget >= precedent.bulletBudget, `vague ${n} : moins de balles permises`);
      assert.ok(
        d.simultaneousDivers >= precedent.simultaneousDivers,
        `vague ${n} : moins de plongeurs`
      );
    }
    precedent = d;
  }
});

test('les planchers sont respectés, même très loin dans la partie', () => {
  const d = difficulty(200, MODS, 40);
  assert.ok(d.formationFireInterval >= DIRECTOR.fireFloor, 'plancher de cadence franchi');
  assert.ok(d.diveInterval >= DIRECTOR.diveFloor, 'plancher de piqué franchi');
  assert.ok(d.bulletSpeed <= DIRECTOR.bulletCeil, 'plafond de vitesse franchi');
  assert.ok(d.bulletBudget <= ENEMY.bulletBudgetMax, 'plafond de balles franchi');
  assert.ok(d.lead <= ENEMY.leadMax + DIRECTOR.leadBoostMax, 'anticipation sans limite');
});

test('la pente ne touche pas la première vague', () => {
  assert.equal(etalee(1), 1, 'la vague 1 doit rester la vague 1');
});

test('la pente adoucit bien le milieu de partie', () => {
  // C'est là que les meilleures parties s'arrêtaient : entre la sixième et la
  // quinzième. Si un réglage futur annule cet adoucissement, on veut le savoir.
  for (const n of [8, 10, 12, 15]) {
    const brute = difficulty(n, MODS, 0);
    const douce = difficulty(etalee(n), MODS, 0);
    assert.ok(
      douce.formationFireInterval > brute.formationFireInterval,
      `vague ${n} : la pente ne l'adoucit plus`
    );
  }
  // La vague 12 doit jouer ce que jouait la neuvième, à une vague près.
  assert.ok(Math.abs(etalee(12) - 9) <= 1, `la vague 12 joue la ${etalee(12)}`);
});

test('la chaleur du directeur durcit, jamais l’inverse', () => {
  const froid = difficulty(10, MODS, 0);
  const chaud = difficulty(10, MODS, 10);
  assert.ok(chaud.formationFireInterval < froid.formationFireInterval);
  assert.ok(chaud.diveInterval < froid.diveInterval);
  assert.ok(chaud.simultaneousDivers >= froid.simultaneousDivers);
});

test('le jeu à deux durcit la vague, et seulement elle', async () => {
  const { DUO } = await import('../src/game/constants.js');
  // Les trois facteurs sont au-dessus de un : à deux on est deux à tirer.
  for (const cle of ['hp', 'fire', 'dive']) {
    assert.ok(DUO[cle] > 1, `DUO.${cle} devrait durcir`);
    // Et jamais au point de doubler : deux joueurs ne valent pas deux fois un.
    assert.ok(DUO[cle] < 2, `DUO.${cle} double la difficulté, c'est trop`);
  }
});
