// LES SALONS DU JEU À PLUSIEURS, LA PRÉSENCE, ET LE RELAIS.
//
// Le serveur ne simule rien : il assoit deux ou trois clients à la même table,
// leur donne la même graine et fait passer les octets. Tout ce qu'il possède en
// propre tient donc dans des PROMESSES, et une promesse trahie ici ne plante pas
// — elle produit deux parties différentes, un ami qui reste éternellement en
// ligne, ou une ligne audio ouverte chez quelqu'un qui n'a rien demandé. Rien de
// tout ça ne se voit dans un journal.
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
    // Une table de deux, PAS ENCORE LANCÉE. Le décollage n'est plus automatique
    // à l'arrivée d'un invité : la table peut attendre un troisième, et c'est
    // l'hôte qui envoie « lancer » quand son équipage lui convient.
    salle.table = (opts = {}) => {
      const hote = salle.arrive(opts.hote || 'ALICE', opts);
      hote.dis({ t: 'creer' });
      const id = hote.dernier('salon').id;
      const invite = salle.arrive(opts.invite || 'BOB', { ...opts, mode: 'arcade' });
      invite.dis({ t: 'rejoindre', id });
      return { hote, invite, id };
    };
    // La même, avec le troisième siège occupé.
    salle.trio = (opts = {}) => {
      const t = salle.table(opts);
      const troisieme = salle.arrive(opts.troisieme || 'EVE', { ...opts, mode: 'arcade' });
      troisieme.dis({ t: 'rejoindre', id: t.id });
      return { ...t, troisieme };
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

epreuve('une table garde sa place en vitrine tant qu’il reste un siège', (salle) => {
  // CHANGEMENT VOULU : à deux, le premier invité suffisait à retirer la table de
  // la liste. Depuis le troisième siège, une table à deux reste une invitation —
  // et `assis` dit combien y sont déjà, pour que le hall affiche « 2/3 ».
  const spectateur = salle.arrive('CARL');
  const { id } = salle.table();

  let vue = spectateur.dernier('salons').l;
  assert.equal(vue.length, 1, 'une table à deux n’attend plus son troisième');
  assert.equal(vue[0].assis, 2, 'la vitrine ne dit pas combien sont assis');

  const eve = salle.arrive('EVE');
  eve.dis({ t: 'rejoindre', id });
  assert.equal(spectateur.dernier('salons').l.length, 0, 'une table pleine reste proposée');

  // Un invité s'en va : un siège se libère, la table revient en vitrine.
  eve.dis({ t: 'quitter' });
  vue = spectateur.dernier('salons').l;
  assert.equal(vue.length, 1, "la table libérée par l'invité ne revient pas dans la liste");
  assert.equal(vue[0].assis, 2, 'la vitrine compte encore l’invité parti');
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

epreuve('rejoindre : chacun reçoit l’équipage entier, et son propre numéro', (salle) => {
  const alice = salle.arrive('ALICE', { coque: 'helios' });
  alice.dis({ t: 'creer' });
  const id = alice.dernier('salon').id;
  // Dès la création, l'hôte voit sa table : un équipage d'un seul, numéro 0.
  assert.deepEqual(alice.dernier('equipage'), {
    t: 'equipage',
    joueurs: [{ slot: 0, nom: 'ALICE', coque: 'helios' }],
    moi: 0,
  });

  const bob = salle.arrive('BOB', { coque: 'vulcain' });
  bob.dis({ t: 'rejoindre', id });

  assert.deepEqual(
    bob.dernier('salon'),
    { t: 'salon', id, role: 'invite', mode: 'arcade' },
    "l'invité n'apprend pas correctement où il vient d'entrer"
  );
  // L'ancien message `pair` décrivait « l'autre » — un mot qui n'a plus de sens à
  // trois. `equipage` donne la table entière dans l'ordre des numéros, et `moi`
  // dit au destinataire lequel il est : deux invités non identifiés peuvent
  // porter le même pseudo, le nom ne suffit pas à se reconnaître.
  const joueurs = [
    { slot: 0, nom: 'ALICE', coque: 'helios' },
    { slot: 1, nom: 'BOB', coque: 'vulcain' },
  ];
  assert.deepEqual(alice.dernier('equipage'), { t: 'equipage', joueurs, moi: 0 });
  assert.deepEqual(bob.dernier('equipage'), { t: 'equipage', joueurs, moi: 1 });
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

epreuve('rejoindre l’impossible : l’inconnue, la pleine, la lancée, la sienne', (salle) => {
  const alice = salle.arrive('ALICE');
  alice.dis({ t: 'creer' });
  const sienne = alice.dernier('salon').id;
  // Une table PLEINE, c'est désormais trois : deux invités au plus.
  const { id: pleine } = salle.trio({ hote: 'CARL', invite: 'DINO', troisieme: 'FRED' });
  // Et une table en plein décompte est verrouillée : ses battements ont déjà
  // annoncé l'équipage aux assis — quelqu'un qui s'assiérait pendant les trois
  // secondes ferait mentir ce qu'ils ont sous les yeux.
  const lancee = salle.table({ hote: 'GIL', invite: 'HUGO' });
  lancee.hote.dis({ t: 'lancer' });

  const zoe = salle.arrive('ZOE');
  for (const [quoi, message] of [
    ['une table inconnue', { t: 'rejoindre', id: 'ffffffff' }],
    ['une table sans identifiant', { t: 'rejoindre' }],
    ['une table déjà pleine', { t: 'rejoindre', id: pleine }],
    ['une table en plein décompte', { t: 'rejoindre', id: lancee.id }],
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
  assert.deepEqual(salle.duo.salons.get(sienne).invites, [], 'l’hôte est devenu son propre invité');
  alice.dis({ t: 'c', f: 1 });
  assert.deepEqual(alice.bruts, [], 'l’hôte se relaie ses propres commandes');

  // Un invité déjà assis ne se rassoit pas non plus. Depuis qu'une table à deux
  // garde un siège libre, la place « disponible » pourrait être la sienne : sans
  // ce refus, il passerait par « quitter puis revenir » et arroserait la table
  // de messages de départ pour rien.
  const t2 = salle.table({ hote: 'IGOR', invite: 'JOE' });
  const partisAvant = t2.hote.des('parti').length;
  t2.invite.dis({ t: 'rejoindre', id: t2.id });
  assert.equal(t2.invite.dernier('erreur')?.code, 'salon-indisponible', 'l’invité s’est rassis');
  assert.equal(t2.hote.des('parti').length, partisAvant, 'se rasseoir a fait croire à un départ');
  assert.equal(salle.duo.salons.get(t2.id).invites.length, 1);
});

epreuve('créer deux fois ne laisse pas de table fantôme', (salle) => {
  const { hote, invite, id } = salle.table();
  hote.dis({ t: 'creer' });

  const neuf = hote.dernier('salon').id;
  assert.notEqual(neuf, id, 'la seconde table réutilise le même identifiant');
  assert.equal(salle.duo.chiffres().salons, 1, "l'ancienne table survit à son hôte");
  assert.deepEqual(
    invite.dernier('parti'),
    { t: 'parti', cause: 'change', slot: 0, hote: true },
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

epreuve('le compte à rebours part au « lancer » de l’hôte, et le serveur le tient', (salle, h) => {
  const { hote, invite } = salle.table();

  // CHANGEMENT VOULU : l'arrivée d'un invité ne déclenche plus rien. La table
  // peut attendre un troisième, et c'est l'hôte qui décide si l'on part à deux.
  h.bat(1000, 5);
  assert.equal(hote.des('compte').length, 0, 'le compte part sans l’ordre de l’hôte');

  hote.dis({ t: 'lancer' });
  // Le premier battement est immédiat : sinon les clients regardent un écran
  // muet pendant une seconde en se demandant si ça a marché.
  const depart = hote.dernier('compte')?.n;
  assert.ok(depart >= 1, 'aucun compte à rebours au moment du lancement');
  // Chaque battement porte l'équipage : l'écran d'attente affiche qui décolle,
  // et avec quel numéro, sans autre message à attendre.
  assert.deepEqual(
    hote.dernier('compte').joueurs.map((j) => [j.slot, j.nom]),
    [
      [0, 'ALICE'],
      [1, 'BOB'],
    ],
    'le décompte n’annonce pas l’équipage'
  );

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
  // Tous reçoivent EXACTEMENT la même chose : c'est ce qui les fait démarrer
  // sur la même image.
  assert.deepEqual(invite.des('compte'), hote.des('compte'), 'les deux comptes divergent');
  assert.equal(hote.des('go').length, 1, 'un seul décollage, et il a eu lieu');
  assert.equal(h.combien(1000), 0, 'le minuteur du compte tourne encore après le décollage');
});

epreuve('« lancer » n’obéit qu’à l’hôte, jamais à vide, jamais deux fois', (salle, h) => {
  // Personne à table : refusé. L'erreur n'est pas décorative — un bouton qui ne
  // fait rien sans dire pourquoi est indéboguable à distance.
  const zoe = salle.arrive('ZOE');
  zoe.dis({ t: 'lancer' });
  assert.equal(zoe.dernier('erreur')?.code, 'lancement-impossible', 'lancer sans salon passe');

  // Un hôte seul : refusé — on ne fait pas décoller une partie à un.
  const seul = salle.arrive('ALICE');
  seul.dis({ t: 'creer' });
  seul.dis({ t: 'lancer' });
  assert.equal(seul.dernier('erreur')?.code, 'lancement-impossible', 'un hôte décolle seul');
  assert.equal(h.combien(1000), 0, 'un compte à rebours est parti quand même');

  // Un invité : refusé — celui qui a ouvert la table décide du départ.
  const { hote, invite } = salle.table({ hote: 'CARL', invite: 'DINO' });
  invite.dis({ t: 'lancer' });
  assert.equal(invite.dernier('erreur')?.code, 'lancement-impossible', 'un invité lance la table');
  assert.equal(h.combien(1000), 0);

  // Deux « lancer » de suite : un SEUL compte. Deux minuteurs feraient descendre
  // le compte deux fois plus vite — et décoller deux fois, avec deux graines.
  hote.dis({ t: 'lancer' });
  hote.dis({ t: 'lancer' });
  assert.equal(hote.dernier('erreur')?.code, 'lancement-impossible');
  assert.equal(h.combien(1000), 1, 'deux comptes à rebours tournent en même temps');
  h.bat(1000, 8);
  assert.equal(hote.des('go').length, 1, 'la table a décollé deux fois');

  // Et une fois en l'air : refusé aussi, la partie est déjà lancée.
  hote.dis({ t: 'lancer' });
  assert.equal(hote.dernier('erreur')?.code, 'lancement-impossible');
  assert.equal(h.combien(1000), 0);
});

epreuve('la même graine des deux côtés, et deux rôles distincts', (salle, h) => {
  const { hote, invite } = salle.table({ mode: 'survie', coque: 'helios' });
  invite.dis({ t: 'coque', coque: 'vulcain' });
  hote.dis({ t: 'lancer' });
  h.bat(1000, 8);

  const a = hote.dernier('go');
  const b = invite.dernier('go');
  assert.ok(a && b, 'quelqu’un n’a pas décollé');
  // LA promesse du jeu à plusieurs : même graine, donc même hasard, donc même
  // partie.
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
    hote.dis({ t: 'lancer' });
    h.bat(1000, 8);
    graines.add(hote.dernier('go').graine);
    hote.dis({ t: 'quitter' });
  }
  // Cinq graines toutes égales, c'est une constante en dur, pas du hasard.
  assert.ok(graines.size > 1, `cinq parties ont toutes semé ${[...graines][0]}`);
});

epreuve('l’invité qui part avant le décollage annule le compte à rebours', (salle, h) => {
  const { hote, invite } = salle.table();
  hote.dis({ t: 'lancer' });
  const battus = hote.des('compte').length;

  invite.dis({ t: 'quitter' });
  assert.equal(h.combien(1000), 0, 'le minuteur du compte à rebours a fui');

  h.bat(1000, 5);
  assert.equal(hote.des('go').length, 0, 'l’hôte décolle seul, sans personne en face');
  assert.equal(hote.des('compte').length, battus, 'le compte continue après le départ de l’invité');
});

// --- Le trio -----------------------------------------------------------------

epreuve('trois pilotes s’assoient, et chacun connaît tout l’équipage', (salle) => {
  const { hote, invite, troisieme } = salle.trio();
  // Le troisième change de coque dans la salle d'attente : les DEUX autres
  // doivent le voir, pas seulement l'hôte.
  troisieme.dis({ t: 'coque', coque: 'vulcain' });

  const joueurs = [
    { slot: 0, nom: 'ALICE', coque: 'orion' },
    { slot: 1, nom: 'BOB', coque: 'orion' },
    { slot: 2, nom: 'EVE', coque: 'vulcain' },
  ];
  assert.deepEqual(hote.dernier('equipage'), { t: 'equipage', joueurs, moi: 0 });
  assert.deepEqual(invite.dernier('equipage'), { t: 'equipage', joueurs, moi: 1 });
  assert.deepEqual(troisieme.dernier('equipage'), { t: 'equipage', joueurs, moi: 2 });
  assert.equal(troisieme.dernier('salon').role, 'invite');
});

epreuve('le quatrième est refusé : une table porte deux invités au plus', (salle) => {
  const { id } = salle.trio();
  const zoe = salle.arrive('ZOE');
  zoe.dis({ t: 'rejoindre', id });

  // Deux et trois sont les seuls effectifs que la table de difficulté du jeu
  // connaisse : un quatrième jouerait une partie sans règles.
  assert.equal(zoe.dernier('erreur')?.code, 'salon-indisponible', 'le quatrième s’est assis');
  assert.equal(zoe.c.salon, null);
  assert.equal(salle.duo.salons.get(id).invites.length, 2);
});

epreuve('le décompte à trois : mêmes battements, même graine, trois numéros', (salle, h) => {
  const { hote, invite, troisieme } = salle.trio();
  hote.dis({ t: 'lancer' });
  h.bat(1000, 8);

  const gos = [hote, invite, troisieme].map((c) => c.dernier('go'));
  assert.ok(gos.every(Boolean), 'quelqu’un n’a pas décollé');
  assert.equal(new Set(gos.map((g) => g.graine)).size, 1, 'trois graines différentes');
  // Chacun son numéro, même liste pour tous : cet ordre est celui de
  // l'application des commandes, il ne peut pas être un point de vue.
  assert.deepEqual(
    gos.map((g) => g.moi),
    [0, 1, 2]
  );
  assert.deepEqual(gos[0].joueurs, [
    { slot: 0, nom: 'ALICE', coque: 'orion' },
    { slot: 1, nom: 'BOB', coque: 'orion' },
    { slot: 2, nom: 'EVE', coque: 'orion' },
  ]);
  assert.deepEqual(gos[1].joueurs, gos[0].joueurs);
  assert.deepEqual(gos[2].joueurs, gos[0].joueurs);
  assert.deepEqual(invite.des('compte'), hote.des('compte'), 'les comptes divergent');
  assert.deepEqual(troisieme.des('compte'), hote.des('compte'));
});

epreuve(
  'un invité qui part avant le décollage : le compte s’annule, on repart à deux',
  (salle, h) => {
    const { hote, invite, troisieme } = salle.trio();
    hote.dis({ t: 'lancer' });
    invite.dis({ t: 'quitter' });

    // Les battements annonçaient un équipage à trois qui n'existe plus : le compte
    // s'annule, et l'hôte relancera avec le bon.
    assert.equal(h.combien(1000), 0, 'le minuteur du compte a fui');
    h.bat(1000, 5);
    assert.equal(hote.des('go').length, 0, 'la table a décollé avec un fantôme');

    // Les restants apprennent QUI est parti — par son numéro, jamais par « lui » :
    // c'est la leçon de l'échange de vaisseaux du mode rejoindre.
    const attendu = { t: 'parti', cause: 'quitte', slot: 1, hote: false };
    assert.deepEqual(hote.dernier('parti'), attendu);
    assert.deepEqual(troisieme.dernier('parti'), attendu);
    // Et l'équipage est rejoué : au hall, EVE glisse au numéro 1.
    assert.deepEqual(troisieme.dernier('equipage'), {
      t: 'equipage',
      joueurs: [
        { slot: 0, nom: 'ALICE', coque: 'orion' },
        { slot: 1, nom: 'EVE', coque: 'orion' },
      ],
      moi: 1,
    });

    hote.dis({ t: 'lancer' });
    h.bat(1000, 8);
    const go = troisieme.dernier('go');
    assert.equal(go?.moi, 1, 'EVE décolle avec son ancien numéro');
    assert.equal(go.joueurs.length, 2, 'le décollage compte un absent');
  }
);

epreuve('une commande réclamée traverse la table comme les autres', (salle) => {
  const { hote, invite, troisieme } = salle.trio();
  const temoin = salle.arrive('ZOE');

  // Une socket meurt — changement de réseau, écran verrouillé, serveur
  // redémarré — et tout ce qui part pendant ce temps-là disparaît sans un mot.
  // Le pas verrouillé s'arrête alors sur l'image manquante et n'en repart
  // jamais : il faut pouvoir la réclamer.
  const cri = '{"de":0,"t":"redemande","j":2,"f":412}';
  troisieme.dis(cri);
  assert.deepEqual(hote.bruts, [cri], 'la réclamation n’atteint pas celui qu’elle vise');
  assert.deepEqual(invite.bruts, [cri], 'la réclamation doit passer par la table, telle quelle');
  assert.deepEqual(troisieme.bruts, [], 'la réclamation revient à son émetteur');
  assert.deepEqual(temoin.bruts, [], 'la réclamation fuit hors de la table');
});

epreuve('la photo de frontière et les empreintes passent par la table', (salle) => {
  const { hote, invite, troisieme } = salle.trio();
  const temoin = salle.arrive('ZOE');

  // L'hôte photographie sa partie au début du tableau : toute la table reçoit,
  // verbatim — le serveur n'a pas à savoir à quoi ressemble un instantané.
  const photo = '{"d":{"w":3,"bords":[null]},"t":"etat-vague","j":0}';
  hote.dis(photo);
  assert.deepEqual(invite.bruts, [photo], 'la photo n’atteint pas l’invité');
  assert.deepEqual(troisieme.bruts, [photo], 'la photo n’atteint pas le troisième');
  assert.deepEqual(hote.bruts, [], 'la photo revient à son expéditeur');
  assert.deepEqual(temoin.bruts, [], 'la photo fuit hors de la table');

  // Les empreintes croisées suivent : le canal des amis exige l'amitié, la
  // table ne l'exige pas — deux invités d'une table publique doivent pouvoir
  // se comparer quand même.
  const emp = '{"d":{"f":60,"e":[1,8]},"t":"emp","j":2}';
  troisieme.dis(emp);
  assert.deepEqual(invite.bruts, [photo, emp], 'l’empreinte n’atteint pas l’autre invité');
  assert.deepEqual(hote.bruts, [emp], 'l’empreinte n’atteint pas l’hôte');
  assert.equal(salle.demandes.length, 0, 'la table a consulté la base d’amitié');
});

epreuve('la pause voyage comme une commande : verbatim, à toute la table', (salle) => {
  const { hote, invite, troisieme } = salle.trio();
  const temoin = salle.arrive('ZOE');

  // Verbatim : le serveur n'a pas à connaître la forme d'une pause — champ
  // inconnu conservé, rien de relu, rien de re-sérialisé.
  const trame = '{"oui":true,"t":"pause","nom":"BOB","extra":"garde-moi"}';
  invite.dis(trame);
  assert.deepEqual(hote.bruts, [trame], 'la pause n’arrive pas chez l’hôte');
  assert.deepEqual(troisieme.bruts, [trame], 'la pause n’atteint pas l’autre invité');
  assert.deepEqual(invite.bruts, [], 'la pause revient à son expéditeur');
  assert.deepEqual(temoin.bruts, [], 'la pause fuit hors de la table');

  // La reprise suit le même chemin — n'importe qui peut relancer la table.
  const reprise = '{"oui":false,"t":"pause","nom":"ALICE"}';
  hote.dis(reprise);
  // L'invité avait ÉMIS la pause : il ne la reçoit pas en retour, il ne reçoit
  // que la reprise. Le troisième, lui, a tout vu passer.
  assert.deepEqual(invite.bruts, [reprise], 'l’invité n’apprend pas la reprise');
  assert.deepEqual(troisieme.bruts, [trame, reprise], 'le troisième n’apprend pas la reprise');
});

epreuve('le relais atteint les deux autres, jamais l’expéditeur', (salle) => {
  const { hote, invite, troisieme } = salle.trio();
  const temoin = salle.arrive('ZOE');

  // Un champ que le serveur ne connaît pas, et un ordre de clés inhabituel : si
  // quelqu'un remplace le relais par une re-sérialisation, ça se voit ici.
  const trame = '{"f":42,"t":"c","d":[1,-1,0],"inconnu":"garde-moi"}';
  invite.dis(trame);
  assert.deepEqual(hote.bruts, [trame], 'la commande n’arrive pas intacte chez l’hôte');
  assert.deepEqual(troisieme.bruts, [trame], 'la commande n’atteint pas l’autre invité');
  assert.deepEqual(
    hote.recus.filter((m) => m.t === 'c'),
    [],
    'le relais relit la commande'
  );
  assert.deepEqual(invite.bruts, [], 'la commande revient à son expéditeur');
  assert.deepEqual(temoin.bruts, [], 'la commande fuit vers un client hors de la table');

  // La fin de partie suit le même chemin : chacun l'annonce aux deux autres,
  // pour qu'ils affichent son score.
  const fin = '{"t":"fin","score":12345,"vague":7}';
  hote.dis(fin);
  assert.deepEqual(invite.bruts, [fin], 'un joueur n’apprend pas la fin, ni le score');
  assert.deepEqual(troisieme.bruts, [trame, fin]);
});

epreuve('une table de trio qui expire prévient les DEUX invités', (salle, h) => {
  const { hote, invite, troisieme, id } = salle.trio();
  const avant = invite.des('salons').length;
  // Le téléphone de l'hôte sort du réseau avant le décollage : la table meurt,
  // et il faut le dire à TOUS — en oublier un le laisserait devant un écran
  // d'attente pour une partie qui n'existera jamais.
  hote.meurt();
  h.bat(12_000);

  assert.equal(salle.duo.salons.has(id), false, 'la table d’un hôte disparu survit');
  for (const co of [invite, troisieme]) {
    assert.deepEqual(co.dernier('parti'), { t: 'parti', cause: 'expire', slot: 0, hote: true });
    assert.equal(co.c.salon, null, 'un invité reste rattaché à une table disparue');
  }
  assert.ok(invite.des('salons').length > avant, 'libéré sans liste pour choisir une autre table');
});

epreuve('en pleine partie, le numéro annoncé est celui du décollage', (salle, h) => {
  const { hote, invite, troisieme } = salle.trio();
  hote.dis({ t: 'lancer' });
  h.bat(1000, 8);
  assert.ok(troisieme.dernier('go'), 'la partie n’a pas décollé');

  const spectateur = salle.arrive('ZOE');
  // BOB (numéro 1) part : la partie CONTINUE pour les deux autres, et la table
  // ne redevient pas une invitation sous leurs pieds.
  invite.dis({ t: 'quitter' });
  assert.deepEqual(hote.dernier('parti'), { t: 'parti', cause: 'quitte', slot: 1, hote: false });
  assert.equal(spectateur.dernier('salons').l.length, 0, 'une table en pleine partie est proposée');

  // EVE part à son tour : son numéro est TOUJOURS 2, celui du décollage. Sans
  // l'équipage figé, la liste retassée des présents l'aurait renumérotée 1 — et
  // le client aurait retiré de l'écran le bord d'un joueur encore en vie.
  troisieme.dis({ t: 'quitter' });
  assert.deepEqual(hote.dernier('parti'), { t: 'parti', cause: 'quitte', slot: 2, hote: false });

  // Plus personne en face : l'hôte finit sa partie seul, et sa table redevient
  // une simple invitation — le comportement du duo d'aujourd'hui.
  assert.equal(spectateur.dernier('salons').l.length, 1, 'la table vidée n’est pas reproposée');
});

epreuve('à trois, la table survit à son hôte en pleine partie, et le relais aussi', (salle, h) => {
  const { hote, invite, troisieme, id } = salle.trio();
  hote.dis({ t: 'lancer' });
  h.bat(1000, 8);

  hote.dis({ t: 'quitter' });
  // Les deux restants apprennent le départ par son numéro — et `hote: false` :
  // leur place tient toujours. Si la table mourait avec son hôte, plus de
  // relais, et leurs deux simulations divergeraient à la première commande.
  const attendu = { t: 'parti', cause: 'quitte', slot: 0, hote: false };
  assert.deepEqual(invite.dernier('parti'), attendu);
  assert.deepEqual(troisieme.dernier('parti'), attendu);
  assert.ok(salle.duo.salons.has(id), 'la table est morte sous les deux survivants');

  // Le premier invité hérite du rôle, et l'apprend par un nouveau `salon`.
  assert.deepEqual(invite.dernier('salon'), { t: 'salon', id, role: 'hote', mode: 'arcade' });

  const trame = '{"f":9,"t":"c","d":[1,0,0]}';
  invite.dis(trame);
  assert.deepEqual(troisieme.bruts, [trame], 'le relais est mort avec l’ancien hôte');
  assert.deepEqual(hote.bruts, [], 'l’ancien hôte reçoit encore des commandes');
});

epreuve('l’hôte promu qui part à son tour est annoncé par SON numéro, pas par 0', (salle, h) => {
  const { hote, invite, troisieme, id } = salle.trio();
  hote.dis({ t: 'lancer' });
  h.bat(1000, 8);

  // L'hôte d'origine part : BOB (numéro 1) est promu, EVE (numéro 2) reste.
  hote.dis({ t: 'quitter' });
  // Puis BOB part aussi. La table meurt sous EVE — mais le partant est le
  // NUMÉRO 1 du décollage, pas le rôle « hôte ». Annoncer 0 désignerait
  // quelqu'un de déjà parti : la survivante attendrait les commandes du vrai
  // partant comme un fantôme, cinq secondes durant, avant le filet des muets.
  invite.dis({ t: 'quitter' });
  assert.deepEqual(troisieme.dernier('parti'), {
    t: 'parti',
    cause: 'quitte',
    slot: 1,
    hote: true,
  });
  assert.equal(salle.duo.salons.has(id), false, 'une table à un seul survivant a survécu');

  // Même règle quand c'est le balayage qui révèle la mort du promu.
  const bis = salle.trio({ hote: 'ANNA', invite: 'BORIS', troisieme: 'EMMA' });
  bis.hote.dis({ t: 'lancer' });
  h.bat(1000, 8);
  bis.hote.dis({ t: 'quitter' });
  bis.invite.meurt();
  h.bat(12_000);
  assert.deepEqual(bis.troisieme.dernier('parti'), {
    t: 'parti',
    cause: 'expire',
    slot: 1,
    hote: true,
  });
});

epreuve('à deux, l’hôte qui part en pleine partie ferme la table, comme avant', (salle, h) => {
  const { hote, invite, id } = salle.table();
  hote.dis({ t: 'lancer' });
  h.bat(1000, 8);
  hote.dis({ t: 'quitter' });

  // Un seul survivant repasse au régime solo : il n'a plus besoin du relais, la
  // table meurt et il retourne au hall — le comportement d'aujourd'hui, gardé.
  assert.deepEqual(invite.dernier('parti'), { t: 'parti', cause: 'quitte', slot: 0, hote: true });
  assert.equal(salle.duo.salons.has(id), false, 'une table sans personne à relier survit');
  assert.equal(invite.c.salon, null);
});

epreuve(
  'l’hôte qui meurt en pleine partie à trois : le balayage promeut au lieu de tuer',
  (salle, h) => {
    const { hote, invite, troisieme, id } = salle.trio();
    hote.dis({ t: 'lancer' });
    h.bat(1000, 8);

    // Son téléphone sort du réseau : rien ne se ferme, la socket est muette. Le
    // balayage la révèle — et il doit prendre le même chemin qu'un départ propre,
    // pas celui de la table abandonnée : on joue encore à deux dessus.
    hote.meurt();
    h.bat(12_000);

    assert.ok(salle.duo.salons.has(id), 'le balayage a tué une table où l’on joue encore à deux');
    assert.deepEqual(invite.dernier('parti'), {
      t: 'parti',
      cause: 'expire',
      slot: 0,
      hote: false,
    });
    assert.deepEqual(invite.dernier('salon'), { t: 'salon', id, role: 'hote', mode: 'arcade' });
    const trame = '{"f":12,"t":"c","d":[0,0,1]}';
    troisieme.dis(trame);
    assert.deepEqual(invite.bruts, [trame], 'le relais n’a pas survécu au balayage');
  }
);

// --- Le relais ---------------------------------------------------------------

epreuve('à deux, la commande passe au voisin tel quel, et à lui seul', (salle) => {
  const { hote, invite } = salle.table();
  const temoin = salle.arrive('CARL');

  const trame = '{"f":42,"t":"c","d":[1,-1,0],"inconnu":"garde-moi"}';
  invite.dis(trame);
  assert.deepEqual(hote.bruts, [trame], 'la commande n’arrive pas intacte chez le voisin');
  assert.deepEqual(invite.bruts, [], 'la commande revient à son expéditeur');
  assert.deepEqual(temoin.bruts, [], 'la commande fuit vers un client hors de la table');
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

epreuve('l’hôte qui part du hall ferme la table, et TOUS les invités l’apprennent', (salle) => {
  // Un trio, pas un duo : à deux invités, n'en prévenir qu'un laisserait l'autre
  // devant un écran d'attente pour une table qui n'existe plus.
  const { hote, invite, troisieme, id } = salle.trio();
  hote.dis({ t: 'quitter' });

  for (const co of [invite, troisieme]) {
    assert.deepEqual(
      co.dernier('parti'),
      { t: 'parti', cause: 'quitte', slot: 0, hote: true },
      "un invité n'apprend pas que la table a fermé"
    );
    assert.equal(co.c.salon, null, "l'invité reste rattaché à une table disparue");
    // Et il retombe dans le hall avec une liste fraîche, sans avoir à la demander.
    assert.ok(co.dernier('salons'), "l'invité éjecté n'a pas de quoi choisir une autre table");
  }
  assert.equal(salle.duo.salons.has(id), false, 'la table survit à son hôte');
});

epreuve('l’invité qui part laisse la table ouverte', (salle) => {
  const spectateur = salle.arrive('CARL');
  const { hote, invite, id } = salle.table();
  invite.dis({ t: 'quitter' });

  assert.deepEqual(
    hote.dernier('parti'),
    { t: 'parti', cause: 'quitte', slot: 1, hote: false },
    "l'hôte n'apprend pas que son invité s'en va"
  );
  assert.equal(salle.duo.salons.has(id), true, "la table de l'hôte a été fermée sans lui");
  assert.equal(hote.c.salon, id, "l'hôte a été renvoyé au hall alors qu'il pouvait attendre");
  const vue = spectateur.dernier('salons').l;
  assert.equal(vue.length, 1, 'la table libérée n’est pas reproposée');
  assert.equal(vue[0].assis, 1, 'la vitrine compte encore l’invité parti');
});

epreuve('une déconnexion vaut un départ', (salle) => {
  const { hote, invite } = salle.table();
  const avant = salle.duo.chiffres().clients;

  invite.ferme();
  assert.deepEqual(
    hote.dernier('parti'),
    { t: 'parti', cause: 'deconnexion', slot: 1, hote: false },
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
    { t: 'parti', cause: 'expire', slot: 0, hote: true },
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
  assert.equal(salle.duo.salons.has(occupee), true, 'une table où l’on s’assoit a été balayée');
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
  hote.dis({ t: 'lancer' });
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

// --- DEMANDER À REGARDER LA PARTIE D'UN COPAIN --------------------------------
//
// Le parcours le plus demandé du jeu, et le seul qui n'avait AUCUNE épreuve :
// Paul a signalé « quand je clique sur regarder, il ne voit pas ma demande ».
// La transmission, elle, marchait — mesuré des deux côtés sur le banc. Mais
// rien ne l'empêchait de cesser de marcher demain, et personne ne l'aurait vu.

epreuve('une demande de regard atteint un copain EN PLEINE PARTIE', (salle) => {
  const louis = salle.arrive('LOUIS', { mode: 'survie' });
  const paul = salle.arrive('PAUL');
  // LOUIS joue : c'est précisément l'instant où l'on veut le regarder, et
  // c'est celui où il ne faut surtout pas que le message se perde.
  louis.dis({ t: 'joue', oui: true });
  const presence = paul.dernier('presence');
  assert.equal(presence.l.LOUIS?.partie, true, 'la présence doit dire qu’il joue');

  paul.dis({ t: 'signal', vers: 'LOUIS', sujet: 'regarde', d: null });
  const recu = louis.dernier('signal');
  assert.ok(recu, 'la demande n’arrive pas chez le joueur en partie');
  assert.equal(recu.sujet, 'regarde');
  assert.equal(recu.de, 'PAUL', 'la demande doit dire de qui elle vient');

  // Et la réponse repart par le même chemin.
  louis.dis({ t: 'signal', vers: 'PAUL', sujet: 'regard-oui', d: null });
  assert.equal(paul.dernier('signal')?.sujet, 'regard-oui', 'l’acceptation n’arrive pas');
});

epreuve('une demande de regard ne part pas vers un inconnu', (salle) => {
  const louis = salle.arrive('LOUIS');
  const etranger = salle.arrive('ZOE');
  salle.amitie = () => false;
  etranger.dis({ t: 'signal', vers: 'LOUIS', sujet: 'regarde', d: null });
  assert.deepEqual(louis.des('signal'), [], 'un inconnu peut demander à regarder');
});

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

  // Cette chaîne s'affiche chez les autres joueurs et dans la liste des
  // invitations : tout ce qui vient du réseau doit être ramené à un identifiant
  // connu.
  for (const inventee of ['<script>', 'ORION', '', 42, null, { coque: 'orion' }]) {
    alice.dis({ t: 'coque', coque: inventee });
    assert.equal(alice.c.coque, 'orion', `la coque ${JSON.stringify(inventee)} a été acceptée`);
  }
  alice.dis({ t: 'coque', coque: 'vulcain' });
  assert.equal(alice.c.coque, 'vulcain', 'une coque légitime est refusée');

  // Et le changement rejoue la liste : l'invitation porte la coque de son hôte.
  alice.dis({ t: 'creer' });
  assert.equal(spectateur.dernier('salons').l[0].coque, 'vulcain');

  // Même assis à sa table : elle reste en vitrine tant qu'il reste un siège, et
  // la vitrine doit suivre — avant, une table d'un seul gardait l'ancien
  // vaisseau à l'affiche jusqu'au prochain balayage.
  alice.dis({ t: 'coque', coque: 'helios' });
  assert.equal(
    spectateur.dernier('salons').l[0].coque,
    'helios',
    'la vitrine garde l’ancienne coque'
  );
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

// --- Ce que les autres joueurs apprennent, et quand ---------------------------

epreuve('changer de coque dans la salle d’attente prévient toute la table', (salle) => {
  const { hote, invite } = salle.table();
  const avant = invite.des('equipage').length;

  hote.dis({ t: 'coque', coque: 'vulcain' });

  // La ligne fautive passait `c.salon` — l'IDENTIFIANT — à une méthode qui attend
  // le SALON. `s.hote` valait alors undefined, la garde d'entrée renvoyait sans
  // rien faire, et l'invité gardait sous les yeux le vaisseau d'avant jusqu'au
  // décompte. Aucune erreur nulle part : juste un message qui ne partait pas.
  assert.ok(invite.des('equipage').length > avant, 'le changement de coque n’a prévenu personne');
  const equipage = invite.dernier('equipage');
  assert.equal(equipage.joueurs[0].coque, 'vulcain');
  assert.equal(equipage.joueurs[0].nom, 'ALICE');
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
  // Pas de numéro ici : personne n'est parti, c'est la table elle-même qui meurt.
  assert.ok(!('slot' in parti), 'l’expiration invente le numéro d’un partant');
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
