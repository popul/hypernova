# HYPERNOVA

> Shoot'em up spatial 3D — vagues d'ennemis en formation, plongées kamikazes, crédits à ramasser
> et boutique d'améliorations entre chaque vague. Three.js + Vite, zéro asset externe : tous les
> vaisseaux sont des meshes low-poly générés en code, tous les sons sont synthétisés en WebAudio.
> Jouable au clavier **et au tactile** (PWA installable), avec un **panthéon partagé** où
> chaque ligne s'ouvre sur le **replay** de la partie, et un mode **Survie** de cent vagues.

![statut](https://img.shields.io/badge/statut-jouable-4ff2ff) ![licence](https://img.shields.io/badge/licence-MIT-ffc857)

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:5173
```

Build de production : `npm run build` puis `npm run preview`.

## Contrôles

| Action                        | Clavier                              | Tactile                       |
| ----------------------------- | ------------------------------------ | ----------------------------- |
| Déplacement                   | ← → ou Q / D (AZERTY) ou A / D       | glisser le doigt              |
| Tir                           | Espace ou clic (maintenu = tir auto) | automatique tant qu'on touche |
| **Nova Bomb** (50 d'énergie)  | **X** (appui bref)                   | bouton ✦ (appui bref)         |
| **Overdrive** (100 d'énergie) | **X** (maintenir 0,35 s)             | bouton ✦ (maintenir)          |
| Boutique / menus              | Souris ou 1-9 + Entrée               | tap                           |
| Pause / son                   | P ou Échap · M                       | boutons ⏸ / ♪ en bas à droite |

## Lire les tirs : deux couleurs, deux dangers

- **Rose** — balle **visée** : elle est calculée sur votre trajectoire, elle vous suit.
  Changez de sens, ne courez pas en ligne droite.
- **Ambre** — balle **droite** : mur, tir croisé ou éventail du boss. Elle ne vous suit pas,
  mais elle occupe l'espace : il faut viser le trou.

Un ennemi qui va tirer **pulse pendant 0,28 s** avant de lâcher sa balle : le préavis est
toujours là, la mort se comprend.

## Le frôlement : la mécanique qui paie le risque

Laisser une balle ennemie passer **à moins de 2 unités** sans être touché = un **frôlement** :
+25 points (×combo), **+6 d'énergie**, et un sursis sur la fenêtre de combo. C'est la seule
façon de tenir les paliers ×6 à ×8, dont la fenêtre se resserre de 2,5 s à 1,5 s.

L'énergie se dépense sur **une seule touche**, deux usages :

- **appui bref à 50** — _Nova Bomb_ : efface tous les tirs à l'écran, frappe les ennemis
  proches, renvoie les plongeurs. Le bouton panique.
- **maintien à 100** — _Overdrive_ (4 s) : cadence ×1,5, balles perforantes, tirs ennemis
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

## Deux modes

- **Partie rapide** — l'arcade : les vagues s'enchaînent sans fin, on joue pour le score.
- **Survie · 100 vagues** — un marathon avec une ligne d'arrivée. La difficulté y monte deux
  fois moins vite (sans quoi tout serait saturé dès la vingtième vague), les boss tombent tous
  les dix, et le classement répond à _jusqu'où es-tu allé ?_ — la vague d'abord, le score
  ensuite.

Chaque mode a son propre tableau et ses propres enregistrements.

## Compétition entre copains

Chaque partie s'inscrit au panthéon sous le nom du pilote. **Cliquer une ligne rejoue la
partie** : contrôles de pause, vitesse ×0,5 à ×4, barre d'avancement.

Le replay n'est pas une vidéo. On enregistre ce que le pilote a demandé, et le jeu refait
tourner la même simulation avec les mêmes commandes — **une partie de vingt secondes pèse deux
cents octets**. Cela suppose trois choses, qui sont des invariants du code :

1. tout le hasard de la simulation passe par `core/rng.js`, semé à chaque vague ;
2. les commandes sont exprimées **dans le monde** et arrondies des deux côtés (`rejeu/commandes.js`),
   pour qu'une partie jouée au doigt en portrait se rejoue sur un écran large ;
3. **toute modification des règles incrémente `VERSION`** dans `rejeu/format.js` — un
   enregistrement d'une autre version est refusé plutôt que rejoué de travers.

### Le serveur est la source

Un petit serveur (`server/`, Node + `node:sqlite`, aucune dépendance npm) tient **les pilotes,
les scores, les replays et les records**. Rien de tout cela n'est en `localStorage` : chaque
appareil avait sinon ses propres pilotes et son propre tableau, qui ne se rejoignaient jamais —
et sur iOS, Safari efface le stockage d'un site laissé de côté une semaine.

Il ne reste sur l'appareil que trois choses, et elles sont assumées :

- le **jeton de session** et le nom du pilote, exactement ce que fait un cookie de connexion ;
- une **file d'envoi** — les parties qui n'ont pas encore pu partir. Ce n'est pas un second
  panthéon mais un tampon : il se vide au retour du réseau, et il est vide la plupart du temps ;
- deux préférences : le son coupé, et l'introduction déjà vue.

Un même pilote peut rester connecté sur **plusieurs appareils** (huit sessions), pour qu'une
tablette ne déconnecte pas le téléphone.

```bash
node server/index.js          # PORT=8081, DB_PATH=/data/hypernova.db
npm run dev                   # le proxy Vite envoie /api au serveur
```

Un pilote publie sous un pseudo protégé par un code à quatre chiffres ; une adresse est
demandée à la création pour pouvoir récupérer un code oublié — elle n'apparaît jamais dans le
classement. Le déploiement se fait par le même chart (`api.enabled=true`).

### La régie

`/admin` est une console d'administration. **Elle n'existe que si le serveur a un secret** :
sans `ADMIN_TOKEN`, les routes `/api/admin` répondent 404 comme une adresse inventée — une
installation neuve n'expose pas une porte ouverte en attendant qu'on pense à la fermer.

```bash
ADMIN_TOKEN="$(openssl rand -base64 32)" node server/index.js
```

```yaml
# Le jeton vient d'un Secret : la valeur en clair finirait dans le manifeste de
# la release, donc dans le dépôt qui la décrit.
api:
  admin:
    existingSecret: hypernova-regie
    secretKey: jeton
```

Elle sait vider un tableau des scores (par mode ou en entier), retirer une partie précise,
supprimer un pilote, fermer ses appareils, libérer les enregistrements d'anciennes règles qui ne
se rejouent plus, et emporter une sauvegarde cohérente de la base.

Le cas qui l'a vraiment justifiée est **le code oublié**. Sans serveur de courrier, quatre
chiffres perdus rendaient un pseudo — et tous ses scores — inaccessibles pour toujours. C'est le
seul endroit du jeu où quelque chose cassait définitivement.

Rien d'irréversible ne se déclenche sur un clic : il faut **recopier à la main** le nom de ce
qu'on détruit. Et chaque action répond par un nombre — « 47 parties effacées » se vérifie,
« fait » ne se vérifie pas.

## PWA

Le jeu est installable (manifest + service worker, icônes générées par
`node scripts/make-icons.mjs`) et jouable hors-ligne après la première visite. Les alertes de
nouvelle campagne utilisent **Periodic Background Sync** quand il est disponible
(Chrome/Android, PWA installée) ; ailleurs, la vérification a lieu à chaque ouverture du jeu.

Les appels à `/api` ne passent **jamais** par le cache : un classement servi depuis le disque
afficherait des scores d'hier sans le dire. Hors ligne, l'appel échoue et le jeu retombe sur le
panthéon local — c'est le comportement voulu, pas une panne.

## Architecture

```
src/
├── main.js              # bootstrap, boucle de rendu, caméra, resize
├── style.css            # HUD, boutique, écrans, effet CRT
├── core/
│   ├── input.js         # clavier, souris, tactile
│   ├── audio.js         # bruitages synthétisés + séquenceur musical WebAudio
│   ├── themes.js        # les thèmes musicaux et leur orchestration
│   └── rng.js           # générateur à graine — la même partie se rejoue
├── admin/               # la régie : console d'administration (page à part)
└── game/
    ├── game.js          # machine à états (titre → vague → boutique → game over)
    ├── constants.js     # tuning gameplay centralisé (équilibrage)
    ├── ships.js         # géométries low-poly, générées en code
    ├── player.js        # déplacement, pirouette, bouclier, frôlement
    ├── enemies.js       # formation, entrées Bézier, IA de plongée, boss
    ├── waves.js         # composition et difficulté des vagues
    ├── bullets.js       # pools de projectiles + missiles guidés
    ├── armes/           # HÉLIOS (rayon) et VULCAIN (missiles) — ORION tire seul
    ├── aura.js          # les gerbes d'énergie de la furie
    ├── soutien.js       # l'appel aux deux autres coques, en pleine furie
    ├── asteroide.js     # le colosse annoncé qui balaie le champ de débris
    ├── pickups.js       # pièces d'or, aimant, collecte
    ├── upgrades.js      # définitions, prix et effets des modules
    ├── shop.js          # la boutique (DOM)
    ├── hud.js           # score, crédits, combo, vies, annonces
    ├── fx.js            # particules poolées, explosions, screenshake, hit-stop
    ├── demo-arme.js     # l'arme vraie qui tire sur l'écran de choix de coque
    ├── pilote-auto.js   # le pilote fantôme qui joue derrière le menu
    ├── director.js      # le rythme d'une session, vague après vague
    ├── characters.js    # les visages et leurs répliques
    ├── cinematic.js     # l'introduction, avec cine/ pour ses accessoires
    ├── jump.js          # le saut entre deux secteurs
    ├── escale-arrivee.js # l'arrivée dans une escale
    ├── routes.js        # les campagnes hebdomadaires
    ├── rejeu/           # enregistrement et relecture déterministes
    ├── space/           # secteurs, décors, escales (anneaux, champ, surface)
    ├── pilots.js        # le pilote courant, côté client
    ├── reseau.js        # les appels au panthéon
    └── parties.js       # la file d'envoi des parties hors ligne

server/                  # le panthéon : Node + node:sqlite, zéro dépendance npm
├── index.js             # les routes publiques
├── admin.js             # les routes d'administration, derrière leur secret
└── base.js              # le schéma et les requêtes
```

Principes : pooling systématique (projectiles, particules, pickups) — aucune allocation dans la
boucle chaude ; tuning centralisé dans `constants.js` ; le DOM ne sert qu'aux menus et au HUD,
tout le gameplay est dans la scène Three.js (bloom via `UnrealBloomPass`).

## Qualité

```bash
npm run lint           # ESLint
npm run format:check   # Prettier
```
