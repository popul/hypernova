// Le panthéon commun, vu depuis le jeu.
//
// Règle unique, et tout en découle : LE LOCAL RESTE LA SOURCE. Le jeu est une
// application hors-ligne — on y joue dans le train, dans une voiture, dans un
// jardin sans réseau. Une partie s'écrit d'abord sur l'appareil ; le serveur en
// reçoit une copie quand il est joignable, et rien ne dépend de sa réponse.
//
// Concrètement : une file d'envoi persistante. Une partie terminée y entre, et
// n'en sort qu'une fois acceptée par le serveur. Trois semaines hors ligne ne
// perdent rien : la file se vide au premier retour du réseau.

const CLE_JETON = 'novaswarm.jeton';
const CLE_NOM = 'novaswarm.jeton.nom';
const CLE_FILE = 'novaswarm.file';
const RACINE = '/api';

// Au-delà, on renonce à envoyer : la partie reste au panthéon local, elle ne
// montera simplement jamais. Mieux vaut une file bornée qu'un stockage qui gonfle
// indéfiniment parce que le serveur est éteint depuis un mois.
const FILE_MAX = 30;
const DELAI = 8000;

function lis(cle, defaut = null) {
  try {
    const v = localStorage.getItem(cle);
    return v === null ? defaut : JSON.parse(v);
  } catch {
    return defaut;
  }
}

function ecris(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* stockage plein : on continue sans, le jeu ne doit jamais s'arrêter pour ça */
  }
}

export function jeton() {
  return localStorage.getItem(CLE_JETON) || null;
}

export function nomEnLigne() {
  return localStorage.getItem(CLE_NOM) || null;
}

export function estInscrit(nom) {
  return !!jeton() && nomEnLigne() === nom;
}

function oublieJeton() {
  localStorage.removeItem(CLE_JETON);
  localStorage.removeItem(CLE_NOM);
}

// Un appel qui échoue ne lève jamais : il renvoie { ok: false, ... }. Le réseau
// est un CONFORT dans ce jeu, pas une dépendance — aucun appel ne doit pouvoir
// interrompre une partie ni faire échouer un écran.
async function appel(chemin, { methode = 'GET', corps = null, avecJeton = false } = {}) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI);
  try {
    const entetes = {};
    if (corps) entetes['content-type'] = 'application/json';
    if (avecJeton) {
      const j = jeton();
      if (!j) return { ok: false, erreur: 'pas-de-jeton' };
      entetes.authorization = `Bearer ${j}`;
    }
    const r = await fetch(RACINE + chemin, {
      method: methode,
      headers: entetes,
      body: corps ? JSON.stringify(corps) : undefined,
      signal: ctrl.signal,
    });
    const donnees = await r.json().catch(() => ({}));
    // 401 : le jeton ne vaut plus rien (base réinitialisée, pilote supprimé). On
    // l'oublie tout de suite, sinon chaque envoi suivant échouerait en silence.
    if (r.status === 401) oublieJeton();
    return { ok: r.ok, statut: r.status, ...donnees };
  } catch {
    return { ok: false, erreur: 'reseau' };
  } finally {
    clearTimeout(minuteur);
  }
}

// --- Inscription ------------------------------------------------------------

// Réclame un pseudo sur le serveur. S'il est libre il devient le nôtre ; s'il est
// déjà pris, il faut le code de celui qui l'a créé.
export async function inscris(nom, code, email, apparence = {}) {
  const r = await appel('/pilotes', {
    methode: 'POST',
    corps: { nom, code, email, livree: apparence.livree, carene: apparence.carene },
  });
  if (r.ok && r.jeton) {
    localStorage.setItem(CLE_JETON, r.jeton);
    localStorage.setItem(CLE_NOM, r.nom || nom);
    return { ok: true, nouveau: r.nouveau, livree: r.livree, carene: r.carene };
  }
  return { ok: false, erreur: r.erreur || 'reseau', statut: r.statut };
}

// Qui suis-je, pour ce jeton ? Appelé au lancement : c'est ce qui remplace la
// lecture du profil en localStorage.
export async function moi() {
  const r = await appel('/moi', { avecJeton: true });
  if (!r.ok || !r.nom) return null;
  return {
    name: r.nom,
    livree: r.livree,
    carene: r.carene,
    // Les records du pilote, qui suivent son nom d'un appareil à l'autre. Le HUD
    // affichait jusqu'ici le record DE L'APPAREIL, ce qui n'avait pas de sens dès
    // que deux enfants partageaient un téléphone.
    meilleur: r.meilleur || 0,
    meilleureVague: r.meilleureVague || 0,
    meilleurSurvie: r.meilleurSurvie || 0,
    meilleureVagueSurvie: r.meilleureVagueSurvie || 0,
  };
}

// La liste des pilotes du jeu — donc les copains, y compris ceux qui jouent
// depuis leur propre téléphone.
export async function listePilotes(limite = 24) {
  const r = await appel(`/pilotes?limite=${limite}`);
  if (!r.ok || !Array.isArray(r.pilotes)) return null;
  return r.pilotes.map((p) => ({
    name: p.nom,
    livree: p.livree,
    carene: p.carene,
    parties: p.parties || 0,
    meilleur: p.meilleur || 0,
  }));
}

export async function majMoi({ livree, carene }) {
  const r = await appel('/moi', { methode: 'PATCH', corps: { livree, carene }, avecJeton: true });
  return r.ok ? { ok: true, livree: r.livree, carene: r.carene } : { ok: false };
}

export function deconnecte() {
  oublieJeton();
}

// --- File d'envoi -----------------------------------------------------------

export function enFile(partie) {
  if (!partie) return;
  const file = lis(CLE_FILE, []);
  file.push({
    mode: partie.mode || 'arcade',
    score: partie.score,
    vague: partie.wave,
    duree: partie.duree || 0,
    jouee_le: partie.date || new Date().toISOString(),
    version: partie.version || 0,
    seed: partie.seed || 0,
    flux: partie.flux || null,
    etats: partie.etats || null,
    controles: partie.controles || null,
  });
  ecris(CLE_FILE, file.slice(-FILE_MAX));
}

let enCoursPromesse = null;

// Vide la file. Appelée au démarrage, après chaque partie, et au retour du réseau.
//
// Sérialisée — deux vidages simultanés enverraient deux fois la même partie — mais
// on ATTEND celle qui court au lieu d'abandonner. C'était un vrai défaut : la
// poussée de démarrage tenait le verrou pendant qu'on terminait une partie, la
// nouvelle poussée repartait aussitôt les mains vides, et le score restait en file
// jusqu'au lancement suivant. L'écran de fin annonçait alors « pas encore dans le
// top 10 » pour une partie qui n'avait tout simplement pas été envoyée.
export async function pousse() {
  if (!jeton()) return { envoyees: 0 };
  if (enCoursPromesse) await enCoursPromesse.catch(() => {});
  if (!lis(CLE_FILE, []).length) return { envoyees: 0 };
  enCoursPromesse = _pousse();
  try {
    return await enCoursPromesse;
  } finally {
    enCoursPromesse = null;
  }
}

async function _pousse() {
  const file = lis(CLE_FILE, []);
  let envoyees = 0;
  // Les identifiants attribués par le serveur, dans l'ordre d'envoi. C'est par eux
  // qu'on retrouve sa propre ligne dans le classement : deux parties d'un même
  // pilote peuvent avoir le même score et la même vague, et se chercher par
  // valeurs revenait à jouer à pile ou face.
  const ids = [];
  try {
    while (file.length) {
      const r = await appel('/parties', { methode: 'POST', corps: file[0], avecJeton: true });
      // 4xx : le serveur refuse cette partie et la refusera toujours (trop grosse,
      // champ invalide). On la jette au lieu de bloquer la file derrière elle.
      const definitif = r.statut >= 400 && r.statut < 500;
      if (!r.ok && !definitif) break; // panne ou hors ligne : on retentera plus tard
      file.shift();
      if (r.ok) {
        envoyees++;
        if (r.id) ids.push(r.id);
      }
      ecris(CLE_FILE, file);
    }
  } finally {
    ecris(CLE_FILE, file);
  }
  return { envoyees, reste: file.length, ids };
}

export function tailleFile() {
  return lis(CLE_FILE, []).length;
}

// --- Lecture ----------------------------------------------------------------

export async function classementDistant(limite = 12, mode = 'arcade') {
  const r = await appel(`/classement?limite=${limite}&mode=${mode}`);
  if (!r.ok || !Array.isArray(r.classement)) return null;
  // On rend la même forme que le panthéon local : l'affichage ne doit pas avoir à
  // savoir d'où vient une ligne.
  return r.classement.map((p) => ({
    id: p.id,
    name: p.nom,
    score: p.score,
    wave: p.vague,
    duree: p.duree,
    date: p.jouee_le,
    mode: p.mode || mode,
    flux: p.a_replay ? 'distant' : null, // marqueur : le contenu se charge au clic
    distant: true,
  }));
}

export async function partieDistante(id) {
  const r = await appel(`/parties/${encodeURIComponent(id)}`);
  if (!r.ok || !r.partie) return null;
  const p = r.partie;
  return {
    id: p.id,
    name: p.nom,
    score: p.score,
    wave: p.vague,
    duree: p.duree,
    date: p.jouee_le,
    version: p.version,
    seed: p.seed,
    flux: p.flux,
    etats: p.etats,
    controles: p.controles,
    distant: true,
  };
}

// Le réseau revient : on en profite tout de suite plutôt que d'attendre la fin de
// la prochaine partie.
window.addEventListener('online', () => {
  pousse();
});
