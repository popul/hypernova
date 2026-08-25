# HYPERNOVA — Les trois coques

Conception du système de classes, à relire et corriger avant implémentation.

---

## Le piège à éviter

La version paresseuse des « trois classes » est connue : rapide / équilibré /
costaud. Trois curseurs de statistiques, un choix au début, et le joueur joue
exactement pareil dans les trois cas — seuls les nombres affichés changent.

Le test qu'une classe doit passer :

> **Si on échange votre vaisseau en pleine partie sans vous prévenir, vos MAINS
> doivent faire autre chose.**

Pas « je fais moins de dégâts », mais « je suis au mauvais endroit et j'appuie sur
le mauvais bouton ». Une classe qui échoue à ce test n'est pas une classe, c'est un
préréglage.

Donc chaque coque s'organise autour d'un **verbe** différent, et ce verbe doit être
en tension avec la boucle du jeu — sinon il ne se paie pas.

---

## Ce que le jeu demande déjà au joueur

Avant d'inventer, il faut regarder ce qui existe. HYPERNOVA demande cinq choses :

1. **Se placer** — l'arène boucle à gauche et à droite, et on peut avancer/reculer.
2. **Frôler** — s'approcher volontairement des balles rapporte énergie, combo et
   recharge de bouclier. C'est la mécanique centrale, et elle est risquée.
3. **Dépenser l'énergie** — bombe de panique ou Overdrive.
4. **Choisir ses cibles** — plongeurs, formation, boss.
5. **Aller chercher l'argent** — qui tombe de la formation vers le bas.

Les trois classes ne sont pas trois jeux différents : ce sont **trois lectures des
mêmes cinq entrées**. Rien d'autre à apprendre, tout à réapprendre.

---

## LAME — le frôleur

> *Coque longue, fine, deux dérives en flèche. Aucun blindage visible : on voit la
> tuyauterie.*

**Verbe : traverser.**

La plus rapide, la plus étroite, et **sans bouclier du tout**. Une vie de moins que
les autres. Chaque erreur est fatale.

Son énergie n'achète pas une bombe : elle achète une **Percée**. Un dash court,
invulnérable, qui frôle tout ce qu'il traverse — et chaque balle frôlée pendant la
Percée est convertie en dégâts sur l'ennemi le plus proche.

Ce qui renverse tout le jeu : **une nappe de balles n'est plus un danger, c'est une
munition.** Le bon réflexe devient de viser l'endroit le plus dense de l'écran et
d'y foncer.

- **Frôler** → charge la Percée, et rapporte le double en score.
- **Se déplacer** → indispensable, en permanence.
- **Sa difficulté** → il n'y a aucune marge d'erreur, jamais.

C'est la classe experte. Celle qu'on prend quand on a compris le jeu, et celle qui
fait les gros scores.

---

## ENCLUME — le tenant

> *Coque large, trapue, plaques boulonnées en épaisseur. Deux bras de canon qui
> dépassent devant.*

**Verbe : tenir.**

Lente, large, deux vies de plus, bouclier qui se régénère seul.

Son arme n'est pas un flux de projectiles mais un **rayon continu qui monte en
puissance** : tant qu'il reste accroché à une cible sans être interrompu, ses
dégâts montent de ×1 à ×4 en deux secondes. Perdre le contact remet à zéro.

Ce qui renverse le jeu dans l'autre sens : **bouger coûte toute la puissance.** Là
où l'instinct dit « esquive en permanence », ENCLUME dit « plante-toi, encaisse sur
le bouclier, et ne lâche pas ». Chaque esquive est une décision comptable.

Son énergie achète l'**Ancrage** : elle s'immobilise complètement et déploie un mur
frontal qui absorbe tout — et chaque balle absorbée recharge le rayon.

- **Frôler** → pose une plaque temporaire (réduction de dégâts), pas de l'énergie.
- **Se déplacer** → coûteux, à faire à contrecœur.
- **Sa difficulté** → savoir quand lâcher. Rester est presque toujours tentant.

C'est la classe accessible. Un enfant qui débute survit avec ENCLUME. Mais bien la
jouer — savoir exactement quand décrocher — est loin d'être simple.

---

## ESSAIM — le commandant

> *Petite coque centrale, presque nue, entourée de nacelles détachables.*

**Verbe : placer.**

Son canon propre est faible, presque symbolique. Elle déploie des **drones** — deux
au départ, jusqu'à cinq — qui tirent tout seuls.

Les drones suivent le vaisseau **avec un retard**. Un zigzag les fait donc balayer
l'écran en éventail ; rester immobile les aligne en colonne. Le joueur ne vise pas :
il *dessine* la position de sa puissance de feu avec sa propre trajectoire.

Son énergie achète la **Salve** : rappel de tous les drones sur un point, puis
détonation. Ils reviennent après un délai.

Et surtout : **les drones ramassent l'argent tout seuls.** ESSAIM est la classe
riche — donc celle qui s'équipe le plus vite en boutique.

- **Frôler** → recharge les drones.
- **Se déplacer** → c'est l'arme elle-même.
- **Sa difficulté** → sa puissance est là où sont ses drones, pas où pointe le nez.

C'est la classe stratège. Celle qui rapporte le plus de crédits, donc celle qui
transforme une bonne partie en très bonne partie.

---

## Le tableau qui résume tout

Les trois coques lisent les mêmes entrées. C'est là qu'est l'élégance : rien de
nouveau à apprendre, tout à réapprendre.

| | **LAME** | **ENCLUME** | **ESSAIM** |
|---|---|---|---|
| **Frôler** | charge la Percée | pose une plaque | recharge les drones |
| **Énergie pleine** | Percée (dash traversant) | Ancrage (mur frontal) | Salve (drones détonent) |
| **Se déplacer** | vital | coûteux | c'est l'arme |
| **Encaisser** | impossible | prévu | à éviter |
| **Argent** | à aller chercher | difficile (lent) | ramassé tout seul |
| **Le bon réflexe** | foncer dans le danger | ne pas bouger | tracer une courbe |

---

## « S'améliorer en passant les niveaux » — deux échelles

### A. Dans la partie : trois paliers de coque

Le vaisseau **change de forme** deux fois par partie. Ce n'est pas un skin : chaque
palier boulonne des modules visibles ET ajoute une capacité.

| | LAME | ENCLUME | ESSAIM |
|---|---|---|---|
| **I** | dash simple | rayon ×1→×3 | 2 drones |
| **II** | dash double, traînée qui blesse | rayon ×1→×4, mur réfléchissant | 3 drones + un drone lourd |
| **III** | dash en chaîne (relance si on tue) | rayon perforant sur toute la colonne | 5 drones, Salve en nova |

**Comment on monte de palier — et c'est là que trois demandes se rejoignent.**

Le scénario prévoit des **fragments du Registre** à récupérer. Le choix de
trajectoire propose à chaque palier une route courte (crédits, matériel) et une
route longue (un fragment). Et le fragment est justement ce qui fait évoluer la
coque : **3 fragments → palier II, 7 fragments → palier III.**

Un seul système sert donc trois choses :

- le choix de route devient une vraie décision (s'équiper *ou* évoluer) ;
- l'évolution du vaisseau se voit, littéralement, sur la coque ;
- les fragments d'histoire cessent d'être de la décoration : ils sont la
  progression.

Un joueur qui prend toujours la route courte finit riche et en palier I. Un joueur
qui prend toujours la route longue finit pauvre et en palier III. Les deux sont
jouables et ne se ressemblent pas.

### B. Entre les parties : la maîtrise

Chaque classe accumule de l'expérience d'une partie à l'autre. Les paliers de
maîtrise débloquent :

- des **variantes cosmétiques** (teintes de coque, marquages, formes de dérives) —
  c'est ce qui alimente la personnalisation au moment de créer son pseudo ;
- à la maîtrise 3, 6 et 9, un **module de départ** au choix : commencer la partie
  avec un fragment déjà acquis, ou une vie en plus, ou 150 crédits.

Le fils de Paul et ses copains n'ont pas seulement un score à comparer : ils ont
« je suis maîtrise 7 sur ESSAIM ».

---

## Conséquences sur ce qui existe déjà

**La boutique.** Huit cartes, comme aujourd'hui, mais coupées en deux :

- **Quatre communes** — Coque renforcée, Propulseurs, Aimant tracteur, Réflexe
  Chrono.
- **Quatre propres à la classe** — pour LAME : portée de Percée, fenêtre
  d'invulnérabilité, conversion frôlement→dégâts, vitesse. Pour ENCLUME : montée
  du rayon, régénération de bouclier, durée d'Ancrage, largeur du faisceau. Pour
  ESSAIM : nombre de drones, cadence des drones, rayon de collecte, puissance de
  Salve.

La grille ne change pas de taille : la moitié change de contenu.

**Le bouton d'attraction des crédits** devient l'action secondaire commune aux
trois : une impulsion qui aspire l'argent, faible au départ, améliorée par
l'Aimant. Sur ESSAIM elle est plus forte, puisque les drones vont chercher.

Deux boutons en bas à droite au tactile : **✦** (la capacité de classe) et **◉**
(l'appel des crédits).

**L'Overdrive et la Nova Bomb.** Ils disparaissent en tant que tels — ils étaient
la « capacité de classe » d'un jeu qui n'en avait qu'une. Leur rôle est repris :
la Percée est la bombe de LAME, l'Ancrage est le bouclier d'ENCLUME, la Salve est
la bombe d'ESSAIM. Le bouton, la jauge et la pédagogie restent identiques.

**Le Réflexe Chrono** reste commun : c'est un filet de sécurité, pas une identité.

---

## Ce que ça coûte à construire — honnêtement

C'est le plus gros chantier depuis le début du projet. Dans l'ordre de coût :

1. **Les drones d'ESSAIM** — une nouvelle entité poolée, avec suivi retardé, tir
   autonome, ciblage et collecte. C'est la moitié du travail à elle seule.
2. **Neuf coques** — trois classes × trois paliers, générées en code comme le reste.
3. **Le rayon continu d'ENCLUME** — nouveau type d'arme (faisceau persistant avec
   contact et montée), rendu compris.
4. **L'écran de choix de classe**, fusionné avec la création de pseudo et la
   personnalisation cosmétique.
5. **La boutique à moitié variable** et la persistance de la maîtrise.

Je propose de livrer par lots jouables plutôt qu'en une fois :

- **Lot 1** — les trois coques au palier I, leurs trois capacités, l'écran de
  choix. Jouable et déjà très différent.
- **Lot 2** — les paliers II et III, liés aux fragments et au choix de route.
- **Lot 3** — la maîtrise entre parties et les cosmétiques.

---

## Points à trancher ensemble

1. **Est-ce que la classe se choisit à chaque partie, ou une fois pour toutes avec
   le pseudo ?** Je penche pour : cosmétique choisie à la création, classe choisie
   à chaque partie. Sinon on essaie une classe et on est coincé avec.

2. **ENCLUME risque d'être trop confortable.** Blindée, immobile, elle pourrait
   devenir le choix évident pour débuter *et* pour finir. Le garde-fou prévu est
   qu'elle rapporte peu d'argent (elle ne va pas chercher les gemmes) — est-ce
   suffisant, ou faut-il un vrai défaut ?

3. **La Percée de LAME est-elle trop forte ?** Traverser une nappe en
   invulnérabilité *et* en tirer des dégâts, c'est beaucoup. Peut-être que la
   Percée ne doit PAS être invulnérable, seulement très rapide — et que le frisson
   vient de là.

4. **Les drones doivent-ils être destructibles ?** Ça donnerait une gestion (les
   protéger, les rappeler), mais aussi une frustration.

5. **Faut-il une quatrième classe plus tard ?** Le cadre le permet. Trois suffisent
   pour l'instant.
