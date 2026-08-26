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

## Les trois fiches

Aucune des trois n'a été construite pour se battre. Les Élides fuyaient : ils ont
emporté des outils, pas des armes. Ce que le joueur pilote, ce sont trois engins de
chantier réveillés dix mille ans trop tard et retournés contre celui qui les
cherche — et c'est précisément ce que KORN ne supporte pas. _« Encore leurs outils.
Toujours leurs outils, et jamais eux. »_

NOVA les connaît toutes les trois. Elle en parle comme d'anciens collègues : avec
affection pour l'une, méfiance pour l'autre, et une gêne qu'elle n'explique pas
pour la troisième.

---

### ORION — celle qui a mesuré la route

**Ce qu'elle était.** Un vaisseau de relevé. Pas un chasseur : un arpenteur. Il
partait devant la flotte, mesurait la distance entre les étoiles et rentrait avec
des chiffres. C'est lui qui a tracé la route par laquelle les Élides se sont
enfuis — et il l'a tracée sans savoir qui resterait derrière.

**Ce qu'elle est devenue.** Ses télémètres tirent. On n'a rien changé d'autre : la
même optique qui mesurait une naine rouge à quatre années-lumière tient aujourd'hui
un plongeur à quarante mètres. Un instrument de mesure fait une arme redoutable,
parce qu'il ne rate pas.

**Son caractère.** Méthodique, sobre, un peu sèche. Elle ne commente pas, elle
annonce. Quand elle a peur, elle donne des chiffres plus précis que nécessaire —
c'est à ça qu'on le voit.

**Ce qu'elle dirait.** _« Trois cent quarante mètres. Deux virgule huit secondes
avant contact. Je te le dis parce que tu peux encore bouger. »_

**Son défaut.** Elle croit que mesurer, c'est comprendre. Elle a mesuré la route de
la fuite sans jamais se demander pourquoi personne ne revenait.

---

### HÉLIOS — celle qui a regardé le soleil trop longtemps

**Ce qu'elle était.** Une récolteuse de lumière. Elle descendait dans la couronne
des étoiles, ouvrait son émetteur et remplissait les arches d'énergie. Un travail
de patience : approcher, se stabiliser, tenir la position pendant des heures
pendant que tout chauffe.

**Ce qu'elle est devenue.** Son collecteur fonctionne à l'envers. Ce qu'elle
absorbait, elle le rend — en ligne droite, sur toute la profondeur, jusqu'à ce que
la cible cède ou qu'elle-même se décroche.

**Son caractère.** Obsessionnelle. Fixe. Elle n'aime pas être interrompue et le
fait sentir. Quand elle tient quelque chose, elle ne parle plus du tout — et ce
silence est la seule chose qui inquiète NOVA.

**Ce qu'elle dirait.** _« Ne bouge pas. Encore. Encore. Je l'ai presque. »_

**Son défaut.** Elle ne sait pas s'arrêter, et elle ne sait pas faire deux choses.
Le jour de l'évacuation, elle était en approche d'une étoile. Personne n'est venu
lui dire de remonter. Elle a fini son cycle.

---

### VULCAIN — celle qui a creusé le monstre

**Ce qu'elle était.** Un vaisseau de chantier. Elle posait les charges qui ouvraient
les astéroïdes, et c'est de ce métal-là qu'on a bâti les deux arches. Elle a donc
creusé, de ses propres bras, la coque dans laquelle KORN a été enfermé.

**Ce qu'elle est devenue.** Rien du tout. Elle fait exactement ce qu'elle a toujours
fait : elle place une charge, elle attend, elle recule. La seule différence, c'est
ce qu'il y a en face.

**Son caractère.** Lente, patiente, imperturbable. Elle ne s'énerve jamais parce
qu'elle a déjà tout calculé. Elle parle au passé et au futur, presque jamais au
présent — ce qui la rend difficile à suivre.

**Ce qu'elle dirait.** _« Dans deux secondes, il sera là. J'y ai déjà mis ce qu'il
faut. »_

**Son défaut.** Elle vit deux secondes en avance et rate ce qui se passe maintenant.
Et elle sait ce qu'elle a construit. Quand l'amiral apparaît, elle est la seule des
trois à se taire.

---

## Le tableau qui résume

|                  | **ORION**             | **HÉLIOS**                  | **VULCAIN**                         |
| ---------------- | --------------------- | --------------------------- | ----------------------------------- |
| Arme             | flux droit + missiles | rayon continu qui monte     | charges à retardement               |
| Verbe            | viser                 | tenir                       | anticiper                           |
| Se déplacer      | vital                 | coûteux                     | libre                               |
| Portée           | devant                | toute la colonne            | là où l'on a semé                   |
| Le bon réflexe   | suivre sa cible       | rester aligné               | tirer devant la cible               |
| Contre un boss   | régulier              | excellent s'il ne bouge pas | irrégulier, énorme si bien placé    |
| Contre une nuée  | moyen                 | bon en largeur              | excellent                           |
| Remplir la jauge | toucher sans rater    | frôler les balles           | prendre plusieurs ennemis d'un coup |

---

## Trois façons de remplir la jauge

La jauge de furie est la même pour tous — c'est elle qui paie la bombe, l'Overdrive
et la pirouette. Mais **on ne la remplit pas de la même manière**, et c'est là que
les trois coques se séparent vraiment. Le frôlement pousse à s'approcher des balles ;
si les trois le partageaient, les trois joueraient pareil malgré leurs armes.

Chaque mécanique récompense donc exactement le verbe de sa coque. Aucune n'est plus
généreuse qu'une autre : le débit visé est le même, seule la façon de l'obtenir
change.

### ORION → LA JUSTESSE

**Chaque balle qui touche nourrit la jauge. Chaque balle qui sort de l'écran sans
rien toucher en retire un tiers.**

Le tir est automatique : le joueur ne choisit pas _quand_ il tire, il choisit _d'où_.
Rester sous la formation, aligné sur une colonne, remplit la jauge à toute vitesse.
Tirer dans le vide en fuyant la vide aussi sûrement — et c'est le même geste.

C'est la mécanique la plus dangereuse des trois, et c'est voulu : elle demande de
rester dans l'axe des ennemis, c'est-à-dire dans l'axe de leurs tirs.

- Ce qu'elle enseigne : **se placer sous sa cible, et y rester.**
- Son piège : la panique fait fuir, et fuir vide la jauge au moment où l'on en a le
  plus besoin.

### HÉLIOS → LE FRÔLEMENT

**Inchangé** — c'est la mécanique historique du jeu, et elle lui revient.

Laisser une balle passer à moins de deux unités sans être touché remplit la jauge,
prolonge le combo et recharge le bouclier.

Elle va parfaitement à cette coque : HÉLIOS doit **rester aligné sur sa cible** pour
que son rayon monte en puissance, donc rester exposé. Le frôlement transforme cette
exposition forcée en carburant. Les deux mécaniques se tiennent — c'est la seule
des trois coques où encaisser le danger EST la stratégie.

- Ce qu'elle enseigne : **tenir sa position quand tout dit de bouger.**
- Son piège : deux unités, c'est très près.

### VULCAIN → LA SALVE

**Une explosion qui ne prend qu'un seul ennemi ne donne rien. Deux donnent un peu.
Cinq remplissent un quart de la jauge d'un coup.**

Pilonner au hasard ne rapporte rien du tout. Attendre que la formation se resserre,
poser la charge devant elle et la laisser arriver dedans : voilà ce qui paie.

- Ce qu'elle enseigne : **ne pas tirer tout de suite.**
- Son piège : attendre coûte du temps, et le temps fait descendre les plongeurs.

### Le reste ne change pas

La bombe, l'Overdrive, la pirouette, l'Appel, le Réflexe Chrono : identiques pour
les trois. On n'apprend pas trois jeux, on réapprend le même.

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
3. **La JUSTESSE d'ORION doit-elle vraiment PÉNALISER les balles perdues ?** Ma
   réponse : oui, sinon ce n'est pas une mécanique, c'est un cadeau — la jauge se
   remplirait toute seule en tirant n'importe où. Mais le tir étant automatique, la
   pénalité tombe parfois sans qu'on l'ait choisie. À essayer manette en main.
4. **Faut-il une quatrième coque plus tard ?** Le cadre le permet ; trois suffisent.
