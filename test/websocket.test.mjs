// LE CADRAGE WEBSOCKET, ET LES OCTETS QUI ARRIVENT EN DÉSORDRE.
//
// C'est le seul endroit du serveur où l'on décode des octets venus du réseau à la
// main. Tout le reste manipule des objets ; ici on manipule des décalages, des
// bornes et un XOR. Une erreur d'un octet ne plante pas : elle décale un message,
// coupe un accent en deux, ou fait attendre une trame qui est déjà là.
//
// Et surtout : TCP ne livre pas des trames, il livre des morceaux. Une trame peut
// arriver coupée en deux, trois trames peuvent arriver collées dans un seul
// paquet, un en-tête peut être tranché au milieu de sa longueur sur seize bits.
// Ça ne se produit presque jamais en local — et systématiquement sur un téléphone
// en 4G, c'est-à-dire chez le joueur. Ces épreuves rejouent ces découpages-là,
// parce que personne ne les rejouera à la main.
//
// On éprouve la classe avec une fausse socket : aucun port ouvert, aucune attente,
// et les octets écrits par le serveur sont relus et vérifiés un par un.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Connexion, brancheWebSocket } from '../server/websocket.js';

// --- Outillage ---------------------------------------------------------------

// Une socket qui ne fait rien d'autre que noter ce qu'on lui écrit. Elle porte
// tout ce que la Connexion attend d'une vraie : les événements, `destroyed`, et
// les deux réglages TCP posés à la construction.
function fausseSocket() {
  const s = new EventEmitter();
  s.ecrits = [];
  s.destroyed = false;
  s.delaiInactivite = null;
  s.sansDelai = false;
  s.write = (b) => {
    s.ecrits.push(Buffer.from(b));
    return true;
  };
  s.destroy = () => {
    if (s.destroyed) return;
    s.destroyed = true;
    s.emit('close');
  };
  s.setTimeout = (ms, fn) => {
    s.delaiInactivite = { ms, fn };
  };
  s.setNoDelay = (v) => {
    s.sansDelai = v;
  };
  return s;
}

// La clé de masquage de l'exemple de la RFC 6455 : quatre octets tous différents
// et tous non nuls, pour qu'un démasquage qui oublierait la rotation `n & 3` —
// ou qui n'aurait pas lieu du tout — donne un résultat visiblement faux.
const CLE = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);

// Fabrique une trame TELLE QU'UN CLIENT L'ENVOIE : masquée, en-tête minimal.
function trameClient(opcode, charge, { fin = true, cle = CLE, masque = true } = {}) {
  const p = Buffer.isBuffer(charge) ? charge : Buffer.from(String(charge), 'utf8');
  const n = p.length;
  let tete;
  if (n < 126) {
    tete = Buffer.alloc(2);
    tete[1] = n;
  } else if (n < 65536) {
    tete = Buffer.alloc(4);
    tete[1] = 126;
    tete.writeUInt16BE(n, 2);
  } else {
    tete = Buffer.alloc(10);
    tete[1] = 127;
    tete.writeUInt32BE(0, 2);
    tete.writeUInt32BE(n, 6);
  }
  tete[0] = (fin ? 0x80 : 0) | opcode;
  if (!masque) return Buffer.concat([tete, p]);
  tete[1] |= 0x80;
  const brouillee = Buffer.alloc(n);
  for (let i = 0; i < n; i++) brouillee[i] = p[i] ^ cle[i & 3];
  return Buffer.concat([tete, cle, brouillee]);
}

// Un en-tête seul, qui ANNONCE une taille sans jamais l'envoyer : c'est ainsi
// qu'on éprouve le plafond sans allouer un gigaoctet.
function enteteGeante(haut, bas) {
  const t = Buffer.alloc(10);
  t[0] = 0x81;
  t[1] = 0x80 | 127;
  t.writeUInt32BE(haut, 2);
  t.writeUInt32BE(bas, 6);
  return t;
}

// Relit une trame écrite PAR LE SERVEUR (donc jamais masquée).
function litTrameServeur(buf) {
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masque = (buf[1] & 0x80) !== 0;
  let taille = buf[1] & 0x7f;
  let entete = 2;
  if (taille === 126) {
    taille = buf.readUInt16BE(2);
    entete = 4;
  } else if (taille === 127) {
    taille = Number(buf.readBigUInt64BE(2));
    entete = 10;
  }
  return { fin, opcode, masque, taille, entete, charge: buf.subarray(entete, entete + taille) };
}

function branche() {
  const socket = fausseSocket();
  const co = new Connexion(socket, { url: new URL('http://x/duo') });
  const recus = [];
  const fermetures = [];
  co.onMessage = (m) => recus.push(m);
  co.onClose = () => fermetures.push(1);
  return {
    socket,
    co,
    recus,
    fermetures,
    // Ce que le client envoie arrive par l'événement `data`, en morceaux choisis.
    envoie: (...morceaux) => morceaux.forEach((m) => socket.emit('data', m)),
    trames: () => socket.ecrits.map(litTrameServeur),
  };
}

// --- Décodage : les tailles et leurs bornes -----------------------------------

test('une trame courte est démasquée et livrée telle quelle', () => {
  const w = branche();
  w.envoie(trameClient(0x1, 'PRÊT'));
  assert.deepEqual(w.recus, ['PRÊT']);
});

test('le démasquage suit bien la rotation de la clé sur quatre octets', () => {
  // Une charge dont la longueur n'est pas un multiple de quatre : si quelqu'un
  // remplace `cle[n & 3]` par `cle[0]` ou oublie le XOR, le message ressort en
  // charabia plutôt qu'en erreur bruyante.
  const w = branche();
  const brut = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x42]);
  w.envoie(trameClient(0x2, brut));
  assert.equal(w.recus.length, 1);
  assert.deepEqual(w.recus[0], brut, 'la charge démasquée ne correspond pas à ce qui a été envoyé');
});

test('la borne exacte 125 / 126 : les deux encodages de taille se décodent', () => {
  // 125 tient dans les sept bits de l'en-tête court ; 126 bascule sur seize bits.
  // C'est le décalage de deux octets le plus facile à rater du protocole.
  for (const n of [0, 1, 125, 126, 127, 300]) {
    const w = branche();
    const charge = 'x'.repeat(n);
    w.envoie(trameClient(0x1, charge));
    assert.equal(w.recus.length, 1, `taille ${n} : aucun message livré`);
    assert.equal(w.recus[0].length, n, `taille ${n} : longueur livrée fausse`);
    assert.equal(w.recus[0], charge, `taille ${n} : contenu abîmé`);
  }
});

test('une trame de charge vide est livrée, pas ignorée', () => {
  // Le zéro est le cas où l'on saute par-dessus le corps sans le lire : facile à
  // transformer en « on attend encore des octets » et à faire disparaître.
  const w = branche();
  w.envoie(trameClient(0x1, ''));
  assert.deepEqual(w.recus, ['']);
  assert.ok(w.co.ouverte, 'une trame vide ne doit pas fermer la connexion');
});

test('la plus grosse trame que seize bits peuvent porter passe entière', () => {
  const w = branche();
  const charge = Buffer.alloc(65535, 0x5a);
  w.envoie(trameClient(0x2, charge));
  assert.equal(w.recus.length, 1, '65 535 octets refusés alors qu’ils sont sous le plafond');
  assert.deepEqual(w.recus[0], charge);
});

test('une trame annoncée trop grosse est refusée AVANT que la charge n’arrive', () => {
  // Le plafond n'est pas un réglage de performance : c'est ce qui empêche un
  // client d'annoncer un gigaoctet et de faire grossir notre tampon jusqu'à la
  // panne. Il doit donc trancher sur le seul en-tête.
  const w = branche();
  w.envoie(enteteGeante(0, 1024 * 1024));
  const t = w.trames();
  assert.equal(t.length, 1, 'le serveur n’a pas répondu à une trame démesurée');
  assert.equal(t[0].opcode, 0x8, 'la réponse n’est pas une fermeture');
  assert.equal(t[0].charge.readUInt16BE(0), 1009, 'le code de fermeture n’est pas 1009 (trop gros)');
  assert.equal(w.co.ouverte, false);
  assert.equal(w.recus.length, 0);
});

test('une taille sur soixante-quatre bits qui déborde l’entier sûr est refusée', () => {
  // La moitié haute est le piège : `[1, 0]` annonce quatre gigaoctets, mais sa
  // moitié BASSE vaut zéro. Qui ne regarderait que celle-ci verrait une trame
  // vide, parfaitement acceptable, et se désynchroniserait sur tout ce qui suit.
  for (const [haut, bas] of [
    [0xffffffff, 0xffffffff],
    [1, 0],
    [0, 0x80000000],
  ]) {
    const w = branche();
    w.envoie(enteteGeante(haut, bas));
    const t = w.trames();
    assert.equal(t.length, 1, `taille ${haut}:${bas} acceptée sans un mot`);
    assert.equal(t[0].opcode, 0x8, `taille ${haut}:${bas} : pas de fermeture`);
    assert.equal(t[0].charge.readUInt16BE(0), 1009, `taille ${haut}:${bas} : mauvais code`);
    assert.equal(w.recus.length, 0);
  }
});

test('le plafond tombe exactement à 64 Kio : 64 Kio passe, un octet de plus est refusé', () => {
  // Le plafond n'est pas un réglage de confort mais une porte, et une porte se
  // vérifie au millimètre. On épingle donc sa valeur : si quelqu'un la déplace,
  // c'est une décision de sécurité qui mérite qu'on relise ce test plutôt qu'un
  // chiffre qui glisse au passage d'un autre correctif.
  const PLAFOND = 64 * 1024;
  const w = branche();
  const juste = Buffer.alloc(PLAFOND, 0x2a);
  w.envoie(trameClient(0x2, juste));
  assert.equal(w.recus.length, 1, '64 Kio pile a été refusé alors qu’il est sous le plafond');
  assert.deepEqual(w.recus[0], juste, 'la plus grosse trame permise revient abîmée');
  assert.ok(w.co.ouverte);

  const trop = branche();
  trop.envoie(enteteGeante(0, PLAFOND + 1));
  const t = trop.trames();
  assert.equal(t.length, 1, '64 Kio + 1 octet est passé sans un mot');
  assert.equal(t[0].charge.readUInt16BE(0), 1009);
});

// --- Décodage : ce qu'on refuse ----------------------------------------------

test('une trame non masquée est refusée, même parfaitement formée par ailleurs', () => {
  // Tout ce qui vient d'un client DOIT être masqué. Une trame nue est soit un
  // bogue, soit quelqu'un qui parle un autre protocole sur notre port.
  const w = branche();
  w.envoie(trameClient(0x1, 'bonjour', { masque: false }));
  assert.equal(w.recus.length, 0, 'une trame non masquée a été livrée au salon');
  const t = w.trames();
  assert.equal(t[0].opcode, 0x8);
  assert.equal(t[0].charge.readUInt16BE(0), 1002, 'le code de fermeture n’est pas 1002 (protocole)');
  assert.equal(t[0].charge.subarray(2).toString(), 'non-masquee');
});

test('un opcode inconnu ferme la connexion au lieu d’être ignoré', () => {
  const w = branche();
  w.envoie(trameClient(0x3, 'quoi'));
  assert.equal(w.recus.length, 0);
  const t = w.trames();
  assert.equal(t[0].opcode, 0x8);
  assert.equal(t[0].charge.readUInt16BE(0), 1002);
  assert.equal(t[0].charge.subarray(2).toString(), 'opcode');
});

// --- Décodage : fragmentation applicative -------------------------------------

test('un message fragmenté est recollé et livré une seule fois', () => {
  const w = branche();
  w.envoie(
    trameClient(0x1, 'HYPER', { fin: false }),
    trameClient(0x0, 'NO', { fin: false }),
    trameClient(0x0, 'VA')
  );
  assert.deepEqual(w.recus, ['HYPERNOVA'], 'les morceaux n’ont pas été recollés en un seul message');
});

test('un ping glissé au milieu d’un message fragmenté ne le casse pas', () => {
  // Une trame de contrôle a le droit de s'intercaler entre deux fragments. Si le
  // ping se retrouvait dans le tampon de fragments, le message livré serait
  // corrompu — et personne ne saurait d'où vient le JSON invalide.
  const w = branche();
  w.envoie(trameClient(0x1, 'DÉ', { fin: false }));
  w.envoie(trameClient(0x9, 'toc'));
  w.envoie(trameClient(0x0, 'COLLAGE'));
  assert.deepEqual(w.recus, ['DÉCOLLAGE'], 'le ping s’est invité dans le message');
  const t = w.trames();
  assert.equal(t.length, 1, 'le ping n’a pas reçu de réponse');
  assert.equal(t[0].opcode, 0xa, 'la réponse à un ping doit être un pong');
});

// --- Décodage : ping, pong, fermeture -----------------------------------------

test('un ping revient en pong avec exactement la même charge', () => {
  // La RFC impose de renvoyer la charge telle quelle : certains clients y mettent
  // un horodatage et mesurent la latence dessus.
  const w = branche();
  w.envoie(trameClient(0x9, 'ping-42'));
  const t = w.trames();
  assert.equal(t.length, 1);
  assert.equal(t[0].opcode, 0xa);
  assert.equal(t[0].fin, true, 'le pong doit porter le bit FIN');
  assert.equal(t[0].charge.toString(), 'ping-42');
  assert.equal(w.recus.length, 0, 'un ping n’est pas un message du jeu');
});

test('un pong reçu ne déclenche rien du tout', () => {
  const w = branche();
  w.envoie(trameClient(0xa, 'ping-42'));
  assert.equal(w.socket.ecrits.length, 0, 'un pong ne doit pas provoquer d’écriture');
  assert.equal(w.recus.length, 0);
  assert.ok(w.co.ouverte, 'un pong ne doit pas fermer la connexion');
});

test('une fermeture du client reçoit une fermeture en retour, avec un code', () => {
  const w = branche();
  w.envoie(trameClient(0x8, Buffer.alloc(0)));
  const t = w.trames();
  assert.equal(t.length, 1);
  assert.equal(t[0].opcode, 0x8);
  assert.equal(t[0].charge.readUInt16BE(0), 1000, 'une fermeture propre doit répondre 1000');
  assert.equal(w.co.ouverte, false);
  assert.equal(w.fermetures.length, 1, 'le salon n’a pas été prévenu du départ');
});

test('ce qui suit une trame de fermeture dans le même paquet est ignoré', () => {
  // Sinon un client peut continuer à parler après avoir dit au revoir, et le
  // salon traite les commandes d'un joueur qu'il a déjà retiré de sa liste.
  const w = branche();
  w.envoie(Buffer.concat([trameClient(0x8, Buffer.alloc(0)), trameClient(0x1, 'encore moi')]));
  assert.equal(w.recus.length, 0, 'un message a été livré après la fermeture');
});

test('le salon n’est prévenu qu’une fois, même si la socket meurt ensuite', () => {
  // La fermeture arrive par deux chemins — la trame et l'événement `close` de la
  // socket. Un double appel ferait retirer deux fois le joueur du salon.
  const w = branche();
  w.envoie(trameClient(0x8, Buffer.alloc(0)));
  w.socket.destroy();
  w.socket.emit('close');
  assert.equal(w.fermetures.length, 1, `le salon a été prévenu ${w.fermetures.length} fois`);
});

// --- Décodage : l'arrivée en morceaux -----------------------------------------

test('une trame coupée en deux au milieu de sa charge est recollée', () => {
  const w = branche();
  const trame = trameClient(0x1, 'MESSAGE COUPÉ EN DEUX');
  w.envoie(trame.subarray(0, 9));
  assert.equal(w.recus.length, 0, 'un message a été livré alors qu’il manquait des octets');
  w.envoie(trame.subarray(9));
  assert.deepEqual(w.recus, ['MESSAGE COUPÉ EN DEUX']);
});

test('un en-tête tranché au milieu ne fait ni livrer ni fermer', () => {
  // Deux découpes qui tombent dans les deux gardes du décodeur : après le premier
  // octet, et au milieu de la longueur sur seize bits. Si l'une des gardes saute,
  // la lecture déborde du tampon et jette dans un gestionnaire `data`.
  const charge = 'y'.repeat(300);
  for (const coupe of [1, 3]) {
    const w = branche();
    const trame = trameClient(0x1, charge);
    w.envoie(trame.subarray(0, coupe));
    assert.equal(w.recus.length, 0, `coupe à ${coupe} : livraison prématurée`);
    assert.equal(w.socket.ecrits.length, 0, `coupe à ${coupe} : un en-tête partiel a été refusé`);
    assert.ok(w.co.ouverte, `coupe à ${coupe} : la connexion a été fermée à tort`);
    w.envoie(trame.subarray(coupe));
    assert.deepEqual(w.recus, [charge], `coupe à ${coupe} : message perdu ou abîmé`);
  }
});

test('une trame livrée octet par octet arrive entière, et à la fin seulement', () => {
  // Le pire découpage possible, et le seul qui exerce toutes les gardes d'un coup.
  const w = branche();
  const trame = trameClient(0x1, 'un octet à la fois, jusqu’au dernier');
  for (let i = 0; i < trame.length; i++) {
    w.envoie(trame.subarray(i, i + 1));
    const attendu = i === trame.length - 1 ? 1 : 0;
    assert.equal(w.recus.length, attendu, `après ${i + 1} octets sur ${trame.length}`);
  }
  assert.deepEqual(w.recus, ['un octet à la fois, jusqu’au dernier']);
});

test('trois trames collées dans un seul paquet sont livrées dans l’ordre', () => {
  // Une lecture TCP peut contenir zéro, une ou plusieurs trames. Un décodeur qui
  // n'en consomme qu'une par lecture perd les suivantes jusqu'au paquet d'après —
  // à soixante images par seconde, c'est une commande de retard permanente.
  const w = branche();
  w.envoie(
    Buffer.concat([trameClient(0x1, 'un'), trameClient(0x1, 'deux'), trameClient(0x1, 'trois')])
  );
  assert.deepEqual(w.recus, ['un', 'deux', 'trois']);
});

test('deux trames dont la seconde est tronquée : la première passe, l’autre attend', () => {
  const w = branche();
  const a = trameClient(0x1, 'complète');
  const b = trameClient(0x1, 'tronquée');
  w.envoie(Buffer.concat([a, b.subarray(0, 5)]));
  assert.deepEqual(w.recus, ['complète'], 'la trame complète du paquet n’a pas été livrée');
  w.envoie(b.subarray(5));
  assert.deepEqual(w.recus, ['complète', 'tronquée']);
});

test('un caractère multi-octets coupé entre deux paquets ne devient pas un point d’interrogation', () => {
  // Décoder en UTF-8 morceau par morceau au lieu d'attendre la trame entière
  // remplace silencieusement les accents et les emojis par U+FFFD. Le pseudo du
  // joueur y passe en premier.
  const texte = 'Zoé pilote 🚀 vers Céphée';
  const trame = trameClient(0x1, texte);
  for (const coupe of [7, 8, 9, 20, 21]) {
    const w = branche();
    w.envoie(trame.subarray(0, coupe), trame.subarray(coupe));
    assert.equal(w.recus[0], texte, `coupe à ${coupe} : le texte est revenu abîmé`);
  }
});

test('un message texte revient en chaîne, un message binaire en Buffer', () => {
  // La charge binaire contient un octet interdit en UTF-8 : si les deux branches
  // étaient inversées, il ressortirait en U+FFFD au lieu de sa valeur.
  const w = branche();
  const brut = Buffer.from([0x00, 0xff, 0x7f]);
  w.envoie(trameClient(0x1, 'texte'), trameClient(0x2, brut));
  assert.equal(typeof w.recus[0], 'string', 'une trame texte doit être décodée en chaîne');
  assert.ok(Buffer.isBuffer(w.recus[1]), 'une trame binaire doit rester un Buffer');
  assert.deepEqual(w.recus[1], brut);
});

// --- Émission ------------------------------------------------------------------

test('le serveur ne masque JAMAIS ce qu’il envoie', () => {
  // C'est l'inverse exact de la règle côté client, et un navigateur ferme la
  // connexion sans explication si le serveur masque.
  const w = branche();
  w.co.envoie('salut');
  w.co.ping();
  w.co.close(1000, 'fin');
  for (const t of w.trames()) assert.equal(t.masque, false, 'le serveur a masqué une trame');
});

test('l’en-tête d’émission grandit aux bonnes bornes : 2, 4 puis 10 octets', () => {
  // Mêmes bornes qu'au décodage, dans l'autre sens. Un en-tête de la mauvaise
  // taille décale tout le flux et le client ne se resynchronise jamais.
  for (const [n, entete] of [
    [0, 2],
    [125, 2],
    [126, 4],
    [65535, 4],
    [65536, 10],
  ]) {
    const w = branche();
    assert.equal(w.co.envoie('a'.repeat(n)), true);
    const t = litTrameServeur(w.socket.ecrits[0]);
    assert.equal(t.entete, entete, `${n} octets : en-tête de ${t.entete} octets au lieu de ${entete}`);
    assert.equal(t.taille, n, `${n} octets : taille annoncée ${t.taille}`);
    assert.equal(t.charge.length, n, `${n} octets : charge tronquée`);
    assert.equal(t.opcode, 0x1);
    assert.equal(t.fin, true, 'le serveur n’envoie jamais de trame fragmentée');
  }
});

test('un objet part en JSON dans une trame texte, et revient identique', () => {
  const w = branche();
  const message = { t: 'commande', dx: -1, vise: true, nom: 'Zoé' };
  assert.equal(w.co.envoieJSON(message), true);
  const t = litTrameServeur(w.socket.ecrits[0]);
  assert.equal(t.opcode, 0x1, 'du JSON doit voyager en trame texte');
  assert.deepEqual(JSON.parse(t.charge.toString('utf8')), message);
});

test('la trame de fermeture porte le code sur seize bits, puis la raison', () => {
  const w = branche();
  w.co.close(1001, 'silence');
  const t = litTrameServeur(w.socket.ecrits[0]);
  assert.equal(t.opcode, 0x8);
  assert.equal(t.charge.readUInt16BE(0), 1001);
  assert.equal(t.charge.subarray(2).toString('utf8'), 'silence');
});

test('une raison bavarde est coupée, pas envoyée en entier', () => {
  // Une trame de contrôle doit tenir sous cent vingt-cinq octets : sans cette
  // coupe, une raison longue produirait un en-tête étendu illégal.
  const w = branche();
  w.co.close(1011, 'e'.repeat(400));
  const t = litTrameServeur(w.socket.ecrits[0]);
  assert.equal(t.entete, 2, 'une trame de contrôle ne doit pas passer en en-tête étendu');
  assert.ok(t.taille <= 125, `la trame de fermeture fait ${t.taille} octets`);
});

test('après fermeture, plus rien ne part sur le fil', () => {
  const w = branche();
  w.co.close(1000, 'fin');
  const apres = w.socket.ecrits.length;
  assert.equal(w.co.envoie('trop tard'), false, 'envoie() a réussi après la fermeture');
  assert.equal(w.co.envoieJSON({ t: 'trop-tard' }), false);
  assert.equal(w.socket.ecrits.length, apres, 'des octets sont partis après la fermeture');
});

test('un ping sur une socket morte rend faux au lieu de jeter', () => {
  // La boucle de surveillance pingue des connexions dont certaines viennent de
  // disparaître. Une exception ici emporterait toute la boucle, donc tout le salon.
  const w = branche();
  w.socket.destroy();
  assert.equal(w.co.ping(), false);
});

test('une seconde fermeture ne renvoie pas une seconde trame', () => {
  const w = branche();
  w.co.close(1000, 'fin');
  const apres = w.socket.ecrits.length;
  w.co.close(1011, 'encore');
  assert.equal(w.socket.ecrits.length, apres, 'deux trames de fermeture ont été envoyées');
});

// --- Réglages TCP posés à la construction --------------------------------------

test('la connexion neuve désarme Nagle et arme le délai d’inactivité', () => {
  // Sans `setNoDelay`, Nagle retient nos trames de trente octets jusqu'à quarante
  // millisecondes : deux images et demie de retard à chaque commande.
  const w = branche();
  assert.equal(w.socket.sansDelai, true, 'Nagle n’a pas été désarmé');
  assert.equal(w.socket.delaiInactivite?.ms, 45_000, 'le délai d’inactivité a changé');

  // Et ce délai doit fermer, sinon un téléphone entré dans un tunnel occupe un
  // salon indéfiniment.
  w.socket.delaiInactivite.fn();
  assert.equal(w.co.ouverte, false);
  const t = litTrameServeur(w.socket.ecrits[0]);
  assert.equal(t.charge.readUInt16BE(0), 1001, 'le silence doit fermer avec 1001');
});

test('une erreur de socket ferme proprement plutôt que de laisser la connexion morte-vivante', () => {
  const w = branche();
  w.socket.emit('error', new Error('ECONNRESET'));
  assert.equal(w.co.ouverte, false);
  assert.equal(w.fermetures.length, 1, 'le salon n’a pas été prévenu de l’erreur');
});

// --- Poignée de main -----------------------------------------------------------

// Un faux serveur HTTP : `brancheWebSocket` ne fait qu'écouter `upgrade`.
function poignee(entetes, accepte, url = '/duo?nom=Zo%C3%A9') {
  const serveur = new EventEmitter();
  const vus = [];
  brancheWebSocket(serveur, (u, r) => {
    vus.push({ url: u, req: r });
    return accepte(u, r);
  });
  const socket = fausseSocket();
  const req = { url, headers: entetes };
  serveur.emit('upgrade', req, socket);
  return { socket, vus, reponse: socket.ecrits.map((b) => b.toString('latin1')).join('') };
}

const ENTETES_VALIDES = {
  'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
  'sec-websocket-version': '13',
};

test('la clé d’acceptation est celle de l’exemple de la RFC 6455', () => {
  // Valeur gravée dans la spécification : base64(sha1(clé + GUID)). Si le GUID,
  // l'algorithme ou l'encodage bougent d'un caractère, aucun navigateur au monde
  // n'ouvre plus la connexion — et l'erreur affichée ne dit pas pourquoi.
  const { reponse } = poignee(ENTETES_VALIDES, () => ({}));
  assert.match(reponse, /^HTTP\/1\.1 101 Switching Protocols\r\n/);
  assert.match(reponse, /\r\nsec-websocket-accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=\r\n/);
  assert.match(reponse, /\r\nupgrade: websocket\r\n/);
  assert.match(reponse, /\r\nconnection: Upgrade\r\n/);
  assert.ok(reponse.endsWith('\r\n\r\n'), 'les en-têtes ne sont pas terminés par une ligne vide');
});

test('une version différente de 13 est refusée en HTTP, pas en coupant', () => {
  // Le client doit apprendre POURQUOI il est refusé : une coupure sèche laisse le
  // jeu afficher « connexion perdue » sans autre indice.
  for (const version of ['8', '12', '14', undefined]) {
    const { reponse, socket } = poignee(
      { ...ENTETES_VALIDES, 'sec-websocket-version': version },
      () => ({})
    );
    assert.match(reponse, /^HTTP\/1\.1 400 /, `version ${version} : acceptée à tort`);
    assert.ok(!reponse.includes('101'), `version ${version} : montée en WebSocket`);
    assert.equal(socket.destroyed, true, `version ${version} : socket laissée ouverte`);
  }
});

test('une clé absente est refusée', () => {
  const { reponse } = poignee({ 'sec-websocket-version': '13' }, () => ({}));
  assert.match(reponse, /^HTTP\/1\.1 400 /);
});

test('un refus du routage répond 403 et ne monte pas en WebSocket', () => {
  const { reponse, socket } = poignee(ENTETES_VALIDES, () => null);
  assert.match(reponse, /^HTTP\/1\.1 403 /);
  assert.ok(!reponse.includes('sec-websocket-accept'), 'une clé a été donnée à un client refusé');
  assert.equal(socket.destroyed, true);
});

test('une exception dans le routage refuse au lieu d’emporter le serveur', () => {
  // `accepte` lit la base de données pour reconnaître un jeton : elle peut jeter.
  // Ça doit rester un 403, pas la fin du processus.
  const { reponse } = poignee(ENTETES_VALIDES, () => {
    throw new Error('base indisponible');
  });
  assert.match(reponse, /^HTTP\/1\.1 403 /);
});

test('le routage reçoit l’URL analysée, chemin et paramètres compris', () => {
  // Tout le routage du salon en dépend : le chemin décide de la route, les
  // paramètres portent le pseudo, le mode et le jeton.
  const { vus } = poignee(ENTETES_VALIDES, () => ({}), '/api/duo?mode=survie&nom=Zo%C3%A9');
  assert.equal(vus.length, 1);
  assert.equal(vus[0].url.pathname, '/api/duo');
  assert.equal(vus[0].url.searchParams.get('mode'), 'survie');
  assert.equal(vus[0].url.searchParams.get('nom'), 'Zoé', 'le pourcent-encodage n’est pas défait');
  assert.ok(vus[0].req, 'la requête doit être passée au routage, pour l’adresse et les en-têtes');
});

test('une montée réussie donne une connexion qui décode déjà les trames', () => {
  // Le bout à bout : la poignée de main, puis la première trame du client.
  const serveur = new EventEmitter();
  let co = null;
  brancheWebSocket(serveur, () => ({ onOuverture: (c) => (co = c) }));
  const socket = fausseSocket();
  serveur.emit('upgrade', { url: '/duo', headers: ENTETES_VALIDES }, socket);

  assert.ok(co, 'onOuverture n’a pas été appelée');
  assert.ok(co.ouverte);
  assert.equal(co.tete.url.pathname, '/duo', 'le salon ne sait pas d’où vient le joueur');

  const recus = [];
  co.onMessage = (m) => recus.push(m);
  socket.emit('data', trameClient(0x1, '{"t":"pret"}'));
  assert.deepEqual(recus, ['{"t":"pret"}']);
});
