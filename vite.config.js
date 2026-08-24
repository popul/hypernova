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
});
