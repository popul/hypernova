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

function adresse(nom, mode, jeton) {
  const p = new URLSearchParams({ nom: nom || 'PILOTE', mode: mode || 'arcade' });
  // Le jeton vaut identité : sans lui on peut jouer, mais aucun ami ne nous voit.
  if (jeton) p.set('jeton', jeton);
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
    // Le pair d'un pas verrouillé SANS salon : renseigné quand un copain qui
    // regardait se met à jouer. Voir `publie`.
    this.direct = null;
    this.frame = 0;
    this.reste = 0;
    this.attentes = 0; // images passées à attendre l'autre, pour le diagnostic
  }

  // --- Connexion -------------------------------------------------------------

  // LA CONNEXION EST OUVERTE DÈS LE DÉMARRAGE, PAS SEULEMENT AU SALON.
  //
  // C'est elle qui porte la présence des amis. Ne l'ouvrir qu'en entrant dans le
  // salon revenait à n'apprendre qu'un copain est en ligne qu'au moment où l'on
  // cherchait déjà à jouer avec lui — c'est-à-dire trop tard pour que ça serve à
  // quelque chose.
  //
  // Rouvrir une connexion déjà ouverte coûterait une poignée de main pour rien :
  // on se contente alors de redemander la liste des tables.
  connecte({ nom, mode, jeton = null }) {
    if (this.ws?.readyState === 1) {
      if (mode && mode !== this.mode) {
        this.mode = mode;
        this._envoie({ t: 'mode', mode });
      }
      this.lister();
      return;
    }
    this.ferme();
    // Ce qu'il faut pour revenir tout seul si la ligne tombe.
    this._voulu = true;
    this._dernier = { nom, mode, jeton };
    this.etat = 'connexion';
    this.mode = mode;
    const ws = new WebSocket(adresse(nom, mode, jeton));
    this.ws = ws;
    ws.onopen = () => {
      this.etat = 'hall';
      this._essais = 0; // la ligne est revenue : on repart d'une attente courte
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
      this._replanifie();
    };
  }

  // ON SE RECONNECTE, SINON LA PRÉSENCE MEURT AU PREMIER HOQUET.
  //
  // Un téléphone qui se met en veille, un tunnel, un changement de réseau : la
  // connexion tombe, et rien ne la rouvrait. Les amis restaient alors
  // éternellement « hors ligne », les appels ne passaient plus et le mode
  // spectateur non plus — sans aucun message, puisque de notre côté tout avait
  // l'air normal.
  //
  // L'attente double à chaque échec, plafonnée à trente secondes : on ne
  // martèle pas un serveur qui ne répond pas, et on revient vite quand ce
  // n'était qu'un trou de réseau.
  _replanifie() {
    if (this._voulu === false || !this._dernier) return;
    this._essais = (this._essais || 0) + 1;
    const attente = Math.min(30000, 1000 * Math.pow(2, this._essais - 1));
    clearTimeout(this._reprise);
    this._reprise = setTimeout(() => {
      if (this._voulu !== false) this.connecte(this._dernier);
    }, attente);
  }

  ferme() {
    // Fermeture VOULUE : on ne se reconnecte pas derrière le dos de l'appelant.
    this._voulu = false;
    clearTimeout(this._reprise);
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

  // Dire au serveur ce qu'on joue maintenant. La connexion ne se rouvre pas :
  // elle sert aussi de canal de présence, et la fermer couperait les amis.
  changeMode(mode) {
    if (!mode || mode === this.mode) return;
    this.mode = mode;
    this._envoie({ t: 'mode', mode });
  }

  lister() {
    this._envoie({ t: 'lister' });
  }

  signale(vers, sujet, d) {
    this._envoie({ t: 'signal', vers, sujet, d });
  }

  // Le serveur ne sait pas ce qui se joue chez nous : on le lui dit, pour que nos
  // amis puissent proposer de regarder.
  annonceJeu(oui) {
    this._envoie({ t: 'joue', oui: !!oui });
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
      case 'presence':
        this.presence = m.l;
        return this.r.onPresence?.(m.l);
      // La signalisation de la voix passe par le même canal. Le contenu ne nous
      // regarde pas : on le remet à qui sait le lire.
      case 'signal':
        return this.r.onSignal?.(m.de, m.sujet, m.d);
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

  // L'AMORÇAGE, sans lequel rien ne démarre.
  //
  // Chaque commande est publiée pour l'image `f + DELAI`. Les DELAI premières
  // images n'ont donc, par construction, aucune commande — et les deux clients
  // s'attendent l'un l'autre pour toujours. Il faut poser à la main ces
  // premières images vides, des deux côtés : c'est le seul instant du protocole
  // où l'on envoie quelque chose qu'on n'a pas joué.
  amorce(neutre) {
    // L'AMORÇAGE EMPRUNTE LE MÊME TUYAU QUE LE RESTE, et il faut y penser : il
    // partait toujours par le salon. En pas verrouillé DIRECT il n'y a pas de
    // salon, donc les quatre premières images ne sont jamais arrivées — chacun
    // attendait de l'autre une commande pour l'image zéro, et les deux
    // s'arrêtaient là. Mesuré sur le banc : cent soixante-dix-neuf attentes de
    // chaque côté, image zéro, plus rien qui avance.
    for (let f = 0; f < DELAI; f++) {
      if (this.direct) this.signale(this.direct, 'c', { f, d: neutre });
      else this._envoie({ t: 'c', f, d: neutre });
    }
  }

  // Ce qu'on envoie pour l'image `frame + DELAI`. `encode` transforme la commande
  // du jeu en tableau de nombres — c'est le seul endroit qui sait à quoi elle
  // ressemble, et le serveur, lui, ne le sait pas du tout.
  publie(donnees) {
    // DEUX TRANSPORTS POUR LE MÊME PAS VERROUILLÉ.
    //
    // Une partie à deux montée depuis le hall passe par un SALON : le serveur
    // relaie les commandes entre les deux membres. Mais on peut aussi devenir
    // deux en cours de route — un copain qui regardait demande à jouer — et il
    // n'y a alors pas de salon, seulement le canal des amis, déjà ouvert et déjà
    // en train de porter la partie image par image.
    //
    // Plutôt que d'ouvrir un salon au milieu d'une vague, on fait passer les
    // commandes par ce canal-là. Toute la discipline du pas verrouillé — le
    // délai, l'attente, le rattrapage — ne change pas d'une ligne : seul le
    // tuyau change.
    if (this.direct) return this.signale(this.direct, 'c', { f: this.frame + DELAI, d: donnees });
    this._envoie({ t: 'c', f: this.frame + DELAI, d: donnees });
  }

  // Bascule en pas verrouillé DIRECT avec un ami, sans salon. `moi` vaut 0 pour
  // celui qui hébergeait la partie, 1 pour celui qui arrive.
  ouvreDirect(nom, moi) {
    this.direct = nom;
    this.moi = moi;
    this.etat = 'partie';
    this.frame = 0;
    this.reste = 0;
    this.attentes = 0;
    this.recues.clear();
  }

  fermeDirect() {
    this.direct = null;
    if (this.etat === 'partie' && !this.salonId) this.etat = 'hall';
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
