// INSTALLER LE JEU SUR L'ÉCRAN D'ACCUEIL.
//
// Un jeu qu'on lance depuis un onglet de navigateur n'est pas tout à fait un jeu :
// il faut retrouver l'adresse, la barre d'URL mange le haut de l'écran, et
// personne ne pense à y revenir. Une icône sur l'écran d'accueil change ça — et
// tout est déjà là pour l'obtenir, manifeste et service worker compris.
//
// DEUX MONDES, ET C'EST TOUT LE SUJET.
//
// Android et Chrome donnent un vrai crochet : le navigateur décide que le site
// est installable, envoie `beforeinstallprompt`, et l'on peut alors ouvrir la
// FENÊTRE NATIVE d'installation au moment de son choix. C'est exactement ce
// qu'on veut : le système parle, pas nous.
//
// iOS ne le donne pas. Safari n'a jamais implémenté `beforeinstallprompt` et
// n'expose aucun moyen de déclencher l'ajout à l'écran d'accueil depuis une
// page. Il reste un seul chemin : Partager, puis « Sur l'écran d'accueil ». On
// ne peut donc pas proposer, on ne peut qu'EXPLIQUER — et le dire honnêtement
// vaut mieux qu'un bouton qui ne ferait rien.
//
// QUAND ON DEMANDE. Pas au premier chargement : proposer d'installer un jeu
// qu'on n'a pas encore vu, c'est demander avant d'avoir donné. L'invitation
// apparaît sur l'écran d'accueil, discrètement, et se ferme pour de bon si on la
// refuse — une bannière qui revient est une bannière qu'on apprend à ignorer.

const CLE_REFUS = 'novaswarm.installrefusee';

export class Installation {
  constructor() {
    this.attendue = null; // l'événement mis de côté, à rejouer au bon moment
    this.installee = false;
    this._ecoute();
  }

  _ecoute() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Sans ceci, Chrome affiche sa propre invite quand il l'a décidé. On la
      // met de côté pour la rejouer à un moment qui a du sens.
      e.preventDefault();
      this.attendue = e;
      this.onChangement?.();
    });
    window.addEventListener('appinstalled', () => {
      this.installee = true;
      this.attendue = null;
      this.onChangement?.();
    });
  }

  // Déjà lancée depuis l'écran d'accueil ? Deux façons de le savoir, et il faut
  // les deux : `display-mode` est la norme, `navigator.standalone` est la
  // réponse d'iOS, qui n'implémente pas la première.
  get dejaLancee() {
    return (
      this.installee ||
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      navigator.standalone === true
    );
  }

  get refusee() {
    try {
      return localStorage.getItem(CLE_REFUS) === '1';
    } catch {
      return false;
    }
  }

  refuse() {
    try {
      localStorage.setItem(CLE_REFUS, '1');
    } catch {
      // Navigation privée : on ne peut pas retenir le refus. Tant pis, on
      // reproposera — c'est moins grave que de planter.
    }
  }

  // Un appareil d'Apple sur lequel l'ajout à l'écran d'accueil existe, mais
  // seulement à la main. On ne renifle pas le navigateur pour le plaisir : c'est
  // le SEUL moyen de distinguer « pas encore installable » de « jamais
  // proposable », et les deux appellent des textes opposés.
  get pomme() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  // OÙ SE TROUVE LE BOUTON PARTAGER — et pourquoi on ne peut pas se contenter
  // d'une phrase. Sur iPhone en Safari il est dans la barre du bas ; sur iPad il
  // est en haut ; dans Chrome ou Firefox sur iOS il est dans le menu du
  // navigateur. Trois endroits pour un seul geste, et une instruction fausse est
  // pire qu'une instruction vague : elle envoie chercher là où il n'y a rien.
  get appareil() {
    const ua = navigator.userAgent || '';
    // Tous les navigateurs d'iOS tournent sur le moteur de Safari, donc l'agent
    // contient « Safari » partout : ce sont les marqueurs des AUTRES qu'il faut
    // chercher, pas celui de Safari.
    if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return 'ios-autre';
    return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? 'ipad'
      : 'iphone';
  }

  // Y a-t-il quelque chose à proposer, et sous quelle forme ?
  //   'native'   — la fenêtre du système, un bouton suffit
  //   'pomme'    — il faut expliquer le geste
  //   null       — déjà installée, refusée, ou pas installable
  get forme() {
    if (this.dejaLancee || this.refusee) return null;
    if (this.attendue) return 'native';
    if (this.pomme) return 'pomme';
    return null;
  }

  // Ouvre la fenêtre native. À n'appeler QUE depuis un geste de l'utilisateur :
  // les navigateurs refusent l'invite autrement, silencieusement.
  async propose() {
    if (!this.attendue) return 'indisponible';
    const e = this.attendue;
    // L'événement ne se rejoue pas : une fois consommé, il faut attendre que le
    // navigateur en renvoie un autre.
    this.attendue = null;
    try {
      e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === 'accepted') this.installee = true;
      return outcome;
    } catch {
      return 'erreur';
    }
  }
}
