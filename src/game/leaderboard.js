// Panthéon local : top 10 des pilotes en localStorage, façon borne d'arcade.
// Permet à plusieurs joueurs (copains, famille) de se comparer sur le même appareil.

const SCORES_KEY = 'novaswarm.scores';
const NAME_KEY = 'novaswarm.lastname';
const MAX_ENTRIES = 10;

export function loadScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCORES_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

// Enregistre un score et renvoie { rank, scores } (rank = position 1-based, -1 si hors top).
export function saveScore(name, score, wave) {
  const scores = loadScores();
  const entry = { name, score, wave, date: new Date().toISOString().slice(0, 10) };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const kept = scores.slice(0, MAX_ENTRIES);
  localStorage.setItem(SCORES_KEY, JSON.stringify(kept));
  localStorage.setItem(NAME_KEY, name);
  const rank = kept.indexOf(entry);
  return { rank: rank === -1 ? -1 : rank + 1, scores: kept };
}

export function lastName() {
  return localStorage.getItem(NAME_KEY) || '';
}

export function sanitizeName(raw) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ\-. ]/g, '')
    .trim()
    .slice(0, 10);
}

// Texte de défi à partager (Web Share sur mobile, presse-papier sinon).
export function challengeText(name, score, wave) {
  return `⭐ ${name || 'Un pilote'} a marqué ${score} points (vague ${wave}) sur HYPERNOVA ! Qui fait mieux ?`;
}
