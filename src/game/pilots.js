// Les pilotes. LE SERVEUR EST LA SEULE SOURCE.
//
// Ils vivaient en localStorage : chaque appareil avait ses propres pilotes, ses
// propres scores, et rien ne se rejoignait jamais. Deux frères sur deux téléphones
// jouaient dans deux jeux différents qui portaient le même nom — et sur iOS,
// Safari efface le stockage d'un site laissé de côté une semaine.
//
// Il ne reste donc en local qu'UNE chose : le jeton de session, qui dit « c'est
// encore moi » au serveur. Exactement ce que fait un cookie de connexion, et pour
// la même raison — sans lui, il faudrait retaper son code à chaque lancement.
// Tout le reste — la liste des pilotes, l'apparence du vaisseau, les parties — se
// demande au serveur et ne se recopie nulle part.
//
// Ce que ça coûte, et il faut le savoir : sans réseau, on ne peut plus s'identifier.
// Le jeu le dit alors clairement au lieu d'échouer en silence.

import * as reseau from './reseau.js';

export function sanitizeName(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ\-. ]/g, '')
    .trim()
    .slice(0, 10);
}

// Le pilote de la session en cours. Rempli par `reprends()` au démarrage et par
// `connecte()` — c'est un cache de la réponse du serveur, jamais une source.
let courant = null;

export function activePilot() {
  return courant;
}

// Au lancement : le jeton est-il encore bon ? Le serveur répond avec le nom et
// l'apparence. S'il ne répond pas, on n'a pas de pilote — et on le dira.
export async function reprends() {
  if (!reseau.jeton()) return null;
  const moi = await reseau.moi();
  if (moi) {
    courant = moi;
    return courant;
  }
  // Hors ligne, ou serveur éteint. On sait encore QUI l'on est — le jeton et le
  // nom sont dans cette session — on ignore seulement ce que le serveur en dit.
  // Le jeu doit rester jouable dans un train : on joue, et les parties montent au
  // retour du réseau. C'est un cache d'IDENTITÉ, pas un second panthéon.
  const nom = reseau.nomEnLigne();
  courant = nom ? { name: nom, horsLigne: true } : null;
  return courant;
}

// Qui joue sur ce jeu ? La liste vient du serveur, donc elle contient les copains
// qui jouent depuis LEUR téléphone. C'est tout l'intérêt.
export async function listPilots() {
  const l = await reseau.listePilotes();
  return l || [];
}

// Réclamer un pseudo, ou revenir dessus avec son code. Le serveur tranche : libre,
// il devient le nôtre ; pris, il faut le code de celui qui l'a créé.
// Renvoie { ok } ou { ok: false, error: 'code' | 'email' | 'reseau' | 'invalid' }.
export async function connecte(rawName, code, email, apparence = {}) {
  const nom = sanitizeName(rawName);
  if (!nom) return { ok: false, error: 'invalid' };
  const r = await reseau.inscris(nom, code, email, apparence);
  if (!r.ok) return { ok: false, error: r.erreur || 'reseau' };
  courant = {
    name: nom,
    livree: r.livree || apparence.livree,
    carene: r.carene || apparence.carene,
  };
  return { ok: true, name: nom };
}

export function deconnecte() {
  courant = null;
  reseau.deconnecte();
}

// L'apparence appartient au pilote, donc au serveur : elle le suit d'un appareil
// à l'autre. Un vaisseau qu'on a choisi et qui ne serait pas là au prochain
// téléphone ne serait pas vraiment le sien.
export async function majApparence({ livree, carene }) {
  const r = await reseau.majMoi({ livree, carene });
  if (r?.ok && courant) {
    courant.livree = r.livree;
    courant.carene = r.carene;
  }
  return !!r?.ok;
}
