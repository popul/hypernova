# NOVA SWARM

> Un hommage 3D à **Galaga** — vagues d'ennemis en formation, plongées kamikazes, crédits à ramasser
> et boutique d'améliorations entre chaque vague. Three.js + Vite, zéro asset externe : tous les
> vaisseaux sont des meshes low-poly générés en code, tous les sons sont synthétisés en WebAudio.

![statut](https://img.shields.io/badge/statut-jouable-4ff2ff) ![licence](https://img.shields.io/badge/licence-MIT-ffc857)

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:5173
```

Build de production : `npm run build` puis `npm run preview`.

## Contrôles

| Action | Touches |
| --- | --- |
| Déplacement | ← → ou Q / D (AZERTY) ou A / D |
| Tir | Espace ou clic (maintenu = tir auto) |
| Boutique / menus | Souris ou 1-9 + Entrée |
| Pause | P ou Échap |
| Couper le son | M |

## Boucle de jeu

1. **Vague** — les ennemis entrent en file sur des courbes de Bézier, se placent en formation,
   puis plongent vers vous en tirant.
2. **Crédits** — chaque ennemi détruit lâche des crédits. Enchaîner les kills monte le
   **multiplicateur de combo** (jusqu'à ×5) qui multiplie les gains.
3. **Boutique** — entre deux vagues, dépensez vos crédits : cadence de tir, canons multiples,
   missiles à tête chercheuse, bouclier, propulseurs, aimant à crédits, coque.
4. Toutes les 4 vagues : **vaisseau-amiral** (mini-boss). Le meilleur score et la meilleure vague
   sont sauvegardés en `localStorage`.

## Architecture

```
src/
├── main.js            # bootstrap, boucle de rendu, resize
├── style.css          # HUD, boutique, écrans, effet CRT
├── core/
│   ├── input.js       # clavier + souris, states pressed/held
│   └── audio.js       # SFX synthétisés + séquenceur musical WebAudio
└── game/
    ├── game.js        # machine à états (titre → vague → boutique → game over)
    ├── constants.js   # tuning gameplay centralisé (équilibrage)
    ├── ships.js       # géométries low-poly des vaisseaux (générées en code)
    ├── player.js      # déplacement, tir, bouclier, invulnérabilité
    ├── enemies.js     # formation, entrées Bézier, IA de plongée, boss
    ├── waves.js       # composition et difficulté des vagues
    ├── bullets.js     # pools de projectiles joueur/ennemis + missiles guidés
    ├── pickups.js     # crédits droppés, aimant, collecte
    ├── upgrades.js    # définitions/prix/effets des améliorations
    ├── shop.js        # UI boutique (DOM)
    ├── hud.js         # score, crédits, combo, vies, annonces de vague
    ├── fx.js          # particules poolées, explosions, screenshake, hit-stop
    └── starfield.js   # fond étoilé parallaxe + nébuleuse
```

Principes : pooling systématique (projectiles, particules, pickups) — aucune allocation dans la
boucle chaude ; tuning centralisé dans `constants.js` ; le DOM ne sert qu'aux menus/HUD, tout le
gameplay est dans la scène Three.js (bloom via `UnrealBloomPass`).

## Qualité

```bash
npm run lint           # ESLint
npm run format:check   # Prettier
```
