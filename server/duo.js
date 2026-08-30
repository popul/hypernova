// LE JEU À PLUSIEURS : LES SALONS, ET LE RELAIS DES COMMANDES.
//
// CE QUE LE SERVEUR NE FAIT PAS. Il ne simule rien. Pas d'ennemis, pas de
// collisions, pas de score : il ne sait même pas à quoi ressemble une partie.
//
// C'est un choix, et il tient à une chose que le jeu possède déjà : il est
// DÉTERMINISTE. Le hasard est semé par vague à partir d'une graine, les
// commandes du joueur sont arrondies avant d'être appliquées, et c'est ce qui
// fait marcher le rejeu — une partie se rejoue à l'identique des mois plus tard.
// Des clients qui partagent la même graine et s'échangent leurs commandes
// jouent donc rigoureusement la même partie, chacun chez soi.
//
// Le serveur n'a plus qu'à faire passer les commandes de chaque joueur aux
// autres. Quelques dizaines d'octets par image, aucune logique de jeu à
// maintenir en double, et un rejeu à plusieurs qu'on obtient sans écrire une
// ligne de plus.
//
// L'ALTERNATIVE, ET POURQUOI ELLE EST PIRE. Un serveur autoritaire devrait
// sérialiser tout l'état — des centaines d'objets — à chaque image, et les
// autres joueurs piloteraient avec un aller-retour de retard. Ici, chacun voit
// son propre vaisseau répondre immédiatement.
//
// CE QUE ÇA COÛTE. Une divergence est fatale : si les simulations s'écartent
// d'un flottant, elles racontent des parties différentes sans que personne ne
// s'en aperçoive. C'est pour ça que les commandes sont quantifiées à la source,
// et que le client vérifie régulièrement qu'il voit la même chose que les
// autres — voir la somme de contrôle échangée à chaque vague.

import { randomBytes } from 'node:crypto';

// Combien de temps un salon vide attend avant d'être oublié. Dix minutes : assez
// pour aller chercher un copain, pas assez pour encombrer la liste d'invitations
// mortes.
const SALON_TTL = 10 * 60_000;
// Le compte à rebours avant le décollage, en secondes. Trois : le temps de poser
// les mains, pas le temps de changer d'avis.
const COMPTE = 3;
// Plafond de salons simultanés. Ce n'est pas une limite de charge — le homelab
// n'en verra jamais trois — mais une porte : sans elle, une boucle qui crée des
// salons remplirait la mémoire.
const SALONS_MAX = 40;
// Deux invités au plus : une partie se joue à deux ou trois. Le chiffre vient du
// jeu — la table de difficulté (MULT_JOUEURS, côté client) ne connaît que 2 et
// 3 — mais c'est ici qu'on le fait respecter : un client modifié ne se
// l'imposerait pas tout seul.
const INVITES_MAX = 2;

// Un pseudo tient en dix caractères, une coque en un identifiant connu. Tout ce
// qui vient du réseau passe par là avant d'être renvoyé aux autres joueurs : ces
// deux chaînes s'affichent chez eux.
const COQUES = ['orion', 'helios', 'vulcain'];
const coquePropre = (v) => (COQUES.includes(v) ? v : COQUES[0]);

export class Duo {
  // `sontAmis` vient de la base : le relais de signalisation ne fait passer un
  // message qu'entre deux personnes qui se sont déclarées amies. Sans ce
  // contrôle, n'importe qui pourrait ouvrir une ligne audio chez n'importe qui.
  constructor({ nomPropre, sontAmis }) {
    this.nomPropre = nomPropre;
    this.sontAmis = sontAmis;
    // Tout le monde connecté, salon ou pas : c'est à eux qu'on pousse la liste.
    this.clients = new Set();
    this.salons = new Map();
    // DOUZE SECONDES, ET C'EST LA PRÉSENCE QUI LE DÉCIDE.
    //
    // Une socket coupée sans au revoir — un téléphone qui perd le réseau, un
    // onglet tué — n'est détectée qu'à la première ÉCRITURE dessus. Sans
    // battement régulier, un ami resté « en ligne » le serait jusqu'au prochain
    // message, c'est-à-dire potentiellement jamais. Douze secondes bornent donc
    // le mensonge ; un ping vide coûte deux octets.
    this._minuteur = setInterval(() => this._balaie(), 12_000);
    this._minuteur.unref?.();
  }

  arrete() {
    clearInterval(this._minuteur);
  }

  // Un client arrive. `co` est une connexion WebSocket déjà ouverte.
  accueille(co, { nom, mode, identifie = false }) {
    const c = {
      co,
      nom: this.nomPropre(nom) || 'PILOTE',
      // Seul un pilote reconnu par son jeton compte comme « en ligne » pour ses
      // amis : un invité peut jouer, mais il n'est l'ami de personne.
      identifie,
      mode: mode === 'survie' ? 'survie' : 'arcade',
      coque: 'orion',
      salon: null,
    };
    this.clients.add(c);
    co.onMessage = (m) => this._recois(c, m);
    co.onClose = () => {
      this._depart(c);
      this._diffusePresence();
    };
    this._listePour(c);
    this._diffusePresence();
    return c;
  }

  // --- Réception -------------------------------------------------------------

  _recois(c, brut) {
    let m;
    try {
      m = JSON.parse(brut);
    } catch {
      return;
    }
    switch (m.t) {
      case 'coque':
        c.coque = coquePropre(m.coque);
        // La salle d'attente ET la vitrine affichent des coques : on rejoue les
        // deux. La leçon vient d'un bogue — on passait l'IDENTIFIANT du salon à
        // une méthode qui attendait le SALON, la garde d'entrée renvoyait sans
        // bruit, et l'autre joueur gardait le vaisseau d'avant sous les yeux
        // jusqu'au décompte.
        if (c.salon) {
          const s = this.salons.get(c.salon);
          if (s) this._annonceSalon(s);
        }
        return this._diffuseListe();
      // Le mode se change sans rouvrir la connexion : elle sert aussi de canal de
      // présence, et la fermer pour passer d'arcade à survie couperait les amis.
      case 'mode':
        c.mode = m.mode === 'survie' ? 'survie' : 'arcade';
        return this._listePour(c);
      // LA SIGNALISATION DE LA VOIX. Le serveur ne transporte AUCUN son : il fait
      // passer les quelques messages qui permettent aux deux navigateurs de se
      // trouver, puis l'audio va de l'un à l'autre en direct. C'est mieux pour la
      // latence, pour la bande passante du homelab, et pour la vie privée — deux
      // enfants qui se parlent ne passent pas par ma machine. Et la voix RESTE un
      // appel à deux, même à trois joueurs : pas de maillage pour l'instant.
      case 'signal':
        return this._signale(c, m);
      // Le client dit quand il entre et sort d'une partie : c'est la seule façon
      // pour le serveur de le savoir, et c'est ce qui permet à un ami de proposer
      // de la regarder.
      case 'joue':
        c.enPartie = !!m.oui;
        return this._diffusePresence();
      case 'creer':
        return this._cree(c);
      case 'rejoindre':
        return this._rejoint(c, String(m.id || ''));
      case 'quitter':
        return this._quitteSalon(c, 'quitte');
      // L'hôte appuie sur le bouton du décollage. Avant, l'arrivée de l'invité
      // déclenchait le compte toute seule ; avec un troisième siège, il faut
      // bien que quelqu'un décide si on part à deux ou si on attend — et c'est
      // celui qui a ouvert la table.
      case 'lancer':
        return this._lance(c);
      case 'lister':
        return this._listePour(c);
      // LE RELAIS. C'est le seul message du chemin chaud, et il ne fait qu'une
      // chose : passer aux AUTRES membres de la table, tel quel. On ne lit même
      // pas ce qu'il y a dedans — c'est le client qui donne un sens à ces
      // octets. La fin de partie (`fin`) suit le même chemin : chacun l'annonce,
      // les autres affichent son score.
      // La pause voyage comme une commande : verbatim, à toute la table. Le
      // serveur ne sait pas ce qu'elle veut dire — c'est le client qui arrête
      // d'appeler update, et le pas verrouillé reprend où il s'était tu.
      //
      // L'ÉTAT DE VAGUE (`etat-vague`) suit le même chemin : au début de chaque
      // tableau, l'hôte photographie sa partie et la table entière s'y recale.
      // C'est LA réparation du jeu en réseau — la même photo que celle d'un
      // spectateur — et elle passe par la table, pas par le canal des amis :
      // deux invités d'une table publique ne se connaissent pas forcément.
      // Les empreintes croisées (`emp`) voyagent ici pour la même raison.
      // La trajectoire choisie par l'hôte : une décision COMMUNE, relayée telle
      // quelle. Personne ne passe l'écran de choix sans elle, donc tout le monde
      // l'a avant d'entamer la vague suivante.
      case 'route':
      case 'etat-vague':
      case 'emp':
      case 'pause':
      case 'c':
      case 'fin': {
        for (const autre of this._pairs(c)) {
          if (autre.co.ouverte) autre.co.envoie(brut);
        }
        return;
      }
      default:
        return;
    }
  }

  // On ne relaie qu'entre AMIS, et seulement si les deux sont identifiés. Le
  // message est passé tel quel : le serveur ne lit pas ce qu'il y a dedans, et
  // n'a pas à connaître WebRTC.
  _signale(c, m) {
    const vers = this.nomPropre(m.vers);
    if (!c.identifie || !vers) return;
    if (!this.sontAmis(c.nom, vers)) return;
    for (const autre of this.clients) {
      if (autre.identifie && autre.nom === vers) {
        autre.co.envoieJSON({ t: 'signal', de: c.nom, sujet: m.sujet, d: m.d });
      }
    }
  }

  // Les AUTRES membres de la table — ceux à qui on relaie. À deux c'était « le
  // voisin » ; à trois, chaque commande part en double.
  _pairs(c) {
    const s = c.salon && this.salons.get(c.salon);
    if (!s) return [];
    return [s.hote, ...s.invites].filter((m) => m !== c);
  }

  // L'équipage dans l'ordre des numéros : l'hôte est 0, les invités suivent dans
  // leur ordre d'arrivée. CET ORDRE EST LA NUMÉROTATION — chaque client applique
  // les commandes d'une image dans l'ordre de ces numéros, et deux machines qui
  // les appliqueraient dans deux ordres différents divergeraient en silence.
  _joueurs(s) {
    return [s.hote, ...s.invites].map((c, i) => ({ slot: i, nom: c.nom, coque: c.coque }));
  }

  // --- Salons ----------------------------------------------------------------

  _cree(c) {
    if (c.salon) this._quitteSalon(c, 'change');
    if (this.salons.size >= SALONS_MAX) {
      c.co.envoieJSON({ t: 'erreur', code: 'trop-de-salons' });
      return;
    }
    const id = randomBytes(4).toString('hex');
    const s = {
      id,
      hote: c,
      invites: [],
      mode: c.mode,
      cree: Date.now(),
      compte: null,
      enCours: false,
      // L'équipage FIGÉ au décollage — voir _demarre. Null tant qu'on ne joue pas.
      equipage: null,
    };
    this.salons.set(id, s);
    c.salon = id;
    c.co.envoieJSON({ t: 'salon', id, role: 'hote' });
    this._annonceSalon(s);
    this._diffuseListe();
  }

  _rejoint(c, id) {
    const s = this.salons.get(id);
    // Refusé : table inconnue, pleine, déjà la sienne, ou verrouillée par le
    // décompte ou la partie. Le décompte verrouille parce que ses battements ont
    // déjà annoncé l'équipage : quelqu'un qui s'assiérait pendant les trois
    // secondes ferait mentir ce que les autres ont sous les yeux.
    if (
      !s ||
      s.invites.length >= INVITES_MAX ||
      s.hote === c ||
      s.invites.includes(c) ||
      s.compte ||
      s.enCours
    ) {
      c.co.envoieJSON({ t: 'erreur', code: 'salon-indisponible' });
      this._listePour(c);
      return;
    }
    if (c.salon) this._quitteSalon(c, 'change');
    s.invites.push(c);
    c.salon = id;
    // Le mode de l'hôte fait loi : c'est lui qui a ouvert la table.
    c.mode = s.mode;
    c.co.envoieJSON({ t: 'salon', id, role: 'invite', mode: s.mode });
    this._annonceSalon(s);
    this._diffuseListe();
    // Plus de décollage automatique ici : la table peut attendre un troisième,
    // et c'est l'hôte qui envoie « lancer » quand son équipage lui convient.
  }

  _lance(c) {
    const s = c.salon && this.salons.get(c.salon);
    // Seul l'hôte lance, il faut au moins quelqu'un en face, et un seul compte à
    // la fois. L'erreur n'est pas décorative : un bouton qui ne fait rien sans
    // dire pourquoi est indéboguable à distance.
    if (!s || s.hote !== c || s.invites.length === 0 || s.compte || s.enCours) {
      c.co.envoieJSON({ t: 'erreur', code: 'lancement-impossible' });
      return;
    }
    this._lanceCompte(s);
  }

  // Le compte à rebours. Il est tenu par le SERVEUR, et c'est ce qui fait que
  // tous les clients démarrent sur la même image : chacun reçoit « go » au même
  // instant, avec la même graine.
  _lanceCompte(s) {
    let n = COMPTE;
    const battement = () => {
      if (!this.salons.has(s.id) || !s.hote || s.invites.length === 0) {
        clearInterval(s.compte);
        s.compte = null;
        return;
      }
      if (n > 0) {
        // Le décompte porte l'équipage : l'écran d'attente affiche qui décolle
        // et avec quel numéro, sans autre message à attendre.
        const joueurs = this._joueurs(s);
        for (const c of [s.hote, ...s.invites]) c.co.envoieJSON({ t: 'compte', n, joueurs });
        n--;
        return;
      }
      clearInterval(s.compte);
      s.compte = null;
      this._demarre(s);
    };
    s.compte = setInterval(battement, 1000);
    battement();
    // Une table en plein décompte n'accueille plus personne : elle sort de la
    // vitrine tout de suite, pas au décollage.
    this._diffuseListe();
  }

  _demarre(s) {
    // La graine vient du serveur : tous les clients doivent tirer le MÊME
    // hasard, et aucun d'eux ne doit pouvoir le choisir.
    const graine = randomBytes(4).readUInt32BE(0) % 2 ** 31;
    const joueurs = this._joueurs(s);
    s.enCours = true;
    // LES NUMÉROS SONT FIGÉS AU DÉCOLLAGE. Si quelqu'un part en pleine partie,
    // les survivants gardent le numéro annoncé ici : c'est cet équipage-là, pas
    // la liste retassée des présents, qui dira « qui est parti ».
    s.equipage = [s.hote, ...s.invites];
    for (const [i, c] of s.equipage.entries()) {
      c.co.envoieJSON({ t: 'go', graine, mode: s.mode, moi: i, joueurs });
    }
    // Une partie lancée n'est plus une invitation : elle sort de la liste.
    this._diffuseListe();
  }

  _quitteSalon(c, cause) {
    const id = c.salon;
    if (!id) return;
    c.salon = null;
    const s = this.salons.get(id);
    if (!s) return;
    // Un départ pendant le décompte l'annule : les battements ont annoncé un
    // équipage qui n'existe plus, l'hôte relancera avec le bon.
    if (s.compte) {
      clearInterval(s.compte);
      s.compte = null;
    }
    if (s.hote === c) {
      if (s.enCours && s.invites.length >= 2) {
        // L'HÔTE PART EN PLEINE PARTIE, ET ILS SONT ENCORE DEUX EN FACE : la
        // table lui survit. Sans elle, plus de relais — les deux restants
        // divergeraient à la première commande. Le premier invité hérite du
        // rôle, et l'apprend par un nouveau message `salon`.
        s.hote = s.invites.shift();
        if (s.hote.co.ouverte) {
          s.hote.co.envoieJSON({ t: 'salon', id, role: 'hote', mode: s.mode });
        }
        for (const m of [s.hote, ...s.invites]) {
          // `hote: false` : ta place tient toujours, la partie continue — c'est
          // le numéro (0, l'hôte) qui dit qui manque désormais.
          if (m.co.ouverte) m.co.envoieJSON({ t: 'parti', cause, slot: 0, hote: false });
        }
      } else {
        // Sinon, LE SALON MEURT. Au hall, l'hôte emporte sa table ; en partie à
        // deux, le survivant repasse au régime solo et n'a plus besoin du relais.
        this.salons.delete(id);
        // Le numéro du partant est celui du DÉCOLLAGE, jamais 0 d'office : un
        // hôte PROMU a gardé son numéro d'invité. Annoncer 0, c'est désigner
        // quelqu'un de déjà parti — le survivant attendrait le vrai partant
        // comme un fantôme, cinq secondes durant, avant que le filet des muets
        // ne le sauve.
        const slot = s.enCours && s.equipage ? s.equipage.indexOf(c) : 0;
        for (const inv of s.invites) {
          inv.salon = null;
          if (inv.co.ouverte) inv.co.envoieJSON({ t: 'parti', cause, slot, hote: true });
          this._listePour(inv);
        }
      }
    } else {
      // Le numéro annoncé est celui du DÉCOLLAGE quand la partie est en cours :
      // la liste des présents se retasse et renumérote, l'équipage figé jamais.
      const slot = s.enCours && s.equipage ? s.equipage.indexOf(c) : 1 + s.invites.indexOf(c);
      s.invites = s.invites.filter((m) => m !== c);
      // Plus personne en face : la table redevient une simple invitation, comme
      // à deux aujourd'hui — et si l'hôte joue encore, il finit sa partie seul.
      if (s.invites.length === 0) {
        s.enCours = false;
        s.equipage = null;
      }
      for (const m of [s.hote, ...s.invites]) {
        if (m.co.ouverte) m.co.envoieJSON({ t: 'parti', cause, slot, hote: false });
      }
      // Hors partie, la composition a changé : on rejoue l'équipage aux
      // restants — les numéros du hall glissent, autant le dire tout de suite.
      this._annonceSalon(s);
    }
    this._diffuseListe();
  }

  _depart(c) {
    this._quitteSalon(c, 'deconnexion');
    this.clients.delete(c);
  }

  // --- Liste des salons ------------------------------------------------------

  _liste(mode) {
    const out = [];
    for (const s of this.salons.values()) {
      // Une invitation, c'est une table où il reste un siège : ni pleine, ni en
      // plein décompte, ni en partie. À deux on la retirait dès le premier
      // invité ; maintenant elle reste en vitrine pour le troisième.
      if (s.invites.length >= INVITES_MAX || s.compte || s.enCours) continue;
      if (mode && s.mode !== mode) continue;
      out.push({
        id: s.id,
        nom: s.hote.nom,
        coque: s.hote.coque,
        mode: s.mode,
        depuis: s.cree,
        // Combien sont déjà assis : le hall affiche « 2/3 » sans autre message.
        assis: 1 + s.invites.length,
      });
    }
    return out.sort((a, b) => a.depuis - b.depuis);
  }

  _listePour(c) {
    if (!c.co.ouverte) return;
    c.co.envoieJSON({ t: 'salons', l: this._liste(c.mode) });
  }

  // On ne pousse la liste qu'à ceux qui la regardent : un joueur en salon ou en
  // partie n'a que faire des invitations des autres.
  _diffuseListe() {
    for (const c of this.clients) if (!c.salon) this._listePour(c);
  }

  // La composition de la table, rejouée à TOUS ses membres : à la création, à
  // chaque arrivée, chaque départ, chaque changement de coque. `moi` désigne le
  // destinataire par son numéro — deux invités non identifiés peuvent porter le
  // même pseudo, le nom ne suffit pas à se reconnaître.
  _annonceSalon(s) {
    if (s.enCours) return; // en partie, les numéros du décollage font foi
    const membres = [s.hote, ...s.invites];
    const joueurs = this._joueurs(s);
    for (const [i, c] of membres.entries()) {
      if (c.co.ouverte) c.co.envoieJSON({ t: 'equipage', joueurs, moi: i });
    }
  }

  // Un salon dont l'hôte a disparu sans fermer proprement finirait par encombrer
  // la liste avec une invitation qui ne répond pas.
  _balaie() {
    const limite = Date.now() - SALON_TTL;
    for (const [id, s] of this.salons) {
      const mort = !s.hote?.co.ouverte;
      // L'hôte est mort en pleine partie et ils sont encore deux en face : même
      // chemin que s'il avait quitté proprement — promotion, la table survit,
      // le relais entre les deux autres aussi.
      if (mort && s.enCours && s.invites.length >= 2) {
        this._quitteSalon(s.hote, 'expire');
        continue;
      }
      if (mort || (s.invites.length === 0 && s.cree < limite)) {
        if (s.compte) clearInterval(s.compte);
        this.salons.delete(id);
        if (s.hote) {
          s.hote.salon = null;
          // ON LE DIT À L'HÔTE. Sa table expirait sous lui en silence : le
          // serveur la retirait de la liste, et lui restait sur l'écran d'attente
          // à regarder tourner un compteur pour une partie qui n'existait plus.
          // Personne ne pouvait plus le rejoindre, et rien ne le lui indiquait.
          // (Pas de `slot` ici : personne n'est parti, c'est la table qui meurt.)
          if (!mort) s.hote.co.envoieJSON({ t: 'parti', cause: 'expire', hote: false });
        }
        // TOUS les invités sont prévenus, pas seulement le premier : à trois, en
        // oublier un le laisserait devant un écran d'attente pour une table qui
        // n'existe plus.
        //
        // Même règle que dans _quitteSalon : en partie, le numéro annoncé est
        // celui du DÉCOLLAGE — un hôte promu qui meurt n'est pas le numéro 0.
        const slot = s.enCours && s.equipage ? s.equipage.indexOf(s.hote) : 0;
        for (const inv of s.invites) {
          inv.salon = null;
          if (inv.co.ouverte) {
            inv.co.envoieJSON({ t: 'parti', cause: 'expire', slot, hote: true });
          }
        }
      }
    }
    // Un ping régulier tient la connexion ouverte à travers les intermédiaires,
    // et surtout détecte les pairs muets : c'est l'écriture qui révèle la socket
    // morte, pas l'attente.
    for (const c of this.clients) c.co.ping();
    this._diffuseListe();
    this._diffusePresence();
  }

  // QUI EST LÀ. La présence n'est pas stockée : elle EST la liste des connexions
  // ouvertes. Une table « en ligne » en base se désynchronise au premier
  // processus tué — on aurait des joueurs éternellement connectés que personne
  // ne peut rejoindre.
  enLigne() {
    const out = {};
    for (const c of this.clients) {
      if (!c.identifie || !c.nom) continue;
      // « En partie » vaut aussi pour une partie SOLO : c'est justement celle
      // qu'un copain voudra regarder. Le client l'annonce, puisque le serveur ne
      // sait rien de ce qui se joue.
      out[c.nom] = {
        salon: !!c.salon,
        partie: !!c.enPartie || !!this.salons.get(c.salon)?.enCours,
      };
    }
    return out;
  }

  // La présence est POUSSÉE, pas interrogée. Un client qui demanderait toutes les
  // dix secondes apprendrait qu'un ami vient d'arriver avec dix secondes de
  // retard, et pour rien la plupart du temps.
  _diffusePresence() {
    const l = this.enLigne();
    for (const c of this.clients) {
      if (c.identifie) c.co.envoieJSON({ t: 'presence', l });
    }
  }

  chiffres() {
    return { clients: this.clients.size, salons: this.salons.size };
  }
}
