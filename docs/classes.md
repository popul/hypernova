# HYPERNOVA — Les trois coques

Conception à relire et corriger avant implémentation. Elle remplace la version
précédente, qui datait d'avant le mode Survie et les modules qui tombent.

Les trois noms viennent de la mythologie, et chacun a été choisi pour dire son arme
sans qu'on ait à l'expliquer : **ORION** le chasseur frappe où il regarde,
**HÉLIOS** traverse le ciel d'un bout à l'autre, **VULCAIN** forge sous le volcan
ce qui finira par éclater.

---

## Ce que le jeu demande déjà

Cinq choses, et les trois coques n'en ajoutent aucune — elles en changent la
lecture :

1. **Se placer** — l'arène boucle à gauche et à droite, on avance et on recule.
2. **Frôler** — s'approcher des balles rapporte énergie et combo. C'est risqué.
3. **Dépenser l'énergie** — bombe ou Overdrive.
4. **Choisir ses cibles** — plongeurs, formation, amiral.
5. **Ramasser** — modules en Survie, crédits en arcade.

Le test qu'une coque doit passer :

> Si on échange votre vaisseau en pleine partie sans vous prévenir, vos **mains**
> doivent faire autre chose.

Pas « je fais moins de dégâts », mais « je suis au mauvais endroit ».

---

## I. ORION — le chasseur

> _Coque longue et fine, deux dérives en flèche._

**Verbe : viser.**

Le chasseur céleste, l'arc tendu. Il frappe où il regarde — et c'est tout ce que
son nom promet.

Le vaisseau actuel, sans changement : flux de projectiles droit devant, missiles à
tête chercheuse qui s'ajoutent avec les modules. C'est la coque de référence — celle
à laquelle les deux autres se comparent, et celle qu'on prend pour apprendre.

- **Tir** — cadence élevée, jusqu'à trois canons parallèles.
- **Missiles** — automatiques, tête chercheuse, un module les ajoute et les accélère.
- **Ce qui la définit** — elle frappe où elle regarde. Rien de plus, rien de moins.

---

## II. HÉLIOS — le soleil qui traverse

> _Coque ramassée autour d'un émetteur central. Deux satellites en orbite lente._

**Verbe : tenir.**

Le soleil va d'un bout du ciel à l'autre, chaque jour, sans dévier. C'est
exactement ce que fait ce vaisseau — et exactement ce qu'il paie : il ne peut pas
faire les deux, avancer et briller.

Un **rayon continu** part du nez et traverse tout l'écran en profondeur. Il ne
s'arrête à rien : tout ce qui se trouve dans sa colonne prend des dégâts, en
permanence.

Ce qui l'empêche d'être une tondeuse à gazon, et c'est tout l'équilibre :

- **Ses dégâts sont faibles au contact, et montent tant qu'il ne quitte pas sa
  cible.** De ×1 à ×3,5 en deux secondes. Perdre le contact remet à zéro.
- Donc **bouger coûte toute la puissance**. Là où l'instinct dit « esquive en
  permanence », HÉLIOS dit « reste aligné, encaisse, et ne lâche pas ». Chaque
  esquive est une décision comptable, et c'est ce qui rend la coque difficile.

**Le laser grossit** avec les modules : la largeur du rayon suit le niveau de
`cannons`, de deux dixièmes d'unité à une unité et demie. Un rayon large touche
plusieurs colonnes de la formation — mais un rayon large monte en puissance plus
lentement, sinon il n'y aurait plus de raison de choisir autre chose.

**Autour du laser** — les satellites. Deux orbes tournent autour du vaisseau et
lâchent des éclats vers les côtés, à intervalle régulier. Ils couvrent ce que le
rayon ne couvre pas : les diagonales, les plongeurs qui arrivent par le flanc. Le
module `missiles` en ajoute (jusqu'à quatre), `firerate` accélère leur cadence.

- **Frôler** → recharge instantanément la montée en puissance du rayon.
- **Sa difficulté** → sa puissance est dans l'immobilité, et le jeu punit
  l'immobilité.

---

## III. VULCAIN — la forge sous le volcan

> _Coque large et trapue, deux bras de lancement, un ventre plein._

**Verbe : anticiper.**

Le forgeron des dieux travaillait sous l'Etna : ce qui couve en dessous finit
toujours par sortir. Ses charges montent lentement avant d'éclater — le nom dit le
délai autant que l'explosion.

Son tir direct est **volontairement faible** — de quoi finir un blessé, pas de quoi
nettoyer. Sa vraie arme, ce sont les **charges** : le vaisseau en lâche une toutes
les deux secondes, elles montent lentement, et **explosent en sphère** au contact
ou au bout de trois secondes.

Ce qui en fait une coque tactique :

- Une charge met du temps à monter. **On ne tire pas sur ce qu'on voit, on tire sur
  ce qui sera là.** Une formation qui balaie de gauche à droite se pilonne en
  visant devant elle.
- L'explosion ne fait pas de distinction : elle prend tout un pan de formation d'un
  coup. Bien placée, elle vaut dix secondes de tir. Mal placée, elle ne vaut rien.
- **Les charges s'accumulent** si on ne les dépense pas : jusqu'à cinq en attente.
  On peut donc en garder pour un boss, ou en semer un tapis avant une vague.

**Ses modules à lui** — les mêmes objets, d'autres effets :

| Module     | Sur VULCAIN                                             |
| ---------- | ------------------------------------------------------- |
| `cannons`  | +1 charge lâchée à la fois                              |
| `missiles` | rayon d'explosion (+35 % par niveau)                    |
| `firerate` | charges lâchées plus souvent                            |
| `engine`   | les charges montent plus vite (donc frappent plus près) |

- **Frôler** → amorce immédiatement la charge la plus proche.
- **Sa difficulté** → tout se joue deux secondes à l'avance, et l'écran ne montre
  que le présent.

---

## Le tableau qui résume

|                 | **ORION**             | **HÉLIOS**                  | **VULCAIN**                      |
| --------------- | --------------------- | --------------------------- | -------------------------------- |
| Arme            | flux droit + missiles | rayon continu qui monte     | charges à retardement            |
| Verbe           | viser                 | tenir                       | anticiper                        |
| Se déplacer     | vital                 | coûteux                     | libre                            |
| Portée          | devant                | toute la colonne            | là où l'on a semé                |
| Le bon réflexe  | suivre sa cible       | rester aligné               | tirer devant la cible            |
| Contre un boss  | régulier              | excellent s'il ne bouge pas | irrégulier, énorme si bien placé |
| Contre une nuée | moyen                 | bon en largeur              | excellent                        |

---

## Ce qui ne change pas

Le frôlement, la jauge de furie, la bombe, l'Overdrive, la pirouette, l'Appel, le
Réflexe Chrono : identiques pour les trois. On n'apprend pas trois jeux, on
réapprend le même.

---

## Où l'on choisit

**Au début de chaque partie**, pas à la création du pilote : il faut pouvoir
essayer. L'écran de choix montre les trois coques en 3D, avec une phrase chacune —
la même vitrine que le hangar, avec trois vaisseaux au lieu d'un.

La coque choisie entre dans l'instantané du replay : revoir la partie d'un copain,
c'est aussi voir avec quoi il l'a jouée.

---

## Points à trancher ensemble

1. **HÉLIOS peut-il tirer en se déplaçant ?** Ma réponse : oui, mais la montée
   en puissance se remet à zéro dès qu'il change de colonne. Sinon la coque devient
   « je ne bouge jamais », ce qui n'est pas un jeu.
2. **Les charges de VULCAIN blessent-elles le joueur ?** Ma réponse : non. Ce serait
   réaliste et détestable.
3. **Faut-il une quatrième coque plus tard ?** Le cadre le permet ; trois suffisent.
