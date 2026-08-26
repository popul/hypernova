// Vérifie que tout décor RÉCLAMÉ quelque part est bien FABRICABLE.
// Usage : node scripts/verifie-decors.mjs
//
// Le jeu désigne ses décors par une chaîne — `{ id: 'planet' }`, `{ id: 'champ' }` —
// et `createLandmark` lève « Décor inconnu » sur un nom qui n'est pas dans sa table.
// C'est le bon comportement : un nom de décor qui n'existe pas est une faute de
// programmation, pas un cas à rattraper poliment.
//
// Le problème est le MOMENT où elle se voit. Ces noms ne sont lus qu'au changement
// de secteur, et certains décors n'apparaissent qu'après un détour, vers la
// vingtième vague : rien dans le lint, rien dans le build, rien au démarrage — puis
// le jeu s'arrête net au milieu d'une partie, quinze minutes après le lancement.
// C'est arrivé pendant l'écriture des escales, et sans une vérification écrite
// exprès, ça ne se serait vu qu'en jouant très loin.
//
// D'où ce script, volontairement bête : il lit les fichiers comme du TEXTE plutôt
// que de les importer, parce que les importer demanderait Three.js, donc un
// navigateur, donc précisément ce qu'on essaie d'éviter.

import { readFileSync } from 'node:fs';

const lis = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Les fabriques déclarées, entre `const FACTORIES = {` et l'accolade fermante.
function fabriques() {
  const src = lis('src/game/space/landmarks.js');
  const i = src.indexOf('const FACTORIES = {');
  if (i < 0) throw new Error('table des fabriques introuvable dans landmarks.js');
  const bloc = src.slice(i, src.indexOf('\n};', i));
  return new Set([...bloc.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
}

// Tout ce qui se présente comme un décor.
//
// Un décor se désigne de deux façons : `landmark: 'nom'` pour une forme sans
// réglages, ou `{ id: 'nom', … }` dans un tableau `landmark: [...]`. Le reste de ce
// qu'on croise là-dedans — `kind: 'earth'`, `variant: 'torn'` — ce sont les
// RÉGLAGES d'une fabrique, pas des fabriques : `createPlanet` sait faire une terre
// comme un jupiter, et ces noms-là ne doivent pas être cherchés dans la table.
// C'est toute la difficulté de lire du code comme du texte, et la raison de ce
// motif étroit plutôt que large.
function reclames() {
  const trouves = new Map(); // nom -> fichiers qui le réclament
  for (const f of ['src/game/space/biomes.js', 'src/game/space/escales.js']) {
    const src = lis(f);
    for (const bloc of src.matchAll(/landmark:\s*(\[[\s\S]*?\]|'[a-z]+')/g)) {
      const texte = bloc[1];
      const noms = texte.startsWith("'")
        ? [texte.slice(1, -1)]
        : [...texte.matchAll(/\bid:\s*'([a-z]+)'/g)].map((m) => m[1]);
      for (const n of noms) {
        if (!trouves.has(n)) trouves.set(n, new Set());
        trouves.get(n).add(f);
      }
    }
  }
  return trouves;
}

const connues = fabriques();
const demandes = reclames();

const suspects = [];
for (const [nom, fichiers] of demandes) {
  if (!connues.has(nom)) suspects.push({ nom, fichier: [...fichiers].join(', ') });
}

if (suspects.length) {
  console.error('❌ Décors réclamés mais introuvables dans la table des fabriques :\n');
  for (const s of suspects) console.error(`   « ${s.nom} »  réclamé par ${s.fichier}`);
  console.error(`\n   Fabriques connues : ${[...connues].join(', ')}`);
  console.error('\n   Ajoute la fabrique à FACTORIES dans src/game/space/landmarks.js.');
  process.exit(1);
}

console.log(
  `✅ ${demandes.size} noms lus, ${connues.size} fabriques déclarées, aucun décor manquant`
);
