# HYPERNOVA

> Shoot'em up spatial 3D — vagues d'ennemis en formation, plongées kamikazes, crédits à ramasser
> et boutique d'améliorations entre chaque vague. Three.js + Vite, zéro asset externe : tous les
> vaisseaux sont des meshes low-poly générés en code, tous les sons sont synthétisés en WebAudio.
> Jouable au clavier **et au tactile** (PWA installable), avec un panthéon local pour se défier
> entre copains et des **campagnes hebdomadaires dans la Voie lactée**.

![statut](https://img.shields.io/badge/statut-jouable-4ff2ff) ![licence](https://img.shields.io/badge/licence-MIT-ffc857)

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:5173
```

Build de production : `npm run build` puis `npm run preview`.

## Contrôles

| Action | Clavier | Tactile |
| --- | --- | --- |
| Déplacement | ← → ou Q / D (AZERTY) ou A / D | glisser le doigt |
| Tir | Espace ou clic (maintenu = tir auto) | automatique tant qu'on touche |
| **Nova Bomb** (50 d'énergie) | **X** (appui bref) | bouton ✦ (appui bref) |
| **Overdrive** (100 d'énergie) | **X** (maintenir 0,35 s) | bouton ✦ (maintenir) |
| Boutique / menus | Souris ou 1-9 + Entrée | tap |
| Pause / son | P ou Échap · M | boutons ⏸ / ♪ en bas à droite |

## Le frôlement : la mécanique qui paie le risque

Laisser une balle ennemie passer **à moins de 2 unités** sans être touché = un **frôlement** :
+25 points (×combo), **+6 d'énergie**, et un sursis sur la fenêtre de combo. C'est la seule
façon de tenir les paliers ×6 à ×8, dont la fenêtre se resserre de 2,5 s à 1,5 s.

L'énergie se dépense sur **une seule touche**, deux usages :

- **appui bref à 50** — *Nova Bomb* : efface tous les tirs à l'écran, frappe les ennemis
  proches, renvoie les plongeurs. Le bouton panique.
- **maintien à 100** — *Overdrive* (4 s) : cadence ×1,5, balles perforantes, tirs ennemis
  au ralenti et **score ×2**. Le bouton panache.

## Boucle de jeu

1. **Vague** — les ennemis entrent en file sur des courbes de Bézier, se placent en formation,
   puis plongent vers vous en tirant.
2. **Crédits** — chaque ennemi détruit lâche des crédits. Enchaîner les kills monte le
   **multiplicateur de combo** (jusqu'à ×5) qui multiplie les gains.
3. **Boutique** — entre deux vagues, dépensez vos crédits : cadence de tir, canons multiples,
   missiles à tête chercheuse, bouclier, propulseurs, aimant à crédits, coque.
4. Toutes les 4 vagues : **vaisseau-amiral** (mini-boss). Le meilleur score et la meilleure vague
   sont sauvegardés en `localStorage`.

## Compétition entre copains

À la fin d'une partie rapide, chaque pilote inscrit son nom au **panthéon local** (top 10,
`localStorage`, affiché à l'écran titre) — parfait pour se départager sur le même appareil.
Le bouton **« Défier les copains »** partage le score (Web Share sur mobile, presse-papier
sinon) pour lancer le défi à distance.

## Campagnes — la Voie lactée

Le mode **Campagne** ouvre une carte de la galaxie : chaque système (Sol, Proxima, Sirius,
Bételgeuse… jusqu'à Sagittarius A★) est une mission courte avec ses modificateurs (PV,
densité de tir, plongées, crédits) et parfois un vaisseau-amiral final. La progression et le
record par système sont sauvegardés.

**Publier une campagne chaque semaine** : déposer un JSON dans `public/campaigns/` + une entrée
dans `index.json`, déployer — rien d'autre. Voir [`public/campaigns/PUBLIER.md`](public/campaigns/PUBLIER.md).
Les joueurs voient un badge « Nouveau » et, s'ils ont activé les alertes, reçoivent une
notification.

## PWA

Le jeu est installable (manifest + service worker, icônes générées par
`node scripts/make-icons.mjs`) et jouable hors-ligne après la première visite. Les alertes de
nouvelle campagne utilisent **Periodic Background Sync** quand il est disponible
(Chrome/Android, PWA installée) ; ailleurs, la vérification a lieu à chaque ouverture du jeu.
Pour des notifications *push* même application fermée sur toutes les plateformes, il faudrait
un petit serveur Web Push (non inclus).

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
