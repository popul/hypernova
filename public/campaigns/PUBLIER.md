# Publier une nouvelle campagne (chaque semaine)

Une campagne = **un fichier JSON dans ce dossier** + **une entrée dans `index.json`**.
Aucun code à toucher : déployez, et les joueurs voient un badge « Nouveau » (et reçoivent
une notification si les alertes sont activées).

## 1. Créer `<bras>-<année>-w<semaine>.json`

```jsonc
{
  "id": "sagittaire-2026-w37",        // unique, stable (sert à la détection « nouveau »)
  "title": "Le Bras du Sagittaire",
  "subtitle": "Campagne de la semaine 37",
  "publishedAt": "2026-09-07",        // tri : la plus récente s'affiche en premier
  "systems": [
    {
      "id": "m8",                     // unique dans la campagne (progression localStorage)
      "name": "Nébuleuse de la Lagune",
      "desc": "Texte d'ambiance affiché sur la carte.",
      "waves": 3,                     // nombre de vagues de la mission
      "baseWave": 5,                  // difficulté de départ (≈ numéro de vague arcade)
      "bossFinal": false,             // true → la dernière vague est un vaisseau-amiral
      "mods": {                       // multiplicateurs (1 = normal)
        "hp": 1.2,                    // points de vie des ennemis
        "fire": 1.3,                  // densité des tirs
        "dive": 1.2,                  // fréquence/vitesse des plongées
        "credits": 1.4                // gains de crédits (récompense le risque)
      }
    }
  ]
}
```

Conseils d'équilibrage : 5 à 8 systèmes, `baseWave` croissant (1-2 par système),
un `bossFinal` au milieu et un à la fin, `credits` qui monte avec la difficulté.

## 2. Référencer dans `index.json`

```json
{ "id": "sagittaire-2026-w37", "title": "Le Bras du Sagittaire", "file": "sagittaire-2026-w37.json" }
```

## 3. Déployer

`npm run build` puis publier `dist/` (ou commit + déploiement automatique).
Le jeu recharge `index.json` avec `cache: no-store` à chaque ouverture.
