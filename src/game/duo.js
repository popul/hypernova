// LE JEU EN RÉSEAU, CÔTÉ CLIENT : le salon, puis le pas verrouillé — à deux ou
// à trois.
//
// LE PRINCIPE, EN UNE PHRASE. Tous les joueurs simulent la MÊME partie, chacun
// chez lui, et ne s'échangent que ce que leurs doigts font. Rien d'autre ne
// traverse le réseau : ni les ennemis, ni les tirs, ni le score.
//
// C'est possible parce que le jeu est déterministe — le hasard est semé par
// vague à partir d'une graine commune, et les commandes sont arrondies avant
// d'être appliquées. C'est déjà ce qui fait marcher le rejeu.
//
// LE PAS VERROUILLÉ, ET SON PRIX. Pour calculer l'image N, il faut les commandes
// de TOUS les joueurs pour l'image N. Attendre celle de l'autre à chaque image
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

// LE RATTRAPAGE DU SPECTATEUR : combien d'images consommer EN PLUS ce tour-ci
// quand sa file a grossi — onglet passé en fond, réseau qui hoquette, appareil
// qui ralentit.
//
// L'ancienne réponse jetait la file et attendait l'instantané du prochain
// tableau. Deux torts, tous deux vus en vrai. Pendant un combat de boss, le
// prochain tableau est à plusieurs minutes : l'écran restait GELÉ tout du long.
// Et jeter des commandes au milieu d'un flux qui n'est qu'une suite ordonnée,
// c'est recoller la simulation sur les commandes d'APRÈS : elle divergeait en
// silence — un vaisseau ailleurs, des morts qui n'arrivent pas — jusqu'au
// tableau suivant.
//
// On consomme donc l'excédent en accéléré : six cents images de simulation par
// image rendue au plus — dix secondes de retard avalées en un battement, sans
// rien perdre ni rien corrompre. Le seuil laisse vivre l'amortisseur normal, et
// le tampon garde une seconde d'avance pour ne pas repartir à sec.
export function pasDeRattrapage(retard, { tampon = 45, seuil = 120, maxParImage = 600 } = {}) {
  if (retard <= seuil) return 0;
  return Math.max(0, Math.min(retard - tampon, maxParImage));
}
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

// QUI PHOTOGRAPHIE LA TABLE.
//
// Le pas verrouillé n'est pas un déterminisme parfait : ma commande s'applique
// chez moi tout de suite et chez les autres quatre images plus tard, donc les
// simulations sont VOISINES, jamais identiques. Ce qui les recolle, c'est la
// photo de frontière de vague — le mécanisme du spectateur, appliqué aux
// joueurs. Reste à désigner le photographe : UN SEUL, le même pour tous, sans
// se concerter. La règle est « le plus petit numéro encore en course » —
// ni parti, ni arrivé au bout de sa partie. Chacun la déduit des mêmes
// messages de table (`parti`, `fin`), donc tout le monde nomme le même.
//
// `moi` : mon numéro. `autres` : les autres postes, `{numero, fini}`.
// `partis` : les numéros que le serveur a déclarés partis.
export function estPhotographe(moi, autres, partis) {
  if (!autres?.length) return false; // plus de table : régime solo, rien à recaler
  for (const b of autres) {
    if (b.fini || partis?.has?.(b.numero)) continue;
    if (b.numero < moi) return false;
  }
  return true;
}

export class Duo {
  constructor(rappels = {}) {
    this.r = rappels;
    this.ws = null;
    this.etat = 'ferme'; // ferme | connexion | hall | salon | partie
    this.salonId = null;
    this.role = null;
    // MON NUMÉRO DE JOUEUR : 0, 1 ou 2. On n'écrit JAMAIS « moi » et « lui »
    // dans un état qui traverse le réseau, toujours des numéros — c'est la leçon
    // de l'échange de vaisseaux du mode rejoindre : ces deux mots désignent des
    // choses différentes de chaque côté de la ligne.
    this.moi = 0;
    this.joueurs = [];
    this.graine = 0;
    // Les PAIRS : les autres joueurs, `{ numero, nom }`, ordonnés par numéro
    // croissant. C'est cet ordre — jamais celui d'arrivée des paquets — qui
    // aligne les commandes consommées sur les bords distants du jeu.
    this.pairs = [];
    // Les NUMÉROS des pairs partis en cours de partie. On ne les retire pas tout
    // de suite : leurs dernières commandes, déjà relayées, se consomment
    // jusqu'au bout — voir `consomme`, c'est ce qui rend le retrait déterministe.
    this.partis = new Set();
    // Les commandes reçues, par PAIR puis par image
    // (numéro de joueur → Map image → commande). On ne les efface qu'après les
    // avoir consommées : un paquet en avance doit pouvoir attendre son tour.
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
    this.pairs = [];
    this.partis.clear();
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

  // L'hôte décide du décollage : un salon n'attend pas d'être plein, on part à
  // deux comme à trois. Le serveur lance alors le compte à rebours pour tous.
  lance() {
    this._envoie({ t: 'lancer' });
  }

  // LA PAUSE EST PARTAGÉE. À plusieurs, « pause » veut dire que la table
  // s'arrête — pas qu'un vaisseau reste figé au milieu des balles pendant que
  // les autres jouent, jusqu'à ce que le garde-fou des muets le retire de la
  // partie. Le message ne touche pas au pas verrouillé : chacun cesse d'appeler
  // update, et les commandes reprennent où elles s'étaient tues. En liaison
  // directe, même geste par le canal des amis.
  pause(oui) {
    if (this.direct) return this.signale(this.direct, 'pause', { oui: !!oui });
    this._envoie({ t: 'pause', oui: !!oui, nom: this._dernier?.nom || '' });
  }

  // La photo de frontière de vague, de l'hôte vers la table. En liaison
  // directe, le canal des amis fait le même travail avec `resync-etat`.
  etatVague(d) {
    this._envoie({ t: 'etat-vague', j: this.moi, d });
  }

  // L'empreinte croisée, à toute la table d'un coup. Elle passait par le canal
  // des amis, qui exige l'amitié : deux invités d'une table publique ne se
  // connaissent pas forcément, et leurs divergences passaient sans témoin.
  empreinte(d) {
    this._envoie({ t: 'emp', j: this.moi, d });
  }

  quitte() {
    this._envoie({ t: 'quitter' });
    this.salonId = null;
    this.etat = 'hall';
    // La tablée appartenait à cette table : la garder ferait montrer les sièges
    // d'hier à la prochaine table ouverte, le temps que le serveur reparle.
    this.joueurs = [];
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
    // Signée du numéro, comme les commandes : le relais est verbatim, et à trois
    // il faut savoir quel score est à qui.
    this._envoie({ t: 'fin', j: this.moi, score, vague });
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
        // EN PARTIE, ON Y RESTE. Quand l'hôte s'en va à trois, le serveur promeut
        // le premier invité et le lui dit par ce même message `salon` : retomber
        // à l'état « salon » couperait le pas verrouillé en plein vol — plus
        // d'attente des pairs, simulation en temps réel, divergence immédiate.
        if (this.etat !== 'partie') this.etat = 'salon';
        if (Array.isArray(m.joueurs)) this.joueurs = m.joueurs;
        return this.r.onSalon?.(m);
      // La composition de la table, rejouée entière à chaque changement : qui
      // est assis, avec quelle coque, et QUEL NUMÉRO est le nôtre — deux invités
      // sans compte peuvent porter le même pseudo, le nom ne suffit pas.
      case 'equipage':
        if (Array.isArray(m.joueurs)) this.joueurs = m.joueurs;
        if (this.etat !== 'partie' && typeof m.moi === 'number') this.moi = m.moi;
        return this.r.onEquipage?.(m);
      case 'compte':
        if (Array.isArray(m.joueurs)) this.joueurs = m.joueurs;
        return this.r.onCompte?.(m.n);
      case 'go':
        this.graine = m.graine;
        this.moi = m.moi;
        this.joueurs = m.joueurs;
        // Mes pairs, ordonnés par NUMÉRO : l'indice dans `joueurs` fait loi, et
        // il est FIGÉ pour toute la partie — un départ ne renumérote personne.
        this.pairs = m.joueurs
          .map((j, numero) => ({ numero, nom: j.nom }))
          .filter((p) => p.numero !== m.moi);
        this.partis.clear();
        this.etat = 'partie';
        this.frame = 0;
        this.reste = 0;
        this.attentes = 0;
        this.recues.clear();
        return this.r.onGo?.(m);
      case 'c':
        // Le relais est VERBATIM : c'est l'ÉMETTEUR qui signe sa commande de son
        // numéro (`j`, posé dans `publie`) — à trois, « l'autre » n'existe plus.
        // Sans signature (partie à deux d'avant), elle ne peut venir que de
        // l'unique pair.
        this.recoisCommande(m.j ?? this.pairs[0]?.numero, m.f, m.d);
        return;
      case 'fin':
        return this.r.onFinAutre?.(m);
      case 'pause':
        return this.r.onPause?.(m);
      case 'etat-vague':
        return this.r.onEtatVague?.(m);
      case 'emp':
        return this.r.onEmpreinte?.(m);
      case 'parti':
        // EN PARTIE, LE DÉPART NE COUPE PAS LE PAS VERROUILLÉ : les autres
        // continuent. On marque le partant — par son NUMÉRO du décollage, que le
        // serveur fige — ses dernières commandes déjà relayées s'épuisent, et
        // c'est le jeu qui retire son bord, voir `consomme`. Hors partie, on
        // retombe au salon ou au hall comme avant.
        if (this.etat === 'partie') {
          if (typeof m.slot === 'number') this.marquePart(m.slot);
          else if (this.pairs.length === 1) this.marquePart(this.pairs[0].numero);
        } else {
          // La table est morte quand l'hôte est parti (`hote`) ou qu'elle a
          // expiré : on retombe au hall, sièges compris — les garder peints
          // montrerait une tablée qui n'existe plus.
          if (m.hote || m.cause === 'expire') {
            this.salonId = null;
            this.joueurs = [];
          }
          this.etat = this.salonId ? 'salon' : 'hall';
        }
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
      else this._envoie({ t: 'c', j: this.moi, f, d: neutre });
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
    // LA COMMANDE EST SIGNÉE DU NUMÉRO DE SON ÉMETTEUR (`j`). Le relais du
    // salon passe les octets tels quels, sans savoir de qui ils viennent : à
    // trois, c'est cette signature qui range chaque commande dans la bonne
    // besace chez ceux qui la reçoivent.
    if (this.direct) return this.signale(this.direct, 'c', { f: this.frame + DELAI, d: donnees });
    this._envoie({ t: 'c', j: this.moi, f: this.frame + DELAI, d: donnees });
  }

  // Une commande arrive d'un pair — par le salon ou par le canal des amis. `de`
  // est son NUMÉRO de joueur : l'identité qui ne ment pas, là où deux invités
  // peuvent porter le même pseudo.
  recoisCommande(de, f, d) {
    if (typeof de !== 'number') return;
    let parImage = this.recues.get(de);
    if (!parImage) {
      parImage = new Map();
      this.recues.set(de, parImage);
    }
    parImage.set(f, d);
  }

  // Un pair a quitté la partie. On ne jette RIEN : ses dernières commandes,
  // relayées à tout le monde avant sa fermeture, sont les mêmes chez chaque
  // survivant — les consommer jusqu'au bout, puis retirer son bord à la première
  // image sans commande, donne à tous le MÊME instant de retrait. Un retrait « à
  // réception du message » se ferait à des images différentes selon la latence
  // de chacun, et les simulations divergeraient en silence.
  marquePart(numero) {
    if (this.pairs.some((p) => p.numero === numero)) this.partis.add(numero);
  }

  // Le jeu a retiré son bord : le pair sort pour de bon du pas verrouillé.
  retire(numero) {
    this.pairs = this.pairs.filter((p) => p.numero !== numero);
    this.partis.delete(numero);
    this.recues.delete(numero);
  }

  // Bascule en pas verrouillé DIRECT avec un ami, sans salon. `moi` vaut 0 pour
  // celui qui hébergeait la partie, 1 pour celui qui arrive. Le rejoindre-en-
  // cours reste une affaire à DEUX : un spectateur rejoint une partie solo —
  // l'étendre à trois est un chantier séparé.
  ouvreDirect(nom, moi) {
    this.direct = nom;
    this.moi = moi;
    this.pairs = [{ numero: 1 - moi, nom }];
    this.partis.clear();
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
  // attendre ; en réseau, il faut la commande de CHAQUE pair encore là. Un pair
  // parti n'est plus attendu : ce qu'il a laissé se consomme, et c'est tout.
  pret() {
    if (this.etat !== 'partie') return true;
    for (const p of this.pairs) {
      if (this.partis.has(p.numero)) continue;
      if (!this.recues.get(p.numero)?.has(this.frame)) return false;
    }
    return true;
  }

  // Les commandes des pairs pour l'image courante, ORDONNÉES PAR NUMÉRO DE
  // JOUEUR — le même ordre que `pairs`, donc que les bords distants du jeu.
  // Un pair parti dont la réserve est épuisée rend `null` : c'est le signal,
  // identique chez tous les survivants, que son bord se retire à cette image.
  consomme() {
    return this.pairs.map((p) => {
      const parImage = this.recues.get(p.numero);
      const d = parImage?.get(this.frame);
      parImage?.delete(this.frame);
      return d || null;
    });
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
