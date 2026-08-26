# Musiques des escales — prompts pour Suno

Trois lieux où le détour dépose le vaisseau, donc trois morceaux à écrire. Chaque
`.txt` de ce dossier contient **un prompt et rien d'autre** : il se copie en
entier dans le champ **Style** de Suno, sans rien en retirer.

| Fichier               | Pour                                                      |
| --------------------- | --------------------------------------------------------- |
| `surface.txt`         | Valles Marineris — la surface minérale, chaude             |
| `surface-glace.txt`   | Triton, Europe, Arrokoth — la même chose, glacée           |
| `anneaux.txt`         | Division de Cassini, arcs de Neptune, anneau de Jupiter    |
| `champ.txt`           | Ceinture, cimetière de L2, Kuiper                          |
| `champ-epave.txt`     | Épave sans nom — le tout dernier secteur, désossé          |

Dans tous les cas : **Instrumental coché**, et un titre libre.

Chaque prompt fait environ 500 caractères. Les versions récentes de Suno en
acceptent 1000, les plus anciennes 200 — si le champ refuse le texte, coupe à
partir de « Long hall reverb… » : tout ce qui suit décrit la production, et c'est
la partie dont on peut se passer. Le début, lui, tient l'identité du morceau.

---

## Pourquoi aucun nom de compositeur n'apparaît dans les prompts

Suno filtre les noms d'artistes et d'œuvres. Demander « à la manière de tel
compositeur » ne produit rien, ou produit un générique de série télé. Ce qui
fonctionne, ce sont les **instruments** et les **gestes**. Les trois références
demandées ont donc été traduites en descripteurs concrets :

**Du premier** — le cor solo qui énonce un motif de quatre notes montantes, le
chœur sans paroles placé très en arrière, le piano cristallin, le shakuhachi pour
une seule phrase solitaire, et les grands silences avant les grandes phrases.

**Du deuxième** — l'orgue d'église tenu, l'ostinato de croches régulières, la
montée par accumulation lente, et surtout : jamais de batterie.

**Du troisième** — les cuivres graves massifs, les trombones qui grondent, les
timbales martiales, les percussions métalliques frappées, la mécanique qui avance
et ne s'arrêtera pas.

## Pourquoi tout est en ré

Les quatre thèmes que le jeu synthétise déjà sont bâtis sur un **ré** — c'est
écrit dans `src/core/themes.js`, et c'est ce qui leur permet de s'enchaîner au
saut lumière sans que l'oreille bronche. Une piste dans une autre tonalité
jurerait à chaque passage de l'une à l'autre. Les prompts demandent donc tous
`D minor`, sauf le champ de débris en `D dorian` — le même ré, mais durci, comme
le thème « La route se durcit ».

---

## Trois choses à savoir avant de lancer

### Générer deux fois, toujours

Suno rend deux versions par prompt et elles diffèrent beaucoup. Sur ce genre
d'écriture orchestrale, la deuxième est souvent la bonne — celle qui a osé le
silence. Ne juge pas sur la première.

### La boucle est le vrai problème

Ces morceaux tourneront en boucle pendant qu'on joue. Suno ne sait pas écrire une
boucle : il écrit un début et une fin. Prends la section la plus régulière du
résultat — souvent entre 0:45 et 1:45 — et fais-en une boucle, plutôt que de
garder le morceau entier avec son intro et sa chute.

### Le jeu ne sait pas encore lire un fichier audio

Aujourd'hui tout est synthétisé à la volée : il n'y a pas un seul fichier son
dans le projet, et c'est ce qui lui permet de peser si peu et de fonctionner hors
ligne. Ajouter des pistes demandera de les charger, de les mettre en cache pour
le hors-ligne, et de décider ce qui se passe quand elles ne sont pas encore
arrivées. C'est faisable, mais ce n'est pas rien.

---

## Si le résultat ne va pas

**Trop sage, trop plat** (surtout sur les anneaux) — ajouter au prompt :
`one enormous organ chord entering at 1:20 and holding`. Donner l'horaire d'un
geste est ce que Suno exécute le mieux.

**Trop chargé, ça n'arrête jamais** — ajouter `leave long silences between
phrases` et retirer un instrument de la liste plutôt que d'en ajouter un.

**Ça sonne comme une musique de pub** — c'est presque toujours la faute d'une
batterie qui s'est invitée. Renforcer le champ *Exclude styles* :
`drums, edm, pop, trap, rock drums, cinematic trailer`.

**Trop lent à démarrer** — Suno met souvent trente secondes à entrer dans le
morceau. Ce n'est pas grave ici : cette intro sera coupée au moment de faire la
boucle.
