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
    retiensPilote(courant);
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

// ---------------------------------------------------------- LES PILOTES CONNUS
//
// QUI S'EST DÉJÀ CONNECTÉ SUR CET APPAREIL — et personne d'autre.
//
// L'écran « Qui pilote ? » demandait au serveur la liste de TOUS les pilotes du
// jeu. Ça marche à trois, et ça ne marche plus du tout ensuite : la grille
// devient un annuaire où l'on cherche son propre nom. Et un annuaire public, en
// plus — n'importe qui pouvait énumérer les pseudos de tous les enfants qui
// jouent, sans même un compte.
//
// Ce qu'il faut montrer, c'est une chose que seul l'APPAREIL sait : qui s'est
// déjà identifié ici. Sur la tablette du salon, ce sont les deux frères ; sur le
// téléphone de l'un, c'est lui seul. La liste reste donc courte par construction,
// et elle est juste — c'est exactement le geste qu'on veut raccourcir, « je
// reviens sur mon pseudo », pas « je cherche qui existe ».
//
// C'est de la même nature que le jeton de session, et pas un second panthéon :
// ni score, ni partie, rien qui se compare. Un nom, une apparence, une date. Le
// serveur reste la seule source de ce qui compte, et il redemande TOUJOURS le
// code — voir plus bas, `connecte`.

const CLE_CONNUS = 'novaswarm.pilotes';
// Six suffisent à une famille, et bornent ce qui traîne sur un appareil partagé.
const MAX_CONNUS = 6;

export function pilotesConnus() {
  try {
    const l = JSON.parse(localStorage.getItem(CLE_CONNUS) || '[]');
    return Array.isArray(l) ? l.filter((p) => p && p.name) : [];
  } catch {
    return [];
  }
}

function retiensPilote(p) {
  if (!p?.name) return;
  const l = pilotesConnus().filter((x) => x.name !== p.name);
  l.unshift({ name: p.name, livree: p.livree || null, carene: p.carene || null, vu: Date.now() });
  try {
    localStorage.setItem(CLE_CONNUS, JSON.stringify(l.slice(0, MAX_CONNUS)));
  } catch {
    // Stockage plein ou refusé : on joue quand même, on ne raccourcit juste plus
    // le geste au prochain lancement.
  }
}

// Sur une tablette partagée, on doit pouvoir effacer quelqu'un de la liste sans
// toucher à son compte : le pilote existe toujours côté serveur, il n'apparaît
// simplement plus ici.
export function oubliePilote(nom) {
  try {
    localStorage.setItem(CLE_CONNUS, JSON.stringify(pilotesConnus().filter((p) => p.name !== nom)));
  } catch {
    /* rien à faire : la liste restera telle quelle */
  }
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
  // On ne retient QUE ceux qui se sont vraiment identifiés : un code refusé ne
  // laisse aucune trace, sinon la liste se remplirait des pseudos qu'on a essayés.
  retiensPilote(courant);
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
