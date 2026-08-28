// LE JOURNAL DE BORD — ce que les parties en ligne racontent, et à qui.
//
// Jusqu'ici, un défaut de réseau se signalait ainsi : « y'a des désynchros ».
// C'est vrai, c'est utile, et c'est intenable à corriger — on ne sait ni quand,
// ni entre qui, ni de combien. Toute la difficulté d'un défaut de synchronisation
// est qu'il ne laisse AUCUNE trace : les deux machines continuent de tourner,
// chacune persuadée d'avoir raison.
//
// Ce fichier envoie donc quelques événements au serveur, et rien de plus :
//
//   · les DÉSYNCHRONISATIONS mesurées, avec ce qui diffère et de combien ;
//   · les erreurs JavaScript non rattrapées, avec leur pile ;
//   · le début et la fin d'une partie, pour savoir ce qui tournait.
//
// TROIS RÈGLES, ET ELLES COMPTENT.
//
// 1. RIEN DE PERSONNEL. Le pseudo et la version, c'est tout. Pas d'adresse, pas
//    d'identifiant d'appareil, pas de contenu de partie. Ce qu'on cherche, ce
//    sont des défauts, pas des joueurs.
//
// 2. ÇA NE DOIT JAMAIS GÊNER LE JEU. L'envoi est groupé, différé, et il échoue
//    en silence. Un serveur éteint ne doit pas coûter une image.
//
// 3. ÇA S'ARRÊTE TOUT SEUL. Une boucle de désynchronisation pourrait émettre
//    soixante événements par seconde ; le plafond par session est donc dur, et
//    les répétitions du même défaut sont comptées plutôt que renvoyées.

const MAX_PAR_SESSION = 60; // au-delà, on se tait : un défaut qui boucle est déjà dit
const GROUPE_MS = 4000; // on regroupe avant d'envoyer
const MAX_LOT = 12;

let file = [];
let envoyes = 0;
let minuteur = null;
let contexte = { pilote: null, version: null };
const vus = new Map(); // empreinte d'un événement -> combien de fois

export function poseContexte({ pilote, version }) {
  contexte = { pilote: pilote || null, version: version || null };
}

// Ce qui identifie un événement pour le compter plutôt que le répéter.
function signature(type, detail) {
  return `${type}|${detail?.ou || ''}|${detail?.quoi || ''}`;
}

export function note(type, detail = {}) {
  if (envoyes >= MAX_PAR_SESSION) return;
  const sig = signature(type, detail);
  const deja = vus.get(sig) || 0;
  vus.set(sig, deja + 1);
  // Le même défaut, encore : on ne renvoie que les trois premiers, puis on
  // compte. Sans ça, une boucle noierait tout le reste.
  if (deja >= 3) return;

  envoyes++;
  file.push({
    quand: new Date().toISOString(),
    type,
    pilote: contexte.pilote,
    version: contexte.version,
    // La forme de l'écran explique à elle seule une bonne part des défauts de
    // cadrage — et c'est la seule chose qu'on garde de l'appareil.
    ecran: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null,
    detail: { ...detail, fois: deja + 1 },
  });
  if (file.length >= MAX_LOT) return vide();
  if (!minuteur && typeof setTimeout === 'function') {
    minuteur = setTimeout(() => vide(), GROUPE_MS);
  }
}

export function vide() {
  if (minuteur) {
    clearTimeout(minuteur);
    minuteur = null;
  }
  if (!file.length) return;
  const lot = file;
  file = [];
  try {
    const corps = JSON.stringify({ evenements: lot });
    // `sendBeacon` survit à la fermeture de l'onglet — c'est le seul moment où
    // l'on tient VRAIMENT à ce que le dernier lot parte.
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/journal', new Blob([corps], { type: 'application/json' }));
      return;
    }
    fetch('/api/journal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: corps,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Un journal qui casse le jeu serait pire que pas de journal du tout.
  }
}

// Les erreurs qu'on ne rattrape nulle part. Ce sont celles qui coupent une
// partie, donc exactement celles qu'on ne voit jamais depuis un écran de
// développement.
export function ecoute() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    note('erreur', {
      quoi: String(e.message || 'erreur').slice(0, 200),
      ou: `${e.filename || ''}:${e.lineno || 0}`.slice(-120),
      pile: String(e.error?.stack || '').slice(0, 600),
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    note('promesse', {
      quoi: String(e.reason?.message || e.reason || 'rejet').slice(0, 200),
      pile: String(e.reason?.stack || '').slice(0, 600),
    });
  });
  // La dernière chance d'envoyer ce qui reste.
  window.addEventListener('pagehide', () => vide());
}
