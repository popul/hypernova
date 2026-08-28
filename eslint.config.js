import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    // La salle d'écoute embarque le moteur audio du jeu : c'est du code
    // navigateur, au même titre que `src`.
    files: ['src/**/*.js', 'tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        Element: 'readonly',
        localStorage: 'readonly',
        // La régie garde son secret le temps de l'onglet, pas plus, et rend la
        // sauvegarde au navigateur par une URL d'objet.
        sessionStorage: 'readonly',
        URL: 'readonly',
        // Le jeu à deux : adresse du salon et transport temps réel.
        URLSearchParams: 'readonly',
        location: 'readonly',
        WebSocket: 'readonly',
        history: 'readonly',
        // La voix entre joueurs : liaison directe entre navigateurs.
        RTCPeerConnection: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        AudioContext: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        Blob: 'readonly',
        Response: 'readonly',
        CompressionStream: 'readonly',
        DecompressionStream: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        matchMedia: 'readonly',
        clearTimeout: 'readonly',
        Notification: 'readonly',
        // Remplacé à la construction par le numéro de version — voir vite.config.js.
        __VERSION__: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      // UNE VARIABLE QUI MASQUE LA FONCTION QU'ELLE APPELLE.
      //
      // `const cible = clamp(cible(game).position.x, …)` : la déclaration masque
      // la fonction `cible()` dans tout le bloc, y compris dans sa propre
      // initialisation, ce que JavaScript refuse à l'exécution. Ça a figé le jeu
      // au troisième acte du boss pendant deux versions, sur une ligne que
      // personne ne relit parce qu'elle a l'air juste. La règle est ici pour que
      // ça ne se rejoue pas — c'est le genre d'erreur qu'une machine voit
      // toujours et qu'un œil ne voit jamais.
      // `no-use-before-define` attraperait aussi le cas, mais il signale sept
      // fermetures parfaitement saines — une `const` déclarée deux lignes plus
      // bas et appelée seulement au clavier. C'est le MASQUAGE qui est en cause,
      // et c'est lui qu'on interdit.
      'no-shadow': 'error',
    },
  },
  // La configuration de Vite tourne sous Node, pas dans le navigateur.
  {
    files: ['vite.config.js'],
    languageOptions: {
      globals: { process: 'readonly' },
    },
  },
  // Le serveur du panthéon : Node, pas navigateur.
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // Les salons du jeu à deux : compte à rebours, balayage, ping.
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
];
