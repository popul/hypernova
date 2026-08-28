// UN SERVEUR WEBSOCKET, ÉCRIT À LA MAIN.
//
// Le jeu à deux échange des commandes soixante fois par seconde : quelques
// octets, mais tout le temps, et dans les deux sens. C'est exactement ce que
// HTTP ne sait pas faire — une requête par image coûterait plus en en-têtes
// qu'en données, et le long polling ajouterait un aller-retour à chaque message.
//
// POURQUOI PAS `ws`. Le serveur du panthéon n'a AUCUNE dépendance npm : node:http
// et node:sqlite, une image de quarante mégaoctets, rien à auditer. Ajouter une
// bibliothèque pour ce qui suit reviendrait à faire entrer un arbre de
// dépendances — et sa surface de sécurité — dans un service qui n'en avait pas.
// Le protocole tient en deux cents lignes : la poignée de main est un SHA-1 sur
// une constante, et le cadrage est un en-tête de deux à quatorze octets.
//
// CE QUI EST IMPLÉMENTÉ, ET CE QUI NE L'EST PAS.
//
//   · poignée de main RFC 6455, sans extension — permessage-deflate est refusé
//     par omission, et c'est très bien : nos messages font trente octets, les
//     compresser coûterait plus que de les envoyer ;
//   · trames texte et binaires, fragmentées ou non ;
//   · ping/pong, fermeture propre avec code ;
//   · démasquage — obligatoire, tout ce qui vient d'un client est masqué.
//
// Ce qui n'y est PAS : les extensions, les sous-protocoles négociés, et l'envoi
// fragmenté. On n'en a pas besoin, et chaque ligne non écrite est une ligne qui
// ne peut pas être fausse.

import { createHash } from 'node:crypto';

// La constante magique du protocole. Elle n'est pas secrète : elle sert à
// prouver que le serveur a compris qu'il s'agit d'un WebSocket et non d'un
// intermédiaire qui recopierait l'en-tête sans réfléchir.
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Un message de commande fait quelques dizaines d'octets. Ce plafond n'est pas un
// réglage de performance mais une porte : sans lui, un client peut annoncer une
// trame de plusieurs gigaoctets et faire grossir notre tampon jusqu'à la panne.
const TRAME_MAX = 64 * 1024;

const OUVERT = 1;
const FERME = 3;

export class Connexion {
  constructor(socket, tete) {
    this.socket = socket;
    this.etat = OUVERT;
    // `tete` porte ce que la requête d'ouverture disait : chemin, paramètres,
    // adresse. Le salon s'en sert pour savoir qui arrive et où.
    this.tete = tete;
    this.onMessage = null;
    this.onClose = null;
    this._reste = Buffer.alloc(0);
    // Une trame peut arriver en morceaux (fragmentation applicative) : on garde
    // l'opcode du premier morceau et on accumule jusqu'au bit FIN.
    this._fragOp = 0;
    this._frag = [];

    socket.on('data', (c) => this._avale(c));
    socket.on('error', () => this.close(1011, 'erreur'));
    socket.on('close', () => this._mort());
    // Sans délai d'inactivité, une connexion coupée sans FIN — un téléphone qui
    // sort du tunnel — resterait ouverte indéfiniment côté serveur, et le salon
    // attendrait un joueur qui ne reviendra pas.
    socket.setTimeout(45_000, () => this.close(1001, 'silence'));
    socket.setNoDelay(true);
  }

  get ouverte() {
    return this.etat === OUVERT;
  }

  // --- Réception -------------------------------------------------------------

  _avale(morceau) {
    this._reste = this._reste.length ? Buffer.concat([this._reste, morceau]) : morceau;
    // Une lecture peut contenir zéro, une, ou plusieurs trames : on en consomme
    // autant que le tampon en offre, puis on garde le reliquat.
    for (;;) {
      const trame = this._litTrame();
      if (!trame) return;
      this._traite(trame);
      if (!this.ouverte) return;
    }
  }

  _litTrame() {
    const b = this._reste;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masque = (b[1] & 0x80) !== 0;
    let taille = b[1] & 0x7f;
    let i = 2;

    if (taille === 126) {
      if (b.length < 4) return null;
      taille = b.readUInt16BE(2);
      i = 4;
    } else if (taille === 127) {
      if (b.length < 10) return null;
      // Une taille sur soixante-quatre bits ne tient pas dans un entier sûr. On
      // lit les deux moitiés : si la haute n'est pas nulle, la trame dépasse de
      // toute façon notre plafond de très loin.
      const haut = b.readUInt32BE(2);
      const bas = b.readUInt32BE(6);
      if (haut !== 0 || bas > TRAME_MAX) {
        this.close(1009, 'trop-gros');
        return null;
      }
      taille = bas;
      i = 10;
    }
    if (taille > TRAME_MAX) {
      this.close(1009, 'trop-gros');
      return null;
    }
    // Tout ce qui vient d'un client DOIT être masqué : une trame non masquée est
    // soit un bogue, soit quelqu'un qui parle un autre protocole.
    if (!masque) {
      this.close(1002, 'non-masquee');
      return null;
    }
    if (b.length < i + 4 + taille) return null;
    const cle = b.subarray(i, i + 4);
    const charge = Buffer.allocUnsafe(taille);
    for (let n = 0; n < taille; n++) charge[n] = b[i + 4 + n] ^ cle[n & 3];
    this._reste = b.subarray(i + 4 + taille);
    return { fin, opcode, charge };
  }

  _traite({ fin, opcode, charge }) {
    switch (opcode) {
      case 0x0: // suite d'une trame fragmentée
        this._frag.push(charge);
        if (fin) this._livre();
        return;
      case 0x1: // texte
      case 0x2: // binaire
        if (fin) return this._delivre(opcode, charge);
        this._fragOp = opcode;
        this._frag = [charge];
        return;
      case 0x8: // fermeture
        this.close(1000, 'au-revoir');
        return;
      case 0x9: // ping
        this._ecris(0xa, charge);
        return;
      case 0xa: // pong
        return;
      default:
        this.close(1002, 'opcode');
    }
  }

  _livre() {
    const charge = Buffer.concat(this._frag);
    this._frag = [];
    this._delivre(this._fragOp, charge);
  }

  _delivre(opcode, charge) {
    if (!this.onMessage) return;
    try {
      this.onMessage(opcode === 0x1 ? charge.toString('utf8') : charge);
    } catch (e) {
      console.error('[ws] message', e?.message || e);
    }
  }

  // --- Émission --------------------------------------------------------------

  envoie(texte) {
    if (!this.ouverte) return false;
    return this._ecris(0x1, Buffer.from(texte, 'utf8'));
  }

  envoieJSON(obj) {
    return this.envoie(JSON.stringify(obj));
  }

  ping() {
    return this._ecris(0x9, Buffer.alloc(0));
  }

  // Le serveur n'a PAS le droit de masquer : c'est l'inverse du client, et un
  // navigateur ferme la connexion si on le fait.
  _ecris(opcode, charge) {
    if (this.socket.destroyed) return false;
    const n = charge.length;
    let tete;
    if (n < 126) {
      tete = Buffer.allocUnsafe(2);
      tete[1] = n;
    } else if (n < 65536) {
      tete = Buffer.allocUnsafe(4);
      tete[1] = 126;
      tete.writeUInt16BE(n, 2);
    } else {
      tete = Buffer.allocUnsafe(10);
      tete[1] = 127;
      tete.writeUInt32BE(0, 2);
      tete.writeUInt32BE(n, 6);
    }
    tete[0] = 0x80 | opcode; // FIN, jamais de fragmentation à l'envoi
    try {
      this.socket.write(Buffer.concat([tete, charge]));
      return true;
    } catch {
      return false;
    }
  }

  close(code = 1000, raison = '') {
    if (this.etat === FERME) return;
    this.etat = FERME;
    const r = Buffer.from(String(raison).slice(0, 100), 'utf8');
    const charge = Buffer.allocUnsafe(2 + r.length);
    charge.writeUInt16BE(code, 0);
    r.copy(charge, 2);
    this._ecris(0x8, charge);
    // On laisse une fraction de seconde à la trame de fermeture pour partir :
    // détruire tout de suite, c'est la remplacer par une coupure sèche, et le
    // client n'apprend alors jamais POURQUOI il a été fermé.
    setTimeout(() => this.socket.destroy(), 60);
    this._mort();
  }

  _mort() {
    if (this._enterre) return;
    this._enterre = true;
    this.etat = FERME;
    try {
      this.onClose?.();
    } catch (e) {
      console.error('[ws] fermeture', e?.message || e);
    }
  }
}

// Branche l'écoute des montées en WebSocket sur un serveur HTTP existant.
// `accepte(url)` décide : elle rend un objet de contexte pour accepter, ou null
// pour refuser — c'est là que vivent l'authentification et le routage.
export function brancheWebSocket(serveur, accepte) {
  serveur.on('upgrade', (req, socket) => {
    const cle = req.headers['sec-websocket-key'];
    const version = req.headers['sec-websocket-version'];
    const url = new URL(req.url, 'http://x');
    // On refuse en HTTP, pas en coupant : le client reçoit un code et sait quoi
    // en dire à l'utilisateur.
    const refuse = (code, texte) => {
      socket.write(`HTTP/1.1 ${code} ${texte}\r\nconnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (!cle || version !== '13') return refuse(400, 'Bad Request');

    let contexte;
    try {
      contexte = accepte(url, req);
    } catch {
      contexte = null;
    }
    if (!contexte) return refuse(403, 'Forbidden');

    const accept = createHash('sha1')
      .update(cle + GUID)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'upgrade: websocket\r\n' +
        'connection: Upgrade\r\n' +
        `sec-websocket-accept: ${accept}\r\n\r\n`
    );
    const co = new Connexion(socket, { url, contexte });
    contexte.onOuverture?.(co);
  });
}
