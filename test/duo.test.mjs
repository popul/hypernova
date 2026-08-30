// LES SALONS DU JEU À DEUX, LA PRÉSENCE, ET LE RELAIS.
//
// Le serveur ne simule rien : il apparie deux clients, leur donne la même graine
// et fait passer les octets. Tout ce qu'il possède en propre tient donc dans des
// PROMESSES, et une promesse trahie ici ne plante pas — elle produit deux parties
// différentes, un ami qui reste éternellement en ligne, ou une ligne audio ouverte
// chez quelqu'un qui n'a rien demandé. Rien de tout ça ne se voit dans un journal.
//
// Ces épreuves construisent un Duo avec de faux clients : la classe ne parle aux
// connexions que par envoieJSON / envoie / ping / ouverte, et ne connaît de la
// base que deux fonctions. Une fausse socket qui note ses messages suffit donc, et
// c'est autrement plus déterministe qu'un vrai réseau.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Duo } from '../server/duo.js';
// Le rattrapage vit côté CLIENT : même nom de fichier, autre monde — le serveur
// relaie des commandes, le client les consomme.
import { pasDeRattrapage } from '../src/game/duo.js';

// La même normalisation que le serveur (server/index.js) : sans elle, « Louis » et
// « LOUIS » seraient deux pilotes.
const nomPropre = (brut) =>
  String(brut || '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ\-. ]/g, '')
    .trim()
    .slice(0, 10);

// UNE HORLOGE DE PAPIER.
//
// Le compte à rebours dure trois secondes et le balayage passe toutes les douze :
// attendre pour de vrai coûterait une minute de suite d'épreuves et rendrait le
// tout tributaire de la charge de la machine. On remplace donc setInterval le
// temps de l'épreuve, et on avance nous-mêmes, minuteur par période.
function piloteHorloge() {
  const vraiPose = globalThis.setInterval;
  const vraiRetire = globalThis.clearInterval;
  const minuteurs = new Set();
  globalThis.setInterval = (rappel, ms) => {
    const t = { rappel, ms, unref: () => t };
    minuteurs.add(t);
    return t;
  };
  globalThis.clearInterval = (t) => (minuteurs.has(t) ? minuteurs.delete(t) : vraiRetire(t));
  return {
    // Un battement des seuls minuteurs de cette période.
    bat(ms, fois = 1) {
      for (let i = 0; i < fois; i++) {
        for (const t of [...minuteurs]) if (t.ms === ms && minuteurs.has(t)) t.rappel();
      }
    },
    // Combien de minuteurs de cette période sont encore en vie : c'est ainsi qu'on
    // attrape un clearInterval oublié.
    combien(ms) {
      return [...minuteurs].filter((t) => t.ms === ms).length;
    },
    rends() {
      globalThis.setInterval = vraiPose;
      globalThis.clearInterval = vraiRetire;
    },
  };
}

// Une fausse connexion : elle note ce qu'on lui donne au lieu de l'écrire sur une
// socket. Les deux chemins sont distincts à dessein — `recus` porte les messages
// que le serveur CONSTRUIT, `bruts` ceux qu'il se contente de faire passer.
class FausseCo {
  constructor() {
    this.ouverte = true;
    this.recus = [];
    this.bruts = [];
    this.pings = 0;
  }
  envoieJSON(m) {
    this.recus.push(m);
    return true;
  }
  envoie(brut) {
    this.bruts.push(brut);
    return true;
  }
  ping() {
    this.pings++;
    return true;
  }
  // Ce que le client dit au serveur. Une chaîne passe telle quelle : c'est ainsi
  // qu'on éprouve le relais octet pour octet.
  dis(m) {
    this.onMessage(typeof m === 'string' ? m : JSON.stringify(m));
  }
  // Une socket qui se ferme proprement.
  ferme() {
    this.ouverte = false;
    this.onClose();
  }
  // Une socket qui meurt sans au revoir : le téléphone qui perd le réseau.
  meurt() {
    this.ouverte = false;
  }
  des(t) {
    return this.recus.filter((m) => m.t === t);
  }
  dernier(t) {
    return this.des(t).at(-1);
  }
}

// Une épreuve : une horloge de papier, un Duo neuf, et de quoi faire arriver des
// clients. `salle.amitie` se remplace au besoin ; `salle.demandes` note chaque
// consultation de la base, ce qui permet de vérifier qu'on ne l'interroge PAS.
function epreuve(titre, corps) {
  test(titre, () => {
    const horloge = piloteHorloge();
    const salle = { amitie: () => true, demandes: [] };
    const duo = new Duo({
      nomPropre,
      sontAmis: (a, b) => {
        salle.demandes.push(`${a}>${b}`);
        return salle.amitie(a, b);
      },
    });
    salle.duo = duo;
    // Par défaut on arrive avec un jeton : la plupart des épreuves parlent de
    // salons, et l'invité est un cas à part qu'on demande explicitement.
    salle.arrive = (nom, { mode = 'arcade', identifie = true, coque = null } = {}) => {
      const co = new FausseCo();
      co.c = duo.accueille(co, { nom, mode, identifie });
      if (coque) co.dis({ t: 'coque', coque });
      return co;
    };
    // Une table prête à décoller : hôte, invité, et l'identifiant du salon.
    salle.table = (opts = {}) => {
      const hote = salle.arrive(opts.hote || 'ALICE', opts);
      hote.dis({ t: 'creer' });
      const id = hote.dernier('salon').id;
      const invite = salle.arrive(opts.invite || 'BOB', { ...opts, mode: 'arcade' });
      invite.dis({ t: 'rejoindre', id });
      return { hote, invite, id };
    };
    try {
      corps(salle, horloge);
    } finally {
      duo.arrete();
      horloge.rends();
    }
  });
}

// --- Les salons --------------------------------------------------------------

epreuve('créer une table donne un rôle, et une invitation que les autres voient', (salle) => {
  const spectateur = salle.arrive('CARL');
  const alice = salle.arrive('ALICE', { coque: 'helios' });
  alice.dis({ t: 'creer' });

  const salon = alice.dernier('salon');
  assert.ok(salon?.id, "l'hôte n'apprend pas l'identifiant de sa table");
  assert.equal(salon.role, 'hote', 'le créateur doit être hôte');
  assert.equal(alice.c.salon, salon.id, "le serveur n'a pas retenu que ce client est à table");

  // La table est POUSSÉE aux autres : sans ça, personne ne voit l'invitation avant
  // d'avoir rafraîchi à la main.
  const vues = spectateur.dernier('salons').l;
  assert.equal(vues.length, 1, "l'invitation n'a pas été diffusée");
  assert.deepEqual(
    { id: vues[0].id, nom: vues[0].nom, coque: vues[0].coque, mode: vues[0].mode },
    { id: salon.id, nom: 'ALICE', coque: 'helios', mode: 'arcade' },
    "l'invitation ne décrit pas correctement son hôte"
  );
});

epreuve("une table complète n'est plus une invitation, et redevient libre", (salle) => {
  const spectateur = salle.arrive('CARL');
  const { invite } = salle.table();

  assert.equal(spectateur.dernier('salons').l.length, 0, 'une table à deux reste proposée');

  // L'invité s'en va : l'hôte garde sa table, et elle réapparaît dans la liste.
  invite.dis({ t: 'quitter' });
  assert.equal(
    spectateur.dernier('salons').l.length,
    1,
    "la table libérée par l'invité ne revient pas dans la liste"
  );
});

epreuve('la liste ne montre que les tables du même mode', (salle) => {
  const alice = salle.arrive('ALICE', { mode: 'survie' });
  alice.dis({ t: 'creer' });

  const survivant = salle.arrive('CARL', { mode: 'survie' });
  const arcadien = salle.arrive('DINO', { mode: 'arcade' });
  assert.equal(survivant.dernier('salons').l.length, 1, 'une table de survie devrait être visible');
  assert.equal(arcadien.dernier('salons').l.length, 0, "l'arcade voit une table de survie");

  // Changer de mode se fait sans rouvrir la connexion — elle sert aussi de canal
  // de présence — et doit rafraîchir la liste tout de suite.
  arcadien.dis({ t: 'mode', mode: 'survie' });
  assert.equal(arcadien.c.mode, 'survie');
  assert.equal(
    arcadien.dernier('salons').l.length,
    1,
    'le changement de mode ne rejoue pas la liste'
  );

  // Un mode inconnu retombe sur l'arcade plutôt que de filtrer sur du vide.
  arcadien.dis({ t: 'mode', mode: 'triche' });
  assert.equal(arcadien.c.mode, 'arcade', 'un mode inconnu doit retomber sur arcade');

  // Le mode d'arrivée vient d'un paramètre d'URL, donc du client : il mérite la
  // même méfiance. Un mode fantaisiste ne filtrerait plus rien du tout.
  for (const invente of ['triche', '', undefined, 'SURVIE']) {
    assert.equal(
      salle.arrive('ZOE', { mode: invente }).c.mode,
      'arcade',
      `le mode ${JSON.stringify(invente)} est entré tel quel`
    );
  }
  assert.equal(salle.arrive('ZOE', { mode: 'survie' }).c.mode, 'survie', 'la survie est refusée');
});

epreuve('la liste part de la plus ancienne invitation', (salle) => {
  const ids = ['ALICE', 'BOB', 'CARL'].map((n) => {
    const co = salle.arrive(n);
    co.dis({ t: 'creer' });
    return co.dernier('salon').id;
  });
  // Trois salons créés dans la même milliseconde ne s'ordonnent pas tout seuls :
  // on leur forge des dates de naissance pour éprouver le tri, pas l'horloge.
  const ages = [3000, 1000, 2000];
  ids.forEach((id, i) => (salle.duo.salons.get(id).cree = ages[i]));

  const spectateur = salle.arrive('DINO');
  assert.deepEqual(
    spectateur.dernier('salons').l.map((s) => s.id),
    [ids[1], ids[2], ids[0]],
    'les invitations ne sont pas servies de la plus vieille à la plus jeune'
  );
});

epreuve('on ne pousse la liste qu’à ceux qui la regardent', (salle) => {
  const alice = salle.arrive('ALICE');
  alice.dis({ t: 'creer' });
  const avant = alice.des('salons').length;

  const spectateur = salle.arrive('CARL');
  const bob = salle.arrive('BOB');
  bob.dis({ t: 'creer' });

  assert.equal(
    alice.des('salons').length,
    avant,
    'un joueur assis à sa table reçoit encore les invitations des autres'
  );
  assert.equal(spectateur.dernier('salons').l.length, 2, 'le hall ne voit pas la nouvelle table');
});

epreuve('rejoindre : chacun apprend le pseudo et la coque de l’autre', (salle) => {
  const alice = salle.arrive('ALICE', { coque: 'helios' });
  alice.dis({ t: 'creer' });
  const id = alice.dernier('salon').id;

  const bob = salle.arrive('BOB', { coque: 'vulcain' });
  bob.dis({ t: 'rejoindre', id });

  assert.deepEqual(
    bob.dernier('salon'),
    { t: 'salon', id, role: 'invite', mode: 'arcade' },
    "l'invité n'apprend pas correctement où il vient d'entrer"
  );
  // L'appairage est symétrique : chacun voit le pseudo ET la coque de l'autre,
  // sinon la salle d'attente affiche un vaisseau qui n'est pas celui qui décollera.
  assert.deepEqual(alice.dernier('pair'), { t: 'pair', nom: 'BOB', coque: 'vulcain' });
  assert.deepEqual(bob.dernier('pair'), { t: 'pair', nom: 'ALICE', coque: 'helios' });
});

epreuve('le mode de l’hôte fait loi', (salle) => {
  const alice = salle.arrive('ALICE', { mode: 'survie' });
  alice.dis({ t: 'creer' });
  const id = alice.dernier('salon').id;

  // Bob joue en arcade : il ne voit même pas cette table dans sa liste, mais il
  // peut la rejoindre par son identifiant — et il doit alors changer de mode.
  const bob = salle.arrive('BOB', { mode: 'arcade' });
  bob.dis({ t: 'rejoindre', id });
  assert.equal(
    bob.c.mode,
    'survie',
    "l'invité garde son mode et jouera une autre partie que l'hôte"
  );
  assert.equal(
    bob.dernier('salon').mode,
    'survie',
    "l'invité n'est pas prévenu du mode de la table"
  );
});

epreuve('rejoindre l’impossible : l’inconnue, la complète, et la sienne', (salle) => {
  const alice = salle.arrive('ALICE');
  alice.dis({ t: 'creer' });
  const sienne = alice.dernier('salon').id;
  const { id: complete } = salle.table({ hote: 'CARL', invite: 'DINO' });

  const zoe = salle.arrive('ZOE');
  for (const [quoi, message] of [
    ['une table inconnue', { t: 'rejoindre', id: 'ffffffff' }],
    ['une table sans identifiant', { t: 'rejoindre' }],
    ['une table déjà complète', { t: 'rejoindre', id: complete }],
  ]) {
    const avant = zoe.des('erreur').length;
    zoe.dis(message);
    assert.equal(zoe.des('erreur').length, avant + 1, `${quoi} : aucun refus`);
    assert.equal(zoe.dernier('erreur').code, 'salon-indisponible');
    assert.equal(zoe.c.salon, null, `${quoi} : le client se croit à table`);
    // Un refus renvoie une liste fraîche : l'invitation qu'il visait a peut-être
    // disparu pendant qu'il cliquait, et il lui faut de quoi en choisir une autre.
    assert.ok(zoe.dernier('salons'), `${quoi} : refusé sans rien pour se rattraper`);
  }

  // Et l'hôte ne rejoint pas sa propre table : sans ce garde-fou il deviendrait
  // son propre voisin, et se relaierait ses commandes à lui-même.
  alice.dis({ t: 'rejoindre', id: sienne });
  assert.equal(alice.dernier('erreur')?.code, 'salon-indisponible', 'l’hôte a rejoint sa table');
  assert.ok(salle.duo.salons.has(sienne), 'la table a disparu sous son hôte');
  assert.equal(salle.duo.salons.get(sienne).invite, null, 'l’hôte est devenu son propre invité');
  alice.dis({ t: 'c', f: 1 });
  assert.deepEqual(alice.bruts, [], 'l’hôte se relaie ses propres commandes');
});

epreuve('créer deux fois ne laisse pas de table fantôme', (salle) => {
  const { hote, invite, id } = salle.table();
  hote.dis({ t: 'creer' });

  const neuf = hote.dernier('salon').id;
  assert.notEqual(neuf, id, 'la seconde table réutilise le même identifiant');
  assert.equal(salle.duo.chiffres().salons, 1, "l'ancienne table survit à son hôte");
  assert.deepEqual(
    invite.dernier('parti'),
    { t: 'parti', cause: 'change', hote: true },
    "l'invité de la table abandonnée n'est pas prévenu"
  );
  assert.equal(invite.c.salon, null, "l'invité reste assis à une table qui n'existe plus");
});

epreuve('le plafond de salons existe, et se libère', (salle) => {
  // Le plafond n'est pas une limite de charge mais une porte : sans elle, une
  // boucle qui crée des salons remplit la mémoire. On ne connaît pas le chiffre
  // exact — on vérifie qu'il y en a un, et qu'il est atteint avant l'absurde.
  const hotes = [];
  let refuse = null;
  for (let i = 0; i < 500 && !refuse; i++) {
    const co = salle.arrive(`P${i}`, { identifie: false });
    co.dis({ t: 'creer' });
    if (co.dernier('erreur')?.code === 'trop-de-salons') refuse = co;
    else hotes.push(co);
  }
  assert.ok(refuse, 'aucun plafond : cinq cents salons ont été acceptés');
  const plafond = salle.duo.chiffres().salons;
  assert.equal(plafond, hotes.length, 'le compte des salons ne suit pas les créations');
  assert.equal(refuse.c.salon, null, 'un créateur refusé se croit tout de même à table');

  // Le plafond compte les salons VIVANTS : une table fermée rend sa place.
  hotes[0].dis({ t: 'quitter' });
  refuse.dis({ t: 'creer' });
  assert.ok(refuse.c.salon, 'une place libérée ne profite à personne');
  assert.equal(salle.duo.chiffres().salons, plafond, 'le plafond a bougé');
});

// --- Le décollage ------------------------------------------------------------

epreuve('le compte à rebours est tenu par le serveur, et part sans attendre', (salle, h) => {
  const { hote, invite } = salle.table();

  // Le premier battement est immédiat : sinon les deux clients regardent un écran
  // muet pendant une seconde en se demandant si ça a marché.
  const depart = hote.dernier('compte')?.n;
  assert.ok(depart >= 1, 'aucun compte à rebours au moment de l’appairage');

  for (let i = 0; i < depart; i++) {
    assert.equal(hote.des('go').length, 0, 'le décollage a eu lieu avant la fin du compte');
    h.bat(1000);
  }

  const attendu = Array.from({ length: depart }, (_, i) => depart - i);
  assert.deepEqual(
    hote.des('compte').map((m) => m.n),
    attendu,
    'le compte ne descend pas jusqu’à un'
  );
  // Les deux reçoivent EXACTEMENT la même chose : c'est ce qui les fait démarrer
  // sur la même image.
  assert.deepEqual(invite.des('compte'), hote.des('compte'), 'les deux comptes divergent');
  assert.equal(hote.des('go').length, 1, 'un seul décollage, et il a eu lieu');
  assert.equal(h.combien(1000), 0, 'le minuteur du compte tourne encore après le décollage');
});

epreuve('la même graine des deux côtés, et deux rôles distincts', (salle, h) => {
  const { hote, invite } = salle.table({ mode: 'survie', coque: 'helios' });
  invite.dis({ t: 'coque', coque: 'vulcain' });
  h.bat(1000, 8);

  const a = hote.dernier('go');
  const b = invite.dernier('go');
  assert.ok(a && b, 'quelqu’un n’a pas décollé');
  // LA promesse du jeu à deux : même graine, donc même hasard, donc même partie.
  assert.equal(a.graine, b.graine, 'les deux clients sèment un hasard différent');
  assert.ok(
    Number.isInteger(a.graine) && a.graine >= 0 && a.graine < 2 ** 31,
    'graine hors bornes'
  );
  assert.equal(a.mode, 'survie', "le mode de la table n'est pas celui du décollage");
  assert.equal(b.mode, 'survie');

  // Même table des joueurs des deux côtés, mais chacun sait lequel il est.
  assert.equal(a.moi, 0, "l'hôte n'est pas le joueur 0");
  assert.equal(b.moi, 1, "l'invité n'est pas le joueur 1");
  assert.deepEqual(a.joueurs, b.joueurs, 'les deux clients ne voient pas le même équipage');
  assert.deepEqual(a.joueurs, [
    { slot: 0, nom: 'ALICE', coque: 'helios' },
    { slot: 1, nom: 'BOB', coque: 'vulcain' },
  ]);
});

epreuve('la graine vient du serveur et n’est pas une constante', (salle, h) => {
  const graines = new Set();
  for (let i = 0; i < 5; i++) {
    const { hote } = salle.table({ hote: `A${i}`, invite: `B${i}` });
    h.bat(1000, 8);
    graines.add(hote.dernier('go').graine);
    hote.dis({ t: 'quitter' });
  }
  // Cinq graines toutes égales, c'est une constante en dur, pas du hasard.
  assert.ok(graines.size > 1, `cinq parties ont toutes semé ${[...graines][0]}`);
});

epreuve('l’invité qui part avant le décollage annule le compte à rebours', (salle, h) => {
  const { hote, invite } = salle.table();
  const battus = hote.des('compte').length;

  invite.dis({ t: 'quitter' });
  assert.equal(h.combien(1000), 0, 'le minuteur du compte à rebours a fui');

  h.bat(1000, 5);
  assert.equal(hote.des('go').length, 0, 'l’hôte décolle seul, sans personne en face');
  assert.equal(hote.des('compte').length, battus, 'le compte continue après le départ de l’invité');
});

// --- Le relais ---------------------------------------------------------------

epreuve('la commande passe au voisin telle quelle, et à lui seul', (salle) => {
  const { hote, invite } = salle.table();
  const temoin = salle.arrive('CARL');

  // Un champ que le serveur ne connaît pas, et un ordre de clés inhabituel : si
  // quelqu'un remplace le relais par une re-sérialisation, ça se voit ici.
  const trame = '{"f":42,"t":"c","d":[1,-1,0],"inconnu":"garde-moi"}';
  invite.dis(trame);
  assert.deepEqual(hote.bruts, [trame], 'la commande n’arrive pas intacte chez le voisin');
  assert.deepEqual(
    hote.recus.filter((m) => m.t === 'c'),
    [],
    'le relais relit la commande'
  );
  assert.deepEqual(invite.bruts, [], 'la commande revient à son expéditeur');
  assert.deepEqual(temoin.bruts, [], 'la commande fuit vers un client hors de la table');
});

epreuve('la fin de partie est annoncée au voisin', (salle) => {
  const { hote, invite } = salle.table();
  const trame = '{"t":"fin","score":12345,"vague":7}';
  hote.dis(trame);
  assert.deepEqual(invite.bruts, [trame], 'l’autre joueur n’apprend pas la fin, ni le score');
});

epreuve('une commande sans voisin vivant ne casse rien', (salle) => {
  const seul = salle.arrive('ALICE');
  seul.dis({ t: 'c', f: 1 }); // pas même de table
  seul.dis({ t: 'creer' });
  seul.dis({ t: 'c', f: 2 }); // une table, mais personne en face
  assert.deepEqual(seul.bruts, []);

  const bob = salle.arrive('BOB');
  bob.dis({ t: 'rejoindre', id: seul.dernier('salon').id });
  // Une socket morte sans au revoir : écrire dedans ne sert à rien, et le relais
  // doit le vérifier plutôt que de compter sur la couche du dessous.
  bob.meurt();
  seul.dis({ t: 'c', f: 3 });
  assert.deepEqual(bob.bruts, [], 'on écrit encore dans une socket fermée');
});

// --- Les départs -------------------------------------------------------------

epreuve('l’hôte qui part ferme la table', (salle) => {
  const { hote, invite, id } = salle.table();
  hote.dis({ t: 'quitter' });

  assert.deepEqual(
    invite.dernier('parti'),
    { t: 'parti', cause: 'quitte', hote: true },
    "l'invité n'apprend pas que la table a fermé"
  );
  assert.equal(salle.duo.salons.has(id), false, 'la table survit à son hôte');
  assert.equal(invite.c.salon, null, "l'invité reste rattaché à une table disparue");
  // Et il retombe dans le hall avec une liste fraîche, sans avoir à la demander.
  assert.ok(invite.dernier('salons'), "l'invité éjecté n'a pas de quoi choisir une autre table");
});

epreuve('l’invité qui part laisse la table ouverte', (salle) => {
  const spectateur = salle.arrive('CARL');
  const { hote, invite, id } = salle.table();
  invite.dis({ t: 'quitter' });

  assert.deepEqual(
    hote.dernier('parti'),
    { t: 'parti', cause: 'quitte', hote: false },
    "l'hôte n'apprend pas que son invité s'en va"
  );
  assert.equal(salle.duo.salons.has(id), true, "la table de l'hôte a été fermée sans lui");
  assert.equal(hote.c.salon, id, "l'hôte a été renvoyé au hall alors qu'il pouvait attendre");
  assert.equal(spectateur.dernier('salons').l.length, 1, 'la table libérée n’est pas reproposée');
});

epreuve('une déconnexion vaut un départ', (salle) => {
  const { hote, invite } = salle.table();
  const avant = salle.duo.chiffres().clients;

  invite.ferme();
  assert.deepEqual(
    hote.dernier('parti'),
    { t: 'parti', cause: 'deconnexion', hote: false },
    'une socket qui se ferme ne prévient pas le voisin'
  );
  assert.equal(salle.duo.chiffres().clients, avant - 1, 'le client parti compte encore');
  assert.equal(salle.duo.enLigne().BOB, undefined, 'un déconnecté reste affiché en ligne');
});

// --- Le balayage -------------------------------------------------------------

epreuve('le balayage oublie la table dont l’hôte a disparu', (salle, h) => {
  const { hote, invite, id } = salle.table();
  const avant = hote.des('salons');
  // Le téléphone sort du réseau : rien ne se ferme, la socket est simplement
  // muette. Sans balayage, la table resterait là jusqu'au prochain message.
  hote.meurt();
  h.bat(12_000);

  assert.equal(salle.duo.salons.has(id), false, 'la table d’un hôte disparu survit');
  assert.deepEqual(
    invite.dernier('parti'),
    { t: 'parti', cause: 'expire', hote: true },
    "l'invité attend un hôte qui ne reviendra pas"
  );
  assert.equal(invite.c.salon, null);
  // Et on n'écrit pas la liste dans une socket morte : c'est justement celle
  // qu'on vient de constater muette.
  assert.deepEqual(hote.des('salons'), avant, 'la liste est poussée dans une socket fermée');
});

epreuve('le balayage oublie l’invitation trop vieille, jamais la table occupée', (salle, h) => {
  const seul = salle.arrive('ALICE');
  seul.dis({ t: 'creer' });
  const abandonnee = seul.dernier('salon').id;
  const { id: occupee } = salle.table({ hote: 'CARL', invite: 'DINO' });

  // Un jour d'âge : au-delà de n'importe quel délai de grâce raisonnable.
  const vieux = Date.now() - 24 * 3600_000;
  salle.duo.salons.get(abandonnee).cree = vieux;
  salle.duo.salons.get(occupee).cree = vieux;
  h.bat(12_000);

  assert.equal(salle.duo.salons.has(abandonnee), false, 'une invitation morte encombre la liste');
  assert.equal(salle.duo.salons.has(occupee), true, 'une table où l’on joue a été balayée');
});

epreuve('le balayage envoie un ping à tout le monde', (salle, h) => {
  // C'est l'ÉCRITURE qui révèle une socket morte, pas l'attente : sans ce ping,
  // un ami resté « en ligne » le serait jusqu'au prochain message, donc parfois
  // jamais.
  const clients = [salle.arrive('ALICE'), salle.arrive('BOB'), salle.arrive('CARL')];
  h.bat(12_000);
  for (const c of clients) assert.equal(c.pings, 1, 'un client n’a pas été sondé');
  h.bat(12_000);
  for (const c of clients) assert.equal(c.pings, 2, 'le sondage ne se répète pas');
});

// --- La présence -------------------------------------------------------------

epreuve('seul un pilote reconnu par son jeton compte comme en ligne', (salle) => {
  const alice = salle.arrive('ALICE');
  const zoe = salle.arrive('ZOE', { identifie: false });
  // Un invité peut jouer, mais il n'est l'ami de personne. Celui-ci se déclare
  // « ALICE » sans jeton : il ne doit ni apparaître, ni recouvrir la vraie.
  const imposteur = salle.arrive('ALICE', { identifie: false });
  imposteur.dis({ t: 'creer' });
  imposteur.dis({ t: 'joue', oui: true });

  assert.deepEqual(Object.keys(salle.duo.enLigne()), ['ALICE'], 'la présence compte des invités');
  assert.deepEqual(
    salle.duo.enLigne().ALICE,
    { salon: false, partie: false },
    "l'état d'un invité homonyme est passé pour celui du pilote identifié"
  );
  assert.equal(salle.duo.chiffres().clients, 3, 'un invité doit pouvoir se connecter et jouer');
  assert.deepEqual(imposteur.des('presence'), [], 'un invité reçoit la liste des amis en ligne');
  assert.deepEqual(zoe.des('presence'), []);
  assert.ok(alice.des('presence').length > 0, 'un pilote identifié ne reçoit pas la présence');
});

epreuve('la présence dit qui est à table, et qui joue', (salle, h) => {
  const solitaire = salle.arrive('CARL');
  const { hote } = salle.table();

  assert.deepEqual(
    salle.duo.enLigne().ALICE,
    { salon: true, partie: false },
    "l'hôte d'une table qui n'a pas encore décollé est mal décrit à ses amis"
  );

  // « En partie » vaut aussi pour une partie SOLO : c'est justement celle qu'un
  // copain voudra regarder, et seul le client peut l'annoncer.
  solitaire.dis({ t: 'joue', oui: true });
  assert.deepEqual(
    salle.duo.enLigne().CARL,
    { salon: false, partie: true },
    'le solo ne se voit pas'
  );
  solitaire.dis({ t: 'joue', oui: false });
  assert.equal(salle.duo.enLigne().CARL.partie, false, 'la fin de la partie solo ne se voit pas');

  // Une fois le duo décollé, le serveur le sait sans qu'on le lui dise.
  h.bat(1000, 8);
  assert.deepEqual(
    salle.duo.enLigne().ALICE,
    { salon: true, partie: true },
    'le duo lancé ne se voit pas'
  );
  assert.deepEqual(salle.duo.enLigne().BOB, { salon: true, partie: true });
  assert.ok(hote.dernier('go'), 'la partie n’a pas décollé');
});

epreuve('la présence est poussée, et suit les départs', (salle) => {
  const alice = salle.arrive('ALICE');
  const bob = salle.arrive('BOB');
  // Poussée, pas interrogée : Alice apprend l'arrivée de Bob tout de suite.
  assert.deepEqual(Object.keys(alice.dernier('presence').l).sort(), ['ALICE', 'BOB']);

  bob.ferme();
  assert.deepEqual(
    Object.keys(alice.dernier('presence').l),
    ['ALICE'],
    'un ami parti reste affiché en ligne'
  );
});

// --- La signalisation de la voix ---------------------------------------------

epreuve('la signalisation ne passe qu’entre amis', (salle) => {
  const alice = salle.arrive('ALICE');
  const bob = salle.arrive('BOB');

  salle.amitie = () => false;
  alice.dis({ t: 'signal', vers: 'BOB', sujet: 'offre', d: { sdp: 'x' } });
  assert.deepEqual(bob.des('signal'), [], 'une ligne audio s’ouvre chez un inconnu');
  assert.ok(salle.demandes.includes('ALICE>BOB'), 'l’amitié n’a même pas été vérifiée');

  salle.amitie = () => true;
  alice.dis({ t: 'signal', vers: 'BOB', sujet: 'offre', d: { sdp: 'x' } });
  assert.equal(bob.des('signal').length, 1, 'deux amis ne peuvent plus se parler');
});

epreuve('un client sans jeton ne peut pas signaler', (salle) => {
  const imposteur = salle.arrive('ALICE', { identifie: false });
  const bob = salle.arrive('BOB');

  imposteur.dis({ t: 'signal', vers: 'BOB', sujet: 'offre', d: {} });
  assert.deepEqual(bob.des('signal'), [], 'un invité ouvre une ligne audio chez un pilote');
  // Et on ne consulte même pas la base : un anonyme ne doit pas pouvoir faire
  // travailler la table des amis à chaque message.
  assert.deepEqual(salle.demandes, [], 'l’amitié est consultée pour un client non identifié');
});

epreuve('on ne signale ni vers un inconnu, ni vers un homonyme sans jeton', (salle) => {
  const alice = salle.arrive('ALICE');
  const bob = salle.arrive('BOB');
  const faussaire = salle.arrive('BOB', { identifie: false });

  alice.dis({ t: 'signal', vers: 'ZOE', sujet: 'offre', d: {} });
  assert.deepEqual(bob.des('signal'), []);

  // Un destinataire qui ne survit pas à la normalisation ne coûte pas même une
  // lecture de la base.
  alice.dis({ t: 'signal', vers: '###', sujet: 'offre', d: {} });
  alice.dis({ t: 'signal', sujet: 'offre', d: {} });
  assert.deepEqual(
    salle.demandes,
    ['ALICE>ZOE'],
    'un destinataire vide interroge quand même la base'
  );

  alice.dis({ t: 'signal', vers: 'BOB', sujet: 'offre', d: {} });
  assert.equal(bob.des('signal').length, 1, 'l’ami identifié n’a rien reçu');
  assert.deepEqual(faussaire.des('signal'), [], 'un homonyme sans jeton écoute la conversation');
});

epreuve('le serveur signe le message : l’expéditeur déclaré est ignoré', (salle) => {
  const alice = salle.arrive('ALICE');
  const bob = salle.arrive('BOB');

  // Alice se prétend quelqu'un d'autre, et ajoute un champ de son cru. Le serveur
  // ne recopie pas le message : il en construit un, et c'est lui qui dit qui parle.
  alice.dis({
    t: 'signal',
    vers: 'BOB',
    de: 'CARL',
    sujet: 'offre',
    d: { sdp: 'x' },
    triche: true,
  });
  assert.deepEqual(
    bob.dernier('signal'),
    { t: 'signal', de: 'ALICE', sujet: 'offre', d: { sdp: 'x' } },
    "l'expéditeur ou le contenu du message n'est pas celui que le serveur devrait produire"
  );
});

// --- Le tout-venant ----------------------------------------------------------

epreuve('la coque annoncée est ramenée à une coque connue', (salle) => {
  const spectateur = salle.arrive('CARL');
  const alice = salle.arrive('ALICE');

  // Cette chaîne s'affiche chez l'autre joueur et dans la liste des invitations :
  // tout ce qui vient du réseau doit être ramené à un identifiant connu.
  for (const inventee of ['<script>', 'ORION', '', 42, null, { coque: 'orion' }]) {
    alice.dis({ t: 'coque', coque: inventee });
    assert.equal(alice.c.coque, 'orion', `la coque ${JSON.stringify(inventee)} a été acceptée`);
  }
  alice.dis({ t: 'coque', coque: 'vulcain' });
  assert.equal(alice.c.coque, 'vulcain', 'une coque légitime est refusée');

  // Et le changement rejoue la liste : l'invitation porte la coque de son hôte.
  alice.dis({ t: 'creer' });
  assert.equal(spectateur.dernier('salons').l[0].coque, 'vulcain');
});

epreuve('un pseudo vide ou biscornu ne casse pas la table', (salle) => {
  const anonyme = salle.arrive('   ');
  assert.equal(anonyme.c.nom, 'PILOTE', 'un pseudo vide doit recevoir un nom par défaut');
  const bavard = salle.arrive('marie-jo la bricoleuse');
  assert.equal(bavard.c.nom, 'MARIE-JO L', 'le pseudo n’est pas normalisé avant d’être rediffusé');

  anonyme.dis({ t: 'creer' });
  assert.equal(salle.arrive('CARL').dernier('salons').l[0].nom, 'PILOTE');
});

epreuve('un message mal formé ou inconnu ne fait rien', (salle) => {
  const alice = salle.arrive('ALICE');
  const avant = alice.recus.length;
  for (const brut of ['', 'pas du json', '{', '123', '"texte"', '[]', '{"t":"inconnu"}', '{}']) {
    alice.dis(brut);
  }
  assert.equal(alice.recus.length, avant, 'un message incompréhensible provoque une réponse');
  assert.equal(salle.duo.chiffres().salons, 0);
});

// --- Ce que l'autre joueur apprend, et quand ---------------------------------

epreuve('changer de coque dans la salle d’attente prévient l’autre joueur', (salle) => {
  const { hote, invite } = salle.table();
  const avant = invite.des('pair').length;

  hote.dis({ t: 'coque', coque: 'vulcain' });

  // La ligne fautive passait `c.salon` — l'IDENTIFIANT — à une méthode qui attend
  // le SALON. `s.hote` valait alors undefined, la garde d'entrée renvoyait sans
  // rien faire, et l'invité gardait sous les yeux le vaisseau d'avant jusqu'au
  // décompte. Aucune erreur nulle part : juste un message qui ne partait pas.
  assert.ok(invite.des('pair').length > avant, 'le changement de coque n’a prévenu personne');
  assert.equal(invite.dernier('pair').coque, 'vulcain');
  assert.equal(invite.dernier('pair').nom, 'ALICE');
});

epreuve('une table qui expire le dit à son hôte', (salle, horloge) => {
  const alice = salle.arrive('ALICE');
  alice.dis({ t: 'creer' });
  const id = alice.dernier('salon').id;

  // Personne ne vient, et la table dépasse ses dix minutes.
  salle.duo.salons.get(id).cree = Date.now() - 11 * 60_000;
  horloge.bat(12000);

  assert.equal(salle.duo.salons.has(id), false, 'la table devait être balayée');
  // ELLE DISPARAISSAIT SOUS LUI EN SILENCE. Le serveur la retirait de la liste,
  // et l'hôte restait sur l'écran d'attente devant un compteur qui tournait pour
  // une partie qui n'existait plus — plus joignable, et pas prévenu.
  const parti = alice.dernier('parti');
  assert.ok(parti, 'l’hôte n’a jamais appris que sa table avait expiré');
  assert.equal(parti.cause, 'expire');
  assert.equal(parti.hote, false, 'c’est SA table qui a expiré, pas celle d’un autre');
});

epreuve('un hôte déjà déconnecté ne reçoit pas d’adieu', (salle, horloge) => {
  const alice = salle.arrive('ALICE');
  alice.dis({ t: 'creer' });
  const id = alice.dernier('salon').id;
  alice.ouverte = false;
  const avant = alice.des('parti').length;

  horloge.bat(12000);

  assert.equal(salle.duo.salons.has(id), false);
  assert.equal(alice.des('parti').length, avant, 'on écrit sur une socket fermée');
});

// --- LE RATTRAPAGE DU SPECTATEUR ----------------------------------------------
//
// Quand sa file grossit — onglet en fond, réseau qui hoquette — le spectateur
// consomme l'excédent en accéléré. L'ancienne réponse jetait la file : couper une
// suite ordonnée de commandes en son milieu, c'est recoller la simulation sur les
// commandes d'après, et elle divergeait en silence. Et attendre le prochain
// tableau gelait l'écran pendant tout un combat de boss.

test('sous le seuil, le rattrapage ne touche à rien', () => {
  for (const retard of [0, 10, 45, 119, 120]) {
    assert.equal(pasDeRattrapage(retard), 0, `retard ${retard} : l’amortisseur normal suffit`);
  }
});

test('au-delà du seuil, on consomme l’excédent en gardant un tampon', () => {
  // 300 images de retard : on en avale 255 et on en garde 45 d'avance, pour ne
  // pas repartir à sec au premier hoquet suivant.
  assert.equal(pasDeRattrapage(300), 255);
  assert.equal(pasDeRattrapage(121), 76);
});

test('le rattrapage est plafonné par image rendue', () => {
  // Dix secondes de simulation par battement d'écran, pas plus : au-delà, c'est
  // l'appareil du spectateur qu'on gèlerait à la place du spectacle.
  assert.equal(pasDeRattrapage(2000), 600);
  assert.equal(pasDeRattrapage(5000), 600);
});

test('le rattrapage ne rend jamais un pas négatif', () => {
  assert.equal(pasDeRattrapage(130, { tampon: 200, seuil: 120 }), 0);
});

// --- LA PRÉSENCE DIT AUSSI LES DÉPARTS ----------------------------------------
//
// Un copain « en ligne » qui ne l'est plus n'est pas un détail d'affichage :
// c'est à lui qu'on propose de parler, de regarder sa partie, de jouer. Chaque
// bouton pointé sur un absent est une promesse cassée.

epreuve('un départ se diffuse immédiatement, sans attendre le battement', (salle) => {
  const alice = salle.arrive('ALICE');
  const bob = salle.arrive('BOB');
  assert.ok(bob.dernier('presence').l.ALICE, 'BOB devrait voir ALICE en ligne');

  // ALICE ferme son onglet : la couche transport appelle onClose.
  alice.ouverte = false;
  alice.onClose?.();

  const l = bob.dernier('presence').l;
  assert.ok(!l.ALICE, 'ALICE est partie et BOB la voit encore en ligne');
  assert.ok(l.BOB, 'BOB doit toujours se voir lui-même');
});

epreuve('une socket morte sans adieu disparaît au battement suivant', (salle, horloge) => {
  const alice = salle.arrive('ALICE');
  const bob = salle.arrive('BOB');
  // Le téléphone d'ALICE perd le réseau : pas de close, juste une socket qui ne
  // répond plus. C'est le ping du balayage qui la révèle — l'écriture échoue et
  // la couche transport appelle onClose.
  alice.ouverte = false;
  alice.ping = () => alice.onClose?.();
  horloge.bat(12000);

  const l = bob.dernier('presence').l;
  assert.ok(!l.ALICE, 'une socket morte reste comptée comme en ligne');
});
