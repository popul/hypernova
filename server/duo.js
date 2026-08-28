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
  constructor({ nomPropre }) {
    this.nomPropre = nomPropre;
    // Tout le monde connecté, salon ou pas : c'est à eux qu'on pousse la liste.
    this.clients = new Set();
    this.salons = new Map();
    this._minuteur = setInterval(() => this._balaie(), 30_000);
    this._minuteur.unref?.();
  }

  arrete() {
    clearInterval(this._minuteur);
  }

  // Un client arrive. `co` est une connexion WebSocket déjà ouverte.
  accueille(co, { nom, mode }) {
    const c = {
      co,
      nom: this.nomPropre(nom) || 'PILOTE',
      mode: mode === 'survie' ? 'survie' : 'arcade',
      coque: 'orion',
      salon: null,
    };
    this.clients.add(c);
    co.onMessage = (m) => this._recois(c, m);
    co.onClose = () => this._depart(c);
    this._listePour(c);
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
        if (c.salon) this._annonceSalon(c.salon);
        else this._diffuseListe();
        return;
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
        if (s.hote) s.hote.salon = null;
        if (s.invite) {
          s.invite.salon = null;
          s.invite.co.envoieJSON({ t: 'parti', cause: 'expire', hote: true });
        }
      }
    }
    // Un ping régulier tient la connexion ouverte à travers les intermédiaires,
    // et détecte les pairs muets.
    for (const c of this.clients) c.co.ping();
    this._diffuseListe();
  }

  chiffres() {
    return { clients: this.clients.size, salons: this.salons.size };
  }
}
