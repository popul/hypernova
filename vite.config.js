import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

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
