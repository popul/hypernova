// Le panthéon. IL VIT SUR LE SERVEUR, et nulle part ailleurs.
//
// Il tenait dans le localStorage de chaque appareil : soixante parties par
// téléphone, qui ne se rejoignaient jamais, et qu'un nettoyage de Safari effaçait
// au bout d'une semaine d'inactivité. Deux enfants sur deux téléphones tenaient
// deux tableaux qui portaient le même nom et n'avaient jamais les mêmes lignes.
//
// Il ne reste donc en local qu'une FILE D'ENVOI (voir reseau.js) : les parties qui
// n'ont pas encore pu partir. Ce n'est pas un second panthéon, c'est un tampon —
// il se vide dès que le réseau répond, et il est vide la plupart du temps. Sans
// lui, une partie jouée dans un train serait simplement perdue.

import * as reseau from './reseau.js';

// Le dernier classement reçu, par mode. Il évite de redemander le tableau à chaque
// ouverture d'écran ; il n'est jamais écrit sur disque et meurt avec l'onglet.
const cache = { arcade: null, survie: null };

export function classementConnu(mode = 'arcade') {
  return cache[mode === 'survie' ? 'survie' : 'arcade'] || [];
}

export async function classement(max = 10, mode = 'arcade') {
  const m = mode === 'survie' ? 'survie' : 'arcade';
  const l = await reseau.classementDistant(max, m);
  if (l) cache[m] = l;
  // Pas de réseau : on rend ce qu'on avait vu. Un tableau vide et un tableau
  // inconnu ne sont pas la même chose — le premier se lit « personne n'a encore
  // joué », et il ne faut pas afficher l'un pour l'autre.
  return l || cache[m];
}

export async function partieParId(id) {
  return reseau.partieDistante(id);
}

// Une partie terminée. Elle entre dans la file, la file part si elle peut, et le
// rang se lit dans le classement que le serveur renvoie ensuite.
export async function enregistrePartie({ name, score, wave, duree, mode = 'arcade', replay }) {
  const m = mode === 'survie' ? 'survie' : 'arcade';
  reseau.enFile({
    name,
    score,
    wave,
    duree,
    mode: m,
    date: new Date().toISOString(),
    flux: replay?.flux || null,
    etats: replay?.etats || null,
    controles: replay?.controles || null,
    version: replay?.version || 0,
    seed: replay?.seed || 0,
  });
  const { envoyees, ids } = await reseau.pousse();
  const table = (await classement(10, m)) || [];
  // Le rang se lit sur l'identifiant que le serveur vient d'attribuer. Le chercher
  // par nom et score échouait dès qu'une partie n'était pas encore partie — et
  // annonçait « pas encore dans le top 10 » à un joueur qui venait d'y entrer.
  const mien = ids?.[ids.length - 1];
  const i = mien
    ? table.findIndex((p) => p.id === mien)
    : table.findIndex((p) => p.name === name && p.score === score && p.wave === wave);
  return {
    rang: i === -1 ? -1 : i + 1,
    classement: table,
    envoyee: envoyees > 0,
    enAttente: reseau.tailleFile(),
  };
}

// Texte de défi à partager (Web Share sur mobile, presse-papier sinon).
export function challengeText(name, score, wave) {
  return `⭐ ${name || 'Un pilote'} a marqué ${score} points (vague ${wave}) sur HYPERNOVA ! Qui fait mieux ?`;
}
