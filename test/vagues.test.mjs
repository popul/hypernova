// LA COMPOSITION DES VAGUES, ET LE VOYAGE QU'ELLES TRAVERSENT.
//
// Trois promesses se jouent ici, et aucune ne se voit en relisant le code.
//
// Une vague doit d'abord CONTENIR quelque chose. Une vague vide ne se termine
// jamais : le jeu attend la mort d'un ennemi qui n'entrera pas, et la partie
// s'arrête sans message, sur un fond d'étoiles.
//
// Elle doit ensuite être REPRODUCTIBLE. Le rejeu, le jeu à deux et le défi du
// jour reposent tous les trois sur la même phrase : à graine égale, vague égale.
// Cette promesse ne casse jamais bruyamment — un Math.random glissé dans
// makeWave laisse tout fonctionner, sauf que les deux joueurs ne se battent plus
// contre la même chose, et personne ne s'en aperçoit avant la fin de la partie.
//
// Le voyage, enfin, doit couvrir toutes les vagues et mener quelque part. Un
// secteur manquant ne lève pas d'erreur : la scène ne se rebâtit pas, et l'on se
// bat dans le décor précédent. Une escale manquante est pire — le joueur a payé
// le détour en crédits ET en difficulté, et il n'obtient rien.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeWave,
  paramsVague,
  annoncesPourVague,
  variantsPour,
  ARRIERE_DEPUIS,
  dailySeed,
  slotBasePosition,
  difficulty,
  pickWeighted,
  pickDiveStyle,
} from '../src/game/waves.js';
import { STAGES, stageForWave, durcisPourBoss, biomeForWave } from '../src/game/space/biomes.js';
import { escalePourSecteur, A_UNE_ESCALE } from '../src/game/space/escales.js';
import { createLandmark } from '../src/game/space/landmarks.js';
import {
  routesForStage,
  PALIERS,
  palierDeCoque,
  fragmentsAvantPalierSuivant,
  prochainPalier,
} from '../src/game/routes.js';
import { WAVES, ENEMY, ENEMY_TYPES, ARENA, PLAYER } from '../src/game/constants.js';
import * as THREE from 'three';

const MODS_NEUTRES = { hp: 1, fire: 1, dive: 1, credits: 1 };
const GRAINES = [0, 1, 7, 4242, 2166136261];

// L'empreinte complète d'une vague : tout ce qu'un joueur peut voir arriver, y
// compris les quatre points de contrôle de chaque trajectoire. C'est la seule
// façon honnête de comparer deux vagues — comparer les seuls types laisserait
// passer une chorégraphie tirée au hasard.
function empreinte(vague) {
  return JSON.stringify([
    vague.boss,
    vague.spawns.map((s) => [
      s.type,
      s.row,
      s.col,
      s.cols,
      s.delay,
      s.curve.v0.toArray(),
      s.curve.v1.toArray(),
      s.curve.v2.toArray(),
      s.curve.v3.toArray(),
    ]),
  ]);
}

// ─── LA VAGUE ────────────────────────────────────────────────────────────────

test('une vague livre toujours des ennemis, et des ennemis que le jeu sait fabriquer', () => {
  // Le type est une chaîne, et rien ne la vérifie avant l'entrée en scène :
  // `ENEMY_TYPES[spawn.type]` rend `undefined` sur une faute de frappe, et le jeu
  // s'arrête à la première lecture de ses points de vie. Au milieu d'une partie.
  for (let n = 1; n <= 60; n++) {
    for (const opts of [{ seed: 3 }, { seed: 3, noBoss: true }, { seed: 3, forceBoss: true }]) {
      const v = makeWave(n, opts);
      assert.ok(v.spawns.length > 0, `vague ${n} (${JSON.stringify(opts)}) : personne n'entre`);
      const cols = v.spawns[0].cols;
      for (const s of v.spawns) {
        assert.ok(ENEMY_TYPES[s.type], `vague ${n} : type d'ennemi inconnu « ${s.type} »`);
        assert.equal(s.cols, cols, `vague ${n} : deux largeurs de formation dans la même vague`);
        assert.ok(Number.isFinite(s.delay) && s.delay >= 0, `vague ${n} : délai d'entrée aberrant`);
        assert.ok(
          Number.isInteger(s.col) && s.col >= 0 && s.col < cols,
          `vague ${n} : colonne ${s.col} hors formation`
        );
        assert.ok(s.curve && s.curve.v3, `vague ${n} : un ennemi sans trajectoire d'entrée`);
      }
    }
  }
});

test('deux ennemis ne se posent jamais dans le même créneau de formation', () => {
  // Deux vaisseaux au même endroit, c'est un seul vaisseau à l'écran — et une
  // rangée qu'on croit avoir nettoyée alors qu'il reste quelque chose dedans.
  for (let n = 1; n <= 40; n++) {
    const v = makeWave(n, { seed: 11 });
    const pris = new Set();
    for (const s of v.spawns) {
      if (s.type === 'boss') continue; // l'amiral ne prend pas de créneau, il patrouille
      const cle = `${s.row}:${s.col}`;
      assert.ok(!pris.has(cle), `vague ${n} : deux ennemis dans le créneau ${cle}`);
      pris.add(cle);
    }
  }
});

test('chaque ennemi vole vers le créneau qu’on lui a promis', () => {
  // La trajectoire d'entrée et la position de formation sont calculées à deux
  // endroits différents. Si l'une bouge sans l'autre — un espacement de colonne
  // retouché, par exemple — les ennemis se posent à côté de leur place et la
  // formation se met à onduler de travers, sans que rien ne signale l'erreur.
  const attendu = new THREE.Vector3();
  for (let n = 1; n <= 30; n++) {
    for (const s of makeWave(n, { seed: 5 }).spawns) {
      if (s.type === 'boss') continue;
      slotBasePosition(s.row, s.col, s.cols, attendu);
      assert.ok(
        s.curve.v3.distanceTo(attendu) < 1e-6,
        `vague ${n} : l'ennemi (${s.row},${s.col}) atterrit en ${s.curve.v3.toArray()} au lieu de ${attendu.toArray()}`
      );
    }
  }
});

test('la formation entière tient dans le cadre, et devant le joueur', () => {
  // La largeur de formation grandit avec la vague. Rien ne la confronte à la
  // taille de l'arène : au-delà, les ennemis des colonnes extérieures se posent
  // hors de l'écran, où ils tirent sans qu'on puisse ni les voir ni les atteindre.
  const p = new THREE.Vector3();
  for (let n = 1; n <= 60; n++) {
    for (const s of makeWave(n, { seed: 2 }).spawns) {
      if (s.type === 'boss') continue;
      slotBasePosition(s.row, s.col, s.cols, p);
      const rayon = ENEMY_TYPES[s.type].radius;
      assert.ok(
        Math.abs(p.x) + rayon <= ARENA.playerXMax,
        `vague ${n} : la colonne ${s.col} déborde du cadre (x=${p.x.toFixed(2)})`
      );
      assert.ok(
        p.z + rayon < ARENA.playerZMin,
        `vague ${n} : la rangée ${s.row} se pose sur le joueur (z=${p.z.toFixed(2)})`
      );
    }
  }
});

test('le boss tombe quand il doit, et jamais quand on le refuse', () => {
  for (let n = 1; n <= 60; n++) {
    const auto = makeWave(n, { seed: 9 });
    assert.equal(
      auto.boss,
      n % WAVES.bossEvery === 0,
      `vague ${n} : le rendez-vous avec l'amiral n'est pas au bon numéro`
    );
    // Le drapeau et le contenu doivent dire la même chose : la musique, le HUD et
    // la fin de vague se fient au drapeau, la scène au contenu.
    const amiraux = auto.spawns.filter((s) => s.type === 'boss').length;
    assert.equal(
      amiraux,
      auto.boss ? 1 : 0,
      `vague ${n} : ${amiraux} amiral(aux) pour boss=${auto.boss}`
    );

    // Les missions de campagne et les escales imposent leur choix : une escale
    // sans boss doit rester sans boss, même sur un numéro de rendez-vous.
    assert.equal(makeWave(n, { seed: 9, noBoss: true }).boss, false, `vague ${n} : noBoss ignoré`);
    assert.equal(
      makeWave(n, { seed: 9, forceBoss: true }).boss,
      true,
      `vague ${n} : forceBoss ignoré`
    );
    assert.equal(
      makeWave(n, { seed: 9, noBoss: true }).spawns.some((s) => s.type === 'boss'),
      false,
      `vague ${n} : un amiral entre en scène malgré noBoss`
    );
  }
});

test('l’amiral entre en dernier, et se pose au milieu', () => {
  // Il doit arriver APRÈS son escorte : entré le premier, il occupe le champ
  // pendant que la formation se constitue derrière lui, et le combat commence
  // par la seule chose qu'on ne peut pas encore faire — le tuer.
  for (const n of [4, 8, 12, 16, 24, 40]) {
    const v = makeWave(n, { seed: 6 });
    const boss = v.spawns.find((s) => s.type === 'boss');
    const escorte = v.spawns.filter((s) => s.type !== 'boss');
    assert.ok(boss, `vague ${n} : pas d'amiral sur une vague de boss`);
    assert.ok(escorte.length > 0, `vague ${n} : l'amiral arrive seul, sans escorte`);
    assert.ok(
      boss.delay > Math.max(...escorte.map((s) => s.delay)),
      `vague ${n} : l'amiral entre avant son escorte`
    );
    assert.equal(boss.curve.v3.x, 0, `vague ${n} : l'amiral ne se pose pas au centre`);
  }
});

test('la vague déferle en deux assauts, avec une respiration entre les deux', () => {
  // Le compte-gouttes d'avant livrait moins d'ennemis que le joueur n'en tuait :
  // la formation ne se constituait jamais. Deux réglages peuvent réintroduire le
  // problème sans rien casser d'autre — un décalage d'entrée trop large, qui fait
  // que le premier assaut n'a pas fini d'entrer quand le second commence, ou un
  // intervalle entre assauts rogné jusqu'à les fondre en un seul.
  for (let n = WAVES.twoAssaultsFromWave; n <= 40; n++) {
    if (n % WAVES.bossEvery === 0) continue; // les vagues de boss n'ont pas d'assauts
    const v = makeWave(n, { seed: 4 });
    const a = v.spawns.filter((s) => s.row <= 2);
    const b = v.spawns.filter((s) => s.row > 2);
    assert.ok(a.length && b.length, `vague ${n} : il n'y a plus deux assauts`);
    const finA = Math.max(...a.map((s) => s.delay));
    const debutB = Math.min(...b.map((s) => s.delay));
    assert.ok(
      debutB - finA >= 1,
      `vague ${n} : les deux assauts se rejoignent (${(debutB - finA).toFixed(2)} s)`
    );
  }
});

test('les premières vagues arrivent rangée par rangée, pour qu’on apprenne', () => {
  // Avant le seuil des deux assauts, chaque rangée doit entrer APRÈS la
  // précédente : c'est la seule montée en douceur du jeu, et il n'y en a pas
  // d'autre pour expliquer ce qu'est une formation.
  for (let n = 1; n < WAVES.twoAssaultsFromWave; n++) {
    if (n % WAVES.bossEvery === 0) continue;
    const v = makeWave(n, { seed: 8 });
    const rangs = [...new Set(v.spawns.map((s) => s.row))].sort((x, y) => x - y);
    let precedent = -Infinity;
    for (const r of rangs) {
      const debut = Math.min(...v.spawns.filter((s) => s.row === r).map((s) => s.delay));
      assert.ok(debut > precedent, `vague ${n} : la rangée ${r} n'attend pas la précédente`);
      precedent = debut;
    }
  }
});

test('à graine égale, vague égale — au point de contrôle près', () => {
  // C'est la promesse dont dépendent le rejeu, le jeu à deux et le défi du jour.
  // Elle se casse en silence : un Math.random dans makeWave laisserait le jeu
  // parfaitement jouable, et les deux joueurs verraient deux vagues différentes.
  for (const graine of GRAINES) {
    for (let n = 1; n <= 24; n++) {
      assert.equal(
        empreinte(makeWave(n, { seed: graine })),
        empreinte(makeWave(n, { seed: graine })),
        `graine ${graine}, vague ${n} : deux appels identiques donnent deux vagues différentes`
      );
    }
  }
  // La graine par défaut est documentée comme valant 1. Une partie lancée sans
  // graine et une partie de graine 1 doivent donc être la même partie.
  assert.equal(
    empreinte(makeWave(6)),
    empreinte(makeWave(6, { seed: 1 })),
    'la graine par défaut a changé'
  );
  // Zéro est une graine, pas une absence de graine : `?? 1` et non `|| 1`.
  assert.notEqual(
    empreinte(makeWave(6, { seed: 0 })),
    empreinte(makeWave(6, { seed: 1 })),
    'la graine 0 est traitée comme absente'
  );
});

test('deux graines différentes ne donnent pas la même vague', () => {
  // L'autre moitié de la promesse : si la graine était ignorée, tout ce qui
  // précède passerait quand même, et toutes les parties se ressembleraient.
  for (const n of [1, 3, 5, 8, 12, 17]) {
    const vues = new Map();
    for (let graine = 0; graine < 30; graine++) {
      const e = empreinte(makeWave(n, { seed: graine }));
      assert.ok(
        !vues.has(e),
        `vague ${n} : les graines ${vues.get(e)} et ${graine} donnent la même vague`
      );
      vues.set(e, graine);
    }
  }
});

test('la graine du jour ne dépend que du jour', () => {
  // Tous les joueurs doivent affronter les mêmes vagues le même jour, quelle que
  // soit l'heure à laquelle ils lancent la partie — et deux jours voisins ne
  // doivent pas retomber sur la même graine, sinon le défi ne change pas.
  const matin = dailySeed(new Date('2026-08-28T00:00:01Z'));
  const soir = dailySeed(new Date('2026-08-28T23:59:59Z'));
  assert.equal(matin, soir, 'la graine du jour bouge au cours de la journée');
  assert.notEqual(
    matin,
    dailySeed(new Date('2026-08-29T00:00:01Z')),
    'deux jours de suite, même défi'
  );

  const vues = new Set();
  for (let j = 0; j < 400; j++) {
    const d = new Date(Date.UTC(2026, 0, 1 + j));
    const g = dailySeed(d);
    assert.ok(
      Number.isInteger(g) && g >= 0 && g <= 0xffffffff,
      `graine du jour hors bornes : ${g}`
    );
    vues.add(g);
  }
  assert.equal(vues.size, 400, 'deux jours de l’année partagent la même graine');
});

test('tout tirage de motif tombe sur un motif que le jeu sait jouer', () => {
  // Les tables de poids nomment des motifs de tir et de plongée, et le code qui
  // les consomme retombe SILENCIEUSEMENT sur le motif de base quand le nom est
  // inconnu : une faute de frappe ne se verrait qu'à l'usure, en trouvant le jeu
  // devenu monotone. On vérifie donc les noms, et que le tirage ne sort jamais
  // de la table — y compris aux deux bords, où un `<=` mal placé rend undefined.
  const TIRS = new Set(['aimed', 'wall', 'cross']);
  const PIQUES = new Set(['sweep', 'strafe', 'squad']);
  for (let n = 1; n <= 40; n++) {
    const d = difficulty(n, MODS_NEUTRES, 0);
    for (const [table, permis, tire] of [
      [d.volleyWeights, TIRS, pickWeighted],
      [d.diveWeights, PIQUES, pickDiveStyle],
    ]) {
      const cles = Object.keys(table);
      assert.ok(cles.length > 0, `vague ${n} : table de motifs vide`);
      let somme = 0;
      for (const [cle, poids] of Object.entries(table)) {
        assert.ok(permis.has(cle), `vague ${n} : motif « ${cle} » que personne ne sait jouer`);
        assert.ok(
          poids > 0,
          `vague ${n} : le motif « ${cle} » a un poids nul, il ne sortira jamais`
        );
        somme += poids;
      }
      assert.ok(
        Math.abs(somme - 1) < 1e-9,
        `vague ${n} : les poids totalisent ${somme} au lieu de 1`
      );
      for (let i = 0; i < 200; i++) {
        const sorti = tire(table, i / 200);
        assert.ok(
          cles.includes(sorti),
          `vague ${n} : le tirage ${i / 200} sort « ${sorti} », hors table`
        );
      }
    }
  }
});

// ─── LE VOYAGE ───────────────────────────────────────────────────────────────

const indexDe = (stage) => STAGES.indexOf(stage);
const vaguesDuSecteur = (i) => {
  const out = [];
  for (let w = 1; w <= 400; w++) if (stageForWave(w) === STAGES[i]) out.push(w);
  return out;
};

test('aucune vague ne se joue sans secteur, et le voyage ne revient jamais en arrière', () => {
  // Un secteur absent ne lève rien : la scène ne se rebâtit pas et l'on se bat
  // dans le décor du palier précédent. Un secteur qui recule serait pire — le
  // sujet du jeu est de s'éloigner de la Terre, pas d'y revenir.
  let precedent = -1;
  for (let w = 0; w <= 400; w++) {
    const s = stageForWave(w);
    assert.ok(s && indexDe(s) >= 0, `vague ${w} : aucun secteur`);
    assert.ok(indexDe(s) >= precedent, `vague ${w} : le voyage rebrousse chemin`);
    precedent = indexDe(s);
  }
  assert.equal(precedent, STAGES.length - 1, 'le voyage n’atteint jamais son dernier palier');
  assert.equal(stageForWave(-5), STAGES[0], 'un numéro de vague aberrant doit retomber au départ');
});

test('les onze secteurs durent tous le même temps, et sont tous atteignables', () => {
  // Le voyage n'a de sens que si l'on passe par tout. Un décalage d'une vague
  // dans le découpage ferait sauter un secteur entier — celui-là ne se verrait
  // jamais, et personne ne saurait qu'il existe.
  const longueurs = STAGES.slice(0, -1).map((_, i) => vaguesDuSecteur(i).length);
  assert.ok(
    longueurs.every((l) => l === longueurs[0]),
    `paliers de durées inégales : ${longueurs.join(',')}`
  );
  assert.ok(longueurs[0] >= 1, 'un palier ne couvre aucune vague');
  assert.equal(vaguesDuSecteur(0)[0], 1, 'la partie ne commence pas au premier secteur');
  // Et le dernier ne se termine pas : la partie continue quand le voyage s'arrête.
  assert.ok(
    vaguesDuSecteur(STAGES.length - 1).length > longueurs[0],
    'le dernier palier a une fin'
  );
});

test('chaque secteur est complet, et ils sont tous distincts', () => {
  // `setBiome` lit chacun de ces champs sans les vérifier. Un secteur ajouté à la
  // hâte, à qui il manque une nébuleuse ou un brouillard, casse la scène à
  // l'instant du saut — c'est-à-dire quinze minutes après le lancement du jeu.
  const modele = Object.keys(STAGES[0]).sort();
  const ids = new Set();
  for (const s of STAGES) {
    assert.deepEqual(
      Object.keys(s).sort(),
      modele,
      `le secteur « ${s.id} » n'a pas les mêmes champs que les autres`
    );
    assert.ok(!ids.has(s.id), `deux secteurs portent l'identifiant « ${s.id} »`);
    ids.add(s.id);
    assert.ok(s.name && s.sub, `le secteur « ${s.id} » n'a pas de quoi s'annoncer`);
    assert.ok(s.sun > 0, `le secteur « ${s.id} » n'a plus de soleil du tout`);
    assert.ok(s.fog.density > 0, `le secteur « ${s.id} » n'a pas de brouillard`);
    assert.ok(s.hemi.intensity > 0 && s.exposure > 0, `le secteur « ${s.id} » est éteint`);
    assert.equal(
      s.star.opacity.length,
      2,
      `le secteur « ${s.id} » : deux opacités d'étoiles attendues`
    );
    assert.ok(
      Array.isArray(s.nebulas) && Array.isArray(s.landmark),
      `le secteur « ${s.id} » : nébuleuses ou décors mal formés`
    );
  }
});

test('le Soleil rétrécit à chaque saut, sans jamais remonter', () => {
  // C'est le seul indicateur de distance que le joueur n'ait jamais besoin qu'on
  // lui explique. Un palier inséré au mauvais endroit le ferait grossir, et
  // l'unique repère du voyage deviendrait un mensonge.
  for (let i = 1; i < STAGES.length; i++) {
    assert.ok(
      STAGES[i].sun < STAGES[i - 1].sun,
      `« ${STAGES[i].id} » a un Soleil plus gros que « ${STAGES[i - 1].id} »`
    );
  }
});

// Le rose des projectiles ennemis : rouge et bleu à fond, vert éteint.
const estRose = (hex) => {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return r >= 200 && b >= 200 && g <= 120;
};

test('aucun décor ne pose de rose dans le fond', () => {
  // Contrainte non négociable : les projectiles ennemis sont roses, et doivent
  // l'être SEULS. Un fond, une brume ou une lumière de bord dans la même teinte
  // et l'on ne distingue plus ce qui tue de ce qui décore. C'est le genre de
  // réglage qu'on change pour une raison esthétique, sans penser aux balles.
  assert.ok(
    estRose(ENEMY.bulletColorAimed),
    'le critère ne désigne plus la couleur des balles visées'
  );
  assert.ok(
    !estRose(ENEMY.bulletColorStraight),
    'le critère est devenu si large qu’il attrape les balles droites'
  );

  const lieux = [];
  for (const s of STAGES) {
    lieux.push(s, durcisPourBoss(s));
    const e = escalePourSecteur(s, 0);
    if (e) lieux.push(e, durcisPourBoss(e));
  }
  for (const l of lieux) {
    for (const [quoi, c] of [
      ['fond', l.bg],
      ['brouillard', l.fog.color],
      ['ciel', l.hemi.sky],
      ['sol', l.hemi.ground],
      ['liseré', l.rim],
      ['étoiles', l.star.color],
    ]) {
      assert.ok(
        !estRose(c),
        `« ${l.id} » : le ${quoi} est rose comme un projectile (0x${c.toString(16)})`
      );
    }
    for (const [css] of l.nebulas) {
      const m = css.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      assert.ok(m, `« ${l.id} » : nébuleuse illisible (${css})`);
      const hex = (+m[1] << 16) | (+m[2] << 8) | +m[3];
      assert.ok(!estRose(hex), `« ${l.id} » : une nébuleuse rose concurrence les projectiles`);
    }
  }
});

test('l’arrivée de l’amiral assombrit le lieu sans le remplacer', () => {
  // Il arrive, le décor ne change pas : le joueur doit garder l'endroit où il se
  // bat. Et l'identifiant DOIT bouger, parce que la scène ne se rebâtit que
  // là-dessus — sans quoi l'assombrissement ne s'appliquerait jamais.
  for (const base of [STAGES[0], STAGES[6], escalePourSecteur(STAGES[3], 0)]) {
    const d = durcisPourBoss(base);
    assert.notEqual(
      d.id,
      base.id,
      `« ${base.id} » : l'identifiant ne change pas, la scène ne se rebâtira pas`
    );
    assert.equal(d.name, base.name, `« ${base.id} » : le joueur perd le nom du lieu où il se bat`);
    assert.deepEqual(
      d.landmark,
      base.landmark,
      `« ${base.id} » : les décors disparaissent à l'arrivée de l'amiral`
    );
    assert.equal(d.escale, base.escale, `« ${base.id} » : une escale cesse d'être une escale`);
    assert.ok(d.fog.density > base.fog.density, `« ${base.id} » : le brouillard ne monte pas`);
    assert.ok(d.hemi.intensity < base.hemi.intensity, `« ${base.id} » : la lumière ne baisse pas`);
    assert.ok(d.exposure < base.exposure, `« ${base.id} » : l'exposition ne baisse pas`);
  }
  assert.equal(biomeForWave(1, false), STAGES[0], 'biomeForWave ne rend plus le secteur nu');
  assert.equal(
    biomeForWave(1, true).id,
    durcisPourBoss(STAGES[0]).id,
    'biomeForWave n’assombrit plus pour le boss'
  );
});

// ─── LES ESCALES ─────────────────────────────────────────────────────────────

test('chaque secteur du voyage mène quelque part', () => {
  // Le détour se paie en crédits ET en difficulté sur la vague suivante. Un
  // secteur sans escale — un palier ajouté sans y penser — ferait payer le prix
  // au joueur pour l'expédier directement à la boutique, sans rien.
  for (const s of STAGES) {
    assert.ok(A_UNE_ESCALE(s.id), `le secteur « ${s.id} » n'offre aucun détour`);
    assert.ok(
      escalePourSecteur(s, 0),
      `le secteur « ${s.id} » se dit une escale mais n'en rend aucune`
    );
  }
  // Les deux réponses doivent s'accorder : le jeu interroge la première pour
  // décider du détour, et n'appelle la seconde qu'après l'avoir facturé.
  assert.equal(A_UNE_ESCALE('secteur-qui-n-existe-pas'), false);
  assert.equal(escalePourSecteur({ id: 'secteur-qui-n-existe-pas' }, 0), null);
});

test('une escale a tout ce qu’un secteur a, et un peu plus', () => {
  // `setBiome` reçoit une escale exactement comme il reçoit un secteur : tout
  // champ ajouté aux secteurs et oublié ici devient un `undefined` au milieu de
  // la construction de la scène, à l'endroit précis du jeu qu'on a fait le détour
  // d'aller voir.
  const champsSecteur = Object.keys(STAGES[0]);
  for (const s of STAGES) {
    for (let tirage = 0; tirage < 4; tirage++) {
      const e = escalePourSecteur(s, tirage);
      for (const c of champsSecteur) {
        assert.ok(c in e, `escale de « ${s.id} » : champ « ${c} » manquant`);
      }
      assert.ok(
        e.escale,
        `escale de « ${s.id} » : elle ne dit pas de quel genre de lieu il s'agit`
      );
      assert.ok(e.name && e.sub, `escale de « ${s.id} » : elle ne s'annonce pas`);
      assert.deepEqual(
        e.nebulas,
        [],
        `escale de « ${s.id} » : des nébuleuses peintes derrière un sol`
      );
      assert.equal(
        e.landmark.length,
        1,
        `escale de « ${s.id} » : une escale est un lieu, pas une collection`
      );
      assert.ok(
        e.fog.density > s.fog.density,
        `escale de « ${s.id} » : elle n'est pas plus fermée que le vide`
      );
      // Le plancher d'éclairage : une escale qu'on a fait le détour d'aller voir
      // et qu'on ne voit pas n'existe pas. Il vaut 0,62 dans le code.
      assert.ok(
        e.hemi.intensity >= 0.62,
        `escale de « ${s.id} » : trop sombre pour être vue (${e.hemi.intensity})`
      );
    }
  }
});

test('deux escales ne se confondent jamais, ni entre elles ni avec un secteur', () => {
  // La scène ne se rebâtit que si l'identifiant change. Deux lieux qui partagent
  // le leur, et l'on garde le décor du précédent — on se croit sur Europe et l'on
  // est encore dans les anneaux.
  const vus = new Set(STAGES.map((s) => s.id));
  for (const s of STAGES) {
    for (let tirage = 0; tirage < 6; tirage++) {
      const e = escalePourSecteur(s, tirage);
      if (vus.has(e.id) && !e.id.endsWith(s.id)) {
        assert.fail(`l'escale « ${e.id} » entre en collision avec un autre lieu`);
      }
      assert.ok(
        e.id.includes(s.id),
        `l'escale « ${e.id} » ne porte pas le secteur dont elle dépend`
      );
      vus.add(e.id);
    }
  }
  // Et deux escales ne s'annoncent pas non plus sous le même titre : c'est ce
  // titre, et lui seul, qui dit au joueur où le détour l'a mené.
  const titres = new Map();
  for (const s of STAGES) {
    for (let tirage = 0; tirage < 6; tirage++) {
      const e = escalePourSecteur(s, tirage);
      const deja = titres.get(e.name);
      assert.ok(
        deja == null || deja === e.id,
        `« ${e.id} » et « ${deja} » s'annoncent tous deux « ${e.name} »`
      );
      titres.set(e.name, e.id);
    }
  }
});

test('une escale est stable pour un tirage donné, et se rejoue', () => {
  // Le tirage vient de la graine de la partie, jamais d'un hasard vif : deux
  // parties de même graine doivent passer par les mêmes escales, sinon le rejeu
  // ne montre pas ce que le joueur a vu.
  for (const s of STAGES) {
    for (const tirage of [0, 1, 5, 42, 100002]) {
      assert.deepEqual(
        escalePourSecteur(s, tirage),
        escalePourSecteur(s, tirage),
        `escale de « ${s.id} », tirage ${tirage} : deux appels, deux lieux`
      );
    }
    // Un tirage négatif ne doit pas sortir de la table : ce serait un `undefined`
    // déstructuré, donc une erreur, au moment d'entrer dans le lieu.
    assert.equal(
      escalePourSecteur(s, -3).id,
      escalePourSecteur(s, 3).id,
      `escale de « ${s.id} » : tirage négatif mal ramené`
    );
    // La graine du décor doit rester dans ses bornes et ne jamais valoir zéro —
    // c'est elle qui sème la disposition des cailloux.
    for (const tirage of [0, 996, 997, 1994, 100002]) {
      const g = escalePourSecteur(s, tirage).landmark[0].seed;
      assert.ok(
        Number.isInteger(g) && g >= 1 && g <= 997,
        `escale de « ${s.id} » : graine de décor hors bornes (${g})`
      );
    }
  }
});

test('un secteur qui offre deux lieux en propose bien deux', () => {
  // Le tirage parcourt les offres du secteur. S'il retombait toujours sur la
  // première, la moitié des escales écrites ne se verrait jamais — et la
  // reproche d'origine, « c'est trop redondant l'espace », reviendrait intact.
  const varies = STAGES.filter((s) => {
    const vus = new Set();
    for (let t = 0; t < 8; t++) vus.add(escalePourSecteur(s, t).id);
    return vus.size > 1;
  });
  assert.ok(varies.length >= 4, `seuls ${varies.length} secteurs proposent plusieurs escales`);
  for (const s of varies) {
    const types = new Set();
    for (let t = 0; t < 8; t++) types.add(escalePourSecteur(s, t).escale);
    assert.ok(types.size > 1, `« ${s.id} » : plusieurs escales, mais toutes du même genre`);
  }
});

test('tout décor réclamé par un lieu est fabricable', () => {
  // scripts/verifie-decors.mjs fait la même vérification en lisant les fichiers
  // comme du TEXTE. Il ne peut donc voir que les noms écrits en toutes lettres —
  // et le décor d'une escale n'en est pas un : il est composé à l'exécution, à
  // partir du genre de lieu tiré. C'est l'angle mort qu'on couvre ici, en
  // interrogeant la vraie table des fabriques plutôt qu'une expression régulière.
  //
  // On ne peut pas construire le décor sous Node — les fabriques peignent leurs
  // textures dans un canvas —, mais `createLandmark` refuse un nom inconnu AVANT
  // d'appeler quoi que ce soit : c'est ce refus-là qu'on écoute.
  const fabricable = (spec, ou) => {
    try {
      createLandmark(spec);
    } catch (e) {
      assert.ok(
        !String(e.message).startsWith('Décor inconnu'),
        `${ou} : ${e.message} — ajoute la fabrique à FACTORIES dans space/landmarks.js`
      );
    }
  };
  for (const s of STAGES) {
    for (const d of s.landmark) fabricable(d, `secteur « ${s.id} »`);
    for (let t = 0; t < 4; t++) {
      const e = escalePourSecteur(s, t);
      for (const d of e.landmark) fabricable(d, `escale « ${e.id} »`);
    }
  }
});

// ─── LES ROUTES ──────────────────────────────────────────────────────────────

test('les deux routes ne proposent jamais la même chose', () => {
  // Le dilemme du jeu tient à cette asymétrie : s'équiper ou comprendre. Une
  // route longue qui paierait autant que la courte, ou une courte qui donnerait
  // un fragment, et il n'y a plus de choix — seulement deux boutons.
  for (let i = 0; i < 24; i++) {
    for (const graine of GRAINES) {
      const r = routesForStage(i, graine);
      assert.equal(r.courte.fragment, false, `palier ${i} : la route directe donne un fragment`);
      assert.equal(r.longue.fragment, true, `palier ${i} : le détour ne rapporte plus de fragment`);
      assert.equal(r.courte.risque, null, `palier ${i} : la route directe fait courir un risque`);
      assert.ok(r.longue.risque, `palier ${i} : le détour est devenu gratuit`);
      assert.ok(
        r.courte.credits > r.longue.credits,
        `palier ${i} : le détour paie autant que la route directe (${r.longue.credits} contre ${r.courte.credits})`
      );
      assert.ok(r.courte.nom && r.courte.desc, `palier ${i} : route directe sans description`);
      assert.ok(r.longue.nom && r.longue.desc, `palier ${i} : détour sans description`);
      assert.ok(
        r.destination && STAGES.includes(r.destination),
        `palier ${i} : destination inconnue`
      );
    }
  }
});

test('un risque de route durcit vraiment la vague suivante', () => {
  // On ne paie pas la connaissance en crédits, on la paie en difficulté. Un
  // modificateur passé sous 1 par inadvertance ferait du détour un choix
  // gratuit — plus de dilemme, et l'autre route ne se prendrait plus jamais.
  const base = difficulty(10, MODS_NEUTRES, 0);
  const vus = new Set();
  for (let i = 0; i < 24; i++) {
    // Graine fixe et palier qui avance : c'est exactement ce que voit une partie,
    // et c'est là que les trois risques doivent se relayer.
    const risque = routesForStage(i, 0).longue.risque;
    assert.ok(risque.id && risque.label, `palier ${i} : risque sans nom à afficher`);
    for (const [cle, val] of Object.entries(risque.mods)) {
      assert.ok(
        val > 1,
        `palier ${i} : le risque « ${risque.id} » adoucit la vague (${cle}=${val})`
      );
      vus.add(cle);
    }
    const durci = difficulty(10, { ...MODS_NEUTRES, ...risque.mods }, 0);
    assert.ok(
      durci.formationFireInterval <= base.formationFireInterval,
      `palier ${i} : la formation tire moins`
    );
    assert.ok(durci.diveInterval <= base.diveInterval, `palier ${i} : moins de piqués`);
    if (risque.mods.fire) {
      assert.ok(
        durci.formationFireInterval < base.formationFireInterval,
        `palier ${i} : « nourri » ne nourrit rien`
      );
    }
    if (risque.mods.dive) {
      assert.ok(durci.diveInterval < base.diveInterval, `palier ${i} : « piqués » ne change rien`);
    }
  }
  assert.deepEqual(
    [...vus].sort(),
    ['dive', 'fire', 'hp'],
    'les trois leviers de risque ne sont plus tous employés'
  );
});

test('deux joueurs de même graine ont eu le même choix au même moment', () => {
  // C'est ce qui rend la comparaison de deux parties honnête, donc le classement
  // défendable. Un Math.random ici ne casserait rien de visible.
  for (let i = 0; i < 24; i++) {
    for (const graine of GRAINES) {
      assert.deepEqual(
        routesForStage(i, graine),
        routesForStage(i, graine),
        `palier ${i}, graine ${graine}`
      );
    }
  }
  // Et la graine doit compter : sans ça, toutes les parties offriraient la même
  // suite de routes, et le classement comparerait deux fois la même chose.
  const differents = GRAINES.some(
    (g) => JSON.stringify(routesForStage(2, g)) !== JSON.stringify(routesForStage(2, 0))
  );
  assert.ok(differents, 'la graine n’influence plus le choix de route');
});

test('la destination annoncée est bien le secteur où l’on arrive', () => {
  // L'écran de choix promet un secteur ; la vague suivante en charge un autre.
  // Les deux calculs vivent dans deux fichiers différents et rien ne les relie :
  // ajouter un palier au voyage sans y penser suffit à les désaccorder.
  for (let i = 0; i < STAGES.length - 1; i++) {
    const vagues = vaguesDuSecteur(i);
    const arrivee = stageForWave(vagues[vagues.length - 1] + 1);
    assert.equal(
      routesForStage(i, 0).destination,
      arrivee,
      `palier ${i} : on annonce « ${routesForStage(i, 0).destination.name} », on arrive à « ${arrivee.name} »`
    );
  }
  // Au bout du voyage, on ne promet plus d'ailleurs : rebrousser chemin n'aurait
  // aucun sens, et la partie, elle, continue.
  const dernier = STAGES.length - 1;
  assert.equal(
    routesForStage(dernier, 0).destination,
    STAGES[dernier],
    'le voyage repart après sa fin'
  );
  assert.equal(
    routesForStage(dernier + 40, 0).destination,
    STAGES[dernier],
    'un palier au-delà du voyage sort de la table'
  );
});

test('les paliers de coque se méritent dans l’ordre, et s’annoncent juste', () => {
  // Trois fonctions lisent la même table par trois chemins différents, et l'écran
  // de choix affiche les trois côte à côte : le palier atteint, ce qu'il reste à
  // faire, et le palier visé. Qu'elles se contredisent et le joueur lit « Coque II
  // dans 0 fragment » sans jamais l'obtenir.
  assert.equal(PALIERS[0].fragments, 0, 'le premier palier doit être gratuit');
  for (let i = 1; i < PALIERS.length; i++) {
    assert.ok(
      PALIERS[i].fragments > PALIERS[i - 1].fragments,
      `le palier ${PALIERS[i].chiffre} ne coûte pas plus que le précédent`
    );
    assert.ok(PALIERS[i].chiffre && PALIERS[i].effet, `le palier ${i} ne dit pas ce qu'il apporte`);
  }
  for (const p of PALIERS) {
    assert.equal(
      palierDeCoque(p.fragments),
      PALIERS.indexOf(p),
      `le seuil de ${p.fragments} fragments n'ouvre pas le palier ${p.chiffre}`
    );
  }
  let precedent = 0;
  for (let f = 0; f <= 40; f++) {
    const p = palierDeCoque(f);
    assert.ok(p >= precedent && p < PALIERS.length, `${f} fragments : palier ${p} incohérent`);
    precedent = p;
    const reste = fragmentsAvantPalierSuivant(f);
    const vise = prochainPalier(f);
    if (vise) {
      assert.equal(
        reste,
        vise.fragments - f,
        `${f} fragments : « dans ${reste} » ne mène pas au palier ${vise.chiffre}`
      );
      assert.ok(reste > 0, `${f} fragments : on annonce un palier déjà atteint`);
    } else {
      assert.equal(
        reste,
        null,
        `${f} fragments : il reste des fragments à faire sans palier à atteindre`
      );
      assert.equal(
        p,
        PALIERS.length - 1,
        `${f} fragments : plus rien à viser sans être au maximum`
      );
    }
  }
  assert.equal(
    palierDeCoque(-1),
    0,
    'un compte de fragments aberrant doit retomber au premier palier'
  );
});

test('les vies du Registre restent dans ce que la coque peut porter', () => {
  // Les paliers donnent des vies EN PLUS de la Coque renforcée, et le jeu plafonne
  // le total à `PLAYER.maxLives + 2` — un 2 écrit en dur, qui vaut exactement la
  // somme des vies des paliers d'aujourd'hui. Ajouter un palier IV sans toucher à
  // ce plafond ferait disparaître la vie promise à l'écran, en silence, après sept
  // fragments et autant de détours.
  const donnees = PALIERS.reduce((s, p) => s + (p.vies || 0), 0);
  assert.equal(donnees, 2, `les paliers donnent ${donnees} vies, le plafond du jeu en prévoit 2`);
  assert.equal(PALIERS[0].vies, 0, 'la coque d’origine ne donne pas de vie');
  assert.ok(
    PLAYER.baseLives + donnees <= PLAYER.maxLives + 2,
    'un joueur qui ne va que chercher des fragments dépasse déjà le plafond de vies'
  );
});

// --- Deux vagues voisines ne sont jamais la même ------------------------------
//
// Cette épreuve défend une propriété qui a DÉJÀ cédé une fois, en production.
//
// Tant que la difficulté de l'arcade valait le numéro de vague, makeWave recevait
// un nombre différent à chaque fois et la graine pouvait rester fixe. La pente a
// étalé cette difficulté : l'arrondi donne désormais la même à des vagues
// voisines. La graine n'ayant pas suivi, les vagues 2 et 3 étaient le même
// combat, joué deux fois d'affilée — comme 6 et 7, 9 et 10, 13 et 14. Rien ne
// plantait. On rejouait, simplement.

test('la pente donne bien la même difficulté à des vagues voisines', () => {
  // On constate le fait qui rend l'épreuve suivante nécessaire : sans lui, la
  // graine fixe n'aurait jamais posé de problème.
  const doublons = [];
  for (let n = 2; n <= 16; n++) {
    if (paramsVague(n).diff === paramsVague(n - 1).diff) doublons.push(n);
  }
  assert.ok(
    doublons.length > 0,
    'la pente est censée étaler la difficulté, donc en répéter à l’arrondi'
  );
});

test('deux vagues d’arcade qui se suivent ne sont jamais identiques', () => {
  const signature = (n) => {
    const { diff, seed } = paramsVague(n, { seed: 1234 });
    const w = makeWave(diff, { seed });
    // CE QUI DISTINGUE DEUX VAGUES, ET CE QUI VIENT D'OÙ.
    //
    // La FORMATION — qui occupe quelle case de la grille — découle de la seule
    // difficulté : à difficulté égale, deux vagues alignent le même monde. C'est
    // voulu, la difficulté EST la composition.
    //
    // La CHORÉGRAPHIE — qui entre quand, et par quel côté — découle de la graine.
    // C'est elle qui fait que deux vagues de même difficulté ne se jouent pas
    // pareil, et c'est précisément elle qui ne variait plus. On la met donc dans
    // la signature, sans la courbe d'entrée, qui est un objet Three.js entier.
    return JSON.stringify(w.spawns.map((e) => [e.type, e.row, e.col, e.delay, e.side]));
  };
  for (let n = 1; n <= 30; n++) {
    assert.notEqual(
      signature(n),
      signature(n + 1),
      `la vague ${n + 1} rejoue exactement la vague ${n}`
    );
  }
});

test('la graine du jeu change toute la série de vagues', () => {
  // Deux parties lancées de suite ne doivent pas dérouler la même chose. La
  // grille sera la même — elle suit la difficulté — mais l'entrée des ennemis,
  // non.
  const serie = (seed) =>
    Array.from({ length: 8 }, (_, i) => {
      const p = paramsVague(i + 1, { seed });
      return JSON.stringify(
        makeWave(p.diff, { seed: p.seed }).spawns.map((e) => [
          e.type,
          e.row,
          e.col,
          e.delay,
          e.side,
        ])
      );
    }).join('|');
  assert.notEqual(serie(1), serie(2), 'deux parties tirent la même suite de vagues');
});

test('la survie garde la suite de vagues qu’elle avait', () => {
  // La correction ne devait toucher QUE l'arcade : la survie variait déjà sa
  // graine avec le numéro de vague, et changer sa suite invaliderait sans raison
  // les enregistrements et les classements du mode.
  for (let n = 1; n <= 20; n++) {
    assert.equal(paramsVague(n, { survie: true, seed: 77 }).seed, 77 + n * 977);
  }
});

// --- LES ANNONCES D'ENTRÉE, ET LES VAGUES DANS LE DOS -------------------------
//
// Deux demandes de Paul qui s'emboîtent : « une flèche préventive 2 secondes
// avant qui montre exactement où ils vont débouler », et des vagues qui
// surgissent DERRIÈRE le vaisseau « en fonction du niveau ». La seconde n'est
// honnête que grâce à la première : se faire traverser par ce qu'on ne peut pas
// voir n'est pas une difficulté, c'est une injustice.

test('les entrées de côté et de dos s’annoncent, celles du fond non', () => {
  const { diff, seed } = paramsVague(3, { seed: 11 });
  const w = makeWave(diff, { seed });
  const a = annoncesPourVague(w.spawns, { xMax: 14.5, zMax: 14 });
  // La composition varie avec la graine, mais la règle, jamais : chaque annonce
  // vient d'un départ hors cadre, posée SUR le bord franchi.
  for (const x of a) {
    assert.ok(Math.abs(x.x) <= 14.5 && x.z <= 14, 'une flèche est posée hors de l’arène');
    assert.ok(x.delay >= 0);
    assert.ok(Number.isFinite(x.angle));
  }
  // Et jamais une annonce par ennemi : une par escadron au plus.
  const rangees = new Set(w.spawns.filter((s) => s.type !== 'boss').map((s) => s.row));
  assert.ok(a.length <= rangees.size * 2, `${a.length} flèches pour ${rangees.size} rangées`);
});

test('une entrée par le fond n’a pas de flèche', () => {
  // Elle se voit venir de loin : c'est sa nature. L'annoncer diluerait les
  // annonces qui comptent.
  const spawns = [
    {
      type: 'drone',
      row: 0,
      delay: 1,
      curve: { getPoint: () => ({ x: 0, z: -34 }), getTangent: () => ({ x: 0, z: 1 }) },
    },
  ];
  assert.deepEqual(annoncesPourVague(spawns, { xMax: 14.5, zMax: 14 }), []);
});

test('une entrée dans le dos est annoncée au bord bas', () => {
  const spawns = [
    {
      type: 'wasp',
      row: 2,
      delay: 3,
      curve: { getPoint: () => ({ x: 4, z: 30 }), getTangent: () => ({ x: 0, z: -1 }) },
    },
  ];
  const [a] = annoncesPourVague(spawns, { xMax: 14.5, zMax: 14 });
  assert.ok(a, 'le dos doit s’annoncer');
  assert.ok(a.z > 12 && a.z <= 14, `flèche à z=${a.z}, attendue au ras du bord bas`);
  assert.equal(a.delay, 3);
});

test('le dos ne se débloque qu’avec la difficulté, et par le même tirage', () => {
  assert.ok(!variantsPour(ARRIERE_DEPUIS - 1).includes('back'), 'le dos arrive trop tôt');
  assert.ok(variantsPour(ARRIERE_DEPUIS).includes('back'), 'le dos ne se débloque jamais');
  // Déterminisme : à graine égale, mêmes entrées — dos compris. C'est la
  // condition pour que rejeu et duo restent exacts.
  const { diff, seed } = paramsVague(14, { seed: 42 });
  const sig = () =>
    JSON.stringify(
      makeWave(diff, { seed }).spawns.map((s) => [s.row, Math.round(s.curve.getPoint(0).z)])
    );
  assert.equal(sig(), sig());
});

test('la courbe du dos part bien derrière le joueur', () => {
  const c = makeWave(ARRIERE_DEPUIS + 3, { seed: 7 }).spawns.map((s) => s.curve.getPoint(0).z);
  // Au moins une composition sur quelques graines doit contenir une entrée
  // arrière une fois le seuil franchi — sinon le déblocage est un mensonge.
  let vue = false;
  for (let g = 1; g <= 12 && !vue; g++) {
    vue = makeWave(ARRIERE_DEPUIS + 3, { seed: g }).spawns.some((s) => s.curve.getPoint(0).z > 14);
  }
  assert.ok(vue, 'aucune entrée arrière sur douze graines après le seuil');
  void c;
});
