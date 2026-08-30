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

test('le jeu en réseau durcit la vague selon le nombre, jamais proportionnellement', async () => {
  const { MULT_JOUEURS } = await import('../src/game/constants.js');
  // La table connaît exactement les deux tablées possibles : 2 et 3.
  assert.deepEqual(Object.keys(MULT_JOUEURS).sort(), ['2', '3'], 'la table doit couvrir 2 et 3');
  for (const cle of ['hp', 'fire', 'dive']) {
    // Les facteurs sont au-dessus de un : à plusieurs, on est plusieurs à tirer.
    assert.ok(MULT_JOUEURS[2][cle] > 1, `MULT_JOUEURS[2].${cle} devrait durcir`);
    // Et jamais au point de doubler : deux joueurs ne valent pas deux fois un.
    assert.ok(MULT_JOUEURS[2][cle] < 2, `MULT_JOUEURS[2].${cle} double la difficulté, c'est trop`);
    // À trois on couvre plus large : tout monte par rapport à deux…
    assert.ok(
      MULT_JOUEURS[3][cle] > MULT_JOUEURS[2][cle],
      `MULT_JOUEURS[3].${cle} devrait durcir plus qu'à deux`
    );
    // … mais moins que proportionnellement (3/2) : à trois, on se gêne aussi.
    assert.ok(
      MULT_JOUEURS[3][cle] < MULT_JOUEURS[2][cle] * 1.5,
      `MULT_JOUEURS[3].${cle} suit le nombre de joueurs, c'est trop`
    );
  }
});

test("modsEquipage : la majoration suit les vivants, la base reste intacte", async () => {
  const { modsEquipage, MULT_JOUEURS } = await import('../src/game/constants.js');
  const base = { hp: 2, fire: 1.5, dive: 1, credits: 1.2 };
  // Seul, aucune majoration : la table ne connaît pas le 1.
  assert.deepEqual(modsEquipage(base, 1), base);
  const aDeux = modsEquipage(base, 2);
  assert.equal(aDeux.hp, 2 * MULT_JOUEURS[2].hp, 'la coque suit la table');
  assert.equal(aDeux.fire, 1.5 * MULT_JOUEURS[2].fire, 'la cadence suit la table');
  assert.equal(aDeux.dive, 1 * MULT_JOUEURS[2].dive, 'les piqués suivent la table');
  assert.equal(aDeux.credits, 1.2, 'les crédits ne bougent jamais : chacun ramasse les siens');
  // Au-delà de trois, la table plafonne — un quatrième pilote hypothétique
  // n'inventerait pas un multiplicateur inexistant.
  assert.deepEqual(modsEquipage(base, 4), modsEquipage(base, 3));
  // Et surtout : la base n'est JAMAIS mutée. C'est elle qui sert de référence
  // au recalcul en cours de vague — mutée, les majorations se composeraient.
  assert.deepEqual(base, { hp: 2, fire: 1.5, dive: 1, credits: 1.2 });
});

test('le directeur se photographie en entier — chaleur, temps calme, palier', async () => {
  const { Director } = await import('../src/game/director.js');
  const d = new Director();
  d.heat = 2.4;
  d.cleanTime = 7;
  d._lastTier = 2;
  const copie = new Director();
  copie.restaure(d.instantane());
  assert.equal(copie.heat, 2.4);
  // Sans le temps calme, la chaleur du rejoignant recommence à monter à une
  // autre image que celle des autres : divergence sans coupable visible.
  assert.equal(copie.cleanTime, 7);
  // Le palier 2 est déjà annoncé : le refranchir déclencherait un `setHeat`
  // chez le rejoignant seul — et la vague se recalibrerait sur une seule machine.
  assert.equal(copie.pollTier(), 0);
});

// --- LE BOUTON D'ÉNERGIE ------------------------------------------------------
//
// Une seule touche pour deux dépenses très différentes : un appui court lâche la
// bombe de panique, un maintien déclenche l'Overdrive. La règle a déjà été
// fausse une fois, et elle l'a été de la pire façon — sans rien casser.
//
// L'Overdrive ne partait qu'au RELÂCHÉ. La jauge affiche MAINTIENS ; le joueur
// maintient ; rien ne se passe. Il finit par lâcher, et là ça part — sans qu'il
// fasse le lien avec son geste. De son point de vue, « l'Overdrive n'apparaît
// pas quand la barre est à fond ». Rien dans le code ne signalait quoi que ce
// soit : la fonction faisait exactement ce qu'elle disait.

test('maintenir la touche déclenche l’Overdrive sans attendre le relâché', async () => {
  const { gesteEnergie, OVERDRIVE } = await import('../src/game/constants.js');
  const plein = OVERDRIVE.odCost;
  assert.equal(
    gesteEnergie({ tenu: OVERDRIVE.holdTime + 0.01, energie: plein }),
    'overdrive',
    'le maintien ne répond pas au maintien'
  );
});

test('un appui court reste la bombe de panique', async () => {
  const { gesteEnergie, OVERDRIVE } = await import('../src/game/constants.js');
  // Rien ne part tant qu'on n'a pas relâché : sinon le simple fait d'appuyer
  // consommerait la jauge avant que le joueur ait choisi.
  assert.equal(gesteEnergie({ tenu: 0.1, energie: 100 }), null);
  assert.equal(gesteEnergie({ tenu: 0.1, energie: 100, relache: true }), 'bombe');
  assert.ok(OVERDRIVE.holdTime > 0.1, 'le seuil de maintien est plus court qu’un appui');
});

test('sans la jauge pleine, on ne consomme rien pendant le maintien', async () => {
  const { gesteEnergie, OVERDRIVE } = await import('../src/game/constants.js');
  const tenu = OVERDRIVE.holdTime + 0.5;
  assert.equal(
    gesteEnergie({ tenu, energie: OVERDRIVE.odCost - 1 }),
    null,
    'on consomme un maintien qui ne peut pas aboutir'
  );
  // Au relâché, en revanche, on refuse FRANCHEMENT — avec un son. Lâcher une
  // bombe à la place serait une dépense que personne n’a demandée.
  assert.equal(gesteEnergie({ tenu, energie: OVERDRIVE.odCost - 1, relache: true }), 'refus');
});

test('le maintien l’emporte toujours sur la bombe, jauge pleine', async () => {
  const { gesteEnergie, OVERDRIVE } = await import('../src/game/constants.js');
  // Le joueur qui maintient a fait un choix : il ne doit jamais recevoir une
  // bombe à la place, même si son maintien dépasse à peine le seuil.
  for (const tenu of [OVERDRIVE.holdTime, OVERDRIVE.holdTime + 0.001, 3]) {
    assert.equal(gesteEnergie({ tenu, energie: 100, relache: true }), 'overdrive', `tenu ${tenu}`);
  }
});

// --- LA COUTURE, QUI S'ACHÈTE MAINTENANT --------------------------------------
//
// Sortir par un bord pour rentrer par l'autre était acquis dès la première vague.
// C'est pourtant la manœuvre la plus forte du jeu — celle qui transforme un
// encerclement en fuite — et elle ne coûtait rien.

test('la couture est un module, et un module abordable', async () => {
  const { UPGRADES, priceOf } = await import('../src/game/upgrades.js');
  const couture = UPGRADES.find((u) => u.id === 'couture');
  assert.ok(couture, 'le module de couture n’existe pas');
  assert.equal(couture.maxLevel, 1, 'on l’a ou on ne l’a pas');
  // Une manœuvre qu'on n'a jamais les moyens d'apprendre ne s'apprend jamais : le
  // premier hangar doit pouvoir se la payer.
  assert.ok(priceOf(couture, 0) <= 100, `elle coûte ${priceOf(couture, 0)} crédits`);
});

test('sans le module, les bords sont des murs', async () => {
  const { boucleActive } = await import('../src/game/arena.js');
  assert.equal(boucleActive({ levels: {} }), false);
  assert.equal(boucleActive({ levels: { couture: 0 } }), false);
  assert.equal(boucleActive({}), false);
  assert.equal(boucleActive(null), false, 'un appel sans jeu ne doit pas jeter');
});

test('avec le module, la couture s’ouvre', async () => {
  const { boucleActive } = await import('../src/game/arena.js');
  assert.equal(boucleActive({ levels: { couture: 1 } }), true);
});

test('un enregistrement d’avant la couture est refusé, pas rejoué de travers', async () => {
  // Une partie enregistrée quand l'arène bouclait toujours ne se rejoue pas ici :
  // le vaisseau taperait un mur là où il passait, et tout divergerait dès le
  // premier bord touché. Mieux vaut dire « version antérieure » que raconter une
  // autre partie.
  const { VERSION } = await import('../src/game/rejeu/format.js');
  assert.ok(VERSION >= 14, `le format est resté en ${VERSION} malgré le changement de règle`);
});
