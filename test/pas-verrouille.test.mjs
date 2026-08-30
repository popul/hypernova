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
import { Duo, DELAI, estPhotographe } from '../src/game/duo.js';

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
  assert.deepEqual(duo.mienne(), [0], 'à l’image 0 je dois jouer l’amorce, pas ce que je viens de lire');
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
