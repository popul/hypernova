// LE PAS VERROUILLÉ CÔTÉ CLIENT, À TROIS.
//
// Le serveur relaie des octets ; c'est le CLIENT qui tient la discipline du pas
// verrouillé — attendre la commande de chaque pair, les consommer dans l'ordre
// des numéros de joueur, survivre au départ de l'un des trois. Chacune de ces
// promesses, trahie, ne plante pas : elle produit deux simulations qui
// racontent deux parties différentes, sans une ligne de journal. On les épingle
// donc ici, sur la classe `Duo` du client, sans réseau : on lui donne les
// messages qu'un serveur enverrait, et on regarde ce qu'elle en fait.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Duo, DELAI, DELAI_MIN, DELAI_MAX, estPhotographe } from '../src/game/duo.js';

// Trois pilotes à table, et nous sommes le numéro `moi`. La fausse socket note
// ce que le client PUBLIE : c'est là qu'on vérifie la signature des commandes.
function duoEnPartie(moi = 1) {
  const duo = new Duo();
  const envoyes = [];
  duo.ws = { readyState: 1, send: (s) => envoyes.push(JSON.parse(s)) };
  duo._recois(
    JSON.stringify({
      t: 'go',
      graine: 7,
      mode: 'arcade',
      moi,
      joueurs: [
        { slot: 0, nom: 'HOTE', coque: 'orion' },
        { slot: 1, nom: 'LOUIS', coque: 'helios' },
        { slot: 2, nom: 'ZOE', coque: 'vulcain' },
      ],
    })
  );
  return { duo, envoyes };
}

// Un message serveur, tel qu'il arriverait sur la socket.
const arrive = (duo, m) => duo._recois(JSON.stringify(m));

test('à trois, l’image n’est prête qu’avec la commande de CHAQUE poste — la mienne comprise', () => {
  const { duo } = duoEnPartie(1);
  assert.deepEqual(
    duo.pairs.map((p) => p.numero),
    [0, 2],
    'les pairs sont les deux autres numéros, dans l’ordre'
  );
  assert.equal(duo.pret(), false, 'rien reçu : rien n’est prêt');
  arrive(duo, { t: 'c', j: 0, f: 0, d: [1] });
  // Un seul pair a parlé : attendre quand même, sinon le troisième joueur est
  // simulé avec une commande de retard — et sa machine, elle, ne l'aura pas fait.
  assert.equal(duo.pret(), false, 'il manque encore la commande du pair 2');
  arrive(duo, { t: 'c', j: 2, f: 0, d: [2] });
  // ET LA MIENNE. Elle passe par la même file que les leurs depuis qu'on a
  // mesuré le contraire : sans elle, l'image se jouerait chez moi avec une
  // commande que personne d'autre n'a encore appliquée.
  assert.equal(duo.pret(), false, 'ma propre commande ne compte pas dans l’attente');
  duo.amorce([0]);
  assert.equal(duo.pret(), true);
});

test('ma commande passe par la file comme celle des autres, pas par un raccourci', () => {
  // LE BUG QUI COÛTAIT TOUTES LES DÉSYNCHRONISATIONS. Ma commande partait pour
  // l'image `f + DELAI` chez les copains, mais ma simulation l'appliquait à
  // l'image `f` : mon vaisseau bougeait quatre images plus tôt chez moi que
  // chez eux. Mesuré au banc — appui à l'image 150, vu à l'image 154 en face.
  const { duo } = duoEnPartie(1);
  duo.amorce([0]); // les DELAI premières images, pour moi comme pour eux
  duo.frame = 0;
  duo.publie([9, 9]); // publiée à l'image 0, donc POUR l'image DELAI
  assert.deepEqual(
    duo.mienne(),
    [0],
    'à l’image 0 je dois jouer l’amorce, pas ce que je viens de lire'
  );
  duo.frame = DELAI;
  assert.deepEqual(duo.mienne(), [9, 9], 'ma commande ne me revient pas à l’image publiée');
});

test('les commandes se consomment dans l’ordre des numéros, pas dans l’ordre d’arrivée', () => {
  const { duo } = duoEnPartie(1);
  // Le réseau livre dans le désordre : le pair 2 d'abord. Si `consomme` rendait
  // l'ordre d'arrivée, chaque machine appliquerait les commandes dans SON ordre
  // de réception — et les simulations divergeraient en silence.
  arrive(duo, { t: 'c', j: 2, f: 0, d: [22] });
  arrive(duo, { t: 'c', j: 0, f: 0, d: [11] });
  assert.deepEqual(duo.consomme(), [[11], [22]], 'numéro 0 d’abord, numéro 2 ensuite');
});

test('chaque commande publiée est signée du numéro de son émetteur', () => {
  // Le relais du salon passe les octets tels quels, sans dire de qui ils
  // viennent : sans signature, un client à trois rangerait les commandes de ses
  // deux pairs dans la même besace.
  const { duo, envoyes } = duoEnPartie(1);
  duo.frame = 5;
  duo.publie([1, 2, 3]);
  const c = envoyes.at(-1);
  assert.equal(c.t, 'c');
  assert.equal(c.j, 1, 'la commande doit porter le numéro de son émetteur');
  assert.equal(c.f, 5 + DELAI, 'publiée avec l’avance du pas verrouillé');

  // L'amorçage aussi : les DELAI premières images partent signées, sinon les
  // pairs ne sauraient pas à qui les attribuer et attendraient pour toujours.
  envoyes.length = 0;
  duo.amorce([0]);
  assert.equal(envoyes.length, DELAI);
  for (const m of envoyes) assert.equal(m.j, 1);
});

test('un pair parti se consomme jusqu’au bout, puis rend null — à la même image partout', () => {
  const { duo } = duoEnPartie(1);
  // Le pair 0 a publié l'image 0, puis a fermé son onglet. Ses commandes déjà
  // relayées sont les mêmes chez tous les survivants : les consommer jusqu'au
  // bout donne à tous le MÊME instant de retrait. Les jeter à réception du
  // « parti » couperait à des images différentes selon la latence de chacun.
  duo.amorce([0]); // ma file part de l'amorce, comme celle de tout le monde
  arrive(duo, { t: 'c', j: 0, f: 0, d: [10] });
  arrive(duo, { t: 'parti', cause: 'deconnexion', slot: 0, hote: false });
  assert.equal(duo.etat, 'partie', 'le départ d’un pair ne coupe pas la partie');

  arrive(duo, { t: 'c', j: 2, f: 0, d: [20] });
  assert.equal(duo.pret(), true);
  duo.mienne(); // je consomme la mienne comme le fait la boucle de jeu
  assert.deepEqual(duo.consomme(), [[10], [20]], 'ce qu’il a laissé se joue encore');
  duo.frame++;

  // Image 1 : sa réserve est vide. On ne l'attend plus, et son emplacement rend
  // null — le signal, identique chez tous, que son bord se retire ici.
  arrive(duo, { t: 'c', j: 2, f: 1, d: [21] });
  assert.equal(duo.pret(), true, 'un pair parti ne bloque plus le pas');
  duo.mienne();
  assert.deepEqual(duo.consomme(), [null, [21]]);

  // Le jeu retire alors son bord : le pair sort pour de bon.
  duo.retire(0);
  assert.deepEqual(
    duo.pairs.map((p) => p.numero),
    [2]
  );
});

test('la promotion d’hôte en pleine partie ne dégrade pas l’état', () => {
  // Quand l'hôte part à trois, le serveur promeut un invité par un nouveau
  // message `salon`. Retomber à l'état « salon » couperait le pas verrouillé en
  // plein vol : plus d'attente des pairs, simulation en temps réel, divergence
  // immédiate chez les deux survivants.
  const { duo } = duoEnPartie(2);
  arrive(duo, { t: 'salon', id: 'abc', role: 'hote', mode: 'arcade' });
  assert.equal(duo.etat, 'partie', 'en partie on reste en partie');
  assert.equal(duo.role, 'hote', 'le rôle, lui, est bien pris');
});

test('l’équipage du salon porte la tablée entière et mon numéro', () => {
  const duo = new Duo();
  arrive(duo, { t: 'salon', id: 'abc', role: 'invite', mode: 'arcade' });
  arrive(duo, {
    t: 'equipage',
    moi: 2,
    joueurs: [
      { slot: 0, nom: 'HOTE', coque: 'orion' },
      { slot: 1, nom: 'LOUIS', coque: 'helios' },
      { slot: 2, nom: 'LOUIS', coque: 'vulcain' },
    ],
  });
  // Deux invités peuvent porter le même pseudo : c'est le NUMÉRO qui dit qui
  // je suis, pas mon nom.
  assert.equal(duo.moi, 2);
  assert.equal(duo.joueurs.length, 3);
});

test('un enregistrement d’avant le jeu à trois est refusé, pas rejoué de travers', async () => {
  // L'instantané porte désormais une LISTE de bords et les vaisseaux se
  // simulent dans l'ordre des numéros : un enregistrement à deux bords rejoué
  // dans ce monde-là raconterait une autre partie que celle qu'il prétend.
  const { VERSION } = await import('../src/game/rejeu/format.js');
  assert.ok(VERSION >= 17, `le format est resté en ${VERSION} malgré le changement de règle`);
});

// --- QUI PHOTOGRAPHIE LA TABLE ------------------------------------------------
//
// Le pas verrouillé n'est pas un déterminisme parfait : ma commande s'applique
// chez moi tout de suite, chez les autres quatre images plus tard. Les
// simulations sont donc VOISINES, jamais identiques, et c'est la photo de
// frontière de vague qui les recolle — le mécanisme du spectateur, appliqué aux
// joueurs. Reste à savoir QUI la prend : un seul, le même pour tous, et il faut
// que ça survive à sa propre fin de partie. La règle est « le plus petit numéro
// encore en course », déduite chez chacun des mêmes messages de table.

test('le photographe est le plus petit numéro encore en course', () => {
  const tous = [{ numero: 0 }, { numero: 1 }, { numero: 2 }];
  const autres = (moi) => tous.filter((b) => b.numero !== moi).map((b) => ({ ...b, fini: false }));
  assert.equal(estPhotographe(0, autres(0), new Set()), true, 'le numéro 0 ne photographie pas');
  assert.equal(estPhotographe(1, autres(1), new Set()), false, 'le 1 photographie devant le 0');
  assert.equal(
    estPhotographe(2, autres(2), new Set()),
    false,
    'le 2 photographie devant les autres'
  );
});

test('la fin de partie du photographe passe l’appareil au suivant, pas à personne', () => {
  // L'hôte a fini SA partie : la règle du dernier en vol fait continuer les deux
  // autres, et la référence des photos doit leur rester — sinon chacun finit
  // dans son monde, ce qui est exactement le bug qu'on répare.
  const vuDuUn = [
    { numero: 0, fini: true },
    { numero: 2, fini: false },
  ];
  assert.equal(estPhotographe(1, vuDuUn, new Set()), true, 'personne ne reprend l’appareil');
  // Et le troisième ne se croit pas photographe pour autant : le 1 est là.
  const vuDuDeux = [
    { numero: 0, fini: true },
    { numero: 1, fini: false },
  ];
  assert.equal(estPhotographe(2, vuDuDeux, new Set()), false, 'deux photographes en même temps');
});

test('un joueur parti ne garde pas l’appareil, et le dernier seul ne photographie plus', () => {
  const vuDuDeux = [
    { numero: 0, fini: true },
    { numero: 1, fini: false },
  ];
  // Le 1 ferme son onglet : le serveur l'annonce parti, le 2 devient référence.
  assert.equal(estPhotographe(2, vuDuDeux, new Set([1])), true, 'un parti bloque l’appareil');
  // Plus personne en face : plus de table à recaler, donc plus de photo.
  assert.equal(estPhotographe(0, [], new Set()), false, 'on photographie une table vide');
});

// --- LES APPELS AU DUO EXISTENT-ILS VRAIMENT ? -------------------------------
//
// Une faute de frappe sur un nom de méthode ne se voit pas en JavaScript : elle
// attend la ligne d'exécution. Celle-ci était `this.duo.fin(...)` au lieu de
// `annonceFin`, dans l'écran de fin de partie d'une partie en réseau — donc sur
// un chemin qu'aucune épreuve ne traversait. Résultat en vrai : le joueur qui
// tombait levait une exception, cessait de publier ses commandes, et FIGEAIT
// toute la table jusqu'au rechargement de la page. Un caractère, une partie
// perdue pour trois enfants.
//
// On ne peut pas importer game.js sous Node — il touche `window` — mais on peut
// lire son texte et vérifier que chaque `duo.machin(` correspond à une méthode
// qui existe. C'est grossier, et ça aurait suffi.
test('tout appel de méthode sur le duo correspond à une méthode qui existe', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/game/game.js', import.meta.url), 'utf8');
  const appeles = new Set();
  for (const m of source.matchAll(/\bduo(?:\?\.|\.)([a-zA-Zé_$][\w$]*)\s*\(/g)) appeles.add(m[1]);
  assert.ok(appeles.size > 5, `on n’a trouvé que ${appeles.size} appels : la lecture a raté`);

  const connues = new Set(Object.getOwnPropertyNames(Duo.prototype));
  const manquantes = [...appeles].filter((n) => !connues.has(n));
  assert.deepEqual(
    manquantes,
    [],
    `game.js appelle des méthodes qui n’existent pas sur Duo : ${manquantes.join(', ')}`
  );
});

// --- LES POUVOIRS APPARTIENNENT À UN POSTE, PAS AU JOUEUR LOCAL ---------------
//
// La bombe, l'Appel, la pirouette et l'Overdrive touchent l'ARÈNE, qui est
// commune : des ennemis meurent, des balles disparaissent, des gemmes rentrent,
// un vaisseau se déplace. Tant qu'ils n'étaient exécutés que pour `this`, la
// bombe d'un copain ne détruisait rien chez moi — les deux machines cessaient
// de raconter la même partie au premier bouton pressé.
//
// On ne peut pas importer game.js sous Node ; on lit donc son texte et l'on
// vérifie les deux promesses structurelles : chaque pouvoir reçoit le bord qui
// l'exerce, et l'exécution des événements parcourt les postes DANS L'ORDRE DES
// NUMÉROS — le même invariant que les commandes.
test('les pouvoirs prennent le bord qui les exerce, jamais le joueur local seul', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/game/game.js', import.meta.url), 'utf8');

  for (const pouvoir of ['_tryBomb', '_tryCall', '_tryOverdrive']) {
    const decl = new RegExp(`\\n  ${pouvoir}\\((bord = this|dir, bord = this)\\)`);
    assert.match(source, decl, `${pouvoir} doit recevoir le bord qui l’exerce`);
  }
  assert.match(source, /\n {2}_tryRoll\(dir, bord = this\)/, '_tryRoll doit recevoir son bord');

  // Le répartiteur transmet le bord à chacun.
  const bloc = source.slice(source.indexOf('_executeEvenement(ev, bord = this)'));
  const corps = bloc.slice(0, bloc.indexOf('\n  }'));
  for (const appel of [
    '_tryRoll(-1, bord)',
    '_tryRoll(1, bord)',
    '_tryBomb(bord)',
    '_tryOverdrive(bord)',
    '_tryCall(bord)',
  ]) {
    assert.ok(corps.includes(appel), `_executeEvenement doit appeler ${appel}`);
  }

  // Et la boucle qui l'appelle passe par _postesOrdonnes : l'ordre des numéros
  // est ce qui fait que deux pouvoirs simultanés s'appliquent pareil partout.
  assert.match(
    source,
    /for \(const p of this\._postesOrdonnes\(\)\) \{\s*\n\s*if \(p\.bord\.cmd\?\.ev\) this\._executeEvenement\(p\.bord\.cmd\.ev, p\.bord\);/,
    'les événements doivent être exécutés poste par poste, dans l’ordre des numéros'
  );

  // Les ondes sont des LISTES : à plusieurs, deux bombes coexistent.
  assert.ok(source.includes('this.bombFronts.push('), 'les fronts de bombe doivent s’empiler');
  assert.ok(source.includes('this.callWaves.push('), 'les ondes d’Appel doivent s’empiler');
  assert.ok(!/this\.bombFront\b(?!s)/.test(source), 'il reste un front de bombe unique');
  assert.ok(!/this\.callWave\b(?!s)/.test(source), 'il reste une onde d’Appel unique');
});

// --- LE BUDGET RÉSEAU S'ADAPTE, SANS SE CONCERTER ----------------------------
//
// Le délai d'entrée est le nombre d'images dont je postdate ma commande : le
// budget que je laisse au réseau pour la livrer avant que les autres n'en aient
// besoin. Quatre images (66 ms) suffisent sur un même wifi et pas du tout en 4G,
// où chaque image se paie d'une attente de toute la table.
//
// La propriété qui rend l'adaptation possible : le délai est PROPRE À CHAQUE
// JOUEUR. Ma commande porte l'image pour laquelle elle vaut ; que je la poste
// avec quatre ou dix images d'avance, tout le monde l'applique à l'image
// inscrite dessus. Deux pilotes vivent donc avec deux budgets différents sans
// rien faire diverger — et c'est ce qu'on épingle ici.
test('monter le délai ne laisse aucune image sans commande', () => {
  const { duo, envoyes } = duoEnPartie(1);
  duo.amorce([0]);
  duo.frame = 10;
  envoyes.length = 0;
  duo.changeDelai(6, [0]); // 6 + marge → 8

  // Les images entre l'ancien budget et le nouveau n'avaient encore été
  // publiées par personne : sans ce remplissage, la table s'arrête dessus.
  const pour = envoyes
    .filter((m) => m.t === 'c')
    .map((m) => m.f)
    .sort((a, b) => a - b);
  const attendu = [];
  for (let f = 10 + DELAI; f < 10 + duo.delai; f++) attendu.push(f);
  assert.deepEqual(pour, attendu, 'le trou entre l’ancien et le nouveau délai n’est pas comblé');
  for (const f of attendu) {
    assert.ok(duo.recues.get(1)?.has(f), `l’image ${f} manque dans ma propre file`);
  }
});

test('le délai reste entre ses bornes, quelle que soit la mesure', () => {
  const { duo } = duoEnPartie(1);
  duo.amorce([0]);
  assert.equal(duo.changeDelai(999, [0]), DELAI_MAX, 'un réseau catastrophique doit plafonner');
  assert.equal(duo.changeDelai(-50, [0]), DELAI_MIN, 'un réseau parfait garde un minimum');
  assert.ok(
    DELAI_MIN < DELAI && DELAI < DELAI_MAX,
    'le délai de départ doit être entre les bornes'
  );
});

test('la commande porte l’image pour laquelle elle vaut, pas le délai de son auteur', () => {
  // C'est CE fait qui autorise deux budgets différents à la même table : le
  // destinataire n'a pas besoin de connaître mon délai, il lit l'estampille.
  const { duo, envoyes } = duoEnPartie(1);
  duo.amorce([0]);
  duo.frame = 20;
  duo.changeDelai(8, [0]); // délai porté à 10
  envoyes.length = 0;
  duo.publie([7]);
  const c = envoyes.filter((m) => m.t === 'c').at(-1);
  assert.equal(c.f, 20 + duo.delai, 'l’estampille doit suivre le délai en vigueur');
  // Et je joue la mienne à l'image estampillée, pas à celle où je l'ai lue.
  duo.frame = 20 + duo.delai;
  assert.deepEqual(duo.mienne(), [7], 'ma commande ne me revient pas à l’image estampillée');
});

test('la montée est immédiate, la descente attend une frontière de vague', () => {
  const { duo } = duoEnPartie(1);
  duo.amorce([0]);
  let horloge = 100000;
  duo._maintenant = () => horloge;

  // Le réseau se dégrade : on monte tout de suite, une image d'attente coûte à
  // toute la table.
  duo.pireRetard = 9;
  const monte = duo.ajusteDelai([0], false);
  assert.ok(monte > DELAI, `le délai devrait monter, il vaut ${monte}`);

  // Mais pas deux fois dans la même seconde : un hoquet isolé ne doit pas
  // grimper marche après marche jusqu'au plafond.
  duo.pireRetard = 20;
  assert.equal(duo.ajusteDelai([0], false), monte, 'deux montées dans la même seconde');

  // Le réseau va mieux : hors frontière, on ne descend pas.
  horloge += 5000;
  duo.pireRetard = 0;
  assert.equal(duo.ajusteDelai([0], false), monte, 'on est descendu en pleine vague');

  // À la frontière, on descend — d'un cran, pas d'un coup.
  const apres = duo.ajusteDelai([0], true);
  assert.ok(apres < monte, 'la frontière devrait permettre de descendre');
  assert.ok(apres >= DELAI_MIN, 'la descente doit rester au-dessus du plancher');
  assert.equal(duo.pireRetard, 0, 'la mesure doit s’oublier à chaque vague');
});

// --- UNE BALLE APPARTIENT À QUELQU'UN ----------------------------------------
//
// Sans propriétaire, chaque machine calculait les dégâts avec SA propre furie et
// SES propres niveaux, quel que soit l'auteur du tir : les ennemis n'avaient pas
// les mêmes points de vie d'un écran à l'autre — donc un ennemi qui meurt ici et
// survit là. Et la récompense du kill allait au joueur local, si bien qu'un
// copain n'avait jamais d'énergie chez moi et que ses pouvoirs y étaient refusés
// alors qu'ils partaient chez lui. Mesuré au banc : jauge 580 chez lui, 0 chez
// moi, à l'image 117.
test('une balle et un missile portent le numéro de leur tireur', async () => {
  const THREE = await import('three');
  const { PlayerBullets, Missiles } = await import('../src/game/bullets.js');
  const scene = new THREE.Scene();
  const pos = new THREE.Vector3(0, 0, 0);
  const vel = new THREE.Vector3(0, 0, -1);

  const balles = new PlayerBullets(scene);
  assert.equal(balles.spawn(pos, vel, 2)?.proprio, 2, 'la balle doit porter son tireur');
  assert.equal(balles.spawn(pos, vel)?.proprio, 0, 'sans précision, c’est le numéro zéro (solo)');

  const missiles = new Missiles(scene);
  assert.equal(missiles.launch(pos, null, 1)?.proprio, 1, 'le missile doit porter son tireur');

  // Et la trace de frôlement est PAR PILOTE : une seule pour toute la table
  // faisait qu'un frôlement en effaçait un autre, donc des jauges différentes.
  const b = balles.spawn(pos, vel, 0);
  assert.ok(Array.isArray(b.minDistSq), 'la distance minimale doit être tenue par pilote');
  assert.equal(b.grazePar, 0, 'aucun pilote n’a encore frôlé cette balle');
});

test('les dégâts et la récompense se lisent sur le TIREUR, pas sur moi', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/game/game.js', import.meta.url), 'utf8');
  const debut = source.indexOf('const perforation =');
  assert.ok(debut > 0, 'la perforation ne se calcule plus par tireur');
  const bloc = source.slice(debut, debut + 4000);

  assert.match(
    bloc,
    /const tireur = this\._bordDuNumero\(b\.proprio/,
    'la balle doit désigner son tireur'
  );
  assert.match(
    bloc,
    /tireur\.odTimer > 0 \? FUREUR\.degats\[tireur\.levels/,
    'la fureur doit être celle du tireur'
  );
  assert.ok(
    !/this\.odTimer > 0 \? FUREUR\.degats\[this\.levels/.test(bloc),
    'la fureur locale décide encore des dégâts'
  );
  assert.match(
    bloc,
    /_onEnemyKilled\(e, critique \? 'precision' : 'cannon', tireur\.numero\)/,
    'le kill doit revenir au tireur'
  );

  // Et la récompense se pose sur le bord du tueur, pas sur `this`.
  const recompense = source.slice(
    source.indexOf("_onEnemyKilled(e, source = 'cannon', numero = null)")
  );
  const corps = recompense.slice(0, recompense.indexOf('\n  _dropCredits('));
  assert.match(corps, /bord\.combo\.chain\+\+/, 'la chaîne doit être celle du tueur');
  assert.match(corps, /bord\.score \+=/, 'le score doit être celui du tueur');
  assert.ok(!/\n\s*this\.combo\.chain\+\+/.test(corps), 'la chaîne locale est encore créditée');
});

// --- L'ARÈNE EST COMMUNE, LES PILOTES SONT DISTINCTS -------------------------
//
// Un audit du code a trouvé quatorze endroits où de l'état PARTAGÉ — les
// ennemis, les balles, les gemmes, la position des vaisseaux — était modifié à
// partir de l'état du seul joueur LOCAL. Chacun sépare les deux parties en
// quelques secondes de jeu. On épingle ici les règles, pas les lignes : elles
// doivent survivre au prochain qui touchera ces fichiers.
test('rien de partagé ne se décide sur le seul joueur local', async () => {
  const { readFile } = await import('node:fs/promises');
  const lis = (f) => readFile(new URL(`../src/game/${f}`, import.meta.url), 'utf8');
  const jeu = await lis('game.js');
  const pilote = await lis('player.js');
  const arene = await lis('arena.js');
  const ennemis = await lis('enemies.js');

  // La furie de CHACUN s'éteint : un copain restait en Overdrive pour toujours
  // chez moi, tirant une fois et demie plus vite jusqu'à la fin de la partie.
  assert.match(jeu, /p\.bord\.odTimer -= dt/, 'l’Overdrive des autres ne s’éteint pas');
  // Le ralenti des tirs ennemis est un fait de l'arène, pas de mon écran.
  assert.match(
    jeu,
    /const odActive = this\._postesOrdonnes\(\)\.some\(\(p\) => p\.bord\.odTimer > 0\)/,
    'le ralenti des balles suit encore ma seule furie'
  );
  // Le Colosse écrase tout le monde.
  assert.ok(
    !/this\.player\.alive &&\s*!this\.player\.rolling/.test(jeu),
    'le Colosse n’écrase encore que le vaisseau local'
  );
  // La grosse pièce se tire sur le combo du TUEUR : ce tirage consomme le
  // générateur semé, et un tirage de plus d'un côté décale tout le hasard commun.
  assert.match(jeu, /_dropCredits\(e, bord = this\)/, 'la grosse pièce suit encore mon combo');
  assert.match(jeu, /const mult = bord\.combo\.mult;/, 'la grosse pièce suit encore mon combo');

  // L'échelle de temps et la couture appartiennent au pilote, pas au jeu.
  assert.match(
    pilote,
    /bord\.cmd\?\.echelle/,
    'le ralenti local déplace encore tous les vaisseaux'
  );
  // Et `game.timeScale` ne décide plus du déplacement de personne : il ne
  // subsiste que comme repli pour le poste local, à côté de l'échelle du bord.
  assert.ok(
    !/game\.timeScale \? dt \//.test(pilote),
    'le déplacement se calcule encore sur le ralenti du joueur local'
  );
  assert.match(pilote, /boucleActive\(bord\)/, 'la couture lue sur le jeu, pas sur le pilote');
  assert.match(arene, /export function boucleActive\(porteur\)/, 'boucleActive lit encore le jeu');

  // Aucun tirage aléatoire DANS un comparateur de tri : le nombre d'appels
  // dépendrait de l'algorithme de tri du navigateur, donc du navigateur.
  const lignes = ennemis.split('\n');
  for (let i = 0; i < lignes.length; i++) {
    if (!lignes[i].includes('.sort(')) continue;
    // La fenêtre couvre le comparateur, qu'il tienne sur une ligne ou sur cinq.
    const fenetre = lignes.slice(i, i + 5).join('\n');
    const depuis = fenetre.slice(fenetre.indexOf('.sort('));
    const fin = depuis.indexOf('});') >= 0 ? depuis.indexOf('});') + 3 : depuis.indexOf(';') + 1;
    assert.ok(
      !/\b(alea|ecart)\s*\(/.test(depuis.slice(0, fin)),
      `un comparateur de tri consomme le hasard, ligne ${i + 1} : ${lignes[i].trim()}`
    );
  }
});

test('les améliorations d’un pilote voyagent avec sa commande', async () => {
  const { readFile } = await import('node:fs/promises');
  const jeu = await readFile(new URL('../src/game/game.js', import.meta.url), 'utf8');

  // Les postes distants restaient aux valeurs de départ : un copain qui achetait
  // des Propulseurs volait plus vite chez lui que chez moi, et son bouclier
  // n'existait pas ici — il encaissait là-bas ce qui lui coûtait une vie ici.
  assert.match(
    jeu,
    /d\.publie\(commandeVersTableau\(this\.cmd\), this\._bordSale/,
    'les achats ne voyagent pas'
  );
  assert.match(jeu, /_poseBordage\(numero, b\)/, 'rien ne pose les améliorations reçues');
  assert.match(
    jeu,
    /bord\.stats = computeStats\(bord\.levels, bord\.surcharge\)/,
    'les stats d’un bord se calculent sur autre chose que lui'
  );

  // Et la trajectoire est une décision commune : sinon l'un affronte un boss
  // pendant que l'autre traverse un champ de débris.
  assert.match(jeu, /_jeChoisisLaRoute\(\)/, 'la trajectoire reste un choix personnel');
  assert.match(jeu, /this\.duo\.route\(\{/, 'la trajectoire choisie ne part pas aux autres');
});

test('une estampille de commande ne recule jamais, même quand le délai baisse', () => {
  // EN BAISSANT LE DÉLAI, on se met à publier pour une image plus proche — donc
  // possiblement pour une image que les autres ont DÉJÀ jouée avec la valeur
  // d'avant. Leur simulation est faite, ma vraie commande arrive dans le vide,
  // et mon vaisseau bouge chez moi une image avant chez eux. Mesuré au banc :
  // divergence à l'image 3, après une descente de quatre à trois au premier
  // tableau. Une baisse doit se traduire par un rattrapage, jamais par un saut
  // en arrière.
  const { duo, envoyes } = duoEnPartie(1);
  duo.amorce([0]);
  envoyes.length = 0;
  duo.delai = DELAI_MIN; // le réseau va mieux : on veut publier plus près
  const vues = [];
  for (let f = 0; f < 8; f++) {
    duo.frame = f;
    duo.publie([f]);
    vues.push(envoyes.filter((m) => m.t === 'c').at(-1).f);
  }
  for (let i = 1; i < vues.length; i++) {
    assert.ok(vues[i] > vues[i - 1], `l’estampille recule : ${vues[i - 1]} puis ${vues[i]}`);
  }
  // Et aucune ne retombe sur une image déjà couverte par l'amorce.
  assert.ok(vues[0] >= DELAI, `la première publication écrase l’amorce (image ${vues[0]})`);
});

// --- QUAND UNE COMMANDE SE PERD ----------------------------------------------
//
// Sur une socket ouverte, rien ne se perd : c'est du TCP. Mais une socket ne
// reste pas ouverte — elle meurt quand le téléphone change de réseau, quand
// l'écran se verrouille, quand un intermédiaire coupe une connexion inactive, ou
// quand le serveur redémarre pour une mise à jour. Tout ce qu'on émet pendant ce
// temps-là part dans le vide, sans un mot : `_envoie` ne fait rien quand la
// socket n'est pas prête, et le relais du serveur saute un destinataire fermé.
//
// Le pas verrouillé s'arrête alors sur l'image manquante — c'est sa vertu, il
// préfère attendre à diverger — mais rien ne la faisait jamais revenir. Mesuré
// au banc AVANT correction : deux commandes perdues, et les deux machines se
// figent définitivement aux images 14 et 10.
test('une commande perdue se réclame et revient', () => {
  const { duo, envoyes } = duoEnPartie(1);
  duo.amorce([0]);
  for (let f = 0; f < 6; f++) {
    duo.frame = f;
    duo.publie([f]);
  }
  // Un pair réclame ma commande de l'image DELAI + 2 : je renvoie celle-là ET
  // toutes les suivantes — à qui il manque une commande, il en manque une suite,
  // et un aller-retour par image coûterait plus cher que le tout.
  envoyes.length = 0;
  const reclamee = DELAI + 2;
  duo._recois(JSON.stringify({ t: 'redemande', j: 0, de: 1, f: reclamee }));
  const renvoyees = envoyes.filter((m) => m.t === 'c').map((m) => m.f);
  assert.ok(renvoyees.length > 1, 'la réponse doit renvoyer la rafale, pas une seule image');
  assert.ok(Math.min(...renvoyees) >= reclamee, 'on renvoie depuis l’image réclamée');
  assert.ok(renvoyees.includes(reclamee), `l’image ${reclamee} n’est pas renvoyée`);

  // Une réclamation qui vise quelqu'un d'autre ne me concerne pas.
  envoyes.length = 0;
  duo._recois(JSON.stringify({ t: 'redemande', j: 0, de: 2, f: reclamee }));
  assert.deepEqual(envoyes, [], 'j’ai répondu à une réclamation qui ne m’était pas adressée');
});

test('les muets sont ceux dont la commande manque, et eux seuls', () => {
  const { duo } = duoEnPartie(1);
  duo.amorce([0]);
  duo.frame = 0;
  // Personne n'a parlé pour cette image : les deux pairs sont muets.
  assert.deepEqual(
    duo.muets().map((p) => p.numero),
    [0, 2],
    'les deux pairs devraient manquer'
  );
  duo._recois(JSON.stringify({ t: 'c', j: 0, f: 0, d: [1] }));
  assert.deepEqual(
    duo.muets().map((p) => p.numero),
    [2],
    'un pair qui a parlé ne doit plus compter comme muet'
  );
  // Un pair déjà déclaré parti n'est pas « muet » : on ne le réclame plus.
  duo.marquePart(2);
  assert.deepEqual(duo.muets(), [], 'on réclame encore à quelqu’un qui est parti');
});

test('l’histoire de mes commandes ne grandit pas sans fin', () => {
  const { duo } = duoEnPartie(1);
  duo.amorce([0]);
  for (let f = 0; f < 900; f++) {
    duo.frame = f;
    duo.publie([f]);
  }
  assert.ok(duo.histoire.size <= 600, `l’histoire garde ${duo.histoire.size} images`);
  // Et elle garde les RÉCENTES : c'est celles-là qu'on réclame.
  assert.ok(duo.histoire.has(duo._dernierPour), 'la dernière commande publiée a été oubliée');
});
