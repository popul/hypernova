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
import { paramsVague } from '../src/game/waves.js';
import {
  BOSS_PHASES,
  BOSS_BASCULE,
  BOSSES,
  ORDRE_OMBRES,
  BOSS_RAYON_DEMI,
  EXTRACTION,
  TRANSFO,
  ARENA,
  bossPourVague,
  bossParId,
  ENEMY_TYPES,
  BOSS,
} from '../src/game/constants.js';

// Le strict nécessaire pour que le boss ait quelqu'un à viser et quelque part où
// tirer. Aucun rendu, aucune scène : on éprouve la mécanique, pas les pixels.
const muet = (noms) => Object.fromEntries(noms.map((n) => [n, () => {}]));

function banc({ joueursDistants = [] } = {}) {
  const enemies = new Enemies(new THREE.Scene());
  const balles = [];
  const game = {
    player: { position: new THREE.Vector3(3, 0, 8), alive: true },
    joueursDistants,
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

test('en réseau, l’acte III vise le joueur le plus avancé', () => {
  // La fonction masquée par la variable était justement celle qui choisit lequel
  // des joueurs le boss traque. C'est ce que le duo avait ajouté, et c'est
  // ce que le masquage a cassé.
  const distant = { position: new THREE.Vector3(-6, 0, 9), alive: true };
  const { enemies, game, boss } = banc({ joueursDistants: [distant] });
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

// --- LES OMBRES ---------------------------------------------------------------
//
// KORN ouvrait chaque combat de boss du voyage : on l'affrontait sept fois, et un
// dévoreur de mondes qu'on plie toutes les quatre vagues cesse d'en être un. Il
// attend maintenant au bout, et entre-temps ce sont les ombres des trois coques
// jouables — chacune se battant avec SON arme, retournée contre le joueur.

test('les ombres se succèdent dans l’ordre, et KORN garde la fin', () => {
  const vus = [1, 2, 3, 4, 5, 6].map((rang) => bossPourVague({ rang }));
  assert.deepEqual(vus, [...ORDRE_OMBRES, ...ORDRE_OMBRES], 'la rotation des ombres a changé');
  assert.equal(
    bossPourVague({ rang: 7, dernierSecteur: true }),
    'korn',
    'KORN n’attend plus au dernier secteur'
  );
});

test('la rotation compte les RENCONTRES, pas les numéros de vague', () => {
  // Les combats de boss ne tombent pas tous les quatre numéros : ils tombent
  // quand la DIFFICULTÉ est un multiple de quatre, et la pente l'étale. Les
  // vagues de boss réelles sont 5, 11, 16, 22… Un rang calculé sur le numéro de
  // vague donnait ORION à la cinquième et VULCAIN à la onzième : HÉLIOS
  // n'apparaissait jamais.
  const vagues = [];
  for (let n = 1; n <= 40; n++) {
    const diff = paramsVague(n).diff;
    if (diff % 4 === 0 && !vagues.some((v) => v.diff === diff)) {
      vagues.push({ n, diff, boss: bossPourVague({ rang: Math.round(diff / 4) }) });
    }
  }
  assert.ok(vagues.length >= 3, 'pas assez de combats de boss pour juger');
  const troisPremiers = vagues.slice(0, 3).map((v) => v.boss);
  assert.deepEqual(
    troisPremiers,
    ORDRE_OMBRES,
    `les trois premières rencontres donnent ${troisPremiers.join(', ')}`
  );
});

test('une partie menée au bout montre les trois ombres', () => {
  // C'est la raison d'être de la rotation : quelle que soit la coque pilotée, on
  // affronte les trois, pas trois fois la même.
  const vus = new Set([1, 2, 3].map((rang) => bossPourVague({ rang })));
  assert.equal(vus.size, 3, `une partie n’en montre que ${vus.size}`);
});

test('chaque boss a trois actes, nommés et ordonnés', () => {
  for (const [id, b] of Object.entries(BOSSES)) {
    assert.equal(b.phases.length, 3, `${id} n’a pas trois actes`);
    // Les seuils descendent : le premier acte court à pleine coque, le dernier
    // sous le tiers. Un seuil qui remonte rendrait un acte inatteignable.
    const seuils = b.phases.map((p) => p.seuil);
    assert.deepEqual(
      seuils,
      [...seuils].sort((x, y) => y - x),
      `${id} : seuils en désordre`
    );
    assert.equal(seuils[0], 1, `${id} : le premier acte ne démarre pas à pleine coque`);
    for (const p of b.phases) {
      assert.ok(p.nom && p.dit, `${id} : un acte sans nom ni annonce`);
      assert.ok(p.roles?.length, `${id} : un acte qui ne tire rien`);
    }
  }
});

test('chaque ombre se bat avec l’arme de sa coque', () => {
  // C'est tout le propos : le joueur reconnaît ce qui le tue, et connaît déjà la
  // parade — il l'a juste toujours utilisée dans l'autre sens.
  const helios = BOSSES['ombre-helios'];
  assert.ok(
    helios.phases.every((p) => p.rayons),
    'l’ombre d’HÉLIOS doit porter un rayon à chaque acte'
  );
  const vulcain = BOSSES['ombre-vulcain'];
  assert.ok(
    vulcain.phases.every((p) => p.mines),
    'l’ombre de VULCAIN doit semer à chaque acte'
  );
  const orion = BOSSES['ombre-orion'];
  assert.ok(
    orion.phases.some((p) => p.chercheuses),
    'l’ombre d’ORION doit lancer des chercheuses'
  );
  // Et elles ne se marchent pas dessus : KORN n'emprunte rien.
  assert.ok(
    BOSSES.korn.phases.every((p) => !p.rayons && !p.mines && !p.chercheuses),
    'KORN a hérité d’une arme d’ombre'
  );
});

test('deux rayons laissent toujours de quoi passer', () => {
  // Une arène barrée est une arène perdue : deux colonnes qui se croisent doivent
  // laisser un couloir, sinon l'acte final d'HÉLIOS n'est plus difficile, il est
  // impossible.
  const largeurArene = ARENA.playerXMax * 2;
  const barre = BOSS_RAYON_DEMI * 2 * 2; // deux colonnes, deux demi-largeurs chacune
  assert.ok(
    largeurArene - barre > 6,
    `il ne reste que ${(largeurArene - barre).toFixed(1)} unités de passage`
  );
});

test('une ombre tombe plus vite que KORN', () => {
  // On en affronte sept, on n'affronte KORN qu'une fois. Ça doit se sentir dans
  // le temps qu'ils mettent à tomber.
  for (const id of ORDRE_OMBRES) {
    assert.ok(BOSSES[id].hp < BOSSES.korn.hp, `${id} est aussi coriace que KORN`);
  }
});

test('les trois ombres se tiennent comme trois boss', () => {
  // La taille est VISÉE, pas multipliée : les trois carènes n'ont pas la même
  // envergure, et à facteur égal celle d'HÉLIOS — le faucon, tout en ailes —
  // mesurait deux fois celle d'ORION. Elle couvrait plus de la moitié de l'arène.
  const tailles = ORDRE_OMBRES.map((id) => BOSSES[id].demiLargeur);
  for (const [i, id] of ORDRE_OMBRES.entries()) {
    assert.ok(tailles[i] > 3, `${id} est trop petite pour un boss`);
    // KORN reste le plus gros de tous : c'est lui qu'on affronte au bout.
    assert.ok(tailles[i] < 5.2, `${id} dépasse KORN`);
    assert.ok(BOSSES[id].coque, `${id} n’est l’ombre de personne`);
    assert.ok(BOSSES[id].replique, `${id} : KORN l’extrait sans rien dire`);
  }
  // Et elles restent comparables entre elles : un quart d'écart au maximum.
  assert.ok(
    Math.max(...tailles) / Math.min(...tailles) < 1.25,
    `écart de taille entre ombres : ${(Math.max(...tailles) / Math.min(...tailles)).toFixed(2)}`
  );
  assert.equal(BOSSES.korn.coque, null, 'KORN ne devrait être l’ombre de personne');
  assert.equal(BOSSES.korn.demiLargeur, null, 'KORN a sa propre carène, donc sa propre taille');
});

test('un identifiant inconnu retombe sur KORN plutôt que de casser', () => {
  assert.equal(bossParId('ombre-de-rien').nom, 'KORN');
  assert.equal(bossParId(undefined).nom, 'KORN');
});

test('l’extraction dure assez pour se lire, pas assez pour lasser', () => {
  const total = EXTRACTION.arrivee + EXTRACTION.sortie + EXTRACTION.depart;
  assert.ok(total > 2, `${total.toFixed(1)} s : trop court pour comprendre`);
  assert.ok(total < 5, `${total.toFixed(1)} s : trop long, on attend`);
});

// --- LA TRANSFORMATION --------------------------------------------------------
//
// Le passage d'un acte à l'autre est un PLAN : le joueur ne fait rien pendant
// deux secondes et demie. Ça impose deux choses, et l'épreuve défend les deux.

test('ce qu’on voit et ce qu’on touche grandissent ensemble', () => {
  // C'est LE défaut qui revient à chaque fois qu'un boss change de taille : la
  // silhouette grossit, la boîte de collision reste. On tire alors dans une
  // coque sans rien lui faire, ou l'on meurt à côté du vide — et rien à l'écran
  // ne permet de le comprendre.
  const { enemies, game, boss } = banc();
  boss.group.userData.rayon = 3;
  boss.def = { ...boss.def, radius: 3 };
  boss.fiche = bossParId('ombre-orion');

  const suit = () => boss.group.scale.x / boss.def.radius;
  joue(enemies, boss, game, 100, 0.5);
  const avant = suit();

  // Deux transformations d'affilée : on descend sous les deux tiers, puis sous
  // le tiers, en laissant chaque plan se dérouler entièrement.
  joue(enemies, boss, game, 50, BOSS_BASCULE + 0.5);
  joue(enemies, boss, game, 20, BOSS_BASCULE + 0.5);

  assert.equal(boss.phase, 2, 'le boss n’a pas traversé les deux transformations');
  assert.ok(
    Math.abs(suit() - avant) < 0.001,
    `le rapport taille/collision a dérivé : ${avant.toFixed(3)} → ${suit().toFixed(3)}`
  );
  assert.ok(boss.def.radius > 3, 'la boîte de collision n’a pas grandi du tout');
});

test('un boss transformé est plus grand qu’avant', () => {
  const { enemies, game, boss } = banc();
  boss.fiche = bossParId('ombre-orion');
  joue(enemies, boss, game, 100, 0.5);
  const avant = boss.group.scale.x;
  joue(enemies, boss, game, 50, BOSS_BASCULE + 0.5);
  assert.ok(
    boss.group.scale.x > avant,
    `il ne grossit pas : ${avant.toFixed(2)} → ${boss.group.scale.x.toFixed(2)}`
  );
  // Mais pas au point de remplir l'écran : trois actes, c'est deux montées.
  assert.ok(boss.group.scale.x < avant * 1.5, 'il grossit beaucoup trop d’un coup');
});

test('la déflagration balaie les tirs ennemis', () => {
  // Le joueur subit un plan de deux secondes et demie sans pouvoir esquiver ni
  // riposter. Mourir d'une balle tirée AVANT la transformation serait une mort
  // qu'il ne pourrait imputer qu'à la mise en scène.
  const { enemies, game, boss } = banc();
  boss.fiche = bossParId('ombre-orion');
  const balles = [{ id: 1 }, { id: 2 }, { id: 3 }];
  game.enemyBullets = {
    forEachActive: (f) => [...balles].forEach(f),
    kill: (b) => balles.splice(balles.indexOf(b), 1),
  };
  joue(enemies, boss, game, 100, 0.5);
  joue(enemies, boss, game, 50, BOSS_BASCULE + 0.5);
  assert.equal(balles.length, 0, 'des tirs ont survécu à la déflagration');
});

test('chaque transformation a une phrase à dire', () => {
  // Le deuxième et le troisième acte se gagnent : ils méritent une réplique. Le
  // premier n'en a pas, il n'y a pas eu de transformation pour y arriver.
  for (const [id, b] of Object.entries(BOSSES)) {
    assert.ok(!b.phases[0].cri, `${id} : le premier acte n’a rien à crier`);
    assert.ok(b.phases[1].cri, `${id} : l’acte II se passe en silence`);
    assert.ok(b.phases[2].cri, `${id} : l’acte III se passe en silence`);
  }
});

test('la transformation dure assez pour se vivre, pas assez pour agacer', () => {
  const total = TRANSFO.charge + TRANSFO.cri + TRANSFO.souffle + TRANSFO.reprise;
  assert.equal(BOSS_BASCULE, total, 'la durée annoncée ne vaut pas la somme des temps');
  assert.ok(total > 2, `${total.toFixed(2)} s : trop court pour un moment`);
  assert.ok(total < 4, `${total.toFixed(2)} s sans rien faire, c’est trop long`);
});

// --- LA PENTE DES BOSS --------------------------------------------------------
//
// Les points de vie réels d'un boss ne se lisent PAS dans sa fiche : ils sortent
// de la difficulté de la vague où on le rencontre, multipliée par son facteur.
// Deux nombres écrits à deux endroits différents, dont seul le produit compte —
// c'est exactement le genre de réglage qui dérape sans qu'on s'en aperçoive.
//
// Il a dérapé : l'ombre d'ORION tombait avec 73 points de vie quand celle
// d'HÉLIOS en avait 120 et celle de VULCAIN 175. « Vraiment trop faible », et
// c'était vrai — le premier boss du voyage doit être le plus abordable, pas
// inexistant.

// Ce que le joueur affronte VRAIMENT, à la vague où il le rencontre.
function pvReels(vague, id) {
  const d = paramsVague(vague).diff;
  return Math.round((ENEMY_TYPES.boss.hp + d * BOSS.hpPerWave) * BOSSES[id].hp);
}

// Les vraies vagues de boss de l'arcade, celles que la pente produit.
const RENCONTRES = [
  [5, 'ombre-orion'],
  [11, 'ombre-helios'],
  [16, 'ombre-vulcain'],
];

test('chaque ombre est plus coriace que la précédente', () => {
  let avant = 0;
  for (const [vague, id] of RENCONTRES) {
    const pv = pvReels(vague, id);
    assert.ok(pv > avant, `${id} (${pv} PV) n’est pas plus dur que le boss d’avant (${avant})`);
    avant = pv;
  }
});

test('le premier boss se sent, sans être un mur', () => {
  const pv = pvReels(5, 'ombre-orion');
  // Sous cent points de vie, il tombe avant d'avoir montré son deuxième acte —
  // et un boss en trois actes dont on ne voit qu'un n'est pas un boss.
  assert.ok(pv >= 100, `l’ombre d’ORION n’a que ${pv} PV : elle tombe trop vite`);
  // Au-delà du double du suivant, ce ne serait plus une introduction.
  assert.ok(pv < pvReels(11, 'ombre-helios') * 1.2, `l’ombre d’ORION à ${pv} PV : trop dure`);
});

test('l’écart entre deux ombres reste une pente, pas une marche', () => {
  // C'était une marche : 73 puis 120, soit soixante-cinq pour cent d'un coup.
  for (let i = 1; i < RENCONTRES.length; i++) {
    const bas = pvReels(...RENCONTRES[i - 1]);
    const haut = pvReels(...RENCONTRES[i]);
    assert.ok(
      haut / bas < 1.6,
      `${RENCONTRES[i][1]} fait ×${(haut / bas).toFixed(2)} le boss précédent`
    );
  }
});

test('KORN reste de loin le plus coriace', () => {
  // C'est le bout du voyage : il doit écraser tout ce qui précède.
  const korn = pvReels(27, 'korn');
  for (const [vague, id] of RENCONTRES) {
    assert.ok(korn > pvReels(vague, id) * 1.8, `KORN (${korn} PV) ne domine pas ${id}`);
  }
});
