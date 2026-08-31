// VULCAIN — la forge sous le volcan. Elle ne tire pas : elle POSE.
//
// Le vaisseau lâche des missiles lents qui montent en traînant leur feu et qui
// n'éclatent QU'AU CONTACT d'une coque ennemie. Tout le sel de l'arme tient dans le
// délai : entre le moment où l'on décide et le moment où ça touche, il se passe
// deux ou trois secondes, et pendant ces secondes la formation a bougé. On ne vise
// donc pas ce qu'on voit, on vise ce qui SERA là.
//
// Quatre décisions structurent le fichier, et aucune n'est un détail :
//
//  1. L'ENCLUME. La forge produit une charge toutes les 1,7 s et la GARDE. Ce
//     qui décide de la sortie n'est pas un bouton — il n'y en a pas, le tir est
//     automatique dans tout le jeu — c'est la VITESSE DU VAISSEAU. Tant qu'on se
//     déplace, le ventre se remplit ; dès qu'on se pose, tout part, un missile
//     toutes les 0,22 s, jusqu'à ce qu'on reparte. Une enclume ne frappe pas en
//     courant.
//
//     C'est la seule mécanique du jeu où l'IMMOBILITÉ est le geste offensif, et
//     c'est là qu'est son prix : s'arrêter, ici, c'est offrir sa coque. Le volume
//     de feu ne s'achète donc pas, il se GAGNE — il vaut exactement le temps
//     qu'on a passé à bouger avant de se poser.
//
//     La règle précédente — « le lanceur ne sort une charge que s'il y a
//     quelque chose au-dessus » — reste, mais elle a changé de rôle : elle
//     n'est plus le levier, elle est le garde-fou qui empêche de vider le ventre
//     dans un ciel vide. Le levier, désormais, c'est le pied.
//
//  2. LE CONTACT, ET RIEN D'AUTRE. Il n'y a plus de mèche : un missile qui ne
//     rencontre personne ne détone pas, il s'ÉTEINT. C'est ce qui donne son prix au
//     placement — avant, une charge mal posée éclatait quand même et ramassait
//     parfois quelque chose par accident. Le prix de cette règle est qu'un tir peut
//     ne rien valoir du tout, et il fallait donc que l'extinction se VOIE (§ 4).
//
//  3. LE SOUFFLE SE LIT AU RAYON. L'impact reste une explosion de ZONE — c'est
//     l'identité de la coque — dessinée à l'exact rayon des dégâts, et ce rayon est
//     ANNONCÉ au sol dès que le missile approche d'une cible. Une arme de zone dont
//     on ne voit pas la zone n'est pas jouable : elle est subie, y compris quand
//     elle réussit.
//
//  4. LA SALVE, et elle seule, remplit la jauge. Un ennemi pris ne donne RIEN.
//     C'est la seule règle qui force à attendre que la formation se resserre au
//     lieu de pilonner, et attendre est précisément le verbe de la coque.
//
// Les charges ne blessent jamais le joueur : décision tranchée à la conception.
// Ce serait réaliste, et détestable.
//
// UN EXEMPLAIRE PAR POSTE DE PILOTAGE. La forge ne suppose plus qu'elle est la
// mienne : `update` reçoit le BORD qu'elle sert et lit tout chez lui — son
// vaisseau, ses modules, sa jauge, son numéro. Elle ne posait que MES charges, et
// c'est le hasard commun qui en souffrait le plus : chaque missile tire sa vitesse
// dans le générateur semé (voir ECART_MOTEUR), si bien qu'une salve partie chez un
// copain y puisait un tirage que ma machine ne puisait pas. À partir de là nos deux
// suites étaient décalées d'un cran et TOUT le hasard partagé décrochait —
// plongées, cibles, dispersion, trajectoires. Le défaut ne se voyait pas : les deux
// parties restaient plausibles, elles n'étaient simplement plus la même.

import * as THREE from 'three';
import { ARENA, FUREUR } from '../constants.js';
import { ecart } from '../../core/rng.js';

// ---- La montée ----
//
// Une balle du joueur file à 34 u/s, une balle ennemie à 11,5, une gemme qui tombe
// à 4,5. À 6,5 le missile est l'objet le plus lent du ciel, et c'est exactement ce
// qu'on veut : le temps qu'il met à monter est le temps qu'on a pour se tromper
// de cible.
const MONTEE = 6.5;
// `engine` sur cette coque. Au niveau 4 le missile monte à 10,2 u/s et couvre 37
// unités : la formation entière passe à portée. Le module ne change donc pas la
// puissance, il change la PROFONDEUR de tir — et comme le missile arrive plus tôt,
// il faut moins anticiper. C'est la lecture juste de « frappe plus près ».
const MONTEE_PAR_MOTEUR = 1.12;
// Deux moteurs ne poussent jamais pareil. Trois centièmes et demi d'écart suffisent :
// à vingt unités de montée, deux charges d'un même tapis se décalent d'un dixième
// de seconde de plus que ne le veut leur départ, et le tapis se lit comme un
// roulement irrégulier au lieu d'un métronome. C'est le rôle que tenait l'écart de
// mèche avant qu'il n'y ait plus de mèche.
//
// `ecart` et pas Math.random : la vitesse décide de l'instant du contact, donc de
// qui est pris, donc de l'issue de la partie. Un tirage hors du générateur semé et
// le rejeu diverge. Un seul tirage par missile, comme avant.
const ECART_MOTEUR = 0.035;

// ---- La portée ----
//
// Un missile qui n'explose qu'au contact peut ne jamais rencontrer personne. Il lui
// faut donc une fin, et cette fin est un budget de VOL exprimé en secondes — pas en
// unités. C'est délibéré : à budget de temps constant, un moteur plus rapide porte
// plus loin, ce qui est très exactement ce que `engine` est censé acheter sur cette
// coque.
//
// 3,6 s et pas 3,0. L'ancienne mèche brûlait en trois secondes et plaçait alors le
// SOUFFLE (rayon 3,2) au niveau du rang bas : la charge n'avait pas besoin d'aller
// jusqu'à la coque, son rayon faisait les derniers pas. Un missile qui doit TOUCHER
// doit les parcourir lui-même — 3,2 de souffle plus le rayon d'une cible, soit six
// dixièmes de seconde de vol. Sans ce rallongement, la coque perdait un rang entier
// de portée le jour où l'on a changé la règle.
const PORTEE = 3.6;
// Les derniers dixièmes, pendant lesquels le moteur meurt À VUE : la plume se
// rétracte, le corps refroidit, l'aperçu s'efface. Une demi-seconde, parce qu'en
// dessous l'extinction ressemble à une disparition — et une disparition ressemble à
// un bug. C'est le prix à payer pour avoir le droit de rater un tir.
const EXTINCTION = 0.5;

// ---- L'annonce ----
//
// L'ancienne version armait la charge six dixièmes avant la fin de sa mèche. La
// mèche a disparu, la constante reste, et elle garde son sens : six dixièmes de
// seconde AVANT LE CONTACT. Comme on ne connaît pas l'avenir, on l'approche par la
// distance — le missile s'arme quand une coque ennemie entre dans ce qu'il parcourt
// en six dixièmes. En dessous de la demi-seconde l'annonce arriverait trop tard
// pour qu'on puisse encore en tirer quelque chose : elle ne servirait plus qu'à
// décorer un coup déjà joué.
const AMORCE = 0.6;

// ---- Le souffle ----
//
// La formation est maillée à 2,35 en largeur et 2,3 en profondeur. À 3,2 le souffle
// prend la case centrale et ses quatre voisines directes, et LAISSE les diagonales
// (à 3,29). Cinq ennemis d'un coup, soit exactement le sommet de la courbe de la
// SALVE, et seulement si le souffle naît au centre d'un bloc plein. Un rayon choisi
// sur la maille, donc, et pas sur une impression.
const RAYON = 3.2;
const RAYON_PAR_MISSILE = 1.35; // `missiles` : +35 % par niveau, comme prévu

// ---- Le rythme ----
// Deux secondes laissaient la réserve vide plus des deux tiers du temps : la coque
// passait l'essentiel de la vague à attendre sa forge, et « attends qu'ils se
// resserrent » devenait « attends, tout court ». À 1,7 la charge revient assez vite
// pour qu'on ait un choix à faire à chaque passage, ce qui est tout l'objet.
const INTERVALLE = 1.7;
// `firerate`. À six niveaux, l'intervalle tombe à 0,96 s : la forge double son
// débit sans jamais changer la nature de l'arme.
const INTERVALLE_PAR_CADENCE = 1 / 1.13;
// ---- Le ventre ----
//
// Cinq charges de base, DEUX DE PLUS par niveau de `cannons` — soit neuf au
// dernier. C'est ce que ce module achète sur cette coque, et il fallait qu'il
// cesse d'acheter autre chose : « un missile de plus, tiré en même temps, à côté
// du premier » était le module d'ORION mot pour mot, et il CONTREDISAIT la coque
// — plus on couvrait de largeur, moins il fallait se placer.
//
// La contenance, elle, ne couvre rien du tout. Elle allonge le tapis qu'un seul
// arrêt peut cracher. Elle ne sert donc qu'à celui qui sait s'arrêter au bon
// endroit, ce qui est très exactement le contraire d'une aide.
const RESERVE_BASE = 5;
const RESERVE_PAR_CANON = 2;
// Le nombre de braises taillées sous la coque. `cannons` monte à deux niveaux
// (voir upgrades.js) : cinq et quatre font neuf, et une épreuve le vérifie plutôt
// que de le croire.
const RESERVE_PLAFOND = 9;
// Le débit du lanceur quand la réserve se vide. Neuf charges en deux secondes :
// assez serré pour que ça se lise comme un TAPIS et non comme neuf tirs.
const DELAI_SALVE = 0.22;

// ---- Le pied ----
//
// Sous quelle vitesse le vaisseau compte pour POSÉ. Trois unités par seconde,
// soit 19 % de sa vitesse de pointe (16) : assez bas pour qu'on ne se pose pas
// par hasard en dérivant, assez haut pour pardonner les micro-corrections du
// pouce sur un écran.
const SEUIL_POSE = 3;
// Et combien de temps il faut le tenir avant que la première charge ne sorte.
//
// CETTE CONSTANTE N'EST PAS UN CONFORT, C'EST UNE CORRECTION. Sans elle, changer
// de direction ouvrirait le lanceur : la vitesse passe par zéro en le faisant.
// Le vaisseau freine à 14/s ; depuis la vitesse maximale il tombe sous le seuil
// en sept images (0,12 s) et un demi-tour le traverse en deux. Douze centièmes
// séparent donc proprement « je me pose » de « je change d'avis » — et ils
// s'entendent : il y a un dixième de silence, et puis ça part.
const CALAGE = 0.12;
// Au-delà de quelle distance latérale la forge considère qu'il n'y a rien à
// atteindre. C'est ce chiffre qui décide si l'on charge ou si l'on décharge.
//
// Quatre unités, et le rayon du souffle n'entre PLUS dans le calcul. Il y entrait
// quand la charge éclatait toute seule : ce qui passait à trois unités mourait
// quand même. Un missile, lui, doit toucher — un ennemi laissé à sept unités sur le
// côté n'est pas une cible, c'est une charge perdue, et au niveau 3 de `missiles`
// la veille s'ouvrait à douze unités et vidait la réserve dans le vide.
//
// Ce que quatre unités mesurent aujourd'hui, c'est la DÉRIVE : le balancement de la
// formation vaut 2,1 d'amplitude à 0,55 rad/s, soit 1,16 u/s au passage à zéro et
// jusqu'à 4,2 unités pendant un vol complet. Une cible à quatre unités sur le côté
// peut donc venir se mettre dans la trajectoire, et c'est pour elle qu'on tire.
const VEILLE_LARGE = 4.0;

// ---- Ce que ça coûte à l'ennemi ----
//
// Trois points : de quoi vider un rang de drones et de guêpes, de quoi tuer une
// brute de base d'un seul souffle. Sept sur l'amiral, parce qu'une salve entière
// lui arrive dessus d'un coup (il fait 5,2 de rayon, aucun missile ne le rate) et
// que c'est la seule façon d'honorer « irrégulier, énorme si bien placé ».
const DEGATS = 3;
const DEGATS_BOSS = 7;
// L'amiral compte pour trois dans la SALVE. Sans ça, un combat de boss ne
// remplirait jamais la jauge — un seul ennemi à l'écran, donc zéro énergie, donc
// ni bombe ni Overdrive pendant le seul moment du jeu où l'on en a besoin. Il
// occupe un tiers de l'arène : le compter pour un pan de formation n'est pas une
// faveur, c'est une mesure.
const POIDS_BOSS = 3;

// ---- LA SALVE ----
//
// « Une explosion qui ne prend qu'un ennemi ne donne rien. Deux donnent un peu.
// Cinq remplissent un quart de la jauge. »
//
// D'où la forme : gain = 25 × ((n − 1) / 4) ^ 1,85. Elle vaut zéro à un ennemi par
// construction, vingt-cinq à cinq par construction, et l'exposant fait le reste.
// Mesuré : 0 — 1,9 — 6,9 — 14,5 — 25,0. De deux à cinq ennemis, la récompense est
// multipliée par treize alors que la prise ne l'est que par deux et demi : c'est
// ce rapport-là, et lui seul, qui rend l'attente plus payante que le pilonnage.
//
// Le plafond existe pour une raison précise : à sept ennemis la formule donne 54,
// et un seul missile financerait les trois quarts d'une bombe. On garde le vertige,
// on retire le raccourci.
const SALVE_CINQ = 25;
const SALVE_COURBE = 1.85;
const SALVE_MAX = 45;

// Rayon du corps du missile, pour le contact. Le corps dessiné fait 0,29 de large
// et 1,3 de long : 0,45 est la moyenne honnête des deux, et la seule qui évite à la
// fois le missile qui traverse une aile et celui qui explose à un mètre.
const CONTACT = 0.45;

// La traînée. Une plume de feu ATTACHÉE au missile, plus des étincelles semées
// derrière lui — deux choses, parce qu'aucune ne suffit seule : la plume donne la
// direction et la vitesse, les étincelles donnent le chemin parcouru.
//
// Un quart de seconde de sillage à 6,5 u/s, soit 1,6 unité — le DOUBLE de la
// longueur du corps. Essayé à 0,8 d'abord, par prudence : à l'écran, le halo de
// bloom mangeait la plume et il ne restait qu'une gousse lumineuse un peu allongée.
// Une traînée n'existe que si elle est plus longue que ce qu'elle traîne. Au-delà
// de deux unités en revanche, vingt missiles en vol tissent un grillage et l'on ne
// voit plus la formation derrière — 1,6 est le point où l'on voit les deux.
const PLUME = 1.6;
// Une étincelle tous les cinq centièmes, et pas une par frame. À vingt missiles en
// vol c'est quatre cents particules par seconde, qui vivent 0,42 s : cent soixante
// vivantes en permanence, soit un neuvième du pool de mille quatre cents que se
// partage le jeu entier. Une par frame en ferait huit cent quarante et il ne
// resterait rien pour les explosions — c'est-à-dire pour ce qu'on regarde.
const PAS_TRACE = 0.05;

// Vingt-quatre en vol. Le pire cas ne se devine pas, il se compte : ventre plein au
// dernier niveau de `cannons` (neuf), on se pose sous la nuée, neuf charges partent
// en deux secondes, et la forge continue derrière — au dernier niveau de `firerate`
// elle en rend deux de plus avant que la première n'ait fini ses 3,6 s de vol. Onze
// en l'air, donc, et le compte tombe de moitié par rapport à l'éventail d'avant :
// on posait alors trois missiles par salve.
//
// Vingt-quatre reste. Ce n'est plus la marge d'un pire cas serré, c'est deux fois
// le pire cas — et le jour où trois VULCAIN joueront ensemble, chacun ayant son
// exemplaire, il n'y aura rien à revoir ici.
const NB_CHARGES = 24;
// Seize souffles. Le tapis complet n'en allume jamais plus de cinq à la fois — les
// missiles ne rencontrent pas leur cible au même instant, et c'est justement ce qui
// fait le roulement. Seize laisse donc trois fois la marge du pire cas mesuré.
const NB_SOUFFLES = 16;

// Tant qu'il monte sans rien trouver, le missile est CYAN — la couleur du joueur,
// celle de ce qui est inerte et à soi. Il ne devient incandescent qu'en approchant
// d'une coque. Ce virage de couleur est le télégraphe : il n'a besoin d'aucune
// légende, et il interdit de confondre un missile qui passe avec un missile qui va
// toucher.
const INERTE = 0x8ffbff;
const CHAUDE = 0xff7b2e;
const SOUFFLE = 0xffb347;
const COEUR = 0xfff3d0;
// Le gris-bleu de ce qui n'a plus de moteur. Il ne ressemble à aucune autre couleur
// du jeu, et c'est le but : rien ne meurt de cette couleur-là sauf un tir raté.
const ETEINT = 0x46626f;

// Interpolées à chaque frame sur les matériaux existants : trois couleurs figées
// ici, aucune allocation en vol.
const C_INERTE = new THREE.Color(INERTE);
const C_CHAUDE = new THREE.Color(CHAUDE);
const C_ETEINT = new THREE.Color(ETEINT);
// Le blanc du ventre quand la coque est posée et que ça va partir. C'est la même
// couleur que le cœur d'une détonation : ce qui est blanc, dans cette arme, est
// ce qui est en train de sortir.
const C_COEUR = new THREE.Color(COEUR);

// Ce qu'il reste de la secousse quand c'est la salve d'un COPAIN qui tombe. Le
// partage est celui que game.js applique déjà à la bombe : le souffle est dans
// l'arène et appartient à tout le monde, la caméra est à moi. Un tapis de cinq
// salves lâché à l'autre bout de l'aire n'a pas à m'arracher l'écran des mains
// pendant que j'esquive.
const SECOUSSE_DISTANTE = 0.45;

export class ArmeVulcain {
  constructor(scene) {
    this.scene = scene;
    this._tmp = new THREE.Vector3();
    // Où naît le souffle, et où l'on sème une étincelle de traînée. Deux vecteurs
    // pour toute la classe : `update` ne doit rien allouer, jamais.
    this._impact = new THREE.Vector3();
    this._queue = new THREE.Vector3();
    // Réutilisé à chaque détonation. Une explosion qui alloue son tableau de
    // victimes en alloue quinze en une seconde quand la réserve se vide.
    this._pris = [];

    this.reserve = 0;
    this.tProduction = INTERVALLE;
    this.tSalve = 0;
    // Depuis combien de temps le vaisseau tient sous le seuil. C'est LE compteur
    // de l'arme : c'est lui qui ouvre le lanceur, et pas la vitesse instantanée.
    this.tCalage = 0;
    // Une charge que la forge a faite alors que le ventre était déjà plein. Elle
    // n'a nulle part où aller : elle sort par le tube, en marche ou non.
    this.trop = false;

    // Géométries partagées par tout le pool : c'est la règle de la maison, et elle
    // vaut ici plus qu'ailleurs puisqu'un souffle peut naître vingt fois de suite.
    const geoNoyau = new THREE.SphereGeometry(0.34, 10, 8);
    const geoEnveloppe = new THREE.SphereGeometry(0.62, 12, 8);
    const geoSphere = new THREE.SphereGeometry(1, 18, 12);
    const geoAnneau = new THREE.RingGeometry(0.95, 1.0, 48);
    // Le cône de la plume, couché une fois pour toutes dans la géométrie : base à
    // l'origine, pointe à z = +1. On le rallonge ensuite par `scale.z`, ce qui le
    // fait pousser VERS L'ARRIÈRE depuis le missile — un cône recentré à chaque
    // frame demanderait une position ET une échelle, donc deux fois plus de chances
    // de se tromper de signe.
    const geoPlume = new THREE.ConeGeometry(0.26, 1, 9, 1, true);
    geoPlume.rotateX(Math.PI / 2);
    geoPlume.translate(0, 0, 0.5);

    this.charges = [];
    for (let i = 0; i < NB_CHARGES; i++) {
      this.charges.push(this._faitCharge(geoNoyau, geoEnveloppe, geoAnneau, geoPlume));
    }
    this.souffles = [];
    for (let i = 0; i < NB_SOUFFLES; i++) {
      this.souffles.push(this._faitSouffle(geoSphere, geoAnneau));
    }
    this.ventre = this._faitVentre();
  }

  // Un missile : un corps allongé, son halo, sa plume, et le cercle qui annonce le
  // souffle. Les matériaux sont propres à chaque exemplaire — quatre-vingt-seize en
  // tout, créés une fois — parce que la couleur et l'opacité sont animées séparément
  // sur chacun. Les partager obligerait à faire l'amorçage par sauts d'échelle, et
  // le virage de couleur est justement ce qui rend l'amorçage lisible.
  _faitCharge(geoNoyau, geoEnveloppe, geoAnneau, geoPlume) {
    const groupe = new THREE.Group();
    const noyau = new THREE.Mesh(
      geoNoyau,
      new THREE.MeshBasicMaterial({ color: INERTE, toneMapped: false })
    );
    const enveloppe = new THREE.Mesh(
      geoEnveloppe,
      new THREE.MeshBasicMaterial({
        color: INERTE,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    // LA PLUME. C'est elle, et non les étincelles, qui fait qu'on voit un MISSILE
    // et non un point qui glisse : elle est toujours là, elle pointe d'où l'on
    // vient, et elle raccourcit quand le moteur s'épuise. Les étincelles, elles,
    // sont intermittentes par construction — le pool de particules est partagé.
    const plume = new THREE.Mesh(
      geoPlume,
      new THREE.MeshBasicMaterial({
        color: INERTE,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    // L'aperçu. Un cercle À PLAT, au rayon exact du souffle à venir — la caméra
    // regarde le plan de jeu d'en haut, une empreinte au sol s'y lit d'un coup
    // d'œil là où une sphère demanderait une seconde d'interprétation. Il ne bouge
    // jamais d'échelle pendant qu'il apparaît : un aperçu qui se rétracte
    // mentirait sur la seule chose qu'il est là pour dire.
    const apercu = new THREE.Mesh(
      geoAnneau,
      new THREE.MeshBasicMaterial({
        color: CHAUDE,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    apercu.rotation.x = -Math.PI / 2;
    groupe.add(noyau, enveloppe, plume, apercu);
    groupe.visible = false;
    this.scene.add(groupe);
    return {
      groupe,
      noyau,
      enveloppe,
      plume,
      apercu,
      active: false,
      x: 0,
      z: 0,
      v: 0,
      vol: 0,
      rayon: 0,
      trace: 0,
    };
  }

  // Le souffle : une sphère en fil de fer au rayon des dégâts, un cœur plein qui
  // flashe, et l'empreinte au sol. Le fil de fer n'est pas une coquetterie — une
  // sphère pleine de sept unités bouche l'écran une demi-seconde, et une arme qui
  // cache la vague qu'elle vient de frapper se paie en morts qu'on n'a pas vues.
  _faitSouffle(geoSphere, geoAnneau) {
    const groupe = new THREE.Group();
    const sphere = new THREE.Mesh(
      geoSphere,
      new THREE.MeshBasicMaterial({
        color: SOUFFLE,
        transparent: true,
        opacity: 0,
        wireframe: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const coeur = new THREE.Mesh(
      geoSphere,
      new THREE.MeshBasicMaterial({
        color: COEUR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const anneau = new THREE.Mesh(
      geoAnneau,
      new THREE.MeshBasicMaterial({
        color: COEUR,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    anneau.rotation.x = -Math.PI / 2;
    groupe.add(sphere, coeur, anneau);
    groupe.visible = false;
    this.scene.add(groupe);
    return { groupe, sphere, coeur, anneau, vie: 0, duree: 0.55, rayon: 0 };
  }

  // Le ventre plein. Cinq braises sous la coque, une par charge en réserve, et
  // celle du milieu se remplit à mesure que la forge travaille : on voit donc
  // arriver la prochaine charge avant qu'elle ne sorte. Sans cet indicateur, la
  // mécanique centrale de la coque — se mettre à l'écart pour charger — n'est
  // visible nulle part, et personne ne la trouve.
  _faitVentre() {
    const groupe = new THREE.Group();
    const geo = new THREE.OctahedronGeometry(0.17);
    this.braises = [];
    for (let i = 0; i < RESERVE_PLAFOND; i++) {
      const braise = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: CHAUDE,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      // Pas de position ici : elle dépend de la contenance ACHETÉE, qui se lit
      // sur le bord servi et change d'un poste à l'autre. `_montreReserve` la
      // repose à chaque image, et les places non achetées restent invisibles.
      groupe.add(braise);
      this.braises.push(braise);
    }
    groupe.visible = false;
    this.scene.add(groupe);
    return groupe;
  }

  // ---- Les modules, tels qu'ils agissent SUR CETTE COQUE ----
  //
  // Les modules du BORD servi, et non les miens : chaque pilote a payé les siens,
  // et deux forges réglées sur le même achat poseraient les mêmes missiles au même
  // endroit sur deux machines qui ne le voient pas pareil.

  _montee(bord) {
    return MONTEE * Math.pow(MONTEE_PAR_MOTEUR, bord.levels?.engine || 0);
  }

  _rayon(bord) {
    return RAYON * Math.pow(RAYON_PAR_MISSILE, bord.levels?.missiles || 0);
  }

  _intervalle(bord) {
    return INTERVALLE * Math.pow(INTERVALLE_PAR_CADENCE, bord.levels?.firerate || 0);
  }

  // Ce que le ventre peut contenir. `cannons` sur cette coque, et rien d'autre.
  _capacite(bord) {
    return RESERVE_BASE + RESERVE_PAR_CANON * (bord.levels?.cannons || 0);
  }

  // `bord` : le poste de pilotage servi. Le jeu lui-même quand c'est moi, un objet
  // de `game.bordsDistants` quand c'est un copain. `bord = game` par défaut,
  // c'est-à-dire le solo, et rien n'y change.
  update(dt, game, bord = game) {
    const vaisseau = game._vaisseauDu(bord);
    // Un poste peut se fermer entre deux images — un copain qui quitte la partie.
    // On ne pose alors rien plutôt que de lire une position sur personne ; c'est à
    // game.js d'éteindre la forge, comme il le fait déjà à la mort du pilote.
    if (!vaisseau) return;
    // LA FRONTIÈRE, dans cette arme, ne passe qu'à un seul endroit : la caméra.
    // Le reste — le souffle, les étincelles, le grondement, les braises du ventre
    // sous la coque — se passe dans l'arène et appartient à tout le monde.
    this._local = bord === game;
    // Le pied AVANT la forge et le lanceur : c'est lui qui décide de tout le
    // reste de l'image, et il se lit sur le vaisseau du bord servi — jamais sur
    // le mien, sans quoi ma pose ferait tirer la forge d'un copain.
    this._calage(dt, game, vaisseau);
    this._produit(dt, game, bord);
    this._lance(dt, game, bord, vaisseau);
    this._avanceCharges(dt, game, bord);
    this._avanceSouffles(dt);
    this._montreReserve(bord, vaisseau);
  }

  // LE PIED. Toute l'arme tient dans ces six lignes : on mesure la vitesse du
  // vaisseau dans le plan, et on compte depuis combien de temps elle est basse.
  //
  // Le compteur, et pas la vitesse : c'est la différence entre « je me pose » et
  // « je change d'avis ». Un demi-tour traverse le seuil en deux images, une pose
  // le tient. Voir CALAGE.
  _calage(dt, game, vaisseau) {
    const avant = this.tCalage >= CALAGE;
    const v = Math.hypot(vaisseau.vx || 0, vaisseau.vz || 0);
    this.tCalage = v > SEUIL_POSE ? 0 : this.tCalage + dt;

    // L'ENCLUME SE PLANTE. C'est le seul instant où le joueur apprend la règle
    // sans qu'on la lui écrive : il s'arrête, quelque chose s'allume sous sa
    // coque, et le tapis part. Il ne se produit que si le ventre a de quoi
    // partir — se poser les mains vides n'annonce rien et ne doit rien promettre.
    //
    // Dans l'arène et non chez moi seul : voir un copain planter la sienne à
    // l'autre bout de l'aire est exactement l'information qui manque quand on
    // joue à deux, et c'est la même règle que pour la pose d'une charge.
    if (!avant && this.tCalage >= CALAGE && this.reserve > 0) {
      const p = vaisseau.position;
      game.fx.burst(this._tmp.set(p.x, 0, p.z + 0.6), CHAUDE, {
        count: 10,
        speed: 3.2,
        life: 0.32,
        spread: 0.5,
      });
      game.audio?.enclumePosee?.(p.x);
    }
  }

  // La forge tourne toute seule, à son rythme, et ne s'arrête JAMAIS. Quand le
  // ventre est plein, ce qu'elle vient de faire ne rentre nulle part : ça devient
  // un trop-plein, et le trop-plein sort par le tube (voir `_lance`).
  //
  // La minuterie se réarme sur un intervalle COMPLET dans les deux cas : sans ça,
  // la première charge dépensée serait remplacée à l'image suivante et la réserve
  // n'aurait plus de fond — on ne pourrait plus jamais la vider.
  _produit(dt, game, bord) {
    this.tProduction -= dt;
    if (this.tProduction > 0) return;
    this.tProduction += this._intervalle(bord);
    if (this.reserve < this._capacite(bord)) {
      this.reserve++;
      return;
    }
    // LA LEÇON SE DONNE ICI, et nulle part ailleurs. Le ventre déborde : c'est,
    // par construction, le moment où le joueur court depuis huit secondes sans
    // s'être posé une fois. Il n'y a pas de meilleur instant pour lui dire la
    // règle, et il n'y en a pas de pire pour la lui écrire sur un écran de
    // titre qu'il a passé en tapant.
    if (this._local && !this.trop) game.characters?.teachOnce?.('enclumeFirst');
    this.trop = true;
  }

  _lance(dt, game, bord, vaisseau) {
    if (this.tSalve > 0) this.tSalve -= dt;
    if (this.tSalve > 0) return;
    if (!this._quelqueChoseAuDessus(game, bord, vaisseau)) return;

    if (this.trop) {
      // LE TROP-PLEIN PASSE AVANT TOUT, en marche ou non. C'est le filet de celui
      // qui ne s'arrête jamais : il tire quand même, une charge toutes les 1,7 s,
      // au petit bonheur. Il n'est jamais bloqué — il est seulement moins bon que
      // celui qui se pose, et c'est le bon gradient : ne rien comprendre marche
      // mal, comprendre devient énorme.
      this.trop = false;
    } else if (this.tCalage >= CALAGE && this.reserve > 0) {
      this.reserve--;
    } else return;

    this.tSalve = DELAI_SALVE;
    this._pose(game, bord, vaisseau);
  }

  // VULCAIN ne tire pas sous un ciel vide : « j'y ai déjà mis ce qu'il faut »
  // suppose qu'il y ait un « là ».
  //
  // Ce test FAISAIT la réserve, du temps où s'écarter chargeait et se replacer
  // déchargeait. Le pied a pris ce rôle (voir l'en-tête, § 1) et il lui reste
  // celui de garde-fou : se poser sous un ciel vide ne gâche pas le ventre. La
  // différence compte, parce qu'on peut désormais charger SANS quitter la zone où
  // l'on frôle — c'est-à-dire sans quitter le jeu.
  //
  // Pas de bouclage de l'arène dans le calcul, alors que le vaisseau, lui, boucle.
  // C'est volontaire : le missile ne boucle pas non plus, et une veille qui verrait
  // plus loin que la portée promettrait des salves qui n'atteindraient rien.
  _quelqueChoseAuDessus(game, bord, vaisseau) {
    const p = vaisseau.position;
    const portee = this._montee(bord) * PORTEE;
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const q = e.group.position;
      const profondeur = p.z - q.z;
      // Derrière le vaisseau : le missile monte, il ne fait pas demi-tour.
      if (profondeur < 0 || profondeur > portee + e.def.radius) continue;
      if (Math.abs(q.x - p.x) > VEILLE_LARGE + e.def.radius) continue;
      return true;
    }
    return false;
  }

  // UNE charge à la fois, toujours, quel que soit le niveau de `cannons`. Il y
  // avait ici un éventail latéral, et c'était une faute : il faisait de VULCAIN un
  // ORION lent. Plus on l'achetait, plus on couvrait de largeur, donc MOINS il
  // fallait se placer — le module signature de la coque détruisait son verbe.
  //
  // Les charges d'un même arrêt partent donc l'une derrière l'autre, du même
  // point : la première ouvre un trou dans le rang bas, la deuxième passe par le
  // trou et va chercher le rang du dessus. Le tapis n'est plus large, il FORE, et
  // sa longueur vaut exactement le temps qu'on a passé à bouger avant.
  _pose(game, bord, vaisseau) {
    const p = vaisseau.position;
    const c = this.charges.find((x) => !x.active);
    if (c) {
      c.active = true;
      c.x = p.x;
      c.z = p.z - 1.4; // devant les bras de lancement, jamais dans la coque
      // LE SEUL TIRAGE SEMÉ DE L'ARME, et il décide bel et bien : la vitesse fixe
      // l'instant du contact, donc qui est pris, donc l'issue. Il reste donc dans
      // le générateur commun — et il se consomme maintenant pour CHAQUE poste, un
      // par missile réellement sorti, dans l'ordre où game.js sert les postes.
      // C'est à cette condition, et à elle seule, que toutes les machines puisent
      // le même nombre de fois.
      c.v = this._montee(bord) * (1 + ecart(ECART_MOTEUR));
      c.vol = PORTEE;
      c.rayon = this._rayon(bord);
      this._reposeVisuel(c);
    }
    // Le départ de la salve s'entend chez tout le monde, comme le canon d'un
    // vaisseau ou l'explosion d'une bombe : c'est un événement de l'ARÈNE, calé
    // sur son abscisse. Le taire pour un copain retirerait le seul indice qui
    // dise que quelque chose vient de partir sur le côté.
    game.audio?.chargePosee?.(p.x);
    game.fx.burst(this._tmp.set(p.x, 0, p.z - 0.9), INERTE, {
      count: 5,
      speed: 4,
      life: 0.28,
      spread: 0.7,
    });
  }

  // L'état d'un missile qui vient de naître — ou de renaître d'un instantané. Les
  // deux chemins doivent poser exactement les mêmes valeurs, sans quoi un rejeu
  // repartirait d'un missile mal peint et l'on croirait à une divergence.
  _reposeVisuel(c) {
    c.trace = 0;
    c.groupe.position.set(c.x, 0, c.z);
    c.groupe.visible = true;
    c.noyau.material.color.copy(C_INERTE);
    c.enveloppe.material.color.copy(C_INERTE);
    c.plume.material.color.copy(C_INERTE);
    c.noyau.scale.set(0.85, 0.85, 1.9);
    c.enveloppe.scale.set(0.9, 0.9, 1.5);
    c.plume.scale.set(1, 1, PLUME);
    c.enveloppe.material.opacity = 0.3;
    c.plume.material.opacity = 0.55;
    c.apercu.scale.setScalar(c.rayon);
    c.apercu.material.opacity = 0;
  }

  _avanceCharges(dt, game, bord) {
    for (const c of this.charges) {
      if (!c.active) continue;
      c.z -= c.v * dt;
      c.vol -= dt;
      c.groupe.position.set(c.x, 0, c.z);

      // UNE SEULE traversée de la liste pour les deux questions qui se posent à
      // chaque frame : est-ce que je touche, et à quelle distance est le plus
      // proche ? Les séparer doublerait le coût du seul endroit de l'arme qui soit
      // en O(missiles × ennemis).
      const approche = c.v * AMORCE;
      let cible = null;
      let jeu = Infinity;
      for (const e of game.enemies.list) {
        if (!e.alive) continue;
        const rr = e.def.radius + CONTACT;
        const d2 = e.group.position.distanceToSquared(c.groupe.position);
        if (d2 < rr * rr) {
          cible = e;
          break;
        }
        // La racine carrée ne se paie que pour ce qui est déjà dans la fenêtre
        // d'annonce : tout le reste ne sert qu'à être écarté.
        const limite = rr + approche;
        if (d2 < limite * limite) jeu = Math.min(jeu, Math.sqrt(d2) - rr);
      }

      // LE CONTACT L'EMPORTE SUR TOUT, y compris sur la frame où le vol s'achève :
      // un missile qui touche à bout de course a touché.
      if (cible) {
        this._detonne(c, game, bord, cible);
        continue;
      }

      // Combien il est armé (0 : rien en vue ; 1 : au contact) et combien il lui
      // reste de moteur (1 : il pousse ; 0 : il vient de s'éteindre).
      const chaud = jeu === Infinity ? 0 : 1 - Math.max(0, jeu) / approche;
      const reste = Math.min(1, Math.max(0, c.vol) / EXTINCTION);

      // Le battement prend sa phase dans l'ALTITUDE et non dans une horloge : deux
      // missiles posés à la suite battent donc en décalé, et l'état à sérialiser
      // reste le même. Il s'accélère avec l'armement — de deux battements par
      // seconde en transit à une dizaine juste avant l'impact.
      const bat = 0.5 + 0.5 * Math.sin(c.z * (2.2 + 7 * chaud));

      c.noyau.material.color.lerpColors(C_INERTE, C_CHAUDE, chaud);
      c.noyau.material.color.lerp(C_ETEINT, 1 - reste);
      c.enveloppe.material.color.copy(c.noyau.material.color);
      c.plume.material.color.copy(c.noyau.material.color);

      // Le corps est ALLONGÉ dans l'axe du vol : c'est ce qui le distingue d'une
      // bombe posée. Il gonfle en s'armant, il ne s'étire pas davantage — un
      // missile qui s'allonge à l'approche donnerait l'impression d'accélérer alors
      // qu'il garde sa vitesse du début à la fin.
      const gonfle = 1 + chaud * (0.35 + 0.5 * bat);
      c.noyau.scale.set(0.85 * gonfle, 0.85 * gonfle, 1.9 * gonfle);
      c.enveloppe.scale.set(0.9 * gonfle, 0.9 * gonfle, 1.5 * gonfle);
      c.enveloppe.material.opacity = (0.3 + 0.45 * chaud) * reste;

      // La plume vacille. `Math.random` et pas `ecart` : ça n'a aucun effet sur qui
      // meurt, et le générateur semé ne se dépense que pour ce qui décide.
      const vacille = 0.78 + Math.random() * 0.22;
      c.plume.scale.set(1, 1, PLUME * (0.9 + 0.25 * chaud) * reste * vacille);
      c.plume.material.opacity = (0.55 + 0.3 * chaud) * reste * vacille;
      c.apercu.material.opacity = (0.12 + 0.3 * bat) * chaud * reste;

      // Les étincelles, semées DERRIÈRE la plume : au bout du feu, là où le sillage
      // se détache. Semées sur le nez, elles remonteraient avec le missile et l'on
      // ne verrait qu'une tache plus grosse au lieu d'un chemin.
      c.trace -= dt;
      if (c.trace <= 0) {
        c.trace = PAS_TRACE;
        this._queue.set(c.x, 0, c.z + PLUME * reste);
        game.fx.burst(this._queue, reste < 1 ? ETEINT : chaud > 0.35 ? CHAUDE : INERTE, {
          count: 1,
          speed: 1.1,
          life: 0.42,
          spread: 0.2,
        });
      }

      // La fin du vol, ou le plafond de l'arène. Le second n'arrive qu'aux missiles
      // les plus rapides tirés du fond de l'aire, mais il doit exister : rien ne
      // doit pouvoir sortir du monde en restant actif.
      if (c.vol <= 0 || c.z <= ARENA.bulletCullZMin) this._eteint(c, game);
    }
  }

  // LE TIR RATÉ. Il n'explose pas, il n'ouvre pas de souffle, il ne fait pas de
  // bruit — et ce silence est l'information : le grondement de la détonation ne
  // veut plus dire que « ça a touché ». On entend partir, on n'entend pas arriver,
  // et l'on sait qu'on a tiré trop tôt.
  //
  // Ce qu'on voit, en revanche, ne peut pas être rien : une charge qui s'évanouit
  // sans laisser de trace se lit comme un bug, pas comme un échec. Elle a donc déjà
  // refroidi à vue pendant une demi-seconde (voir EXTINCTION), et elle laisse une
  // bouffée froide à l'endroit où le moteur a lâché.
  _eteint(c, game) {
    c.active = false;
    c.groupe.visible = false;
    const pos = c.groupe.position;
    game.fx.burst(pos, ETEINT, { count: 12, speed: 2.6, life: 0.6, spread: 0.55 });
    game.fx.burst(pos, INERTE, { count: 5, speed: 1.1, life: 0.45, spread: 0.25 });
  }

  // Le protocole du jeu, à la lettre : `damage` renvoie true quand l'ennemi meurt,
  // et c'est alors à l'appelant d'appeler `_onEnemyKilled`. La cause s'appelle
  // 'charge' et pas 'cannon' — délibérément : la prime au plongeur abattu au canon
  // ne doit pas s'ajouter à la SALVE, sinon la coque toucherait deux fois pour le
  // même geste et son économie ne serait plus la sienne.
  _detonne(c, game, bord, cible) {
    c.active = false;
    c.groupe.visible = false;

    // LE SOUFFLE NAÎT SUR LA COQUE TOUCHÉE, PAS SUR LE MISSILE. Ce n'est pas un
    // détail d'un demi-mètre : le contact a lieu à `rayon de la cible + 0,45` de
    // son centre, et sur l'amiral cela fait 5,65 — au-delà des 3,2 du souffle.
    // Centré sur le missile, le souffle ne contenait donc PAS l'amiral qu'il venait
    // de percuter. Ce n'est pas une hypothèse : une vague 4 pilotée sans module
    // donnait vingt et une détonations, dont neuf au contact de l'amiral, et ZÉRO
    // dégât — il finissait à 102 PV sur 102. Le défaut ne se voyait qu'en dessous du
    // niveau 3 de `missiles`, au-delà duquel le rayon (7,87) redevient plus grand
    // que la distance de contact et rattrape tout ; c'est-à-dire qu'il frappait
    // exactement la moitié de partie où l'on n'a encore rien acheté.
    //
    // Centré sur la cible, ce qui est touché meurt par construction, et la sphère
    // qu'on dessine est vraiment celle qui tue.
    //
    // On copie AVANT `damage` : un ennemi qui meurt est retiré de la scène dans la
    // foulée, et le souffle ne doit pas dépendre de ce qu'il devient ensuite.
    const pos = this._impact.copy(cible.group.position);
    const r2 = c.rayon * c.rayon;

    this._pris.length = 0;
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      // Le CENTRE dans la sphère, un point. Ajouter le rayon de l'ennemi rendrait
      // la portée réelle plus grande que la sphère qu'on dessine — et c'est
      // précisément cette égalité qui rend l'arme jouable.
      if (e.group.position.distanceToSquared(pos) > r2) continue;
      this._pris.push(e);
    }

    let poids = 0;
    for (const e of this._pris) poids += e.type === 'boss' ? POIDS_BOSS : 1;
    for (const e of this._pris) {
      // La fureur majore le souffle comme elle majore une balle : sans ça, la
      // Chambre de fureur ne servait à VULCAIN que pour son canon d'appoint, qui
      // n'est pas son arme — on payait pour presque rien.
      const bonus = bord.odTimer > 0 ? 1 + 0.45 * (FUREUR.degats[bord.levels?.fureur | 0] || 0) : 1;
      const degats = Math.round((e.type === 'boss' ? DEGATS_BOSS : DEGATS) * bonus);
      // Le numéro du bord dit à QUI revient la mort — combo, score, pièces. Sans
      // lui, tout retombait sur le joueur local : la salve d'un copain nourrissait
      // ma chaîne, et la sienne restait à zéro sur ma machine.
      if (game.enemies.damage(e, degats, game)) game._onEnemyKilled(e, 'charge', bord.numero);
    }
    this._pris.length = 0;

    // LA SALVE. Un seul ennemi ne paie rien, et ce zéro est le cœur de la coque.
    // Elle remplit la jauge de celui qui a posé la charge, la seule qui autorisera
    // sa bombe — et sa bombe, elle, se simule chez tout le monde.
    if (poids >= 2) {
      const gain = SALVE_CINQ * Math.pow((poids - 1) / 4, SALVE_COURBE);
      game._addEnergy(Math.min(SALVE_MAX, gain), bord);
    }

    this._allumeSouffle(pos, c.rayon, poids);
    game.audio?.detonation?.(poids, pos.x);
    // TROIS COUCHES, et chacune répond à une question différente. Le FRONT dit
    // jusqu'où ça a porté, et il part assez vite pour atteindre le bord de la
    // sphère avant de s'éteindre. Le CŒUR donne le coup — court, blanc, dense. Les
    // ESCARBILLES restent une seconde entière et retombent : ce sont elles qui font
    // la différence entre une explosion et un flash, et c'est la couche qu'on
    // remarque en dernier alors qu'elle est celle qui reste à l'œil.
    game.fx.burst(pos, SOUFFLE, {
      count: 30 + poids * 5,
      speed: c.rayon * 2.6,
      life: 0.45,
      spread: c.rayon * 0.4,
    });
    game.fx.burst(pos, COEUR, { count: 16, speed: c.rayon * 1.5, life: 0.26, spread: 0.5 });
    game.fx.burst(pos, CHAUDE, {
      count: 18,
      speed: c.rayon * 0.75,
      life: 1.0,
      spread: c.rayon * 0.55,
    });
    game.fx.addShake(Math.min(0.7, 0.16 + poids * 0.09) * (this._local ? 1 : SECOUSSE_DISTANTE));
    // L'onde du jeu par-dessus la nôtre, mais seulement quand le coup a porté : le
    // pool d'anneaux n'a que six places et une salve ratée n'a rien à annoncer.
    if (poids >= 2) game.fx.shockwave(pos, SOUFFLE, c.rayon);
  }

  _allumeSouffle(pos, rayon, poids) {
    const s = this.souffles.find((x) => x.vie <= 0);
    if (!s) return;
    // Un gros coup reste à l'écran plus longtemps. C'est la seule récompense
    // visuelle de la SALVE, et elle arrive avant que le chiffre ne bouge au HUD.
    s.duree = 0.5 + Math.min(0.35, poids * 0.06);
    s.vie = s.duree;
    s.rayon = rayon;
    s.groupe.position.copy(pos);
    s.groupe.visible = true;
  }

  _avanceSouffles(dt) {
    for (const s of this.souffles) {
      if (s.vie <= 0) continue;
      s.vie -= dt;
      if (s.vie <= 0) {
        s.groupe.visible = false;
        continue;
      }
      const t = 1 - s.vie / s.duree;
      // Le souffle atteint SON rayon en seize centièmes, puis il ne bouge plus et
      // ne fait que s'éteindre. Cette immobilité est le geste entier : un anneau
      // qui continue de grandir en s'effaçant — la convention du jeu ailleurs — ne
      // dit à aucun moment jusqu'où l'explosion a porté.
      const ouvert = Math.min(1, t / 0.16);
      const taille = Math.max(0.001, s.rayon * (1 - Math.pow(1 - ouvert, 3)));
      s.sphere.scale.setScalar(taille);
      s.sphere.material.opacity = 0.75 * Math.pow(1 - t, 0.8);
      s.anneau.scale.setScalar(taille);
      s.anneau.material.opacity = 0.95 * (1 - t);
      // Le cœur : une boule pleine qui éclaire au premier tiers puis disparaît.
      // C'est lui qui donne le COUP ; la sphère, elle, donne la mesure.
      const coeur = Math.max(0, 1 - t / 0.35);
      s.coeur.scale.setScalar(Math.max(0.001, s.rayon * 0.5 * coeur));
      s.coeur.material.opacity = 0.85 * coeur;
    }
  }

  _montreReserve(bord, vaisseau) {
    const p = vaisseau.position;
    this.ventre.visible = true;
    // Sous la coque et un peu en arrière : de face on ne verrait rien, et la
    // caméra regarde le plan de jeu à trente-huit degrés au-dessus de l'horizon.
    this.ventre.position.set(p.x, -0.2, p.z + 1.2);
    const intervalle = this._intervalle(bord);
    const capacite = this._capacite(bord);
    // POSÉ : le ventre passe au blanc et grossit. C'est le télégraphe de toute la
    // coque — ce qui est blanc est en train de sortir, ce qui est orange attend —
    // et il tient sur la seule chose que le joueur regarde déjà, son vaisseau.
    const pose = this.tCalage >= CALAGE;
    for (let i = 0; i < this.braises.length; i++) {
      const braise = this.braises[i];
      // Les places qu'on n'a pas achetées n'existent pas. La contenance se VOIT
      // donc sous la coque dès la sortie du hangar, avant même d'avoir servi.
      braise.visible = i < capacite;
      if (!braise.visible) continue;
      braise.position.x = (i - (capacite - 1) / 2) * 0.42;
      let force = 0;
      if (i < this.reserve) force = 1;
      // Celle qui est en train d'être forgée se remplit sous les yeux : la
      // prochaine charge s'annonce, elle ne surgit pas.
      else if (i === this.reserve) force = 1 - Math.max(0, this.tProduction) / intervalle;
      braise.material.color.copy(pose && force >= 1 ? C_COEUR : C_CHAUDE);
      braise.material.opacity = (0.05 + 0.6 * force) * (pose ? 1.3 : 1);
      braise.scale.setScalar((0.45 + 0.55 * force) * (pose ? 1.25 : 1));
    }
  }

  clear() {
    for (const c of this.charges) {
      c.active = false;
      c.groupe.visible = false;
    }
    for (const s of this.souffles) {
      s.vie = 0;
      s.groupe.visible = false;
    }
    this.reserve = 0;
    this.tProduction = INTERVALLE;
    this.tSalve = 0;
    // Pied LEVÉ et non posé : une vague qui commence ne doit pas cracher son
    // ventre parce que le vaisseau n'a pas encore bougé. Il faudra se poser
    // pour de bon, comme partout ailleurs.
    this.tCalage = 0;
    this.trop = false;
    this.ventre.visible = false;
  }

  // L'état de la forge, en nombres. Les missiles en vol EN FONT PARTIE : une vague
  // peut commencer alors que trois d'entre eux montent encore, et un rejeu qui
  // repartirait d'un ciel vide raconterait déjà une autre partie. Chacun emporte sa
  // position, sa vitesse (tirée au lancement, donc irrécupérable autrement), son
  // vol restant et son rayon — ce dernier parce qu'il est figé à la pose : un
  // missile lâché avant un module `missiles` garde le souffle pour lequel il a été
  // forgé.
  //
  // Format : [réserve, minuterie de forge, délai de salve, calage, trop-plein,
  // nombre de missiles] puis cinq nombres par missile. Le CALAGE en fait partie :
  // il vaut jusqu'à douze centièmes de tir, et une vague restaurée pied levé
  // rendrait une charge à celui qui était déjà posé. Ce qui n'est pas là — l'armement, l'extinction, la
  // minuterie d'étincelles — se recalcule à la frame suivante à partir de ce qui y
  // est : c'est la raison pour laquelle l'annonce se déduit de la DISTANCE aux
  // ennemis et le battement de l'ALTITUDE, et non d'un compteur qu'il faudrait
  // sérialiser.
  //
  // Rien de ce qui sert le multi-poste n'y entre non plus : le bord, son vaisseau
  // et le fait que le poste soit le mien se relisent à chaque image au début
  // d'`update`. Ce format décrit UNE forge — celle d'un poste — et c'est à game.js
  // de collectionner celles de tous les postes dans son propre instantané.
  instantane() {
    const etat = [this.reserve, this.tProduction, this.tSalve, this.tCalage, this.trop ? 1 : 0, 0];
    let n = 0;
    for (const c of this.charges) {
      if (!c.active) continue;
      etat.push(c.x, c.z, c.v, c.vol, c.rayon);
      n++;
    }
    etat[5] = n;
    return etat;
  }

  restaure(etat) {
    this.clear();
    if (!etat || etat.length < 6) return;
    this.reserve = etat[0];
    this.tProduction = etat[1];
    this.tSalve = etat[2];
    this.tCalage = etat[3];
    this.trop = !!etat[4];
    const n = etat[5];
    for (let i = 0; i < n; i++) {
      const c = this.charges[i];
      if (!c) break;
      const k = 6 + i * 5;
      c.active = true;
      c.x = etat[k];
      c.z = etat[k + 1];
      c.v = etat[k + 2];
      c.vol = etat[k + 3];
      c.rayon = etat[k + 4];
      this._reposeVisuel(c);
    }
  }
}
