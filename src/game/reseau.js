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
export async function inscris(nom, code, email) {
  const r = await appel('/pilotes', { methode: 'POST', corps: { nom, code, email } });
  if (r.ok && r.jeton) {
    localStorage.setItem(CLE_JETON, r.jeton);
    localStorage.setItem(CLE_NOM, r.nom || nom);
    return { ok: true, nouveau: r.nouveau };
  }
  return { ok: false, erreur: r.erreur || 'reseau', statut: r.statut };
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
    jouee_le: partie.date,
    version: partie.version || 0,
    seed: partie.seed || 0,
    flux: partie.flux || null,
    etats: partie.etats || null,
    controles: partie.controles || null,
  });
  ecris(CLE_FILE, file.slice(-FILE_MAX));
}

let enCours = false;

// Vide la file. Appelée au démarrage, après chaque partie, et au retour du réseau.
// Sérialisée : deux vidages simultanés enverraient deux fois la même partie.
export async function pousse() {
  if (enCours || !jeton()) return { envoyees: 0 };
  const file = lis(CLE_FILE, []);
  if (!file.length) return { envoyees: 0 };
  enCours = true;
  let envoyees = 0;
  try {
    while (file.length) {
      const r = await appel('/parties', { methode: 'POST', corps: file[0], avecJeton: true });
      // 4xx : le serveur refuse cette partie et la refusera toujours (trop grosse,
      // champ invalide). On la jette au lieu de bloquer la file derrière elle.
      const definitif = r.statut >= 400 && r.statut < 500;
      if (!r.ok && !definitif) break; // panne ou hors ligne : on retentera plus tard
      file.shift();
      if (r.ok) envoyees++;
      ecris(CLE_FILE, file);
    }
  } finally {
    enCours = false;
    ecris(CLE_FILE, file);
  }
  return { envoyees, reste: file.length };
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
