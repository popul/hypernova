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
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
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
