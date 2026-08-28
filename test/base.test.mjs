// LE PANTHÉON SUR DISQUE.
//
// C'est le seul endroit du jeu où une erreur ne se rattrape pas : une partie
// ratée se rejoue, un score effacé par erreur ne revient jamais. Et rien ici ne
// se voit à l'œil nu — l'élagage tourne en silence à chaque publication, la
// cascade des clés étrangères efface des lignes qu'on n'a pas nommées, et une
// colonne ajoutée au schéma peut partir dans une réponse publique sans que
// personne le remarque.
//
// Ces épreuves gardent donc les promesses que le fichier se fait à lui-même :
// un code qui protège vraiment un pseudo, plusieurs appareils qui cohabitent,
// un marathon de survie qui ne chasse pas les enregistrements d'arcade, quatre
// tableaux qui ne se mélangent pas, et une administration qui dit exactement
// combien de lignes elle a emportées.
//
// Chaque épreuve part d'une base NEUVE dans un répertoire temporaire. C'est la
// règle la plus importante du fichier : une base partagée donne une suite qui
// passe jusqu'au jour où on lance les épreuves dans un autre ordre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Base, modePropre } from '../server/base.js';

// Une base neuve, dans son propre répertoire, effacée à la fin de l'épreuve.
// Le chemin comporte un sous-répertoire qui n'existe pas : c'est le cas réel du
// premier démarrage sur un volume vide, où le constructeur doit créer l'arbre.
function neuve(t) {
  const dossier = mkdtempSync(join(tmpdir(), 'hypernova-'));
  const base = new Base(join(dossier, 'donnees', 'hypernova.db'));
  t.after(() => {
    base.db.close();
    rmSync(dossier, { recursive: true, force: true });
  });
  return base;
}

// Combien de parties et combien d'enregistrements pour un pilote dans un mode.
// L'élagage se juge sur ces deux chiffres, jamais sur un seul : il RELÂCHE des
// enregistrements bien avant de supprimer des parties.
function compte(base, pilote, mode) {
  const r = base.db
    .prepare(
      `SELECT COUNT(*) AS parties, COALESCE(SUM(flux IS NOT NULL), 0) AS replays
       FROM parties WHERE pilote = ? AND mode = ?`
    )
    .get(pilote, mode);
  return { parties: Number(r.parties), replays: Number(r.replays) };
}

// --- Le pseudo et son code ---------------------------------------------------

test('un pseudo libre appartient à qui le réclame, et le jeton rendu ouvre', (t) => {
  const base = neuve(t);
  const r = base.reclame('ZOÉ', '1234', { livree: 'or', carene: 'fine' }, 'zoe@exemple.fr');
  assert.equal(r.ok, true);
  assert.equal(r.nouveau, true, 'un pseudo libre doit créer un pilote, pas en reconnaître un');
  assert.equal(base.parJeton(r.jeton)?.nom, 'ZOÉ', 'le jeton rendu doit désigner son pilote');
  // Un jeton inventé ne doit rien ouvrir, et l'absence de jeton non plus : ces
  // deux chemins sont ceux qu'emprunte une requête anonyme.
  assert.equal(base.parJeton('jeton-inventé'), null);
  assert.equal(base.parJeton(null), null);
});

test('le mauvais code ne rend ni jeton ni session, et ne déconnecte personne', (t) => {
  const base = neuve(t);
  const legitime = base.reclame('ZOÉ', '1234', {}, 'zoe@exemple.fr').jeton;
  const vuAvant = base.pilote('ZOÉ').vu_le;

  const rate = base.reclame('ZOÉ', '9999');
  assert.deepEqual(rate, { ok: false, erreur: 'code' }, 'un code faux ne doit rien concéder');
  // Le point qui compte vraiment : un inconnu qui tape à côté ne doit pas ouvrir
  // de session ni chasser l'appareil de l'enfant qui, lui, connaît son code.
  assert.equal(base.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
  assert.equal(base.parJeton(legitime)?.nom, 'ZOÉ', 'un essai raté a déconnecté le vrai pilote');
  assert.equal(
    base.pilote('ZOÉ').vu_le,
    vuAvant,
    'un essai raté ne doit pas dire « vu à l’instant »'
  );
});

test('deux pilotes au même code n’ont pas la même empreinte', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.reclame('MAX', '1234', {}, 'm@e.fr');
  const a = base.pilote('ZOÉ');
  const b = base.pilote('MAX');

  assert.notEqual(a.sel, b.sel, 'le sel doit être tiré par pilote');
  // Sans sel, une base qui fuite dirait d'un coup d'œil quels enfants ont choisi
  // le même code — et le premier code cassé les ouvrirait tous.
  assert.notEqual(a.code_hash, b.code_hash, 'deux codes identiques donnent la même empreinte');
  assert.equal(a.code_hash.length, 64, "l'empreinte doit faire 32 octets, comme scrypt les rend");
  assert.ok(!a.code_hash.includes('1234'), 'le code ne doit jamais se lire dans la base');
  // Et le code de l'un n'ouvre pas le pseudo de l'autre, sel ou pas.
  assert.equal(base.reclame('MAX', '1234').ok, true);
});

test('le code se vérifie pareil qu’il arrive en texte ou en nombre', (t) => {
  const base = neuve(t);
  // Le client envoie du JSON : « 4321 » et 4321 y sont deux valeurs distinctes,
  // et le pilote ne doit pas se retrouver dehors selon la façon dont son
  // appareil a sérialisé son code.
  base.reclame('NOÉ', 4321, {}, 'n@e.fr');
  assert.equal(base.reclame('NOÉ', '4321').ok, true, 'le nombre et le texte doivent concorder');
  assert.equal(base.reclame('NOÉ', 4321).ok, true);
  assert.equal(base.reclame('NOÉ', '0000').ok, false, 'un autre code doit rester refusé');
});

test('la reconnexion rend l’apparence du serveur et garde la première adresse', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', { livree: 'or', carene: 'fine' }, 'zoe@exemple.fr');
  // Un téléphone neuf arrive avec sa fiche vide : c'est le serveur qui détient
  // le vaisseau, sinon la livrée choisie sur la tablette du salon disparaîtrait.
  const retour = base.reclame('ZOÉ', '1234', {}, 'autre@exemple.fr');
  assert.equal(retour.nouveau, false);
  assert.equal(retour.livree, 'or', 'la reconnexion a effacé la livrée');
  assert.equal(retour.carene, 'fine', 'la reconnexion a effacé la carène');
  // L'adresse sert à retrouver un code oublié : la deuxième ne doit pas écraser
  // celle par laquelle on sait reconnaître l'enfant.
  assert.equal(base.pilote('ZOÉ').email, 'zoe@exemple.fr');

  // Et le changement d'apparence, lui, ne touche que ce qu'on lui donne.
  assert.equal(base.majApparence('ZOÉ', { livree: 'nuit' }).carene, 'fine');
  assert.equal(base.majApparence('ZOÉ', {}).livree, 'nuit', 'une mise à jour vide a tout effacé');
  assert.equal(base.majApparence('PERSONNE', {}), null);
});

// --- Les sessions ------------------------------------------------------------

test('deux appareils tiennent connectés en même temps', (t) => {
  const base = neuve(t);
  const tablette = base.reclame('ZOÉ', '1234', {}, 'z@e.fr').jeton;
  const telephone = base.reclame('ZOÉ', '1234').jeton;
  // Le jeton vivait dans la ligne du pilote : se connecter sur la tablette
  // déconnectait le téléphone, et l'enfant se retrouvait dehors sans comprendre.
  assert.notEqual(tablette, telephone, 'chaque connexion doit émettre son propre jeton');
  assert.equal(base.parJeton(tablette)?.nom, 'ZOÉ', 'la seconde connexion a révoqué la première');
  assert.equal(base.parJeton(telephone)?.nom, 'ZOÉ');
});

test('le plafond de sessions garde les plus récentes', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  // Les instants sont posés à la main, et croissants : c'est le seul moyen de
  // juger QUELLES sessions survivent, et non pas seulement combien.
  const jetons = [];
  for (let i = 0; i < 12; i++) {
    jetons.push(`jeton-${i}`);
    base._ouvreSession('ZOÉ', `jeton-${i}`, `2030-01-01T00:00:${String(i).padStart(2, '0')}.000Z`);
  }
  const vivants = jetons.filter((j) => base.parJeton(j));
  assert.equal(vivants.length, 8, 'sans plafond, chaque reconnexion laisse un jeton valide à vie');
  assert.deepEqual(vivants, jetons.slice(4), 'ce sont les plus RÉCENTES qu’il faut garder');
  // La session ouverte à la création tombe aussi : le plafond vaut pour toutes.
  assert.equal(base.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 8);
});

test('un jeton d’avant les sessions ouvre encore, et se ferme avec les autres', (t) => {
  const base = neuve(t);
  const ancien = base.reclame('ZOÉ', '1234', {}, 'z@e.fr').jeton;
  // On efface la ligne de session pour reproduire l'état d'un jeton émis avant
  // que la table existe : il ne vit alors que dans la ligne du pilote. Sans le
  // repli de parJeton, une mise à jour du serveur déconnecterait tout le monde.
  base.db.prepare('DELETE FROM sessions').run();
  assert.equal(base.parJeton(ancien)?.nom, 'ZOÉ', 'le repli sur l’ancien emplacement a sauté');

  // Et fermer les sessions doit fermer AUSSI cette porte-là, sinon un vieil
  // appareil reste connecté après qu'on a tout fermé.
  assert.equal(base.fermeSessions('ZOÉ'), 0, 'il ne restait aucune ligne de session à compter');
  assert.equal(base.parJeton(ancien), null, 'l’ancien jeton survit à la fermeture');
});

// --- Publier une partie ------------------------------------------------------

test('une partie publiée se relit telle qu’elle est partie', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  const id = base.ajoutePartie('ZOÉ', {
    mode: 'survie',
    score: 4200,
    vague: 17,
    duree: 930,
    version: 3,
    seed: 987,
    flux: 'AAAA',
    etats: [{ v: 1 }, { v: 2 }],
    controles: { dx: 1 },
  });
  const p = base.partie(id);
  assert.equal(p.nom, 'ZOÉ');
  assert.equal(p.mode, 'survie');
  assert.equal(p.score, 4200);
  assert.equal(p.vague, 17);
  assert.equal(p.seed, 987, 'sans la graine, l’enregistrement ne se rejoue pas');
  // Les états et les contrôles font l'aller-retour par JSON : rendus en texte,
  // le lecteur de replay ne saurait pas quoi en faire.
  assert.deepEqual(p.etats, [{ v: 1 }, { v: 2 }]);
  assert.deepEqual(p.controles, { dx: 1 });
  assert.equal(base.partie('identifiant-inventé'), null);

  const autre = base.ajoutePartie('ZOÉ', { score: 1, vague: 1 });
  assert.notEqual(autre, id, 'deux parties publiées coup sur coup partagent leur identifiant');
});

test('un mode inconnu retombe sur l’arcade plutôt que de créer un cinquième tableau', (t) => {
  const base = neuve(t);
  assert.equal(modePropre('arcade2'), 'arcade2');
  assert.equal(modePropre('survie2'), 'survie2');
  // Un mode inventé côté client ne doit pas se ranger dans un tableau à lui, où
  // il trônerait seul en tête sans jamais avoir affronté personne.
  assert.equal(modePropre('triche'), 'arcade');
  assert.equal(modePropre(undefined), 'arcade');

  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  const id = base.ajoutePartie('ZOÉ', { mode: 'triche', score: 10, vague: 1 });
  assert.equal(base.partie(id).mode, 'arcade', 'le mode doit être assaini AVANT l’écriture');
});

// --- L'élagage ---------------------------------------------------------------

test('un marathon de survie ne chasse pas les enregistrements d’arcade', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  for (let i = 1; i <= 20; i++) {
    base.ajoutePartie('ZOÉ', { mode: 'arcade', score: i * 10, vague: i, flux: `A${i}` });
  }
  // Cent trente parties de survie : de quoi passer deux fois le plafond si
  // l'élagage comptait par pilote sans regarder le mode.
  for (let i = 1; i <= 130; i++) {
    base.ajoutePartie('ZOÉ', { mode: 'survie', score: i, vague: i, flux: `S${i}` });
  }
  assert.deepEqual(
    compte(base, 'ZOÉ', 'arcade'),
    { parties: 20, replays: 12 },
    'l’arcade a été rognée par la survie'
  );
  assert.deepEqual(compte(base, 'ZOÉ', 'survie'), { parties: 100, replays: 12 });
});

test('cent parties par pilote et par mode, et le voisin n’y perd rien', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.reclame('MAX', '1234', {}, 'm@e.fr');
  base.ajoutePartie('MAX', { mode: 'arcade', score: 5, vague: 1, flux: 'M' });
  for (let i = 1; i <= 105; i++) {
    base.ajoutePartie('ZOÉ', { mode: 'arcade', score: i, vague: 1 });
  }
  assert.equal(compte(base, 'ZOÉ', 'arcade').parties, 100, 'le plafond de parties ne tient plus');
  // Ce sont les plus faibles qui tombent : le score 1 devait partir, le 105 rester.
  const scores = base.db
    .prepare("SELECT MIN(score) AS bas, MAX(score) AS haut FROM parties WHERE pilote = 'ZOÉ'")
    .get();
  assert.equal(scores.haut, 105, 'le meilleur score du pilote a été élagué');
  assert.equal(scores.bas, 6, 'ce ne sont pas les plus faibles parties qui sont tombées');
  // Et l'élagage est par PILOTE : la seule partie du voisin est intacte.
  assert.deepEqual(compte(base, 'MAX', 'arcade'), { parties: 1, replays: 1 });
});

test('douze enregistrements par mode, les meilleurs, sans toucher aux scores', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  for (let i = 1; i <= 20; i++) {
    base.ajoutePartie('ZOÉ', { mode: 'arcade', score: i * 10, vague: i, flux: `A${i}` });
  }
  // On ne supprime pas les scores, on relâche les enregistrements : les vingt
  // parties restent au tableau, huit d'entre elles ne se regardent plus.
  assert.deepEqual(compte(base, 'ZOÉ', 'arcade'), { parties: 20, replays: 12 });
  const gardes = base.db
    .prepare('SELECT score FROM parties WHERE flux IS NOT NULL ORDER BY score')
    .all()
    .map((r) => r.score);
  assert.deepEqual(
    gardes,
    [90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200],
    'ce ne sont pas les douze meilleures parties qui gardent leur enregistrement'
  );
});

// EN SURVIE, C'EST LA VAGUE QUI COMPTE — Y COMPRIS POUR CE QU'ON GARDE.
//
// L'élagage triait au score dans les deux modes, alors que le tableau de la
// survie se classe à la VAGUE. Les deux ne disent pas la même chose : en survie
// on peut aller très loin en marquant peu, et on peut marquer beaucoup en
// mourant tôt. La partie en TÊTE du tableau était donc élaguée comme si elle
// était mauvaise. Le meilleur run disparaissait du classement, et son
// enregistrement avec — c'est-à-dire précisément celui qu'on avait envie de
// revoir.

test('la survie garde les parties allées le plus LOIN, pas les mieux notées', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');

  // Le run de la vie : très loin, en marquant peu. Au tableau de la survie, il
  // est premier ; à un tri au score, il est bon dernier.
  base.ajoutePartie('ZOÉ', { mode: 'survie', score: 1, vague: 999, flux: 'RECORD' });
  // Cent-cinq parties courtes mais bien notées, de quoi passer les deux plafonds.
  for (let i = 1; i <= 105; i++) {
    base.ajoutePartie('ZOÉ', { mode: 'survie', score: 10_000 + i, vague: 2, flux: `C${i}` });
  }

  const record = base.db
    .prepare("SELECT vague, flux FROM parties WHERE pilote = 'ZOÉ' AND vague = 999")
    .get();
  assert.ok(record, 'la meilleure partie de survie du pilote a été SUPPRIMÉE');
  assert.equal(record.flux, 'RECORD', 'elle est restée au tableau, mais on ne peut plus la revoir');

  // Et elle est bien en tête de ce que le joueur voit : c'est la même question.
  const tete = base.classement(5, 'survie')[0];
  assert.equal(tete.vague, 999, 'le tableau et l’élagage ne répondent pas pareil');
});

test('l’arcade continue de garder les mieux notées', (t) => {
  // La correction ne devait changer que la survie.
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 1, vague: 999, flux: 'LOIN' });
  for (let i = 1; i <= 20; i++) {
    base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 10_000 + i, vague: 2, flux: `C${i}` });
  }
  const loin = base.db
    .prepare("SELECT flux FROM parties WHERE pilote = 'ZOÉ' AND vague = 999")
    .get();
  assert.equal(loin.flux, null, 'l’arcade se classe au SCORE : une vague haute ne protège rien');
});

// --- Les quatre tableaux -----------------------------------------------------

test('l’arcade se classe au score, la survie à la vague — à deux comme en solo', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  // Deux parties construites pour que les deux ordres se contredisent : celle
  // qui gagne à l'un doit perdre à l'autre, sinon l'épreuve ne prouve rien.
  for (const mode of ['arcade', 'survie', 'arcade2', 'survie2']) {
    base.ajoutePartie('ZOÉ', { mode, score: 9000, vague: 3 });
    base.ajoutePartie('ZOÉ', { mode, score: 100, vague: 40 });
  }
  assert.equal(base.classement(1, 'arcade')[0].score, 9000, 'l’arcade est une course au panache');
  assert.equal(base.classement(1, 'arcade2')[0].score, 9000, 'le duo d’arcade se classe au score');
  assert.equal(
    base.classement(1, 'survie')[0].vague,
    40,
    'la survie demande « jusqu’où es-tu allé ? »'
  );
  assert.equal(base.classement(1, 'survie2')[0].vague, 40, 'le duo de survie se classe à la vague');

  // À vague égale, c'est le score qui départage — et pas l'ordre d'arrivée.
  base.ajoutePartie('ZOÉ', { mode: 'survie', score: 500, vague: 40 });
  assert.equal(
    base.classement(1, 'survie')[0].score,
    500,
    'le score ne départage plus les ex æquo'
  );
});

test('chaque tableau ne montre que son mode', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.ajoutePartie('ZOÉ', { mode: 'survie', score: 99999, vague: 99 });
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 10, vague: 1, flux: 'A' });
  const arcade = base.classement(20, 'arcade');
  assert.equal(arcade.length, 1, 'une partie de survie s’est invitée au tableau d’arcade');
  assert.equal(arcade[0].score, 10);
  // Le tableau annonce s'il y a un enregistrement à regarder : sans ce drapeau,
  // le client propose un replay qui n'existe plus.
  assert.equal(Number(arcade[0].a_replay), 1);
  assert.equal(Number(base.classement(20, 'survie')[0].a_replay), 0);
  // Un mode inventé n'ouvre pas un tableau vide : il retombe sur l'arcade.
  assert.deepEqual(base.classement(20, 'triche'), arcade);
});

test('la limite du classement est bornée des deux côtés', (t) => {
  const base = neuve(t);
  // Trois pilotes, parce que le plafond d'élagage est par pilote : il en faut
  // plus d'un pour que le tableau dépasse la centaine de lignes.
  for (const nom of ['ZOÉ', 'MAX', 'NOÉ']) {
    base.reclame(nom, '1234', {}, `${nom}@e.fr`);
    for (let i = 1; i <= 45; i++) base.ajoutePartie(nom, { mode: 'arcade', score: i, vague: i });
  }
  assert.equal(base.classement(0, 'arcade').length, 1, 'une limite nulle rendrait un tableau vide');
  assert.equal(base.classement(-5, 'arcade').length, 1);
  // Le plafond protège la mémoire du serveur : sans lui, une requête demande
  // cent trente-cinq mille lignes et le pod les sérialise toutes.
  assert.equal(base.classement(9999, 'arcade').length, 100);
});

test('les records personnels croisent les deux maxima, mode par mode', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  // Le record de points et la meilleure vague viennent de DEUX parties
  // différentes : c'est la vague ATTEINTE qu'on affiche, pas celle du meilleur
  // score. Une requête qui rendrait la vague de la meilleure partie dirait 3.
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 9000, vague: 3 });
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 100, vague: 25 });
  base.ajoutePartie('ZOÉ', { mode: 'survie', score: 42, vague: 7 });
  assert.deepEqual(base.records('ZOÉ'), {
    meilleur: 9000,
    meilleureVague: 25,
    meilleurSurvie: 42,
    meilleureVagueSurvie: 7,
  });
  // Un pilote qui n'a jamais joué lit 0, et surtout pas « null » : le HUD
  // affiche la valeur telle quelle.
  assert.deepEqual(base.records('PERSONNE'), {
    meilleur: 0,
    meilleureVague: 0,
    meilleurSurvie: 0,
    meilleureVagueSurvie: 0,
  });
});

test('la liste publique ne laisse filer ni sel, ni empreinte, ni adresse', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', { livree: 'or' }, 'zoe@exemple.fr');
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 700, vague: 2 });
  base.ajoutePartie('ZOÉ', { mode: 'survie', score: 5000, vague: 30 });

  const [p] = base.pilotes();
  // Cette liste part sur une route que tout le monde peut appeler. Le jour où
  // quelqu'un remplace l'énumération des colonnes par une étoile, la prochaine
  // colonne du schéma s'en va avec — et ce sont des adresses d'enfants.
  assert.deepEqual(Object.keys(p).sort(), ['carene', 'livree', 'meilleur', 'nom', 'parties']);
  assert.equal(p.parties, 2, 'le compte de parties doit couvrir tous les modes');
  assert.equal(p.meilleur, 700, 'le meilleur affiché est celui d’arcade, pas celui de survie');
  assert.equal(base.pilotes(0).length, 1, 'une limite nulle viderait l’écran « Qui pilote ? »');

  // La route d'administration, elle, montre l'adresse : c'est sa raison d'être,
  // puisque c'est ainsi qu'on reconnaît l'enfant qui a oublié son code.
  assert.equal(base.pilotesAdmin()[0].email, 'zoe@exemple.fr');
});

// --- L'administration --------------------------------------------------------

test('vider un tableau ne vide que lui, et dit combien il a emporté', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 1, vague: 1 });
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 2, vague: 1 });
  base.ajoutePartie('ZOÉ', { mode: 'survie', score: 3, vague: 9 });

  assert.equal(
    base.videClassement('arcade'),
    2,
    'une administration qui dit « fait » ne prouve rien'
  );
  assert.equal(base.classement(20, 'arcade').length, 0);
  assert.equal(base.classement(20, 'survie').length, 1, 'vider l’arcade a emporté la survie');
  // Le pilote reste : on vide un tableau, on ne renvoie pas les pilotes.
  assert.equal(base.pilote('ZOÉ')?.nom, 'ZOÉ');

  assert.equal(base.videClassement('tout'), 1);
  assert.equal(base.chiffres().parties, 0);
});

test('supprimer une partie n’emporte qu’elle', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  const fautive = base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 999999, vague: 1 });
  const honnete = base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 12, vague: 1 });

  // C'est la route qui sert à retirer un score aberrant du tableau. Une clause
  // WHERE oubliée y viderait le panthéon entier, et personne ne s'en rendrait
  // compte avant que les enfants regardent leur classement.
  assert.equal(base.supprimePartie(fautive), 1);
  assert.equal(base.partie(fautive), null);
  assert.equal(base.partie(honnete)?.score, 12, 'la suppression a emporté la partie d’à côté');
  // Deux fois de suite, la seconde ne compte rien : l'interface saura dire que
  // la ligne était déjà partie plutôt que d'annoncer une suppression imaginaire.
  assert.equal(base.supprimePartie(fautive), 0);
  assert.equal(base.supprimePartie('identifiant-inventé'), 0);
});

test('supprimer un pilote emporte ses parties, ses sessions et son lien', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.reclame('MAX', '1234', {}, 'm@e.fr');
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 1, vague: 1 });
  base.ajoutePartie('ZOÉ', { mode: 'survie', score: 2, vague: 2 });
  base.ajoutePartie('MAX', { mode: 'arcade', score: 3, vague: 1 });
  const lien = base.invitation('ZOÉ');

  // La méthode compte AVANT de supprimer : c'est la cascade qui emporte les
  // parties, et une interface qui n'annonce pas le nombre ne permet pas de
  // vérifier qu'on a effacé ce qu'on croyait effacer.
  assert.deepEqual(base.supprimePilote('ZOÉ'), { pilote: 1, parties: 2 });
  assert.equal(base.chiffres().parties, 1, 'les parties du voisin sont parties aussi');
  assert.equal(base.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
  assert.equal(base.parInvitation(lien), null, 'le lien d’invitation survit à son pilote');
  // Un pilote inconnu ne doit rien prétendre avoir supprimé.
  assert.deepEqual(base.supprimePilote('PERSONNE'), { pilote: 0, parties: 0 });

  // Et les clés étrangères sont vraiment actives : sans le PRAGMA, une partie
  // pourrait se publier au nom d'un pilote qui n'existe pas, et plus rien ne la
  // rattacherait à personne.
  assert.throws(() => base.ajoutePartie('FANTÔME', { score: 1, vague: 1 }), /FOREIGN KEY/);
});

test('reposer le code ferme toutes les portes d’un coup', (t) => {
  const base = neuve(t);
  const tablette = base.reclame('ZOÉ', '1234', {}, 'z@e.fr').jeton;
  const telephone = base.reclame('ZOÉ', '1234').jeton;
  const selAvant = base.pilote('ZOÉ').sel;

  assert.deepEqual(base.reposeCode('ZOÉ', '4321'), { sessions: 2 });
  assert.notEqual(base.pilote('ZOÉ').sel, selAvant, 'un code neuf mérite un sel neuf');
  assert.equal(base.reclame('ZOÉ', '1234').ok, false, 'l’ancien code ouvre encore');
  assert.equal(base.reclame('ZOÉ', '4321').ok, true, 'le nouveau code n’ouvre pas');
  // On ne pose pas un code neuf en laissant ouvertes les portes qu'on
  // soupçonnait justement d'être de trop.
  assert.equal(base.parJeton(tablette), null, 'un appareil est resté connecté malgré le code neuf');
  assert.equal(base.parJeton(telephone), null);
  assert.equal(base.reposeCode('PERSONNE', '0000'), null);
});

test('purger les enregistrements libère la place sans toucher aux scores', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 10, vague: 1, version: 1, flux: 'vieux' });
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 20, vague: 2, version: 3, flux: 'neuf' });

  // Un flux enregistré sous des règles périmées ne raconte plus la partie qu'il
  // prétend raconter : on le libère, et lui seul.
  assert.equal(base.purgeReplays(1), 1);
  assert.equal(base.partie(base.classement(20)[1].id).flux, null);
  assert.equal(base.chiffres().replays, 1, 'la purge par version a emporté un flux encore valable');

  assert.equal(base.purgeReplays(), 1, 'la purge complète doit finir le travail');
  // Deux fois de suite, la seconde ne compte rien : le chiffre rendu est bien
  // celui des lignes touchées, pas celui des lignes visitées.
  assert.equal(base.purgeReplays(), 0);
  // Les parties, elles, sont toujours au tableau — on ne peut simplement plus
  // les regarder.
  assert.equal(base.classement(20).length, 2);
  assert.equal(base.chiffres().parties, 2);
});

test('la sauvegarde est une base complète, cohérente et détachée', (t) => {
  const base = neuve(t);
  const dossier = mkdtempSync(join(tmpdir(), 'hypernova-copie-'));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));

  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 42, vague: 2, flux: 'AAA' });
  const vers = join(dossier, 'sauvegarde.db');
  base.sauvegarde(vers);

  // Copier le fichier pendant qu'on écrit dedans donnerait une base à moitié à
  // jour, sans son journal : en WAL, la partie qu'on vient de publier vit encore
  // dans le journal et une simple copie ne la verrait pas.
  const copie = new DatabaseSync(vers);
  t.after(() => copie.close());
  assert.equal(copie.prepare('SELECT COUNT(*) AS n FROM pilotes').get().n, 1);
  const p = copie.prepare('SELECT score, flux FROM parties').get();
  assert.equal(p.score, 42, 'la sauvegarde ne contient pas la dernière partie publiée');
  assert.equal(p.flux, 'AAA', "l'enregistrement doit partir avec le score");

  // Et c'est un instantané : ce qu'on publie ensuite ne s'y ajoute pas.
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 99, vague: 9 });
  assert.equal(copie.prepare('SELECT COUNT(*) AS n FROM parties').get().n, 1);
});

test('l’état de la base compte ce qu’il y a, par mode et par version', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 10, vague: 1, version: 2, flux: 'A' });
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 30, vague: 2, version: 2 });
  base.ajoutePartie('ZOÉ', { mode: 'survie', score: 5, vague: 12, version: 5, flux: 'B' });

  const e = base.etat();
  assert.deepEqual(
    { parties: e.parties, pilotes: e.pilotes, replays: e.replays, sessions: e.sessions },
    { parties: 3, pilotes: 1, replays: 2, sessions: 1 }
  );
  // Par mode, parce que c'est la granularité à laquelle on vide un tableau.
  assert.deepEqual(
    e.modes.map((m) => [m.mode, m.parties, m.record]),
    [
      ['arcade', 2, 30],
      ['survie', 1, 5],
    ]
  );
  // Par version, parce que c'est le chiffre qui dit ce qui ne se rejoue plus.
  assert.deepEqual(
    e.versions.map((v) => [v.version, v.parties, Number(v.replays)]),
    [
      [5, 1, 1],
      [2, 2, 1],
    ]
  );
  // La taille vient de SQLite et non d'un stat, parce que le fichier principal
  // ne dit rien du journal WAL — et elle doit suivre ce qu'on écrit dedans.
  const avant = e.octets;
  assert.ok(avant > 0, 'la taille annoncée est nulle : la lecture des PRAGMA a cessé de marcher');
  base.ajoutePartie('ZOÉ', { mode: 'arcade', score: 40, vague: 3, flux: 'X'.repeat(400_000) });
  assert.ok(base.etat().octets > avant, 'la taille annoncée ne suit pas le contenu');
});

// --- Le lien d'invitation ----------------------------------------------------

test('le lien d’un pilote est stable, et se régénère en tuant l’ancien', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  const code = base.invitation('ZOÉ');
  assert.equal(code.length, 8, 'un lien se colle dans un message : ni trop long, ni devinable');
  // Deux appels ne doivent pas donner deux liens : celui qu'on a déjà partagé
  // dans le groupe de la classe cesserait de marcher à chaque ouverture d'écran.
  assert.equal(base.invitation('ZOÉ'), code);
  assert.equal(base.parInvitation(code), 'ZOÉ');

  const neuf = base.regenereInvitation('ZOÉ');
  assert.notEqual(neuf, code, 'régénérer doit changer le lien');
  // Le lien est réutilisable et sans échéance : sa seule défense est de pouvoir
  // être révoqué d'un geste. Si l'ancien marchait encore, il n'y en aurait plus.
  assert.equal(base.parInvitation(code), null, 'l’ancien lien ouvre encore');
  assert.equal(base.parInvitation(neuf), 'ZOÉ');
  assert.equal(base.db.prepare('SELECT COUNT(*) AS n FROM invitations').get().n, 1);

  assert.equal(base.parInvitation('inconnu'), null);
  assert.equal(base.parInvitation(''), null);
  assert.equal(base.parInvitation(null), null);
});

test('ouvrir le lien de quelqu’un rend amis tout de suite', (t) => {
  const base = neuve(t);
  base.reclame('ZOÉ', '1234', {}, 'z@e.fr');
  base.reclame('MAX', '1234', {}, 'm@e.fr');
  const code = base.invitation('ZOÉ');

  // Le lien EST le consentement : demander une confirmation ensuite serait une
  // étape qui n'apprend rien à personne.
  assert.deepEqual(base.parLien('MAX', code), { ok: true, nom: 'ZOÉ' });
  assert.equal(base.sontAmis('MAX', 'ZOÉ'), true);
  // Toucher le lien deux fois ne crée pas un second lien : une seule ligne, dans
  // l'ordre alphabétique, et la clé primaire interdit le doublon.
  assert.deepEqual(base.parLien('MAX', code), { ok: true, deja: true, nom: 'ZOÉ' });
  assert.equal(base.db.prepare('SELECT COUNT(*) AS n FROM amis').get().n, 1);

  assert.deepEqual(base.parLien('ZOÉ', code), { ok: false, erreur: 'soi-meme' });
  assert.deepEqual(base.parLien('MAX', 'jamais-vu'), { ok: false, erreur: 'lien-inconnu' });
  assert.deepEqual(base.parLien('MAX', null), { ok: false, erreur: 'lien-inconnu' });
});
