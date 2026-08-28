// LE JEU À DEUX, CÔTÉ CLIENT : le salon, puis le pas verrouillé.
//
// LE PRINCIPE, EN UNE PHRASE. Les deux joueurs simulent la MÊME partie, chacun
// chez lui, et ne s'échangent que ce que leurs doigts font. Rien d'autre ne
// traverse le réseau : ni les ennemis, ni les tirs, ni le score.
//
// C'est possible parce que le jeu est déterministe — le hasard est semé par
// vague à partir d'une graine commune, et les commandes sont arrondies avant
// d'être appliquées. C'est déjà ce qui fait marcher le rejeu.
//
// LE PAS VERROUILLÉ, ET SON PRIX. Pour calculer l'image N, il faut les commandes
// des DEUX joueurs pour l'image N. Attendre celle de l'autre à chaque image
// ajouterait un aller-retour à chaque frame : injouable. On envoie donc sa
// commande AVEC DE L'AVANCE — ce qu'on tape à l'image N s'appliquera à l'image
// N + DELAI. Chacun a ainsi quatre images d'avance dans la besace de l'autre, et
// personne n'attend tant que l'aller-retour reste sous les soixante-six
// millisecondes.
//
// Le prix est un retard de commande de quatre images, soit un vingtième de
// seconde. C'est le compromis de tous les jeux de combat depuis trente ans, et
// il se sent beaucoup moins qu'un vaisseau qui bouge en différé.
//
// LE PAS DE TEMPS EST FIXE, et c'est non négociable. Deux machines n'ont pas la
// même cadence d'affichage — soixante d'un côté, cent quarante-quatre de
// l'autre — et une simulation nourrie du temps réel divergerait dès la première
// seconde. En partie à deux, le monde avance donc par pas d'un soixantième
// exactement, autant de fois que le temps écoulé le permet.

const RACINE = '/api';
// Combien d'images d'avance on prend. Quatre à soixante images par seconde
// laissent soixante-six millisecondes d'aller-retour avant le premier hoquet.
export const DELAI = 4;
// Le pas de la simulation. Le même chiffre des deux côtés, toujours.
export const PAS = 1 / 60;
// Au-delà, on abandonne le rattrapage : un onglet remis au premier plan après
// une minute d'absence ne doit pas essayer de simuler trois mille images d'un
// coup — il vaut mieux avouer le décrochage.
const RATTRAPAGE_MAX = 8;

function adresse(nom, mode) {
  const p = new URLSearchParams({ nom: nom || 'PILOTE', mode: mode || 'arcade' });
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${RACINE}/duo?${p}`;
}

export class Duo {
  constructor(rappels = {}) {
    this.r = rappels;
    this.ws = null;
    this.etat = 'ferme'; // ferme | connexion | hall | salon | partie
    this.salonId = null;
    this.role = null;
    this.moi = 0; // 0 ou 1 : quel vaisseau je pilote
    this.joueurs = [];
    this.graine = 0;
    // Les commandes reçues de l'autre, indexées par numéro d'image. On ne les
    // efface qu'après les avoir consommées : un paquet en avance doit pouvoir
    // attendre son tour.
    this.recues = new Map();
    this.frame = 0;
    this.reste = 0;
    this.attentes = 0; // images passées à attendre l'autre, pour le diagnostic
  }

  // --- Connexion -------------------------------------------------------------

  connecte({ nom, mode }) {
    this.ferme();
    this.etat = 'connexion';
    this.mode = mode;
    const ws = new WebSocket(adresse(nom, mode));
    this.ws = ws;
    ws.onopen = () => {
      this.etat = 'hall';
      this.r.onEtat?.('hall');
    };
    ws.onmessage = (e) => this._recois(e.data);
    ws.onerror = () => this.r.onErreur?.('reseau');
    ws.onclose = () => {
      const avant = this.etat;
      this.etat = 'ferme';
      this.ws = null;
      // Une fermeture pendant une partie n'est pas la même chose qu'une
      // fermeture au salon : dans le premier cas, quelqu'un est en train de
      // jouer et il faut le prévenir tout de suite.
      this.r.onEtat?.('ferme', avant);
    };
  }

  ferme() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.etat = 'ferme';
    this.salonId = null;
    this.recues.clear();
  }

  _envoie(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  // --- Salon -----------------------------------------------------------------

  cree() {
    this._envoie({ t: 'creer' });
  }

  rejoint(id) {
    this._envoie({ t: 'rejoindre', id });
  }

  quitte() {
    this._envoie({ t: 'quitter' });
    this.salonId = null;
    this.etat = 'hall';
  }

  choisitCoque(coque) {
    this.coque = coque;
    this._envoie({ t: 'coque', coque });
  }

  lister() {
    this._envoie({ t: 'lister' });
  }

  annonceFin(score, vague) {
    this._envoie({ t: 'fin', score, vague });
  }

  _recois(brut) {
    let m;
    try {
      m = JSON.parse(brut);
    } catch {
      return;
    }
    switch (m.t) {
      case 'salons':
        return this.r.onSalons?.(m.l);
      case 'salon':
        this.salonId = m.id;
        this.role = m.role;
        this.etat = 'salon';
        return this.r.onSalon?.(m);
      case 'pair':
        return this.r.onPair?.(m);
      case 'compte':
        return this.r.onCompte?.(m.n);
      case 'go':
        this.graine = m.graine;
        this.moi = m.moi;
        this.joueurs = m.joueurs;
        this.etat = 'partie';
        this.frame = 0;
        this.reste = 0;
        this.attentes = 0;
        this.recues.clear();
        return this.r.onGo?.(m);
      case 'c':
        this.recues.set(m.f, m.d);
        return;
      case 'fin':
        return this.r.onFinAutre?.(m);
      case 'parti':
        this.etat = this.salonId ? 'salon' : 'hall';
        return this.r.onParti?.(m);
      case 'erreur':
        return this.r.onErreur?.(m.code);
      default:
        return;
    }
  }

  // --- Pas verrouillé --------------------------------------------------------

  // Ce qu'on envoie pour l'image `frame + DELAI`. `encode` transforme la commande
  // du jeu en tableau de nombres — c'est le seul endroit qui sait à quoi elle
  // ressemble, et le serveur, lui, ne le sait pas du tout.
  publie(donnees) {
    this._envoie({ t: 'c', f: this.frame + DELAI, d: donnees });
  }

  // Y a-t-il de quoi calculer l'image courante ? En solo il n'y a rien à
  // attendre ; à deux, il faut la commande de l'autre.
  pret() {
    return this.etat !== 'partie' || this.recues.has(this.frame);
  }

  // La commande de l'autre pour l'image courante, puis on l'oublie.
  consomme() {
    const d = this.recues.get(this.frame);
    this.recues.delete(this.frame);
    return d || null;
  }

  // Combien de pas de simulation exécuter pour le temps réel écoulé. Le reliquat
  // est conservé : c'est lui qui empêche la dérive entre l'horloge de l'écran et
  // celle du monde.
  pas(dtReel) {
    this.reste += Math.min(dtReel, 0.25);
    let n = 0;
    while (this.reste >= PAS && n < RATTRAPAGE_MAX) {
      this.reste -= PAS;
      n++;
    }
    // Ce qui dépasse le rattrapage est abandonné, sinon on accumulerait une
    // dette de temps qu'on ne rembourserait jamais.
    if (this.reste > PAS * RATTRAPAGE_MAX) this.reste = 0;
    return n;
  }
}
