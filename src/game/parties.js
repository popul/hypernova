// Le panthéon, et ce qu'il garde.
//
// Il ne gardait qu'un nom, un score et une vague — dix lignes, écrasées dès qu'une
// meilleure partie arrivait. Une partie disparaissait donc entièrement au moment
// même où l'on aurait aimé la revoir.
//
// Deux registres, désormais :
//
//   L'HISTORIQUE  — toutes les parties jouées, dans l'ordre. On n'efface rien tant
//                   qu'on tient dans le stockage, et ce qui saute en premier, ce
//                   sont les enregistrements des parties les moins bonnes, jamais
//                   les scores eux-mêmes. Un score pèse cent octets ; le replay qui
//                   va avec en pèse trente mille.
//
//   LE CLASSEMENT — la vue triée de l'historique. Il n'est plus stocké : il se
//                   recalcule. Un classement stocké finit toujours par mentir sur
//                   ce qu'il reste vraiment.

const CLE_PARTIES = 'novaswarm.parties';
const CLE_LEGACY = 'novaswarm.scores';
const NAME_KEY = 'novaswarm.lastname';

// Combien de parties on conserve, et combien portent leur enregistrement.
const MAX_PARTIES = 60;
const MAX_REPLAYS = 12;

function lire() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_PARTIES));
    return Array.isArray(brut) ? brut.filter((p) => p && p.name) : [];
  } catch {
    return [];
  }
}

function ecrire(parties) {
  localStorage.setItem(CLE_PARTIES, JSON.stringify(parties));
}

// Les anciens scores deviennent des parties sans enregistrement : on ne perd pas
// le panthéon existant en changeant de format. Ce serait exactement le contraire
// de ce qu'on cherche à faire ici.
function migre() {
  const parties = lire();
  if (parties.length) return parties;
  try {
    const vieux = JSON.parse(localStorage.getItem(CLE_LEGACY));
    if (!Array.isArray(vieux) || !vieux.length) return [];
    const repris = vieux
      .filter((s) => s && s.name)
      .map((s, i) => ({
        id: `legacy-${i}-${s.score}`,
        name: s.name,
        score: s.score || 0,
        wave: s.wave || 1,
        date: s.date || '',
        flux: null,
      }));
    ecrire(repris);
    return repris;
  } catch {
    return [];
  }
}

export function toutesLesParties() {
  return migre();
}

// Le classement : les meilleures PARTIES, comme sur une borne. Pas les meilleurs
// pilotes — un même pilote peut occuper plusieurs lignes, et c'est ce qu'on veut :
// chaque ligne est une partie qu'on peut rouvrir, et n'en garder qu'une par pilote
// reviendrait à jeter les autres.
//
// Un tableau PAR MODE. L'arcade se classe au score, la survie à la vague atteinte :
// ce ne sont pas les mêmes parties, et « jusqu'où es-tu allé » ne se compare pas à
// « combien as-tu marqué ».
export function classement(max = 10, mode = 'arcade') {
  const m = mode === 'survie' ? 'survie' : 'arcade';
  const tri =
    m === 'survie'
      ? (a, b) => (b.wave || 0) - (a.wave || 0) || b.score - a.score
      : (a, b) => b.score - a.score || (b.wave || 0) - (a.wave || 0);
  return migre()
    .filter((p) => (p.mode || 'arcade') === m)
    .sort(tri)
    .slice(0, max);
}

export function partieParId(id) {
  return migre().find((p) => p.id === id) || null;
}

// Le rang d'une partie dans le classement, ou -1.
export function rangDe(id, mode = 'arcade') {
  const i = classement(10, mode).findIndex((p) => p.id === id);
  return i === -1 ? -1 : i + 1;
}

// Enregistre une partie terminée. `replay` est l'objet produit par l'Enregistreur,
// ou null. Renvoie { id, rang, classement }.
export function enregistrePartie({ name, score, wave, duree, mode = 'arcade', replay }) {
  const parties = migre();
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  parties.push({
    id,
    name,
    score,
    wave,
    duree: duree || 0,
    date: new Date().toISOString(),
    flux: replay?.flux || null,
    etats: replay?.etats || null,
    controles: replay?.controles || null,
    version: replay?.version || 0,
    mode: mode === 'survie' ? 'survie' : 'arcade',
    seed: replay?.seed ?? 0,
    pilote: replay?.pilote || null,
  });
  localStorage.setItem(NAME_KEY, name);
  elague(parties);
  sauveEnFaisantDeLaPlace(parties);
  return { id, rang: rangDe(id, mode), classement: classement(10, mode) };
}

// On garde les scores longtemps et les enregistrements peu : ce sont eux qui
// pèsent. Les douze meilleures parties gardent le leur, les autres le perdent —
// mais restent au tableau.
function elague(parties) {
  if (parties.length > MAX_PARTIES) parties.splice(0, parties.length - MAX_PARTIES);
  // Par mode : un marathon de survie ne doit pas chasser les enregistrements
  // d'arcade, ce sont deux collections que le joueur consulte séparément.
  for (const m of ['arcade', 'survie']) {
    const trop = parties
      .filter((p) => p.flux && (p.mode || 'arcade') === m)
      .sort((a, b) => b.score - a.score)
      .slice(MAX_REPLAYS);
    for (const p of trop) {
      p.flux = null;
      p.etats = null;
      p.controles = null;
    }
  }
}

// localStorage n'a pas de quota interrogeable : on ne sait qu'il est plein qu'en
// s'y cognant. On relâche donc les enregistrements un par un, du moins bon score
// au meilleur, jusqu'à ce que ça rentre — plutôt que de perdre la partie entière.
function sauveEnFaisantDeLaPlace(parties) {
  for (let essai = 0; essai < 24; essai++) {
    try {
      ecrire(parties);
      return true;
    } catch {
      const candidat = parties
        .filter((p) => p.flux)
        .sort((a, b) => a.score - b.score)
        .shift();
      if (candidat) {
        candidat.flux = null;
        candidat.etats = null;
        candidat.controles = null;
      } else if (parties.length > 1) {
        parties.shift();
      } else {
        return false;
      }
    }
  }
  return false;
}

export function lastName() {
  return localStorage.getItem(NAME_KEY) || '';
}

// Texte de défi à partager (Web Share sur mobile, presse-papier sinon).
export function challengeText(name, score, wave) {
  return `⭐ ${name || 'Un pilote'} a marqué ${score} points (vague ${wave}) sur HYPERNOVA ! Qui fait mieux ?`;
}
