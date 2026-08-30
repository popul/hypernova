// HÉLIOS — le rayon qui traverse, et les satellites qui couvrent le reste.
//
// Cette coque n'a qu'un verbe : TENIR. Tout ce qui suit en découle. Le rayon est
// allumé en permanence — ce n'est donc pas « quand tirer » qui se décide, c'est OÙ
// l'on se tient. Sa puissance ne s'achète pas : elle se gagne à ne pas bouger et
// se perd à la première dérive.
//
// La récompense est double, et c'est délibéré (docs/classes.md, « HÉLIOS → LA
// CHAUFFE ») : le même contact tenu fait monter les dégâts ET remplit la jauge de
// furie. Le joueur n'a pas deux objectifs à tenir, il en a un seul, très exigeant.
//
// Trois contraintes ont dicté l'écriture du fichier :
//  · aucune allocation par frame — meshes, géométries et matières sont fabriqués
//    au constructeur puis recyclés ; rien n'est créé une fois la partie lancée ;
//  · aucun hasard dans la simulation. L'arme n'en a en fait besoin d'aucun : un
//    rayon continu et des satellites à cadence fixe sont entièrement déterministes,
//    ce qui rend le replay gratuit. Seules les étincelles décoratives, confiées à
//    fx, puisent encore dans Math.random — et elles n'ont aucun effet sur l'issue ;
//  · UN EXEMPLAIRE PAR POSTE DE PILOTAGE. L'arme ne suppose plus qu'elle sert le
//    joueur local : `update` reçoit le BORD qu'elle sert et lit tout chez lui —
//    son vaisseau, ses modules, sa jauge, sa commande. Elle ne servait que le
//    mien, et le rayon d'un copain ne brûlait donc rien chez moi : les ennemis
//    qu'il tuait restaient vivants sur mon écran. Ce qu'elle continue de partager
//    avec tout le monde, ce sont les ennemis, les particules et l'arène — c'est
//    la même partie, vue de trois endroits.

import * as THREE from 'three';
import { ARENA, FUREUR, PLAYER } from '../constants.js';
import { boucleActive } from '../arena.js';

// ---- Le rayon ----

// Jusqu'où il porte. La formation la plus haute vit vers z = −22 ; on va au-delà
// pour que le trait SORTE du cadre au lieu de s'arrêter dans le vide, ce qui se
// lirait comme une portée limitée alors qu'il n'y en a pas.
const PORTEE_Z = -30;
// Le nez, d'où part le trait : la même avance que les traçantes d'ORION, sinon le
// rayon a l'air de naître à l'intérieur de la coque.
const NEZ_Z = -1.2;

// Demi-largeur par niveau de `cannons`. C'est tout ce que ce module achète ici :
// trois canons ne font pas trois rayons, ils font UN rayon large.
const DEMI_LARGEUR = [0.2, 0.85, 1.5];

// Le temps qu'il faut pour atteindre la puissance maximale, par niveau de
// `cannons`. Un rayon large monte plus lentement — sans ce prix-là, élargir
// n'aurait aucun inconvénient et le choix disparaîtrait.
const MONTEE_DUREE = [2.0, 2.6, 3.2];
// La montée ne récompense que les contacts LONGS, donc surtout les boss : c'est
// par elle qu'on règle l'écart entre les deux situations sans toucher au reste. À
// 3,5 la coque pliait un boss en 5,9 s quand ORION en met 20,6 — le rayon ne ratant
// jamais, une arme continue est structurellement avantagée sur une cible unique, et
// il faut le payer quelque part. Ce qui fait vraiment le sel de la tenue reste la
// CHAUFFE, qui remplit la jauge et ouvre l'Overdrive.
const MONTEE_MAX = 1.8; // ×1 au contact, ×1,8 une fois chargé

// LA LENTILLE DIVERGENTE — le rayon s'ouvre en cône.
//
// L'ÉVASEMENT EST ABSOLU, PAS PROPORTIONNEL, et c'est ce qui le garde honnête.
// Multiplier la demi-largeur aurait composé avec les canons : à canons pleins, le
// niveau 3 aurait sextuplé la couverture et la coque serait devenue la meilleure
// partout, ce qui est exactement la chose qu'on ne veut pas. On AJOUTE donc un
// nombre d'unités au loin, le même pour tout le monde.
//
// Et l'évasement ne se gagne qu'au LOIN. Au ras du nez, le rayon garde sa
// largeur : le cône ne sert donc à rien contre un plongeur qui arrive dessus, et
// tout contre une formation qui tient sa ligne. C'est une arme de COUVERTURE, pas
// de puissance — la distinction est le cœur du réglage.
const CONE_EVASEMENT = [0, 0.45, 0.9, 1.35];

// Ce qu'il coûte : la montée ralentit, exactement comme un rayon large paie déjà
// sa largeur (voir MONTEE_DUREE). Sans ce prix, élargir n'aurait aucun
// inconvénient et le choix disparaîtrait — c'est le même raisonnement, appliqué
// au même endroit.
const CONE_LENTEUR = [1, 1.14, 1.28, 1.42];

// LA SURCHAUFFE. Une arme dont la jauge s'appelle « chauffe » doit pouvoir trop
// chauffer, sans quoi le mot ne veut rien dire — et la mesure a montré qu'il ne
// voulait rien dire : sur une cible qui ne se dérobe pas, le rayon tenait 10,8
// dégâts par seconde indéfiniment et pliait un boss en 9 s là où ORION en met 20.
// La coque était la meilleure partout, ce qui est la seule chose qu'on ne voulait
// pas.
//
// Cinq secondes et demie de contact, une seconde de repos. Le réglage vise le boss
// et lui seul : la piétaille meurt en moins d'une seconde et l'on change de colonne
// bien avant d'y arriver, donc en vague la surchauffe ne se déclenche presque
// jamais. C'est le combat long — et uniquement lui — qui impose de lâcher la
// détente et de se replacer.
// Le seuil suit la DURÉE DE MONTÉE, il n'est pas un nombre de secondes en dur : à
// canons améliorés il faut 3,2 s pour saturer, et une surchauffe fixée à 2,8 aurait
// rendu la saturation inatteignable à celui qui a payé pour l'atteindre. Le piège
// aurait été parfaitement invisible.
//
// À 1,4, on garde toujours quatre dixièmes de pleine puissance avant de décrocher :
// assez pour que ça se sente, trop peu pour tenir un boss sans jamais lâcher.
const SURCHAUFFE_MUL = 1.4;
const REPOS = 1.0;

// Dégâts de base, en points par seconde, à cadence de tir nue. Calé sur ORION :
// 3,4 balles à 1 point la seconde. À charge pleine le rayon vaut donc trois fois
// et demie un flux droit, et c'est exactement ce qu'on paie en immobilité.
// Combien on peut dériver sans perdre sa montée. La demi-largeur du rayon s'y
// ajoute : un rayon large tient une ligne large, ce qui est le seul avantage
// consolant de sa montée plus lente.
// Le temps qu'on peut passer SANS toucher personne avant que la montée ne retombe.
// Sans elle, le trou d'un dixième de seconde entre deux rangs suffirait à tout
// perdre, et la coque serait injouable pour la raison la plus bête qui soit.
const GRACE = 0.3;

const DPS_BASE = 2.2;

// LA CHAUFFE. Le débit de jauge suit le temps de contact : un dixième de jauge par
// seconde après une seconde, un tiers après trois. L'exposant 1,1 fait passer la
// courbe par ces deux points-là précisément. Le plafond à trois secondes existe
// parce qu'au-delà la cible est morte ou c'est un boss : dans les deux cas il n'y
// a plus rien à récompenser davantage.
const CHAUFFE_PAR_SEC = 10; // jauge/s à une seconde de contact (la jauge va à 100)
const CHAUFFE_EXP = 1.1;
const CHAUFFE_PLAFOND = 3;

// ---- Les satellites ----

// Combien d'orbes, par niveau de `missiles`. Deux d'origine, quatre au bout — la
// fiche dit « jusqu'à quatre », et le dernier niveau doit rester un palier.
const SATELLITES = [2, 3, 3, 4];
const ORBITE_RAYON = 2.05;
const ORBITE_VITESSE = 1.35; // rad/s
const CADENCE_SAT = 1.05; // éclats/s et par satellite, à cadence de tir nue
const ECLAT_VITESSE = 30;
const ECLAT_PORTEE = 1.4; // secondes
const ECLAT_DEGATS = 1; // franc et ponctuel, exactement comme une balle
// Les orbes ne tirent plus : voir `_satellites`. Le drapeau reste pour que la
// décision se lise, et se défasse d'un mot si elle était mauvaise.
const ORBES_TIRENT = false;
const ECLAT_RAYON = 0.32;

// L'arc dans lequel un satellite crache. On rabat le cercle de l'orbite sur
// l'avant : un orbe passé derrière tirerait sinon dans le vide une fois sur deux.
// La borne basse évite l'axe du rayon — qui laboure déjà cette colonne — et la
// borne haute reste en deçà du travers, pour que l'éclat croise quelque chose.
const ARC_MIN = 0.34; // ~20°
const ARC_MAX = 1.32; // ~76°

// ---- Rendu ----

// LA SPIRALE. Deux hélices enroulées autour du faisceau, qui remontent avec lui.
//
// C'étaient des anneaux : cinq ondes qui glissaient le long du trait. Ça donnait
// bien un SENS au rayon, mais ça lui donnait aussi l'air d'un tuyau à travers
// lequel passent des rondelles — la lecture était plate, et le rayon n'avait pas
// l'air de tourner sur lui-même. Deux hélices, elles, disent d'un coup d'œil
// qu'une énergie s'enroule et se comprime, et c'est exactement ce qu'on veut voir
// quand la puissance monte.
const HELICE_SEGMENTS = 26; // par brin
const HELICE_BRINS = 2;
// Combien de tours complets l'hélice fait sur la longueur du rayon. Plus la
// charge monte, plus elle se resserre : c'est le seul indice qui dise « ça
// comprime » sans afficher de chiffre.
const HELICE_TOURS = 2.2;
const HELICE_TOURS_CHARGE = 2.6;

// Les éclats qui fusent latéralement, arrachés au faisceau.
const FUITES = 26;
const IMPACTS = 6; // points de contact affichés simultanément
const ECLATS_POOL = 40;

// Froid au contact, blanc-or à saturation. HÉLIOS était une récolteuse de lumière
// stellaire : quand elle chauffe, elle vire à la couleur de ce qu'elle regardait.
const FROID = 0x6fe8ff;
const CHAUD = 0xffe6a0;

// Ce qu'il reste de la secousse quand c'est le rayon d'un COPAIN qui gronde. Le
// partage est celui que game.js applique déjà à la bombe : l'arène est à tout le
// monde, la caméra est à moi. À trois pilotes tenant leur rayon, trois
// ronronnements à plein régime feraient trembler mon écran en permanence pour un
// combat auquel je ne participe pas.
const SECOUSSE_DISTANTE = 0.4;

export class ArmeHelios {
  constructor(scene) {
    this.scene = scene;

    // Une matière par COUCHE, partagée par toutes les pièces de cette couche : la
    // couleur monte avec la charge, et il faut qu'elle monte partout ensemble.
    const additif = (color, opacity) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });

    this.matCoeur = additif(0xffffff, 0.95);
    this.matHalo = additif(FROID, 0.34);
    this.matAura = additif(FROID, 0.11);
    this.matAnneau = additif(0xffffff, 0.5);
    this.matNez = additif(0xffffff, 0.9);
    this.matImpact = additif(0xffffff, 0.8);
    this.matOrbe = additif(FROID, 0.95);
    this.matOrbeHalo = additif(FROID, 0.25);
    this.matEclat = additif(CHAUD, 0.95);

    // Trois tubes emboîtés, et non trois boîtes. Une boîte additive montre ses
    // arêtes : le halo se lisait comme une dalle posée devant la caméra au lieu
    // d'un rayon. Un cylindre ouvert n'a ni couvercle ni arête franche, et les
    // trois opacités décroissantes font le dégradé qu'une texture aurait fait.
    // L'unité est en Y pour un cylindre : chaque tube est couché sur Z une fois
    // pour toutes, et c'est l'échelle qui donne rayon et longueur.
    // UN TRONC DE CÔNE PAR COMBINAISON CANONS × LENTILLE, bâti une fois pour
    // toutes — douze géométries, et plus une seule allocation ensuite.
    //
    // Le cylindre était déjà là : lui donner deux rayons différents suffit à en
    // faire un cône. L'axe du cylindre est Y et le tube est couché sur Z, donc +Y
    // devient le NEZ (près du vaisseau) et -Y le LOIN : c'est le rayon du bas qui
    // s'ouvre.
    //
    // POURQUOI DOUZE ET PAS QUATRE. L'évasement est absolu — un nombre d'unités
    // ajoutées au loin — tandis que la géométrie ne connaît qu'un RAPPORT. Le
    // rapport dépend donc de la largeur de base, c'est-à-dire des canons. Bâtir
    // quatre cônes fixes aurait fait mentir le dessin sur la portée réelle du
    // rayon : on aurait brûlé des ennemis en dehors du trait, ou l'inverse. Ce
    // qu'on voit et ce qu'on touche doivent rester la même chose.
    this.tubes = DEMI_LARGEUR.map((base) =>
      CONE_EVASEMENT.map(
        (evase) => new THREE.CylinderGeometry(1, (base + evase) / base, 1, 16, 1, true)
      )
    );
    const tube = this.tubes[0][0];
    const coucher = (m) => {
      m.rotation.x = Math.PI / 2;
      return m;
    };
    const traitNu = () => {
      const g = new THREE.Group();
      const aura = coucher(new THREE.Mesh(tube, this.matAura));
      const halo = coucher(new THREE.Mesh(tube, this.matHalo));
      const coeur = coucher(new THREE.Mesh(tube, this.matCoeur));
      g.add(aura, halo, coeur);
      g.visible = false;
      // Le rayon dépasse très largement du champ : laissé au test de frustum, il
      // disparaissait dès que son centre sortait du cadre.
      g.traverse((o) => (o.frustumCulled = false));
      scene.add(g);
      return { groupe: g, aura, halo, coeur };
    };

    this.trait = traitNu();
    // Le prolongement de l'autre côté de la couture. L'arène boucle et le vaisseau
    // s'y dessine déjà en deux morceaux ; son rayon doit suivre, sinon on tire
    // depuis une coque qu'on ne voit plus.
    this.couture = traitNu();

    // LES DEUX BRINS DE L'HÉLICE.
    //
    // Un brin est une file de petits octaèdres posés le long d'une hélice. On
    // pourrait croire qu'un tube courbe ferait mieux — c'est ce que j'ai essayé
    // d'abord : il faut alors reconstruire sa géométrie à chaque image, puisque
    // le pas de l'hélice change avec la charge, et c'est exactement ce que ce
    // projet s'interdit. Des perles déplacées coûtent une écriture de matrice,
    // et à cette vitesse l'œil les lit comme un trait continu de toute façon.
    const geoPerle = new THREE.OctahedronGeometry(1, 0);
    this.helice = [];
    for (let b = 0; b < HELICE_BRINS; b++) {
      const brin = [];
      for (let i = 0; i < HELICE_SEGMENTS; i++) {
        const m = new THREE.Mesh(geoPerle, this.matAnneau);
        m.visible = false;
        m.frustumCulled = false;
        scene.add(m);
        brin.push(m);
      }
      this.helice.push(brin);
    }

    // Les fuites : ce que le faisceau perd sur les côtés. Elles ne servent à rien
    // qu'à dire qu'il ne CONTIENT pas tout ce qu'il transporte.
    const geoFuite = new THREE.TetrahedronGeometry(0.09, 0);
    this.fuites = [];
    for (let i = 0; i < FUITES; i++) {
      const m = new THREE.Mesh(geoFuite, this.matAnneau);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.fuites.push({ mesh: m, vie: 0, duree: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.tFuite = 0;

    // La bouche de l'émetteur : un noyau facetté et une couronne qui s'ouvre avec
    // la charge. C'est le seul endroit où la montée en puissance se lit sans avoir
    // à regarder ce qu'on est en train de tuer.
    this.nez = new THREE.Group();
    this.nezNoyau = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), this.matNez);
    this.nezCouronne = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 20), this.matAnneau);
    this.nez.add(this.nezNoyau, this.nezCouronne);
    this.nez.visible = false;
    scene.add(this.nez);

    // Les points de contact. Sans eux le rayon traverse la formation sans qu'on
    // sache ce qu'il mord : un dégât qu'on ne voit pas atterrir n'existe pas.
    const geoImpactCoeur = new THREE.SphereGeometry(0.34, 10, 10);
    const geoImpactAnneau = new THREE.TorusGeometry(0.62, 0.06, 6, 18);
    this.impacts = [];
    for (let i = 0; i < IMPACTS; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geoImpactCoeur, this.matImpact));
      g.add(new THREE.Mesh(geoImpactAnneau, this.matAnneau));
      g.visible = false;
      g.traverse((o) => (o.frustumCulled = false));
      scene.add(g);
      this.impacts.push(g);
    }

    // Les orbes. Les quatre existent toujours ; seuls les premiers se montrent,
    // selon le niveau de `missiles` — un pool qui grandit en jeu est une allocation.
    const geoOrbe = new THREE.IcosahedronGeometry(0.26, 0);
    const geoOrbeHalo = new THREE.SphereGeometry(0.5, 10, 10);
    this.satellites = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geoOrbe, this.matOrbe));
      g.add(new THREE.Mesh(geoOrbeHalo, this.matOrbeHalo));
      g.visible = false;
      scene.add(g);
      this.satellites.push(g);
    }

    // Les éclats. Un octaèdre orienté sur sa vitesse : une diagonale doit se lire
    // comme une diagonale, ce qu'une boîte alignée sur Z ne sait pas faire.
    const geoEclat = new THREE.OctahedronGeometry(0.17, 0);
    this.eclats = [];
    for (let i = 0; i < ECLATS_POOL; i++) {
      const m = new THREE.Mesh(geoEclat, this.matEclat);
      m.visible = false;
      scene.add(m);
      this.eclats.push({ mesh: m, actif: false, vel: new THREE.Vector3(), age: 0 });
    }

    // ---- L'état de simulation : tout ce qui part dans l'instantané ----

    // Secondes de contact ININTERROMPU sur la même cible. C'est la seule variable
    // qui compte vraiment : elle pilote les dégâts ET la jauge.
    this.tenu = 0;
    this.grace = 0;
    this.phase = 0; // angle d'orbite des satellites
    this.tirTimer = 0;
    this.prochain = 0; // quel orbe crache le prochain éclat
    this.sature = false;
    // Secondes de repos forcé restantes. Tant qu'il court, le rayon ne sort pas.
    this.repos = 0;
    this.horloge = 0; // temps de vie de l'arme, pour les pulsations

    // Dégâts fractionnaires en attente, par ennemi. On ne dépense qu'au POINT
    // ENTIER : appeler enemies.damage() soixante fois par seconde et par cible
    // noierait le pool de particules sous les étincelles de touche, et le rayon
    // deviendrait illisible là précisément où il touche le plus.
    this.enAttente = new Map();

    this.grainTimer = 0; // cadence des étincelles décoratives
    this.audioTimer = 0; // cadence des envois vers l'oscillateur entretenu
    this._contacts = 0;
    this._cible = null;

    this._couleur = new THREE.Color();
    this._froid = new THREE.Color(FROID);
    this._chaud = new THREE.Color(CHAUD);
    this._tmp = new THREE.Vector3();
    // clear() n'a pas de `game` sous la main, et c'est très bien : c'est un
    // extincteur, pas une frame. On retient donc l'audio de la dernière frame —
    // et seulement si cette frame servait MON poste (voir `update`).
    this._audio = null;
  }

  // `bord` : le poste de pilotage servi. Le jeu lui-même quand c'est moi, un
  // objet de `game.bordsDistants` quand c'est un copain — il porte sa commande,
  // ses modules, ses stats, sa jauge et son numéro. `bord = game` par défaut,
  // c'est-à-dire le solo, et rien n'y change.
  update(dt, game, bord = game) {
    const vaisseau = game._vaisseauDu(bord);
    // Un poste peut se fermer entre deux images — un copain qui quitte la partie.
    // On ne dessine alors rien plutôt que de lire une position sur personne ;
    // c'est à game.js d'éteindre l'arme, comme il le fait déjà à la mort du
    // pilote (sans quoi le rayon reste tendu en travers de l'écran).
    if (!vaisseau) return;
    // CE QUI NE CONCERNE QUE MOI, relevé une fois par image comme `_boucle` : le
    // HUD, le son du rayon et la caméra sont réservés au poste local ; l'arène —
    // le trait, les impacts, les ondes, les étincelles — est à tout le monde,
    // sans quoi on ne verrait pas le rayon du copain. La frontière se tranche à
    // quatre endroits : le carillon de saturation, la surchauffe, `_son`, et la
    // secousse dans `_rendu`.
    this._local = bord === game;
    // On ne retient l'audio que pour le poste local, et c'est ce qui rend `clear`
    // inoffensif ailleurs : `laserBoucle` entretient UN oscillateur pour tout le
    // jeu, si bien que l'extincteur d'un copain couperait mon rayon.
    this._audio = this._local ? game.audio : null;
    this.horloge += dt;
    // Relevé une fois par image : `_ecartX` est appelé une fois par ennemi, et il
    // n'a pas à retrouver le jeu depuis le fond de sa boucle. C'est la couture de
    // CE pilote-là qui décide si SON rayon franchit le bord, pas la mienne.
    this._boucle = boucleActive(bord);

    const levels = bord.levels || {};
    const stats = bord.stats || {};
    const niveauCanons = Math.max(0, Math.min(DEMI_LARGEUR.length - 1, levels.cannons | 0));
    const demi = DEMI_LARGEUR[niveauCanons];
    const niveauCone = Math.max(0, Math.min(CONE_EVASEMENT.length - 1, levels.cone | 0));
    const evase = CONE_EVASEMENT[niveauCone];
    // Le cône se paie sur la montée : un rayon qui couvre plus met plus de temps
    // à saturer. C'est le seul prix, et il suffit à en faire un choix.
    const duree = MONTEE_DUREE[niveauCanons] * CONE_LENTEUR[niveauCone];

    // Le rayon suit la commande de tir — automatique par défaut, donc allumé en
    // permanence comme la fiche l'exige. Celui qui coupe l'auto-tir garde malgré
    // tout le droit d'éteindre son émetteur : c'est sa seule façon de se taire.
    // Le repos court même détente relâchée : on ne triche pas avec la surchauffe en
    // coupant l'émetteur une frame. Il se décompte AVANT `actif`, qui en dépend.
    if (this.repos > 0) this.repos = Math.max(0, this.repos - dt);
    const actif = (bord.cmd ? bord.cmd.tir !== false : true) && this.repos <= 0;

    const p = vaisseau.position;
    const nezZ = p.z + NEZ_Z;

    // --- Ce que la colonne laboure, et qui l'on tient ---
    let cible = null;
    if (actif) {
      // LA FUREUR ET LES ORBES COMPTENT AUSSI POUR LE RAYON.
      //
      // Deux modules ne servaient à rien sur cette coque, et c'est le genre de
      // trou qu'un joueur découvre en ayant déjà payé. `missiles` posait des
      // satellites en orbite, qui ne tirent plus depuis qu'on leur a retiré leurs
      // éclats : on achetait donc une décoration. Et la Chambre de fureur ajoute
      // des dégâts AUX BALLES — or HÉLIOS n'en tire pas une seule.
      //
      // Les orbes amplifient maintenant le rayon au lieu de tirer à côté : c'est
      // plus fidèle à la coque, qui ne sait faire qu'une chose. Et la fureur
      // majore le débit du rayon comme elle majore une balle.
      const orbes = 1 + 0.16 * (levels.missiles | 0);
      const fureur = bord.odTimer > 0 ? 1 + 0.5 * (FUREUR.degats[levels.fureur | 0] || 0) : 1;
      const dps = DPS_BASE * this._ratioCadence(stats) * this._montee(duree) * orbes * fureur;
      this._brule(dt, game, bord, p.x, nezZ, demi, dps, evase);
      // La cible tenue est celle qui est la PLUS PROCHE du vaisseau : celle qu'on
      // va tuer, donc celle dont la mort remettra tout à zéro. Le piège de la
      // coque est là, et il doit être exactement là.
      cible = this._cible;
    } else {
      this._contacts = 0;
      this._cible = null;
    }

    // CE QU'ON TIENT, C'EST LE CONTACT.
    //
    // Deux définitions ont échoué avant celle-ci, et il faut dire pourquoi.
    //
    // La première liait la montée à l'IDENTITÉ de la cible : elle repartait de zéro
    // dès qu'un ennemi mourait. La piétaille a un à trois points de vie et tombe en
    // moins d'une seconde, contre deux pour saturer — HÉLIOS n'atteignait donc
    // jamais sa puissance, et valait ORION sans ses missiles.
    //
    // La seconde ancrait la montée à une COLONNE, c'est-à-dire à la position du
    // vaisseau. Mesurée, elle était pire : le contact le plus long de tout un
    // combat de boss durait SOIXANTE-SIX CENTIÈMES de seconde. Pour suivre une
    // cible il faut bouger, et bouger de plus d'une unité effaçait tout. La montée
    // en puissance de la coque n'existait pas — la fiche la promettait, le jeu ne
    // l'a jamais donnée une seule fois.
    //
    // Ce qui compte est donc plus simple, et c'est le verbe même de la coque : NE
    // PAS LÂCHER. Tant que le rayon touche quelque chose, la chauffe monte ; qu'il
    // brasse le vide plus de trois dixièmes de seconde, et tout retombe. Suivre sa
    // proie devient la bonne façon de jouer au lieu d'être punie, et c'est la
    // SURCHAUFFE — pas l'immobilité — qui empêche de tenir un boss indéfiniment.
    if (cible) {
      this.tenu += dt;
      this.grace = GRACE;
    } else if (this.grace > 0) {
      this.grace -= dt;
    } else if (this.tenu > 0) {
      // Le contact est bel et bien rompu : le débit retombe, la jauge acquise reste.
      // On oublie les dégâts en attente — perdre le contact efface la montée, il
      // serait incohérent qu'il en garde la monnaie.
      this.tenu = 0;
      this.sature = false;
      if (this.enAttente.size) this.enAttente.clear();
    }

    // --- LA CHAUFFE ---
    if (this.tenu > 0) {
      const t = Math.min(CHAUFFE_PLAFOND, this.tenu);
      // La jauge remplie est celle de CELUI qui tient son rayon. Sans le bord, la
      // chauffe d'un copain montait sur mon compteur : je gagnais des bombes en
      // regardant, et lui n'avait jamais de quoi tirer les siennes chez moi.
      game._addEnergy(CHAUFFE_PAR_SEC * Math.pow(t, CHAUFFE_EXP) * dt, bord);
    }

    // La saturation s'annonce UNE fois. C'est le seul instant où le joueur apprend
    // que tenir plus longtemps ne rapportera plus rien de plus.
    if (!this.sature && this.tenu >= duree) {
      this.sature = true;
      // Le carillon ne sonne que pour le pilote concerné : « tenir plus longtemps
      // ne rapportera plus rien » ne veut rien dire venant du rayon d'un copain,
      // et à trois postes ce ne serait plus qu'un bruit. L'onde de choc, elle,
      // reste pour tout le monde — elle est dans l'arène, et voir le rayon du
      // voisin atteindre sa pleine puissance fait partie de la partie.
      if (this._local) game.audio?.laserSature?.();
      game.fx.shockwave(this._tmp.set(p.x, 0, nezZ), CHAUD, 3.4);
    }

    // Trop, c'est trop : l'émetteur décroche et se tait le temps de redescendre.
    // La montée repart de zéro — c'est bien la perte du contact qui coûte, pas une
    // pénalité de plus posée par-dessus.
    if (this.tenu >= duree * SURCHAUFFE_MUL) {
      this.repos = REPOS;
      this.tenu = 0;
      this.grace = 0;
      this.sature = false;
      this.enAttente.clear();
      game.fx.shockwave(this._tmp.set(p.x, 0, nezZ), CHAUD, 5.2);
      // Le décrochage s'adresse à celui qui vient de perdre sa montée, et à lui
      // seul : afficher « SURCHAUFFE » quand c'est le rayon d'un copain qui lâche
      // ferait chercher au mien une panne qu'il n'a pas.
      if (this._local) {
        game.audio?.laserCoupe?.();
        // Court et sans sous-titre : c'est une information de combat, pas une leçon.
        game.hud?.announce?.('SURCHAUFFE', '', 900);
      }
    }

    this._satellites(dt, game, p, levels, stats);
    this._eclats(dt, game, bord);
    // Le cône du moment. C'est la seule géométrie qui change en cours de partie,
    // et elle ne change qu'à l'achat d'un module — donc jamais pendant une vague.
    this._rendu(dt, game, p, nezZ, demi, duree, actif, this.tubes[niveauCanons][niveauCone], evase);
    this._son(dt, game, p, actif, duree);
  }

  // Le rapport à la cadence nue. Le Surcadenceur nourrit aussi le rayon : sur une
  // arme continue, « cadence » ne veut rien dire d'autre que « débit ».
  _ratioCadence(stats) {
    return (stats.fireRate || PLAYER.baseFireRate) / PLAYER.baseFireRate;
  }

  // Le multiplicateur de dégâts courant, de 1 à 3,5.
  _montee(duree) {
    return 1 + (MONTEE_MAX - 1) * Math.min(1, this.tenu / duree);
  }

  // Écart en x tenant compte du bouclage de l'arène : sortir par la gauche fait
  // rentrer par la droite, et le rayon n'a aucune raison d'être la seule chose du
  // jeu qui l'ignore.
  _ecartX(ex, bx) {
    let dx = ex - bx;
    // Le rayon ne franchit la couture que si le vaisseau le peut : sans le module,
    // il s'arrête au bord comme tout le reste.
    if (!this._boucle) return dx;
    const span = ARENA.playerXMax * 2;
    if (dx > span / 2) dx -= span;
    else if (dx < -span / 2) dx += span;
    return dx;
  }

  // Applique les dégâts à tout ce qui traverse la colonne, et retient au passage
  // la cible la plus avancée — celle dont dépend la montée en puissance.
  // LA DEMI-LARGEUR À UNE PROFONDEUR DONNÉE.
  //
  // Sans lentille, c'est une constante et le rayon est une colonne. Avec, elle
  // croît linéairement du nez jusqu'à la portée : le cône ne gagne sa largeur
  // qu'au loin, donc il ne protège de rien à bout portant. C'est la seule
  // fonction qui décide qui est touché — et c'est aussi elle qui décide de ce
  // qu'on DESSINE, pour que les deux ne puissent pas diverger.
  _demiA(z, nezZ, demi, evase) {
    if (!evase) return demi;
    const u = Math.max(0, Math.min(1, (nezZ - z) / Math.max(0.001, nezZ - PORTEE_Z)));
    return demi + evase * u;
  }

  _brule(dt, game, bord, bx, nezZ, demi, dps, evase = 0) {
    const enemies = game.enemies.list;
    let n = 0;
    let meilleure = null;
    let meilleureZ = -Infinity;

    for (const e of enemies) {
      if (!e.alive) continue;
      const pos = e.group.position;
      if (pos.z > nezZ || pos.z < PORTEE_Z) continue;
      const r = e.def.radius;
      if (Math.abs(this._ecartX(pos.x, bx)) > this._demiA(pos.z, nezZ, demi, evase) + r) continue;
      // Les ennemis flottent à quelques dixièmes du plan : la tranche est large
      // pour que ce test n'écarte jamais personne par accident. Mais il existe —
      // le jour où quelque chose volera plus haut, le rayon le laissera passer.
      if (Math.abs(pos.y) > 1.4 + r) continue;

      n++;
      if (pos.z > meilleureZ) {
        meilleureZ = pos.z;
        meilleure = e;
      }

      const du = (this.enAttente.get(e.id) || 0) + dps * dt;
      const entier = Math.floor(du);
      if (entier >= 1) {
        this.enAttente.set(e.id, du - entier);
        if (game.enemies.damage(e, entier, game)) {
          this.enAttente.delete(e.id);
          // Même protocole que _collisions() dans game.js : c'est lui qui compte
          // le combo, le score et les drops, et lui seul. Le numéro du bord dit à
          // QUI ils reviennent — sans lui, la chaîne et la jauge d'un copain
          // montaient sur mon compte, et sa bombe lui était refusée chez moi
          // faute d'énergie alors qu'elle partait chez lui.
          game._onEnemyKilled(e, 'cannon', bord.numero);
        }
      } else {
        this.enAttente.set(e.id, du);
      }
    }

    this._cible = meilleure;
    this._contacts = n;
  }

  // --- Les satellites ---

  _satellites(dt, game, p, levels, stats) {
    const niveau = Math.max(0, Math.min(SATELLITES.length - 1, levels.missiles | 0));
    const combien = SATELLITES[niveau];
    this.phase += ORBITE_VITESSE * dt;
    if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;

    for (let i = 0; i < this.satellites.length; i++) {
      const g = this.satellites[i];
      if (i >= combien) {
        g.visible = false;
        continue;
      }
      const a = this.phase + (i * Math.PI * 2) / combien;
      g.visible = true;
      g.position.set(
        p.x + Math.sin(a) * ORBITE_RAYON,
        // Une orbite parfaitement plate est vue par la tranche : un léger
        // décalage vertical suffit à la lire comme une orbite et non un cercle.
        Math.cos(a * 2) * 0.22,
        p.z + Math.cos(a) * ORBITE_RAYON * 0.7
      );
      g.rotation.y = a * 1.7;
      g.rotation.x = this.horloge * 1.3;
    }

    // LES ORBES NE TIRENT PLUS.
    //
    // Ils crachaient des éclats vers les côtés, pour couvrir ce que le rayon ne
    // couvre pas. C'était une bonne intention et une mauvaise idée : la fiche de
    // la coque dit « elle ne sait pas faire deux choses à la fois », et on lui
    // avait donné une seconde arme. Le joueur n'avait plus à choisir entre tenir
    // sa colonne et se défendre sur les flancs — la question même que la coque
    // pose. Ils restent en orbite, ils brillent, ils annoncent la puissance : ils
    // ne tuent plus rien.
    //
    // Le code de tir est conservé juste en dessous, inerte, parce qu'il porte le
    // seul endroit du fichier qui explique comment répartir une cadence entre
    // plusieurs sources ; le supprimer perdrait ça pour rien.
    if (!ORBES_TIRENT) return;

    // Un seul minuteur, et les orbes crachent chacun leur tour : la cadence totale
    // reste régulière quand leur nombre change, là où un minuteur par satellite
    // ferait tirer quatre orbes ensemble puis plus rien.
    const parSeconde = CADENCE_SAT * combien * this._ratioCadence(stats);
    const intervalle = 1 / Math.max(0.2, parSeconde);
    this.tirTimer -= dt;
    // Une boucle et non un `if` : à cadence maximale et sur une frame longue il
    // peut y avoir plus d'un éclat à sortir, et l'avaler serait une perte de débit
    // qui ne se verrait qu'en dessous de trente images par seconde.
    let secours = 8;
    while (this.tirTimer <= 0 && secours-- > 0) {
      this.tirTimer += intervalle;
      const i = this.prochain % combien;
      this.prochain = (this.prochain + 1) % combien;
      this._crache(game, this.satellites[i].position, this.phase + (i * Math.PI * 2) / combien);
    }
  }

  _crache(game, depuis, angle) {
    const e = this.eclats.find((x) => !x.actif);
    if (!e) return;
    // On rabat l'angle d'orbite sur l'arc avant : un orbe passé derrière crache
    // quand même vers l'avant, du côté où il se trouve.
    const a = Math.atan2(Math.sin(angle), Math.cos(angle));
    const cote = a >= 0 ? 1 : -1;
    const ouverture = ARC_MIN + (Math.abs(a) / Math.PI) * (ARC_MAX - ARC_MIN);
    e.actif = true;
    e.age = 0;
    e.mesh.position.copy(depuis);
    e.mesh.visible = true;
    e.vel.set(Math.sin(ouverture) * cote, 0, -Math.cos(ouverture)).multiplyScalar(ECLAT_VITESSE);
    e.mesh.lookAt(this._tmp.copy(e.mesh.position).add(e.vel));
    game.audio?.eclatSatellite?.();
  }

  _eclats(dt, game, bord) {
    const enemies = game.enemies.list;
    for (const e of this.eclats) {
      if (!e.actif) continue;
      e.age += dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      // lookAt a mis le +Z local sur la vitesse : tourner autour de z fait rouler
      // l'éclat sur son axe de vol, ce qui l'anime sans le désorienter.
      e.mesh.rotation.z += dt * 9;
      const pos = e.mesh.position;
      if (
        e.age > ECLAT_PORTEE ||
        pos.z < ARENA.bulletCullZMin ||
        pos.z > ARENA.bulletCullZMax ||
        Math.abs(pos.x) > ARENA.bulletCullXMax
      ) {
        e.actif = false;
        e.mesh.visible = false;
        continue;
      }
      for (const cible of enemies) {
        if (!cible.alive) continue;
        const rr = cible.def.radius + ECLAT_RAYON;
        if (pos.distanceToSquared(cible.group.position) >= rr * rr) continue;
        e.actif = false;
        e.mesh.visible = false;
        game.fx.burst(pos, CHAUD, { count: 4, speed: 6, life: 0.25 });
        if (game.enemies.damage(cible, ECLAT_DEGATS, game)) {
          game._onEnemyKilled(cible, 'cannon', bord.numero);
        }
        break;
      }
    }
  }

  // --- Rendu ---

  _rendu(dt, game, p, nezZ, demi, duree, actif, tube, evase = 0) {
    if (!actif) {
      this.trait.groupe.visible = false;
      this.couture.groupe.visible = false;
      this.nez.visible = false;
      for (const brin of this.helice) for (const x of brin) x.visible = false;
      for (const f of this.fuites) {
        f.vie = 0;
        f.mesh.visible = false;
      }
      for (const i of this.impacts) i.visible = false;
      return;
    }

    const charge = Math.min(1, this.tenu / duree);

    // Toute l'arme change de couleur ensemble, du bleu froid au blanc-or : c'est
    // le signal le plus fort de la montée, et il se lit du coin de l'œil.
    this._couleur.copy(this._froid).lerp(this._chaud, charge);
    this.matHalo.color.copy(this._couleur);
    this.matAura.color.copy(this._couleur);
    this.matOrbe.color.copy(this._couleur);
    this.matOrbeHalo.color.copy(this._couleur);
    this.matCoeur.color.setRGB(1, 1 - charge * 0.06, 1 - charge * 0.18);

    // La pulsation s'accélère avec la charge : c'est un cœur qui bat plus vite, et
    // l'œil le comprend sans qu'aucun chiffre soit affiché.
    const bat = Math.sin(this.horloge * (26 + charge * 34));
    // LE RAYON PART FIN. Il naissait déjà à sa pleine largeur, et ne gagnait que
    // 35 % en montant en puissance : on ne voyait donc rien grossir, alors que
    // c'est précisément ce que la coque promet. À froid il ne fait plus qu'un
    // tiers de sa section, et il enfle jusqu'à la dépasser d'un tiers — soit un
    // rapport de quatre entre les deux extrêmes, qui se voit immédiatement.
    const largeur = demi * 2 * (0.32 + charge * 1.02);
    const longueur = nezZ - PORTEE_Z;
    const milieu = (nezZ + PORTEE_Z) / 2;

    this._poseTrait(this.trait, p.x, milieu, largeur, longueur, charge, bat);
    this.trait.groupe.visible = true;

    // La couture : le trait prolongé de l'autre côté de l'arène, aux mêmes
    // conditions que la coque du vaisseau.
    if (this._boucle && ARENA.playerXMax - Math.abs(p.x) < ARENA.wrapGhostZone) {
      const span = ARENA.playerXMax * 2;
      const x = p.x > 0 ? p.x - span : p.x + span;
      this._poseTrait(this.couture, x, milieu, largeur, longueur, charge, bat, tube);
      this.couture.groupe.visible = true;
    } else {
      this.couture.groupe.visible = false;
    }

    // L'HÉLICE. Deux brins qui s'enroulent autour du faisceau et remontent avec
    // lui. Ils se RESSERRENT quand la charge monte — le pas raccourcit et le
    // rayon d'enroulement diminue — pendant que le faisceau, lui, grossit : les
    // deux mouvements contraires donnent l'impression que quelque chose est
    // comprimé là-dedans, et c'est tout ce qu'on cherche à faire comprendre.
    const vitesse = 24 + charge * 30;
    const tours = HELICE_TOURS + charge * HELICE_TOURS_CHARGE;
    const enroule = (largeur * 0.5 + 0.34) * (1.25 - charge * 0.3);
    const avance = (this.horloge * vitesse) % longueur;
    for (let b = 0; b < HELICE_BRINS; b++) {
      const brin = this.helice[b];
      const dephasage = (b / HELICE_BRINS) * Math.PI * 2;
      for (let i = 0; i < HELICE_SEGMENTS; i++) {
        const m = brin[i];
        // Chacune avance le long du rayon et boucle : rien n'est créé ni détruit.
        const t = ((i / HELICE_SEGMENTS) * longueur + avance) % longueur;
        const u = t / longueur;
        const angle = u * tours * Math.PI * 2 + dephasage + this.horloge * 1.5;
        // L'enroulement s'ouvre en s'éloignant : le faisceau s'échappe, il ne
        // reste pas cylindrique jusqu'au bout.
        const r = enroule * (1 + u * 0.55);
        m.visible = true;
        m.position.set(p.x + Math.cos(angle) * r, Math.sin(angle) * r * 0.42, nezZ - t);
        // Les perles maigrissent en s'éloignant : la spirale s'efface au lieu de
        // se couper net à la portée du rayon.
        const taille = (0.1 + charge * 0.09) * (1 - u * 0.55);
        m.scale.setScalar(Math.max(0.012, taille));
      }
    }
    this.matAnneau.opacity = 0.2 + charge * 0.3 + bat * 0.05;

    // LES FUITES. Le faisceau perd de la matière sur les côtés, d'autant plus
    // qu'il est chargé. Elles partent perpendiculairement et s'éteignent vite :
    // ce sont des étincelles, pas un nuage — un nuage masquerait les tirs qui
    // arrivent, ce qui est la seule chose interdite ici.
    this.tFuite -= dt;
    if (this.tFuite <= 0) {
      this.tFuite = 0.055 - charge * 0.03;
      const libre = this.fuites.find((f) => f.vie <= 0);
      if (libre) {
        const u = 0.08 + Math.abs(Math.sin(this.horloge * 7.3)) * 0.55;
        const cote = Math.sin(this.horloge * 11.7) > 0 ? 1 : -1;
        libre.mesh.position.set(p.x + cote * largeur * 0.4, 0, nezZ - u * longueur);
        libre.vx = cote * (2.6 + charge * 4.4);
        libre.vy = (Math.sin(this.horloge * 5.1) * 0.5 + 0.4) * 1.6;
        libre.vz = -3 - charge * 5;
        libre.duree = 0.26 + charge * 0.14;
        libre.vie = libre.duree;
      }
    }
    for (const f of this.fuites) {
      if (f.vie <= 0) {
        f.mesh.visible = false;
        continue;
      }
      f.vie -= dt;
      f.mesh.visible = f.vie > 0;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.z += f.vz * dt;
      const k = Math.max(0, f.vie / f.duree);
      f.mesh.scale.setScalar(0.4 + k * 0.9);
      f.mesh.rotation.x += dt * 9;
      f.mesh.rotation.z += dt * 7;
    }

    // La bouche de l'émetteur.
    this.nez.visible = true;
    this.nez.position.set(p.x, 0, nezZ + 0.25);
    this.nez.rotation.y = this.horloge * 2.4;
    this.nez.rotation.x = this.horloge * 1.6;
    const ouvre = (0.6 + charge * 0.7) * (1 + bat * 0.09) * (0.7 + demi * 0.5);
    this.nezNoyau.scale.setScalar(ouvre);
    this.nezCouronne.scale.set(ouvre * (1.2 + charge * 0.5), ouvre * (1.2 + charge * 0.5), ouvre);
    this.matNez.opacity = 0.6 + charge * 0.3;

    this._impacts(dt, game, p.x, nezZ, demi, charge, evase);

    // Un tremblement continu, proportionnel à la charge. Il ne doit jamais gêner
    // la lecture : c'est un ronronnement, pas un impact. Celui d'un copain se
    // sent de loin, sans plus — voir SECOUSSE_DISTANTE.
    if (this._contacts > 0) {
      game.fx.addShake(0.28 * charge * dt * (this._local ? 1 : SECOUSSE_DISTANTE));
    }
  }

  // Les tubes sont couchés : leur Y local est la LONGUEUR, leur X et leur Z les
  // deux demi-axes de la section. Elle est volontairement aplatie — le jeu se voit
  // de haut, un rayon rond y perdrait toute sa largeur.
  _poseTrait(trait, x, milieu, largeur, longueur, charge, bat, tube) {
    trait.groupe.position.set(x, 0, milieu);
    // Les trois couches partagent le même tronc de cône : elles doivent s'évaser
    // ensemble, sinon le halo déborde du cœur d'un côté et pas de l'autre.
    if (tube && trait.coeur.geometry !== tube) {
      trait.coeur.geometry = tube;
      trait.halo.geometry = tube;
      trait.aura.geometry = tube;
    }
    const k = largeur / 2;
    trait.coeur.scale.set(k * 0.3 * (1 + bat * 0.12), longueur, 0.18 + charge * 0.1);
    trait.halo.scale.set(k * 0.85 * (1 + bat * 0.05), longueur, 0.4 + charge * 0.25);
    // Le voile extérieur déborde d'une MARGE CONSTANTE, pas d'un multiple. En
    // proportion, le rayon large à saturation couvrait un tiers de l'arène : on ne
    // voyait plus ce qu'on brûlait, ce qui est le contraire du but recherché.
    trait.aura.scale.set(k + 0.85, longueur * 0.999, 0.9 + charge * 0.5);
    this.matHalo.opacity = 0.18 + charge * 0.2 + bat * 0.03;
    this.matAura.opacity = 0.05 + charge * 0.07;
    this.matCoeur.opacity = 0.75 + charge * 0.25;
  }

  _impacts(dt, game, bx, nezZ, demi, charge, evase = 0) {
    const enemies = game.enemies.list;
    let n = 0;
    for (const e of enemies) {
      if (n >= IMPACTS) break;
      if (!e.alive) continue;
      const pos = e.group.position;
      if (pos.z > nezZ || pos.z < PORTEE_Z) continue;
      const r = e.def.radius;
      // MÊME TEST QUE LA BRÛLURE, sans quoi les marqueurs d'impact s'arrêteraient
      // au bord de la colonne pendant que le cône continuerait de brûler plus
      // loin. Le joueur croirait alors rater ce qu'il touche.
      if (Math.abs(this._ecartX(pos.x, bx)) > this._demiA(pos.z, nezZ, demi, evase) + r) continue;
      if (Math.abs(pos.y) > 1.4 + r) continue;
      const g = this.impacts[n++];
      g.visible = true;
      g.position.copy(pos);
      g.scale.setScalar((0.8 + charge * 0.9) * (1 + Math.sin(this.horloge * 30 + pos.z) * 0.14));
      g.rotation.z = this.horloge * 3.1;
    }
    for (let i = n; i < IMPACTS; i++) this.impacts[i].visible = false;
    this.matImpact.opacity = 0.45 + charge * 0.35;

    // Le grain de brûlure. Décoratif, donc autorisé à puiser dans Math.random via
    // fx — mais cadencé, sinon il avale à lui seul tout le pool de particules.
    this.grainTimer -= dt;
    if (n > 0 && this.grainTimer <= 0) {
      this.grainTimer = 0.07;
      game.fx.burst(this.impacts[0].position, charge > 0.6 ? CHAUD : 0x8ffbff, {
        count: 2 + Math.round(charge * 3),
        speed: 5 + charge * 6,
        life: 0.3,
        spread: 0.5,
      });
    }
  }

  // --- Son ---

  // Un rayon continu ne peut pas rejouer un son par frame : l'audio entretient un
  // oscillateur et on lui envoie une intensité. On la lui envoie à vingt hertz et
  // non soixante — chaque appel pose une automation dans le graphe WebAudio, et il
  // n'y a rien à gagner à en poser trois fois plus que l'oreille n'en distingue.
  //
  // ET IL NE SONNE QUE POUR SON PILOTE. L'oscillateur entretenu est UNIQUE dans
  // tout le jeu : trois postes qui le pilotent se le disputent, et le
  // `laserCoupe` de celui qui relâche sa détente couperait le rayon des deux
  // autres. Le grondement d'un copain se voit dans l'arène — son trait, ses
  // impacts, ses étincelles — il ne s'entend pas.
  _son(dt, game, p, actif, duree) {
    if (!this._local) return;
    this.audioTimer -= dt;
    if (this.audioTimer > 0) return;
    this.audioTimer = 0.05;
    if (!actif) {
      game.audio?.laserCoupe?.();
      return;
    }
    const charge = Math.min(1, this.tenu / duree);
    // Le son dit deux choses distinctes : que le rayon est allumé, et qu'il MORD.
    // Un laser qui gronde autant dans le vide que dans la chair n'apprend rien.
    const intensite = (this._contacts > 0 ? 0.45 : 0.16) + charge * 0.55;
    game.audio?.laserBoucle?.(Math.min(1, intensite), p.x);
  }

  // --- Cycle de vie ---

  // L'écart latéral entre deux positions, sur une arène qui boucle : franchir la
  // couture ne doit pas compter pour vingt-neuf unités de dérive.

  clear() {
    this.tenu = 0;
    this.grace = 0;
    this.tirTimer = 0;
    this.prochain = 0;
    this.sature = false;
    this.repos = 0;
    this._cible = null;
    this._contacts = 0;
    this.enAttente.clear();
    this.trait.groupe.visible = false;
    this.couture.groupe.visible = false;
    this.nez.visible = false;
    for (const brin of this.helice) for (const x of brin) x.visible = false;
    for (const f of this.fuites) {
      f.vie = 0;
      f.mesh.visible = false;
    }
    for (const i of this.impacts) i.visible = false;
    for (const s of this.satellites) s.visible = false;
    for (const e of this.eclats) {
      e.actif = false;
      e.mesh.visible = false;
    }
    this._audio?.laserCoupe?.();
  }

  // L'état sérialisable. Les éclats en vol n'en font PAS partie, et c'est un choix :
  // l'instantané est pris au début d'une vague, quand le ciel vient d'être vidé.
  // Les dégâts fractionnaires en attente non plus, pour la même raison — à cet
  // instant il n'y a personne dans la colonne, donc rien à retenir.
  //
  // Rien de ce qui sert le multi-poste n'y entre non plus, et c'est voulu : le
  // bord, son vaisseau, sa couture et le fait que le poste soit le mien se
  // relisent à chaque image au début d'`update`. L'instantané ne décrit que la
  // CHAUFFE, qui est la seule chose que l'arme sache d'elle-même.
  instantane() {
    return [
      this.tenu,
      this.grace,
      this.phase,
      this.tirTimer,
      this.prochain,
      this.sature ? 1 : 0,
      this.repos,
    ];
  }

  restaure(etat) {
    this.clear();
    if (!etat) return;
    this.tenu = etat[0] || 0;
    this.grace = etat[1] || 0;
    this.phase = etat[2] || 0;
    this.tirTimer = etat[3] || 0;
    this.prochain = etat[4] || 0;
    this.sature = !!etat[5];
    this.repos = etat[6] || 0;
  }
}
