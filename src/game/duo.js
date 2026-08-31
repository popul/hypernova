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
// LE DÉLAI D'ENTRÉE : de combien d'images ma commande est postdatée.
//
// C'est le budget que je donne au réseau pour livrer mes touches avant que les
// autres n'en aient besoin. Trop court, tout le monde attend à chaque image et
// le jeu hoquette ; trop long, mon manche répond mou. Quatre images font
// soixante-six millisecondes : parfait sur un même wifi, insuffisant dès qu'un
// copain joue en 4G.
//
// Il s'ADAPTE donc, entre ces deux bornes, à la latence réellement mesurée. Le
// changement est un acte de simulation comme un autre : il ne s'applique jamais
// au fil de l'eau — voir `changeDelai`.
export const DELAI = 4;
export const DELAI_MIN = 3;
export const DELAI_MAX = 12;

// Combien d'images d'avance on garde en plus de la latence mesurée. Le réseau
// n'est pas régulier : viser exactement l'aller-retour moyen, c'est attendre une
// image sur deux. Deux images de marge absorbent la gigue ordinaire.
export const MARGE_GIGUE = 2;

// Dix secondes de commandes gardées : au-delà, un pair qui n'a pas reparlé n'est
// plus en retard, il est parti — et c'est le serveur qui le dira.
const HISTOIRE_MAX = 600;

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
    // Le délai EN VIGUEUR. Il ne change qu'aux frontières de vague, et de la
    // même façon chez tout le monde — voir `changeDelai`.
    this.delai = DELAI;
    // Ce qu'on a mesuré depuis la dernière frontière : le pire aller-retour vu
    // avec un pair, en images. On garde le PIRE et pas la moyenne — c'est le
    // retardataire qui fait attendre toute la table.
    this.pireRetard = 0;
    this._envoiA = new Map(); // image publiée → temps mur de l'envoi
    // Les états d'améliorations en transit, par numéro puis par image.
    this.bordages = new Map();
    // CE QUE J'AI PUBLIÉ, GARDÉ SOUS LA MAIN.
    //
    // Le pas verrouillé s'arrête sur une commande manquante — c'est sa vertu, il
    // préfère attendre à diverger. Mais rien ne la faisait jamais revenir : une
    // seule commande perdue et la table restait figée pour toujours. Mesuré au
    // banc : deux pertes, et les deux machines s'arrêtent aux images 14 et 10.
    // On garde donc dix secondes de son propre passé, de quoi répondre à qui
    // redemande.
    this.histoire = new Map();
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

  // JE BLOQUE SUR UNE IMAGE : je réclame ce qui manque.
  //
  // Sur une socket ouverte, rien ne se perd — c'est du TCP. Mais une socket ne
  // reste pas ouverte : elle meurt quand le téléphone change de réseau, quand
  // l'écran se verrouille, quand un intermédiaire coupe une connexion inactive,
  // ou quand le serveur redémarre pour une mise à jour. Tout ce que j'émets
  // pendant ce temps-là part dans le vide, silencieusement — et le pas verrouillé
  // attend pour toujours une commande qui ne reviendra jamais.
  redemande(numero, image) {
    this._envoie({ t: 'redemande', j: this.moi, de: numero, f: image });
  }

  // Quelqu'un réclame une de mes commandes : je la renvoie, elle et toutes celles
  // qui suivent — s'il lui en manque une, il lui en manque probablement une
  // rafale, et un aller-retour par image coûterait plus cher que le tout.
  _repondALaRedemande(image) {
    for (const [f, e] of this.histoire) {
      if (f < image) continue;
      if (this.direct) this.signale(this.direct, 'c', { f, d: e.d, b: e.b });
      else this._envoie({ t: 'c', j: this.moi, f, d: e.d, b: e.b });
    }
  }

  // Les pairs dont la commande manque pour l'image courante. C'est la liste de
  // ceux à qui réclamer — et, au bout du compte, de ceux qu'il faudra déclarer
  // partis si le silence dure.
  muets() {
    if (this.etat !== 'partie') return [];
    return this.pairs.filter(
      (p) => !this.partis.has(p.numero) && !this.recues.get(p.numero)?.has(this.frame)
    );
  }

  // La trajectoire choisie, de l'hôte vers la table.
  route(d) {
    this._envoie({ t: 'route', j: this.moi, d });
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
        this.recoisCommande(m.j ?? this.pairs[0]?.numero, m.f, m.d, m.b);
        return;
      case 'fin':
        return this.r.onFinAutre?.(m);
      case 'pause':
        return this.r.onPause?.(m);
      case 'redemande':
        // Elle ne me concerne que si c'est MA commande qu'on réclame.
        if (m.de === this.moi) this._repondALaRedemande(m.f);
        return;
      case 'route':
        return this.r.onRoute?.(m);
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
    this._dernierPour = this.delai - 1;
    for (let f = 0; f < this.delai; f++) {
      // Pour moi comme pour eux : ma file part de la même amorce, sans quoi mes
      // DELAI premières images n'auraient aucune commande à consommer.
      this.recoisCommande(this.moi, f, neutre);
      if (this.direct) this.signale(this.direct, 'c', { f, d: neutre });
      else this._envoie({ t: 'c', j: this.moi, f, d: neutre });
    }
  }

  // Ce qu'on envoie pour l'image `frame + DELAI`. `encode` transforme la commande
  // du jeu en tableau de nombres — c'est le seul endroit qui sait à quoi elle
  // ressemble, et le serveur, lui, ne le sait pas du tout.
  // `bordage` : l'état d'améliorations à faire voyager AVEC cette commande, quand
  // il vient de changer. C'est le seul canal qui garantisse une application à la
  // MÊME IMAGE chez tout le monde — un achat annoncé par un message à part
  // arriverait à des images différentes selon la latence, et les vaisseaux
  // n'auraient pas la même vitesse au même moment. Absent la plupart du temps :
  // on ne l'attache qu'après un achat ou une escale.
  publie(donnees, bordage = null) {
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
    //
    // ET ELLE ENTRE DANS MA PROPRE FILE, exactement comme celle d'un pair.
    //
    // C'est LE point qui manquait, et il coûtait toutes les désynchronisations
    // du jeu en réseau. Ma commande partait pour l'image `f + DELAI` chez les
    // autres, mais ma simulation à moi l'appliquait tout de suite, à l'image
    // `f` : mon vaisseau tournait quatre images plus tôt chez moi que chez le
    // copain. Mesuré sur le banc, sans ambiguïté — appui à l'image 150, vu à
    // l'image 154 en face. Deux machines qui n'appliquent pas les mêmes
    // commandes aux mêmes images ne simulent pas la même partie, et aucune
    // réparation en aval ne rattrape ça : elle recolle un écart qui renaît à
    // l'image suivante.
    //
    // Le pas verrouillé veut que TOUT LE MONDE, moi compris, soit servi par la
    // même file. Le prix est un délai d'entrée de quatre images — soixante-six
    // millisecondes, uniquement en réseau — et c'est le prix normal du genre :
    // mieux vaut un manche qui répond un souffle plus tard que deux parties qui
    // divergent.
    // UNE ESTAMPILLE NE RECULE JAMAIS.
    //
    // En baissant le délai, on se met à publier pour une image PLUS PROCHE — et
    // donc, éventuellement, pour une image que les autres ont déjà jouée avec la
    // valeur d'avant. Ils l'avaient déjà : l'amorce, ou ma commande précédente.
    // Ma vraie commande arrivait après coup, dans le vide, et mon vaisseau
    // bougeait chez moi une image avant chez eux. Mesuré au banc : divergence à
    // l'image 3, après une descente de quatre à trois au tout premier tableau.
    //
    // On garde donc la plus grande des deux : l'image visée par le délai, et
    // celle qui suit ma dernière publication. Une baisse ne se traduit alors pas
    // par un saut en arrière mais par un rattrapage — le délai réel se resserre
    // d'une image par image, sans jamais rien réécrire.
    const pour = Math.max(this.frame + this.delai, (this._dernierPour ?? -1) + 1);
    this._dernierPour = pour;
    this.histoire.set(pour, { d: donnees, b: bordage || null });
    if (this.histoire.size > HISTOIRE_MAX) {
      const vieux = this.histoire.keys().next().value;
      this.histoire.delete(vieux);
    }
    this.recoisCommande(this.moi, pour, donnees, bordage);
    // On note QUAND on a envoyé pour cette image-là. Quand la commande d'un pair
    // pour la même image arrive, l'écart donne l'aller-retour réel, en images,
    // sans horloge partagée ni message de mesure : le trafic mesure le trafic.
    this._envoiA.set(pour, this._maintenant());
    if (this._envoiA.size > 300) {
      const vieux = this._envoiA.keys().next().value;
      this._envoiA.delete(vieux);
    }
    if (this.direct) return this.signale(this.direct, 'c', { f: pour, d: donnees, b: bordage });
    this._envoie({ t: 'c', j: this.moi, f: pour, d: donnees, b: bordage });
  }

  // MA commande pour l'image courante — celle que j'ai publiée DELAI images
  // plus tôt, et que les autres appliquent à cette image-ci. `null` si elle
  // manque, ce qui ne doit pas arriver : l'amorçage remplit les premières.
  mienne() {
    const parImage = this.recues.get(this.moi);
    const d = parImage?.get(this.frame);
    parImage?.delete(this.frame);
    return d || null;
  }

  // Une commande arrive d'un pair — par le salon ou par le canal des amis. `de`
  // est son NUMÉRO de joueur : l'identité qui ne ment pas, là où deux invités
  // peuvent porter le même pseudo.
  // Le temps mur, isolé ici pour que les épreuves puissent le piloter.
  _maintenant() {
    return typeof performance !== 'undefined' ? performance.now() : 0;
  }

  recoisCommande(de, f, d, b = null) {
    if (typeof de !== 'number') return;
    if (b) {
      let parBord = this.bordages.get(de);
      if (!parBord) {
        parBord = new Map();
        this.bordages.set(de, parBord);
      }
      parBord.set(f, b);
    }
    // LA MESURE DE LATENCE, GRATUITE. La commande d'un pair pour l'image `f` me
    // parvient ; j'ai publié la mienne pour cette même image à un instant connu.
    // L'écart, converti en images, est l'aller-retour vu de mon siège. On garde
    // le pire depuis la dernière frontière : c'est le retardataire qui décide du
    // confort de toute la table.
    if (de !== this.moi) {
      const envoi = this._envoiA.get(f);
      if (envoi) {
        const images = Math.ceil(((this._maintenant() - envoi) / 1000 / PAS) * 0.5);
        if (images > this.pireRetard) this.pireRetard = Math.min(images, DELAI_MAX * 2);
      }
    }
    let parImage = this.recues.get(de);
    if (!parImage) {
      parImage = new Map();
      this.recues.set(de, parImage);
    }
    parImage.set(f, d);
  }

  // LE DÉLAI NE CHANGE QU'À UNE FRONTIÈRE, ET DE LA MÊME FAÇON PARTOUT.
  //
  // C'est tout le sujet : changer le postdatage au fil de l'eau créerait des
  // images sans commande ou des commandes en double, donc une divergence. On le
  // change donc à un instant que toutes les machines traversent en même temps —
  // le départ d'une vague — et à partir d'une valeur qu'elles partagent : le
  // pire retard vu par CHACUN voyage avec les commandes, et c'est le maximum de
  // la table qui l'emporte.
  //
  // Le nouveau délai vaut le retard mesuré plus une marge de gigue, borné. En
  // montant, il faut aussi remplir le trou : les images entre l'ancien et le
  // nouveau délai n'ont encore été publiées par personne, on les amorce.
  // `cible` est le délai VOULU, borné ici — pas une mesure. La marge de gigue
  // est ajoutée par l'appelant : mélanger les deux dans la même fonction faisait
  // qu'une descente demandée à `delai - 2` revenait exactement à `delai`, et le
  // budget ne redescendait jamais.
  changeDelai(cible, neutre) {
    const vise = Math.max(DELAI_MIN, Math.min(DELAI_MAX, cible));
    if (vise === this.delai) return this.delai;
    const avant = this.delai;
    this.delai = vise;
    if (vise > avant) {
      for (let f = this.frame + avant; f < this.frame + vise; f++) {
        if (f <= (this._dernierPour ?? -1)) continue; // déjà publiée, on ne réécrit pas
        this._dernierPour = f;
        this.recoisCommande(this.moi, f, neutre);
        if (this.direct) this.signale(this.direct, 'c', { f, d: neutre });
        else this._envoie({ t: 'c', j: this.moi, f, d: neutre });
      }
    }
    return this.delai;
  }

  // LA POLITIQUE : quand changer, et de combien.
  //
  // Le délai est une propriété DE CHAQUE JOUEUR, pas de la table — c'est ce qui
  // rend l'adaptation possible sans se concerter. Ma commande porte l'image pour
  // laquelle elle vaut ; que je la poste avec quatre ou dix images d'avance, tout
  // le monde l'applique à l'image inscrite dessus. Deux pilotes peuvent donc
  // vivre avec deux budgets différents sans que rien ne diverge, et celui qui a
  // un mauvais réseau paie sa latence tout seul au lieu de faire hoqueter les
  // autres.
  //
  // On MONTE vite : dès que la mesure dépasse le budget, parce que chaque image
  // de retard est une image où toute la table attend. On DESCEND lentement, d'un
  // cran et seulement aux frontières de vague, parce qu'un réseau qui va mieux
  // pendant deux secondes ne prouve rien, et qu'un délai qui yoyote se sent plus
  // qu'un délai un peu trop grand.
  ajusteDelai(neutre, frontiere = false) {
    if (this.etat !== 'partie') return this.delai;
    const vise = this.pireRetard + MARGE_GIGUE;
    if (vise > this.delai) {
      const t = this._maintenant();
      // Pas plus d'une montée par seconde : sinon un hoquet isolé grimperait
      // marche après marche jusqu'au plafond.
      if (t - (this._derniereMontee || 0) < 1000) return this.delai;
      this._derniereMontee = t;
      return this.changeDelai(vise, neutre);
    }
    if (frontiere) {
      // La mesure s'oublie à chaque vague : sans cet oubli, le pire hoquet de la
      // partie tiendrait le délai en l'air jusqu'à la fin.
      const mesure = this.pireRetard;
      this.pireRetard = 0;
      // Un cran à la fois, et seulement si la marge reste couverte APRÈS la
      // descente : on préfère un budget un peu large à un yoyo qui se sent.
      if (mesure + MARGE_GIGUE <= this.delai - 1) return this.changeDelai(this.delai - 1, neutre);
    }
    return this.delai;
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
    // La mienne d'abord : depuis qu'elle passe par la file comme les autres,
    // son absence arrête l'image aussi sûrement que celle d'un pair.
    if (!this.recues.get(this.moi)?.has(this.frame)) return false;
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

  // Les états d'améliorations à appliquer À CETTE IMAGE, par numéro de joueur —
  // le mien compris, pour que mon propre achat prenne effet à la même image chez
  // moi que chez les autres. Rend `null` quand il n'y a rien, ce qui est le cas
  // presque toujours.
  bordagesDeLImage() {
    let out = null;
    for (const [numero, parImage] of this.bordages) {
      const b = parImage.get(this.frame);
      if (!b) continue;
      parImage.delete(this.frame);
      (out ||= []).push([numero, b]);
    }
    // Dans l'ordre des numéros, comme tout le reste.
    return out && out.sort((a, z) => a[0] - z[0]);
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
