// Les quatre thèmes du voyage, en DONNÉES.
//
// `audio.js` ne contenait qu'une partition, écrite en dur au milieu du moteur.
// Le voyage, lui, compte onze paliers (voir `src/game/space/biomes.js`) et
// s'éloigne de la Terre : la même musique du premier au dernier revient à dire
// que rien ne change, alors que TOUT le propos du jeu est que quelque chose
// change. D'où ce fichier : quatre partitions, un seul vocabulaire, et un moteur
// qui n'a plus qu'à lire.
//
// ---- LE MODÈLE DE HAUTEURS ----
//
// Tout est écrit en DEMI-TONS ENTIERS depuis ré1 (36,708 Hz), exactement comme
// dans `audio.js` : `hz(s) = 36,708 × 2^(s/12)`. Donc 0 = ré1, 12 = ré2,
// 24 = ré3, 36 = ré4, 48 = ré5. Les classes de hauteur, à retenir pour lire les
// accords : 0 ré, 2 mi, 3 fa, 5 sol, 7 la, 8 si♭, 9 si♮, 10 do.
//
// C'EST LE PIÈGE QUI A COÛTÉ LE PLUS CHER, et il n'a pas le droit de revenir.
// La première table d'accords du jeu avait été écrite en pensant en DO alors que
// la fondamentale est un RÉ : chaque accord sonnait un ton au-dessus de son nom,
// « do majeur » jouait ré majeur, et son fa dièse heurtait au demi-ton le fa
// naturel de la mélodie. Le morceau était bitonal d'un bout à l'autre — mélodie
// en ré mineur, harmonie en mi mineur. C'est ce décalage, et rien d'autre, qui
// donnait « un air étrange, malaisant ».
//
// La règle de relecture tient en une ligne : un accord nommé X doit avoir dans
// son `pad` la classe de hauteur de X. Gm → 5 (sol). Bb → 8 (si♭). C → 10 (do).
// Vérifié par le calcul sur les quatre thèmes : aucun accord de ces tables ne
// contient de note étrangère à son nom.
//
// ---- CE QU'EST UNE MÉLODIE ICI ----
//
// Les quatre respectent le même cahier des charges, celui du thème d'origine :
//  1. UNE QUESTION (4 mesures, qui reste en l'air) ET SA RÉPONSE (4 mesures, qui
//     se pose). C'est ce qui rend une phrase fredonnable.
//  2. UN SOMMET, UN SEUL. La note la plus haute du thème ne se joue qu'une fois,
//     et jamais sur le premier temps de la première mesure — sinon ce n'est pas
//     un sommet, c'est un point de départ.
//  3. DES DURÉES INÉGALES.
//  4. DES DEGRÉS CONJOINTS, ET DEUX OU TROIS SAUTS SEULEMENT. Un saut n'existe
//     que s'il est rare.
//
// ---- LES QUATRE CARACTÈRES ----
//
//   depart   — le départ (orbite terrestre → traversée). Le thème existant,
//              transcrit ici À L'IDENTIQUE. Ré mineur naturel, 84 BPM.
//   ceinture — Mars, la ceinture, Jupiter. Ré DORIEN : le si bécarre de l'accord
//              de sol majeur durcit la route sans changer de tonique. 92 BPM.
//   froid    — Saturne, Neptune, Kuiper. Peu de notes, très haut, sur un socle
//              très bas : c'est le VIDE ENTRE LES DEUX qui fait le froid. 60 BPM,
//              soit un temps par seconde d'horloge, très exactement.
//   dehors   — héliopause, interstellaire. Le plus grave, le plus ample, et le
//              seul dont l'accord de tonique n'a PAS de tierce. 50 BPM.
//
// Les quatre partagent la même fondamentale (ré) et le même socle diatonique :
// on peut passer de l'un à l'autre au saut lumière sans transition brutale. Ce
// qui les sépare, ce n'est pas la tonalité, c'est le MODE, le REGISTRE, le TEMPO
// et la densité — mesuré, leurs profils d'intervalles n'ont rien de commun.
//
// ---- CE QUE LE MOTEUR ATTEND (et qu'on ne peut pas changer ici) ----
//
// `_playStep` d'`audio.js` connaît les six sections PAR LEUR NOM et par leur
// numéro de mesure : la mélodie complète se joue aux mesures 16-23 (`drop`), sa
// première moitié aux mesures 4-11 (`A`), sa question nue aux mesures 24-27
// (`breakdown`), le roulement de timbale à la mesure 14. Les `from` de `forme`
// sont donc figés à 0, 4, 12, 16, 24, 28, et les grilles font 2, 4, 2, 4, 2, 2
// accords — un accord toutes les deux mesures, chaque section parcourant sa
// grille exactement une fois. Ce sont les GRILLES qui changent d'un thème à
// l'autre, pas la charpente.
//
// Conséquence pratique, et c'est la seule vraie contrainte d'écriture : la
// mélodie est harmonisée DEUX FOIS, par la grille de `A` et par celle de `drop`.
// Chaque note tenue doit donc être consonante avec les deux. C'est pour ça que
// les deux grilles d'un même thème ne diffèrent que par leur dernier accord :
// `A` reste en l'air, `drop` retombe sur la tonique.
//
// ---- LES CHAMPS ----
//
//   melodie   [{ b, s, n, d }]  b mesure 0-7, s pas 0-15 (16 par mesure),
//                               n demi-tons depuis ré1, d durée en pas.
//   accords   { nom: { sub, pad, bass } }
//               sub  — la pédale de 32 pieds, fondamentale de l'accord.
//               pad  — les quatre voix tenues (orgue une octave plus bas, chœur
//                      au registre écrit), en conduite serrée d'un accord au
//                      suivant.
//               bass — les notes de contrebasse DE CET ACCORD, dans l'ordre
//                      fondamentale, quinte, tierce. `basse` pointe dessus par
//                      INDICE : un intervalle fixe plaquerait une tierce mineure
//                      sur un accord majeur.
//   forme     [{ name, from, grid }]
//   ostinato  degrés dans `pad` (≥ 4 : l'octave au-dessus), une note par croche.
//             ATTENTION : le moteur lit `ostinato[(pas / 2) % longueur]` avec un
//             pas qui repart de zéro à chaque mesure. Au-delà de HUIT entrées,
//             les suivantes ne sont jamais jouées — et une longueur de 6 ne
//             produit pas un cycle de trois mesures mais un boitement 6+2 à
//             l'intérieur de la mesure, ce qui est très différent (et, pour la
//             ceinture, très souhaitable). Vérifié dans `_playStep`.
//   timbales / timbalesLourdes  pas de la mesure où frappe la timbale ; la
//             seconde est réservée au sommet.
//   basse     { pair, impair } — { pas: { i, len } }, une mesure sur deux, pour
//             que la contrebasse ne joue pas la même chose seize fois de suite.
//   tic       pas où frappe l'horloge. Elle ne s'arrête jamais, mais elle RALENTIT
//             à mesure qu'on s'éloigne : quatre par mesure au départ, une seule
//             dans l'espace interstellaire.
//   signature les cinq premières notes de la mélodie. Les indicatifs des
//             personnages et l'appel de vague citent ce motif : c'est ce qui
//             fait entendre qu'un thème et ses sons appartiennent au même monde.

// ---------------------------------------------------------------------------
// 1. DEPART — « Le dernier en vol »
// ---------------------------------------------------------------------------
//
// Le thème existant, transcrit sans changer une note : c'est la preuve que ce
// format sait tout exprimer de ce qui existe déjà, et le point de comparaison
// des trois autres. Ré mineur naturel, grille Dm–Bb–F–C, sommet au fa5 de la
// mesure 5. La dernière note est un ré tenu par-dessus l'accord de do : elle ne
// se résout pas toute seule, c'est l'accord qui bouge dessous à la reprise, et
// c'est ce qui rend la boucle invisible.
const DEPART = {
  id: 'depart',
  nom: 'Le dernier en vol',
  tempo: 84,

  melodie: [
    // — Question. On entre sur le contretemps, ce qui donne l'élan.
    { b: 0, s: 4, n: 43, d: 4 }, // la4
    { b: 0, s: 8, n: 48, d: 6 }, // ré5   ← premier saut : la quarte
    { b: 0, s: 14, n: 46, d: 2 }, // do5
    { b: 1, s: 0, n: 44, d: 6 }, // si♭4  ← le doute
    { b: 1, s: 6, n: 43, d: 6 }, // la4
    { b: 1, s: 12, n: 39, d: 4 }, // fa4
    { b: 2, s: 0, n: 41, d: 4 }, // sol4
    { b: 2, s: 4, n: 43, d: 4 }, // la4
    { b: 2, s: 8, n: 44, d: 8 }, // si♭4  ← on remonte
    { b: 3, s: 0, n: 43, d: 8 }, // la4
    { b: 3, s: 8, n: 41, d: 8 }, // sol4  ← en suspens
    // — Réponse. Même contour, mais elle va plus haut et elle se pose.
    { b: 4, s: 4, n: 46, d: 4 }, // do5
    { b: 4, s: 8, n: 51, d: 6 }, // fa5   ← LE SOMMET, une seule fois
    { b: 4, s: 14, n: 50, d: 2 }, // mi5
    { b: 5, s: 0, n: 48, d: 6 }, // ré5
    { b: 5, s: 6, n: 46, d: 6 }, // do5
    { b: 5, s: 12, n: 43, d: 4 }, // la4
    { b: 6, s: 0, n: 44, d: 4 }, // si♭4
    { b: 6, s: 4, n: 43, d: 4 }, // la4
    { b: 6, s: 8, n: 41, d: 8 }, // sol4
    { b: 7, s: 0, n: 38, d: 8 }, // mi4
    { b: 7, s: 8, n: 36, d: 8 }, // ré4   ← la tonique, par-dessus l'accord de do
  ],

  accords: {
    Dm: { sub: 0, pad: [24, 27, 31, 36], bass: [12, 19, 15] },
    Bb: { sub: 8, pad: [24, 27, 32, 36], bass: [8, 15, 12] },
    F: { sub: 3, pad: [22, 27, 31, 34], bass: [15, 22, 19] },
    C: { sub: 10, pad: [22, 26, 29, 34], bass: [10, 17, 14] },
    Gm: { sub: 5, pad: [24, 29, 32, 36], bass: [17, 24, 20] },
  },

  forme: [
    { name: 'intro', from: 0, grid: ['Dm', 'Bb'] },
    { name: 'A', from: 4, grid: ['Dm', 'Bb', 'F', 'C'] },
    { name: 'lift', from: 12, grid: ['Bb', 'C'] },
    { name: 'drop', from: 16, grid: ['Gm', 'Bb', 'C', 'Dm'] },
    { name: 'breakdown', from: 24, grid: ['Dm', 'Bb'] },
    { name: 'retour', from: 28, grid: ['F', 'C'] },
  ],

  ostinato: [0, 2, 4, 2, 3, 2, 4, 2],
  timbales: [0, 6, 8, 14],
  timbalesLourdes: [0, 3, 6, 8, 11, 14], // 3+3+2
  basse: {
    pair: { 0: { i: 0, len: 8 }, 8: { i: 1, len: 8 } },
    impair: { 0: { i: 0, len: 6 }, 6: { i: 2, len: 4 }, 10: { i: 1, len: 6 } },
  },
  tic: [0, 4, 8, 12],
  signature: [43, 48, 46, 44, 43],
};

// ---------------------------------------------------------------------------
// 2. CEINTURE — « La route se durcit » (Mars → ceinture → Jupiter)
// ---------------------------------------------------------------------------
//
// On est loin de chez soi et la route devient hostile. Trois choix, et aucun
// n'est un effet de manche :
//
// LE MODE. Ré DORIEN au lieu de ré mineur naturel : la sixte devient un si
// BÉCARRE, ce qui rend possible un accord de SOL MAJEUR — le seul accord majeur
// bâti sur un degré fort de la gamme. Même tonique, même fondamentale, mais la
// route n'a plus la même couleur. Attention : le si bécarre et le si♭ ne peuvent
// pas cohabiter (ils sont à un demi-ton), donc PAS UN SEUL si♭ dans ce thème,
// ni à la mélodie ni aux accords. C'est la discipline qui remplace la modulation.
//
// LE RYTHME. La mélodie a une tête de MARTEAU : une croche pointée et une double
// (3 pas + 1 pas), répétée sur la même note. C'est ça qui est martial, pas le
// volume — et comme le motif se réharmonise (ré sur Dm, puis le MÊME ré sur sol
// majeur), on entend la route changer sous des pas qui ne changent pas.
//
// L'OSTINATO À SIX. Six degrés dans une mesure qui compte huit croches : le
// motif se termine, et il reste deux croches pendant lesquelles il recommence
// sans avoir la place d'aller au bout. La mesure s'articule donc 3+3+2 au lieu
// de 4+4 — le boitement qui fait toutes les musiques de marche non militaires.
// (Le moteur relit l'ostinato depuis le début à chaque mesure : ce n'est pas un
// cycle qui se décale de mesure en mesure, c'est un boitement qui revient tel
// quel. Écrire dix degrés en espérant un cycle de cinq mesures n'aurait produit
// que deux degrés muets.)
//
// Le saut du thème est une QUINTE (ré→la, puis la→mi), là où le départ sautait
// des quartes. Deux fois, et jamais ailleurs.
const CEINTURE = {
  id: 'ceinture',
  nom: 'La route se durcit',
  tempo: 92,

  melodie: [
    // — Question. Le marteau, puis la quinte.
    { b: 0, s: 4, n: 36, d: 3 }, // ré4   ┐ la tête de marteau : pointée + double
    { b: 0, s: 7, n: 36, d: 1 }, // ré4   ┘
    { b: 0, s: 8, n: 43, d: 6 }, // la4   ← le saut de quinte
    { b: 0, s: 14, n: 41, d: 2 }, // sol4
    { b: 1, s: 0, n: 43, d: 3 }, // la4
    { b: 1, s: 3, n: 41, d: 1 }, // sol4
    { b: 1, s: 4, n: 39, d: 6 }, // fa4
    { b: 1, s: 10, n: 38, d: 2 }, // mi4
    { b: 1, s: 12, n: 36, d: 4 }, // ré4
    { b: 2, s: 0, n: 36, d: 3 }, // ré4   ┐ même marteau, mais l'accord a changé
    { b: 2, s: 3, n: 36, d: 1 }, // ré4   ┘ dessous : sol majeur. La route bouge.
    { b: 2, s: 4, n: 41, d: 4 }, // sol4
    { b: 2, s: 8, n: 45, d: 8 }, // si4   ← LE si BÉCARRE : la couleur dorienne
    { b: 3, s: 0, n: 43, d: 4 }, // la4
    { b: 3, s: 4, n: 41, d: 4 }, // sol4
    { b: 3, s: 8, n: 43, d: 8 }, // la4   ← en suspens sur la neuvième de sol
    // — Réponse. Le même marteau une quinte plus haut, et il monte plus loin.
    { b: 4, s: 4, n: 43, d: 3 }, // la4   ┐
    { b: 4, s: 7, n: 43, d: 1 }, // la4   ┘
    { b: 4, s: 8, n: 50, d: 6 }, // mi5   ← la même quinte, transposée
    { b: 4, s: 14, n: 48, d: 2 }, // ré5
    { b: 5, s: 0, n: 50, d: 3 }, // mi5
    { b: 5, s: 3, n: 51, d: 1 }, // fa5
    { b: 5, s: 4, n: 53, d: 6 }, // sol5  ← LE SOMMET, une seule fois
    { b: 5, s: 10, n: 51, d: 2 }, // fa5
    { b: 5, s: 12, n: 50, d: 4 }, // mi5
    { b: 6, s: 0, n: 48, d: 3 }, // ré5   ┐ le marteau une dernière fois, en
    { b: 6, s: 3, n: 48, d: 1 }, // ré5   ┘ redescendant
    { b: 6, s: 4, n: 46, d: 4 }, // do5
    { b: 6, s: 8, n: 43, d: 8 }, // la4
    { b: 7, s: 0, n: 41, d: 4 }, // sol4
    { b: 7, s: 4, n: 38, d: 4 }, // mi4
    { b: 7, s: 8, n: 36, d: 8 }, // ré4   ← la tonique, tenue
  ],

  // Quatre accords, tous doriens. Sol majeur est l'accord-signature du thème :
  // sa tierce est le si bécarre. Conduite serrée — de Dm à G, deux voix montent
  // d'un ton et deux ne bougent pas ; de C à Am, une seule voix bouge.
  accords: {
    Dm: { sub: 0, pad: [24, 27, 31, 36], bass: [12, 19, 15] }, // ré fa la ré
    G: { sub: 5, pad: [24, 29, 33, 36], bass: [17, 24, 21] }, // ré sol SI♮ ré
    C: { sub: 10, pad: [22, 26, 29, 34], bass: [10, 17, 14] }, // do mi sol do
    Am: { sub: 7, pad: [22, 26, 31, 34], bass: [19, 26, 22] }, // do mi la do
  },

  // i–IV–♭VII–v : la cadence dorienne, qui n'a pas de sensible et ne se résout
  // donc jamais tout à fait. `A` finit sur la mineur (en l'air), `drop` sur ré
  // (l'arrivée) : c'est le seul endroit où les deux grilles diffèrent, parce que
  // la mélodie doit être juste sous les deux.
  forme: [
    { name: 'intro', from: 0, grid: ['Dm', 'C'] },
    { name: 'A', from: 4, grid: ['Dm', 'G', 'C', 'Am'] },
    { name: 'lift', from: 12, grid: ['G', 'C'] },
    { name: 'drop', from: 16, grid: ['Dm', 'G', 'C', 'Dm'] },
    { name: 'breakdown', from: 24, grid: ['Dm', 'G'] },
    { name: 'retour', from: 28, grid: ['Am', 'C'] },
  ],

  ostinato: [0, 2, 3, 1, 2, 0], // six degrés dans huit croches : la mesure boite en 3+3+2
  timbales: [0, 3, 8, 11], // le boum-ba de la tête de marteau, deux fois par mesure
  timbalesLourdes: [0, 3, 6, 9, 12], // un coup toutes les trois doubles : le galop
  basse: {
    pair: { 0: { i: 0, len: 4 }, 6: { i: 0, len: 2 }, 8: { i: 1, len: 4 }, 14: { i: 2, len: 2 } },
    impair: { 0: { i: 0, len: 4 }, 6: { i: 2, len: 2 }, 8: { i: 0, len: 6 }, 14: { i: 1, len: 2 } },
  },
  tic: [0, 3, 4, 8, 11, 12], // l'horloge se met à bégayer dans le rythme pointé
  signature: [36, 36, 43, 41, 43],
};

// ---------------------------------------------------------------------------
// 3. FROID — « La longue nuit » (Saturne → Neptune → Kuiper)
// ---------------------------------------------------------------------------
//
// C'est là que le voyage devient long. Vaste, lent, raréfié — et le piège d'un
// morceau qui dit ça, c'est de devenir une nappe d'ambiance sans mélodie. D'où
// quatre décisions :
//
// LE REGISTRE, D'ABORD. La mélodie est écrite entre la4 et si♭5, une octave
// au-dessus de celle du départ, pendant que les voix tenues restent entre la2 et
// fa4. Le milieu du spectre est VIDE. C'est ce trou, et pas la lenteur, qui fait
// entendre le froid : il n'y a plus rien entre le socle et la voix.
//
// QUINZE NOTES en huit mesures, contre vingt-deux au départ. Une note dure
// jusqu'à quatre secondes. Une mélodie lente n'est pas une mélodie ralentie : il
// faut LUI enlever des notes, sinon elle s'étire et se défait.
//
// SOIXANTE BPM. Le temps tombe à une seconde pile — l'horloge du jeu devient
// littéralement une horloge, et elle ne bat plus que deux fois par mesure.
//
// L'HARMONIE NE BOUGE PRESQUE PLUS : quatre mesures par accord au lieu de deux,
// obtenu en répétant l'accord dans la grille. Seuls la montée (`lift`) et la
// sortie du sommet reprennent un rythme harmonique normal — c'est ce qui les
// fait entendre comme un mouvement, alors qu'elles ne jouent rien de plus.
//
// Le sommet est un si♭5 : la sixte abaissée de ré mineur, sur son propre accord.
// C'est la note la plus haute du morceau, elle ne sonne qu'une fois, et elle
// n'est pas la tonique — elle ne referme rien.
const FROID = {
  id: 'froid',
  nom: 'La longue nuit',
  tempo: 60,

  melodie: [
    // — Question. Un petit arc autour de ré5, qui retombe dans le vide.
    { b: 0, s: 4, n: 48, d: 8 }, // ré5   (2 s)
    { b: 0, s: 12, n: 50, d: 4 }, // mi5
    { b: 1, s: 0, n: 51, d: 12 }, // fa5   (3 s) ← la tierce mineure, tenue
    { b: 1, s: 12, n: 50, d: 4 }, // mi5
    { b: 2, s: 0, n: 48, d: 16 }, // ré5   (4 s : une mesure entière sur une note)
    { b: 3, s: 0, n: 43, d: 8 }, // la4   ← la chute de quinte : le vide dessous
    { b: 3, s: 8, n: 46, d: 8 }, // do5   ← en suspens sur la septième
    // — Réponse. Elle part d'où la question s'est arrêtée, et va chercher plus haut.
    { b: 4, s: 4, n: 51, d: 8 }, // fa5
    { b: 4, s: 12, n: 53, d: 4 }, // sol5
    { b: 5, s: 0, n: 56, d: 12 }, // si♭5  ← LE SOMMET, une seule fois (3 s)
    { b: 5, s: 12, n: 55, d: 4 }, // la5
    { b: 6, s: 0, n: 53, d: 8 }, // sol5
    { b: 6, s: 8, n: 51, d: 8 }, // fa5
    { b: 7, s: 0, n: 50, d: 4 }, // mi5
    { b: 7, s: 4, n: 48, d: 12 }, // ré5   ← elle se pose (3 s)
  ],

  // Voicings LARGES : là où le départ empile ses quatre voix dans une octave
  // (c'est chaud, c'est proche), celles-ci s'étalent sur une octave et demie et
  // laissent des quintes vides à l'intérieur. Même harmonie de ré mineur, mais
  // entendue de loin.
  //
  // La voix supérieure ne dépasse jamais ré4, et ce n'est pas un détail de
  // goût : au sommet du morceau les cuivres jouent la mélodie UNE OCTAVE PLUS
  // BAS (`_horn(when, ev.n - 12, …)`), donc entre la3 et si♭4 — exactement là
  // où vivent les voix tenues. Un voicing dont le sommet était un fa4 mettait
  // un demi-ton contre le mi de la mélodie pendant une seconde entière, trois
  // fois par tour ; mesuré, c'était le seul vrai défaut de ce thème.
  accords: {
    Dm: { sub: 0, pad: [19, 27, 31, 36], bass: [12, 19, 15] }, // la fa la ré
    Bb: { sub: 8, pad: [20, 24, 27, 36], bass: [8, 15, 12] }, // si♭ ré fa ré
    F: { sub: 3, pad: [22, 31, 34, 39], bass: [15, 22, 19] }, // do la do fa
    C: { sub: 10, pad: [22, 29, 34, 38], bass: [10, 17, 14] }, // do sol do mi
    Gm: { sub: 5, pad: [24, 32, 36, 41], bass: [17, 24, 20] }, // ré si♭ ré sol
  },

  // Quatre mesures par accord : chaque accord est écrit deux fois de suite. Le
  // seul endroit qui respire à la vitesse normale est la montée.
  forme: [
    { name: 'intro', from: 0, grid: ['Dm', 'Dm'] },
    { name: 'A', from: 4, grid: ['Dm', 'Dm', 'Bb', 'F'] },
    { name: 'lift', from: 12, grid: ['Gm', 'C'] },
    { name: 'drop', from: 16, grid: ['Dm', 'Dm', 'Bb', 'Dm'] },
    { name: 'breakdown', from: 24, grid: ['Dm', 'Dm'] },
    { name: 'retour', from: 28, grid: ['Bb', 'C'] },
  ],

  // Une croche sur deux est la même note : c'est un glas, pas un moteur. Entre
  // deux coups, une seule voix bouge, et elle met une mesure entière à monter
  // puis redescendre.
  ostinato: [0, 2, 0, 3, 0, 2, 0, 2],
  timbales: [0, 10], // deux coups par mesure, dont un hors du temps fort
  timbalesLourdes: [0, 6, 10, 13],
  basse: {
    pair: { 0: { i: 0, len: 16 } }, // une note tenue, une mesure entière
    impair: { 8: { i: 1, len: 8 } }, // et la quinte, en retard d'une demi-mesure
  },
  tic: [0, 8], // l'horloge ne bat plus que deux fois par mesure
  signature: [48, 50, 51, 50, 48],
};

// ---------------------------------------------------------------------------
// 4. DEHORS — « Plus rien derrière » (héliopause → interstellaire)
// ---------------------------------------------------------------------------
//
// Le plus ample et le plus grave des quatre. Le vertige, ici, ne vient pas d'un
// effet : il vient de trois choses qu'on peut compter.
//
// L'ACCORD DE TONIQUE N'A PAS DE TIERCE. `Dm` s'écrit ré–la–ré–la : deux quintes
// vides empilées sur deux octaves. Ni majeur ni mineur, donc rien à quoi se
// raccrocher. C'est la MÉLODIE qui apporte le fa et décide que c'est mineur,
// quand elle veut bien — et quand elle se tait, l'accord redevient un lieu sans
// qualité. Le cinquième degré (`Am`) est vide lui aussi : les deux pôles du
// morceau sont creux, tout ce qu'il y a entre eux ne l'est pas.
//
// LA MÉLODIE EST BASSE. Elle tient tout entière entre ré4 et ré5 — une octave,
// la plus étroite des quatre — et les cuivres la jouent une octave en dessous
// encore. Un thème grave qui ne monte qu'une fois donne l'impression d'un
// espace au-dessus de lui ; un thème aigu donne l'impression d'un plafond.
//
// L'HARMONIE GLISSE D'UN DEMI-TON. De ré mineur à sol mineur, deux voix
// montent d'un demi-ton (la → si♭) et les deux autres ne bougent pas. De si♭ à
// la mineur, deux voix descendent d'un demi-ton et les deux autres tombent
// d'une quarte. On n'entend jamais un accord se poser à côté d'un autre : on
// entend le sol se dérober sous des notes qui, elles, ne changent pas. Et au retour de la boucle, les quatre voix remontent en quartes
// parallèles — un procédé qu'on interdit à un choral, et qui est exactement le
// son de l'organum : ça ne dit pas « accord », ça dit « espace ».
//
// L'ostinato est une seule vague par mesure et il couvre deux octaves : c'est le
// plus ample des quatre, et le plus lent à revenir. Le tic de l'horloge, lui, ne
// bat plus qu'une fois par mesure — une fois toutes les 4,8 secondes. Le temps
// ne s'est pas arrêté, il s'est étiré.
const DEHORS = {
  id: 'dehors',
  nom: 'Plus rien derrière',
  tempo: 50,

  melodie: [
    // — Question. Elle entre au milieu de la mesure, sur un accord vide.
    { b: 0, s: 8, n: 36, d: 8 }, // ré4   (2,4 s)
    { b: 1, s: 0, n: 39, d: 6 }, // fa4   ← c'est la mélodie qui fait le mineur
    { b: 1, s: 6, n: 41, d: 2 }, // sol4
    { b: 1, s: 8, n: 43, d: 8 }, // la4
    { b: 2, s: 0, n: 41, d: 8 }, // sol4  ← ici la mélodie descend son la en sol
    //                                      pendant que la nappe monte le sien en
    //                                      si♭ : les deux voix se croisent, et
    //                                      c'est ça, le sol qui se dérobe
    { b: 2, s: 8, n: 39, d: 8 }, // fa4
    { b: 3, s: 0, n: 44, d: 16 }, // si♭4  ← une mesure entière, en l'air (4,8 s)
    // — Réponse. Le seul vrai mouvement du morceau, et il ne va qu'une fois au bout.
    { b: 4, s: 0, n: 39, d: 8 }, // fa4
    { b: 4, s: 8, n: 43, d: 8 }, // la4
    { b: 5, s: 0, n: 46, d: 4 }, // do5
    { b: 5, s: 4, n: 48, d: 12 }, // ré5   ← LE SOMMET, une seule fois (3,6 s)
    { b: 6, s: 0, n: 46, d: 8 }, // do5
    { b: 6, s: 8, n: 43, d: 8 }, // la4
    { b: 7, s: 0, n: 41, d: 4 }, // sol4
    { b: 7, s: 4, n: 38, d: 4 }, // mi4
    { b: 7, s: 8, n: 36, d: 8 }, // ré4   ← la tonique : sur la mineur dans la
    //                                      section A, où elle ne se résout pas ;
    //                                      sur ré mineur au sommet, où elle se pose
  ],

  // De ré mineur à sol mineur, DEUX VOIX BOUGENT D'UN DEMI-TON et les deux
  // autres ne bougent pas : ré–la–ré–la devient ré–si♭–ré–si♭. On n'entend pas
  // un accord changer, on entend le sol se dérober sous une note qui, elle, ne
  // change pas. C'est le vertige, et il coûte deux demi-tons.
  accords: {
    Dm: { sub: 0, pad: [24, 31, 36, 43], bass: [12, 19, 15] }, // ré la ré la — SANS TIERCE
    Gm: { sub: 5, pad: [24, 32, 36, 44], bass: [17, 24, 20] }, // ré si♭ ré si♭ (le sol est à la basse)
    Bb: { sub: 8, pad: [24, 27, 36, 39], bass: [8, 15, 12] }, // ré fa ré fa (le si♭ est à la basse)
    Am: { sub: 7, pad: [19, 26, 31, 38], bass: [19, 26, 22] }, // la mi la mi — SANS TIERCE
    C: { sub: 10, pad: [22, 29, 34, 38], bass: [10, 17, 14] }, // do sol do mi
  },

  // i–iv–♭VI–v : que des accords sans sensible, et une basse qui descend. `A`
  // s'arrête sur le cinquième degré creux, `drop` retombe sur ré.
  forme: [
    { name: 'intro', from: 0, grid: ['Dm', 'Dm'] },
    { name: 'A', from: 4, grid: ['Dm', 'Gm', 'Bb', 'Am'] },
    { name: 'lift', from: 12, grid: ['Bb', 'C'] },
    { name: 'drop', from: 16, grid: ['Dm', 'Gm', 'Bb', 'Dm'] },
    { name: 'breakdown', from: 24, grid: ['Dm', 'Gm'] },
    { name: 'retour', from: 28, grid: ['Gm', 'Am'] },
  ],

  ostinato: [0, 1, 2, 3, 2, 1, 0, 1], // une seule vague par mesure, et elle couvre deux octaves
  timbales: [0, 11],
  timbalesLourdes: [0, 6, 11, 14],
  basse: {
    pair: { 0: { i: 0, len: 32 } }, // une pédale de deux mesures, soit 9,6 s
    impair: { 8: { i: 1, len: 8 } }, // la quinte arrive par-dessus, sans jamais
  }, //                                déborder sur l'accord suivant
  tic: [0], // une fois par mesure : le temps s'est étiré
  signature: [36, 39, 41, 43, 41],
};

export const THEMES = [DEPART, CEINTURE, FROID, DEHORS];

// À quel palier appartient quel thème. Les onze paliers de `biomes.js` se
// répartissent en quatre âges du voyage : ce qu'on quitte, la route qui durcit,
// la longue nuit, et le dehors. Le changement de thème tombe donc exactement sur
// un saut lumière — jamais au milieu d'une vague.
export const THEME_PAR_PALIER = {
  terre: 'depart',
  lagrange: 'depart',
  transit: 'depart',
  mars: 'ceinture',
  ceinture: 'ceinture',
  jupiter: 'ceinture',
  saturne: 'froid',
  neptune: 'froid',
  kuiper: 'froid',
  heliopause: 'dehors',
  interstellaire: 'dehors',
};

export const themePourPalier = (id) =>
  THEMES.find((t) => t.id === (THEME_PAR_PALIER[id] ?? 'depart')) ?? THEMES[0];
