// LE JEU À DEUX : LES SALONS, ET LE RELAIS DES COMMANDES.
//
// CE QUE LE SERVEUR NE FAIT PAS. Il ne simule rien. Pas d'ennemis, pas de
// collisions, pas de score : il ne sait même pas à quoi ressemble une partie.
//
// C'est un choix, et il tient à une chose que le jeu possède déjà : il est
// DÉTERMINISTE. Le hasard est semé par vague à partir d'une graine, les
// commandes du joueur sont arrondies avant d'être appliquées, et c'est ce qui
// fait marcher le rejeu — une partie se rejoue à l'identique des mois plus tard.
// Deux clients qui partagent la même graine et s'échangent leurs commandes
// jouent donc rigoureusement la même partie, chacun chez soi.
//
// Le serveur n'a plus qu'à faire passer les commandes d'un joueur à l'autre.
// Quelques dizaines d'octets par image, aucune logique de jeu à maintenir en
// double, et un rejeu à deux qu'on obtient sans écrire une ligne de plus.
//
// L'ALTERNATIVE, ET POURQUOI ELLE EST PIRE. Un serveur autoritaire devrait
// sérialiser tout l'état — des centaines d'objets — à chaque image, et le second
// joueur piloterait avec un aller-retour de retard. Ici, chacun voit son propre
// vaisseau répondre immédiatement.
//
// CE QUE ÇA COÛTE. Une divergence est fatale : si les deux simulations
// s'écartent d'un flottant, elles racontent deux parties différentes sans que
// personne ne s'en aperçoive. C'est pour ça que les commandes sont quantifiées à
// la source, et que le client vérifie régulièrement qu'il voit la même chose que
// l'autre — voir la somme de contrôle échangée à chaque vague.

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

// Un pseudo tient en dix caractères, une coque en un identifiant connu. Tout ce
// qui vient du réseau passe par là avant d'être renvoyé à l'autre joueur : ces
// deux chaînes s'affichent chez lui.
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
        // `c.salon` est un IDENTIFIANT, et _annonceSalon attend le SALON. On lui
        // passait la chaîne : `s.hote` valait undefined, la garde en tête de
        // méthode renvoyait aussitôt, et changer de coque dans la salle d'attente
        // ne prévenait jamais l'autre joueur — il voyait le vaisseau d'avant
        // jusqu'au décompte.
        if (c.salon) {
          const s = this.salons.get(c.salon);
          if (s) this._annonceSalon(s);
        } else this._diffuseListe();
        return;
      // Le mode se change sans rouvrir la connexion : elle sert aussi de canal de
      // présence, et la fermer pour passer d'arcade à survie couperait les amis.
      case 'mode':
        c.mode = m.mode === 'survie' ? 'survie' : 'arcade';
        return this._listePour(c);
      // LA SIGNALISATION DE LA VOIX. Le serveur ne transporte AUCUN son : il fait
      // passer les quelques messages qui permettent aux deux navigateurs de se
      // trouver, puis l'audio va de l'un à l'autre en direct. C'est mieux pour la
      // latence, pour la bande passante du homelab, et pour la vie privée — deux
      // enfants qui se parlent ne passent pas par ma machine.
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
      case 'lister':
        return this._listePour(c);
      // LE RELAIS. C'est le seul message du chemin chaud, et il ne fait qu'une
      // chose : passer au voisin, tel quel. On ne lit même pas ce qu'il y a
      // dedans — c'est le client qui donne un sens à ces octets.
      case 'c': {
        const autre = this._voisin(c);
        if (autre?.co.ouverte) autre.co.envoie(brut);
        return;
      }
      // Fin de partie annoncée par un joueur : l'autre l'apprend pour pouvoir
      // afficher le score des deux.
      case 'fin': {
        const autre = this._voisin(c);
        if (autre?.co.ouverte) autre.co.envoie(brut);
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

  _voisin(c) {
    const s = c.salon && this.salons.get(c.salon);
    if (!s) return null;
    return s.hote === c ? s.invite : s.hote;
  }

  // --- Salons ----------------------------------------------------------------

  _cree(c) {
    if (c.salon) this._quitteSalon(c, 'change');
    if (this.salons.size >= SALONS_MAX) {
      c.co.envoieJSON({ t: 'erreur', code: 'trop-de-salons' });
      return;
    }
    const id = randomBytes(4).toString('hex');
    const s = { id, hote: c, invite: null, mode: c.mode, cree: Date.now(), compte: null };
    this.salons.set(id, s);
    c.salon = id;
    c.co.envoieJSON({ t: 'salon', id, role: 'hote' });
    this._diffuseListe();
  }

  _rejoint(c, id) {
    const s = this.salons.get(id);
    if (!s || s.invite || s.hote === c) {
      c.co.envoieJSON({ t: 'erreur', code: 'salon-indisponible' });
      this._listePour(c);
      return;
    }
    if (c.salon) this._quitteSalon(c, 'change');
    s.invite = c;
    c.salon = id;
    // Le mode de l'hôte fait loi : c'est lui qui a ouvert la table.
    c.mode = s.mode;
    c.co.envoieJSON({ t: 'salon', id, role: 'invite', mode: s.mode });
    this._annonceSalon(s);
    this._diffuseListe();
    this._lanceCompte(s);
  }

  // Le compte à rebours. Il est tenu par le SERVEUR, et c'est ce qui fait que les
  // deux clients démarrent sur la même image : chacun reçoit « go » au même
  // instant, avec la même graine.
  _lanceCompte(s) {
    let n = COMPTE;
    const battement = () => {
      if (!this.salons.has(s.id) || !s.hote || !s.invite) {
        clearInterval(s.compte);
        s.compte = null;
        return;
      }
      if (n > 0) {
        for (const c of [s.hote, s.invite]) c.co.envoieJSON({ t: 'compte', n });
        n--;
        return;
      }
      clearInterval(s.compte);
      s.compte = null;
      this._demarre(s);
    };
    s.compte = setInterval(battement, 1000);
    battement();
  }

  _demarre(s) {
    // La graine vient du serveur : les deux clients doivent tirer le MÊME hasard,
    // et aucun des deux ne doit pouvoir le choisir.
    const graine = randomBytes(4).readUInt32BE(0) % 2 ** 31;
    const joueurs = [
      { slot: 0, nom: s.hote.nom, coque: s.hote.coque },
      { slot: 1, nom: s.invite.nom, coque: s.invite.coque },
    ];
    s.enCours = true;
    for (const [i, c] of [s.hote, s.invite].entries()) {
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
    const autre = s.hote === c ? s.invite : s.hote;
    if (s.compte) {
      clearInterval(s.compte);
      s.compte = null;
    }
    // L'HÔTE PART : LE SALON MEURT. L'invité, lui, laisse la table ouverte —
    // l'hôte peut attendre quelqu'un d'autre sans avoir à recommencer.
    if (s.hote === c) {
      this.salons.delete(id);
      if (autre) {
        autre.salon = null;
        autre.co.envoieJSON({ t: 'parti', cause, hote: true });
        this._listePour(autre);
      }
    } else {
      s.invite = null;
      s.enCours = false;
      if (autre) autre.co.envoieJSON({ t: 'parti', cause, hote: false });
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
      if (s.invite || s.enCours) continue; // une table complète n'est pas une invitation
      if (mode && s.mode !== mode) continue;
      out.push({ id: s.id, nom: s.hote.nom, coque: s.hote.coque, mode: s.mode, depuis: s.cree });
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

  _annonceSalon(s) {
    if (!s.hote || !s.invite) return;
    s.hote.co.envoieJSON({ t: 'pair', nom: s.invite.nom, coque: s.invite.coque });
    s.invite.co.envoieJSON({ t: 'pair', nom: s.hote.nom, coque: s.hote.coque });
  }

  // Un salon dont l'hôte a disparu sans fermer proprement finirait par encombrer
  // la liste avec une invitation qui ne répond pas.
  _balaie() {
    const limite = Date.now() - SALON_TTL;
    for (const [id, s] of this.salons) {
      const mort = !s.hote?.co.ouverte;
      if (mort || (!s.invite && s.cree < limite)) {
        if (s.compte) clearInterval(s.compte);
        this.salons.delete(id);
        if (s.hote) {
          s.hote.salon = null;
          // ON LE DIT À L'HÔTE. Sa table expirait sous lui en silence : le
          // serveur la retirait de la liste, et lui restait sur l'écran d'attente
          // à regarder tourner un compteur pour une partie qui n'existait plus.
          // Personne ne pouvait plus le rejoindre, et rien ne le lui indiquait.
          if (!mort) s.hote.co.envoieJSON({ t: 'parti', cause: 'expire', hote: false });
        }
        if (s.invite) {
          s.invite.salon = null;
          s.invite.co.envoieJSON({ t: 'parti', cause: 'expire', hote: true });
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
