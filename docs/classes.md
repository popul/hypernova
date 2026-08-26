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

- **Ses dégâts sont faibles au contact, et montent tant qu'il ne lâche rien.**
  De ×1 à ×1,8 en deux secondes. Brasser le vide plus de trois dixièmes de seconde
  remet tout à zéro.
- **Elle surchauffe.** Passé une fois et demie la durée de montée, l'émetteur
  décroche et se tait une seconde entière. On ne tient donc jamais une cible
  indéfiniment : le combat long impose de lâcher et de se replacer.
- Donc **perdre le contact coûte toute la puissance**. Là où l'instinct dit
  « esquive en permanence », HÉLIOS dit « garde ta proie sous le rayon ». Chaque
  esquive est une décision comptable, et c'est ce qui rend la coque difficile.

> **Ce que la mesure a corrigé.** Une première version liait la montée à une
> COLONNE, c'est-à-dire à la position du vaisseau : dériver de plus d'une unité
> effaçait tout. Chronométrée, elle ne marchait tout simplement pas — le plus long
> contact d'un combat de boss entier durait 0,66 seconde, contre 2 pour saturer. La
> montée en puissance de la coque n'a jamais existé une seule fois. Ce qui compte
> est donc le CONTACT, pas la position : suivre sa cible est désormais la bonne
> façon de jouer, et c'est la surchauffe qui empêche d'en abuser.

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

**Ce que ça donne en jeu.** Le frôlement : passer au plus près sans toucher, c'est
encore une mesure — la dernière qu'elle sache prendre.

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

**Ce que ça donne en jeu.** La chauffe : elle ne récupère de l'énergie qu'en tenant
sa cible, exactement comme elle ne se remplissait qu'en tenant sa position face au
soleil. On ne lui a jamais appris autre chose.

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

**Ce que ça donne en jeu.** La salve : une charge qui ne prend qu'un ennemi ne lui
rapporte rien. Elle n'a jamais été payée au trou, mais au chantier.

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

### ORION → LE FRÔLEMENT

**Inchangé** — c'est la mécanique historique du jeu, et elle revient à la coque de
référence. Laisser une balle passer à moins de deux unités sans être touché remplit
la jauge, prolonge le combo et recharge le bouclier.

Elle lui va, et pas seulement par tradition : ORION est un arpenteur. Frôler, c'est
mesurer une distance avec son propre fuselage — quatre centimètres, annoncés à la
décimale. C'est la seule chose qu'elle ait jamais su faire, appliquée à ce qui lui
tire dessus.

C'est aussi la coque qu'on prend pour apprendre : celui qui débute apprend donc la
mécanique fondatrice du jeu, et les deux autres coques deviennent des variations
qu'on découvre après.

- Ce qu'elle enseigne : **s'approcher du danger au lieu de le fuir.**
- Son piège : deux unités, c'est très près.

### HÉLIOS → LA CHAUFFE

**Tenir le rayon sur une même cible remplit la jauge, de plus en plus vite. Le
lâcher remet le débit à zéro.**

Un dixième de jauge par seconde après un contact d'une seconde, un tiers après
trois. Laisser le rayon brasser le vide, et tout est à recommencer — la jauge
acquise reste, le débit repart de rien.

C'est la même règle que sa montée en dégâts, et c'est délibéré : chez HÉLIOS, une
seule chose compte, et elle compte deux fois. Le joueur n'a pas deux objectifs à
tenir, il en a un seul, très exigeant.

- Ce qu'elle enseigne : **rester aligné quand tout dit de bouger.**
- Son piège : la cible qu'on tient finit par mourir, et il faut alors retrouver
  l'alignement suivant — les deux secondes qui suivent une mise à mort sont les
  plus pauvres du jeu.

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

1. ~~**HÉLIOS peut-il tirer en se déplaçant ?**~~ **Tranché par la mesure.** Oui, et
   se déplacer ne coûte plus rien du tout : c'est perdre le CONTACT qui coûte. La
   réponse d'origine — remise à zéro dès qu'on change de colonne — a été essayée puis
   chronométrée, et elle rendait la montée en puissance littéralement inatteignable.
2. **Les charges de VULCAIN blessent-elles le joueur ?** Ma réponse : non. Ce serait
   réaliste et détestable.
3. **La CHAUFFE d'HÉLIOS récompense-t-elle deux fois la même chose ?** Tenir sa
   cible fait monter les dégâts ET remplit la jauge. C'est volontaire — un seul
   objectif, très exigeant. La crainte était fondée : une fois le contact réparé, la
   coque pliait un boss en 5,9 s là où ORION en met 20,6. La montée est redescendue
   de ×3,5 à ×1,8 et la surchauffe est née de là. **Reste à confirmer manette en
   main** — les chiffres ci-dessous viennent d'un pilote automatique.
4. **Faut-il une quatrième coque plus tard ?** Le cadre le permet ; trois suffisent.


## Où en est l'équilibre

Chronométrages du 26 août 2026 : temps mis pour nettoyer une vague entière, à
pilote automatique identique pour les trois coques. « Immobile » ne bouge jamais,
« suit » se place sous l'ennemi le plus proche. Ce sont des ordres de grandeur, pas
des vérités — un humain joue autrement.

| Coque   | Vague 3 | Vague 7 | Boss (vague 5) | Vague 3, immobile |
| ------- | ------- | ------- | -------------- | ----------------- |
| ORION   | 11,9 s  | 18,4 s  | 20,6 s         | 17,6 s            |
| HÉLIOS  | 8,1 s   | 14,2 s  | 10,8 s         | 18,0 s            |
| VULCAIN | 15,1 s  | 17,8 s  | 18,1 s         | 17,7 s            |

Ce qu'on cherchait, et qu'on lit dans la dernière colonne : **immobiles, les trois
coques se valent** (17,6 / 18,0 / 17,7). Aucune n'est meilleure en soi. C'est le
pilotage qui les sépare, et chacune récompense le sien — HÉLIOS le plus fort quand
on tient sa proie, VULCAIN le moins en vague facile mais le mieux quand la
difficulté monte (vague 7 : il passe devant ORION).

VULCAIN reste le plus lent à nettoyer, ce qui est conforme à sa fiche. À surveiller
tout de même : sa forge n'a une charge en réserve qu'un tiers du temps, et une
charge ne prend en moyenne que 1,8 ennemi — jamais les cinq de la croix théorique,
parce que la formation réelle a des trous. Élargir le souffle n'y changerait rien
(mesuré : de 3,2 à 4,0 de rayon, le gain est nul), c'est le RYTHME de la forge qui
est le levier.
