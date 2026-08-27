import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// LE NUMÉRO DE VERSION AFFICHÉ DANS LE JEU.
//
// Trois sources, dans cet ordre, et l'ordre est le sujet :
//
//   1. HYPERNOVA_VERSION, posé par la CI. C'est la seule qui vaille en
//      production : elle porte exactement le tag que le chart déploie, donc le
//      numéro lu à l'écran est celui qu'on peut aller vérifier.
//   2. `git describe`, pour une construction locale. Absent de l'image Docker —
//      .dockerignore écarte .git — d'où le premier cas.
//   3. « dev », faute de mieux. Jamais en production : si ce mot s'affiche sur
//      hypernova.musso.io, c'est que la CI n'a pas passé la variable.
//
// Surtout PAS la version de package.json : elle demanderait d'être bumpée à la
// main à chaque tag, et un numéro qu'il faut penser à mettre à jour finit
// toujours par mentir. Celui-ci se déduit.
function versionDuJeu() {
  if (process.env.HYPERNOVA_VERSION) return process.env.HYPERNOVA_VERSION;
  try {
    return execSync('git describe --tags --always --dirty', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .replace(/^v/, '');
  } catch {
    return 'dev';
  }
}

// Versionne le service worker à chaque build : un nouveau SW s'installe au déploiement
// et son activation purge le cache d'app du build précédent (voir public/sw.js).
function swVersionPlugin() {
  return {
    name: 'sw-version',
    apply: 'build',
    closeBundle() {
      try {
        const path = 'dist/sw.js';
        const src = readFileSync(path, 'utf8');
        writeFileSync(path, src.replace(/nova-v1/g, `nova-v${Date.now()}`));
      } catch {
        // Pas de sw.js dans ce build : rien à versionner.
      }
    },
  };
}

export default defineConfig({
  plugins: [swVersionPlugin()],
  define: {
    __VERSION__: JSON.stringify(versionDuJeu()),
  },
  // DEUX PAGES, PAS DEUX PROJETS. La régie est servie par le même nginx que le
  // jeu, sous le même nom de domaine : elle appelle /api sans CORS, elle se
  // déploie avec le même artefact, et elle n'existe que si l'API a un secret.
  // Un second site pour trois tableaux et six boutons coûterait un certificat,
  // une route d'entrée et un déploiement à surveiller.
  build: {
    rollupOptions: {
      input: { index: 'index.html', admin: 'admin.html' },
    },
  },
  // En développement, l'API du panthéon tourne à côté ; en production, c'est le
  // routeur d'entrée qui envoie /api au bon service. Le jeu ne connaît donc qu'un
  // seul chemin, le même dans les deux cas — et jamais de CORS à desserrer.
  server: {
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:8099',
        changeOrigin: true,
      },
    },
  },
});
