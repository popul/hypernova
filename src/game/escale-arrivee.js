// L'ARRIVÉE EN ESCALE — on ne se retrouve plus ailleurs, on Y VA.
//
// Le détour dépose le vaisseau dans une escale, et jusqu'ici il s'y trouvait,
// simplement : `setBiome` montait le décor en fondu pendant que la boutique
// s'ouvrait, et le lieu était là sans qu'on ait voyagé. Le reproche est tombé tel
// quel — « il manque une animation quand on choisit la relique, l'idée est de voir
// le vaisseau rentrer dans l'atmosphère de la planète, dans le champ d'astéroïdes,
// ou rejoindre l'anneau de la planète ». Ce fichier raconte les trois derniers
// kilomètres du voyage, et rien d'autre.
//
// TROIS LIEUX, TROIS ARRIVÉES, et c'est là tout l'intérêt : une transition unique
// pour trois destinations ne dirait justement pas où l'on va.
//   · surface  ON PIQUE. Le frottement enflamme la coque, ça secoue, et le
//              redressement ne vient qu'au dernier moment, au ras du sol.
//   · anneaux  ON ARRIVE PAR LE CÔTÉ. Le vaisseau s'incline, longe la nappe, la
//              poussière file de plus en plus vite, puis il remonte dedans.
//   · champ    ON S'ENFONCE. Deux masses passent à trois unités de la coque, le
//              vaisseau se jette de côté, la densité monte jusqu'au cœur.
//
// TROIS SECONDES, PAS PLUS. C'est la contrainte qui a taillé tout le reste : on
// voit cette séquence jusqu'à dix fois par partie, et la dixième ne doit pas
// donner envie de la sauter. Chaque phase a donc été raccourcie jusqu'à la limite
// où elle restait lisible, et pas d'un dixième au-delà.
//
// CE QU'ON EMPRUNTE, ON LE REND. Le vaisseau et la caméra appartiennent à
// l'appelant : leur état est relevé dans `start()` et reposé à l'identique par
// `_repose()`, qui est le SEUL chemin de sortie — la fin normale comme
// l'annulation passent par lui. Les trois trajectoires se terminent d'ailleurs
// déjà exactement sur la pose de départ ; `_repose()` ne fait que garantir
// l'exactitude au centième. Rien d'autre n'est touché : ni le décor, ni les
// lumières, ni le brouillard, qui continuent leur fondu de leur côté.
//
// LA CAMÉRA NE S'ÉCRIT PAS DEPUIS ICI — ou plutôt : pas seulement, et c'est le
// piège principal du fichier. main.js repose la caméra à CHAQUE image, après
// `game.update()`, sauf si `game.cameraOverride` est renseigné. Écrire dans
// `camera.position` depuis un module de jeu ne sert donc à rien : l'écriture est
// effacée dans la même frame, et c'est le genre de bug qu'on met une heure à voir
// parce que « le code est pourtant bien exécuté ». D'où le protocole, identique à
// celui de la cinématique :
//
//   `update()` RENVOIE le descripteur { pos, look, roll, fov }, et c'est lui qu'il
//   faut poser dans `game.cameraOverride` tant que `actif` est vrai. Il renvoie
//   null à la dernière image : l'appelant remet alors `cameraOverride` à null et
//   main.js reprend la main sur la caméra qu'on vient de lui rendre.
//
// La caméra est malgré tout écrite en direct, pour deux raisons : les effets se
// placent par rapport à elle — le voile, surtout, doit couvrir l'écran —, et la
// séquence reste regardable si l'appelant ignore la valeur de retour. Et si
// quelqu'un d'autre repose la caméra derrière notre dos, on s'en aperçoit : voir
// `_maitre`, qui est la réponse à ce piège-là.
//
// BUDGET, mesuré et non estimé. Six objets ajoutés à la scène, donc six appels de
// dessin au plus absolu ; à l'exécution il n'y en a jamais plus de CINQ allumés en
// même temps, et quatre aux anneaux. Les six géométries font 1 698 triangles pools
// pleins ; en pratique le pire des trois lieux est le champ, avec 1 454 triangles à
// son maximum de densité (194 traits vivants et douze masses). Trois textures
// fabriquées au canevas, aucune chargée d'un fichier. Tout est alloué au
// constructeur : `update()` ne crée rien, pas même un Vector3 — les vecteurs de
// travail sont des champs.

import * as THREE from 'three';

// --- Durées ------------------------------------------------------------------
//
// Trois secondes deux pour la surface, parce que l'entrée atmosphérique a trois
// temps à raconter (le piqué, la chauffe, le redressement) ; deux secondes neuf
// pour les anneaux, qui n'en ont que deux ; trois secondes pour le champ, dont les
// deux évitements ont besoin de respirer l'un après l'autre sous peine de se lire
// comme un seul zigzag.
const DUREE = { surface: 3.2, anneaux: 2.9, champ: 3.0 };

// Pool de traits. LA TAILLE SE MESURE, elle ne se devine pas : à deux cent vingt,
// les anneaux et le champ SATURAIENT — le curseur circulaire revenait sur des
// traits encore vivants et les effaçait au milieu du cadre. Le compte à tenir est
// débit × durée de vie : 360 × 0,58 pour les anneaux, 280 × 0,70 pour le champ,
// 470 × 0,30 pour la surface, soit deux cent sept au pire. Trois cents laissent la
// marge des frames longues, où l'émission rattrape son retard d'un coup.
const STRIES = 300;

// Les masses du champ. Douze suffisent parce que deux d'entre elles sont
// SCÉNARISÉES — elles passent au ras du vaisseau à l'instant exact de chaque
// évitement. Le reste ne fait que peupler ; en ajouter n'aurait rendu la scène ni
// plus dense ni plus lisible, seulement plus chère.
const MASSES = 12;

// Le nez pique vers le BAS quand `rotation.x` est NÉGATIF. Ce n'est pas évident,
// et ça se déduit de la géométrie plutôt que des commentaires existants :
// `createPlayerShip` couche le cône du fuselage par `rotation.x = -π/2`, ce qui
// envoie sa pointe sur -Z ; une rotation POSITIVE autour de X remonte donc -Z vers
// +Y, c'est-à-dire lève le nez. (jump.js dit l'inverse en toutes lettres pour la
// même valeur — sa séquence est vue de si haut que le mot n'a pas été vérifié.)
const PIQUE = -1;

// Écart toléré entre la caméra qu'on a écrite et celle qu'on retrouve à l'image
// suivante. En dessous, c'est le tremblement d'écran que main.js ajoute par-dessus
// notre position ; au-dessus, quelqu'un d'autre commande la caméra et on lui rend
// la main. Le tremblement de fx plafonne à 1,9 unité (1,4 × 1,0 × 0,8 sur un
// trauma saturé) et nos décalages de cadrage valent 11 à 16 unités : trois unités
// tombent franchement entre les deux, la détection ne peut ni se déclencher par
// accident ni passer à côté du cas qu'elle guette.
const TOLERANCE_CAM = 3;

// LE SOLEIL, ET POURQUOI CETTE SÉQUENCE NE LÈVE JAMAIS LES YEUX.
//
// C'est le piège qui a coûté le plus cher, et il ne se voit dans aucun fichier de
// décor. `createSun()` pose l'astre en (0 ; 34 ; -150) — treize unités AU-DESSUS
// de la caméra, à cent quatre-vingts devant —, il n'est pas tone-mappé, son halo
// est additif, et le bloom l'étale. Sa hauteur apparente est donc de quatre degrés
// à peine au-dessus de l'horizontale, quand le cadrage de repos plonge de
// trente-cinq degrés pour un demi-champ vertical de vingt-huit : il ne reste que
// ONZE DEGRÉS de marge au-dessus du bord haut de l'image.
//
// La première version levait la caméra de treize unités et visait le vaisseau qui
// tombait. Résultat mesuré à l'écran : le Soleil arrivait en plein milieu du cadre
// et l'image entière virait au blanc — pas un éblouissement, une page blanche. Et
// le pire palier n'est pas Mars (rayon 17) mais l'ORBITE TERRESTRE, qui a elle
// aussi une escale de surface et un Soleil de rayon 26.
//
// D'où la règle qui commande tout le cadrage de ce fichier : la caméra se DÉPLACE,
// elle ne se RÉORIENTE presque pas. Le point visé ne suit jamais le vaisseau ; il
// reste celui du jeu, décalé d'un petit vecteur constant par lieu — et toujours
// vers le BAS. Le vaisseau traverse un cadre stable au lieu d'être poursuivi par
// lui, ce qui est de toute façon le plan le plus lisible des deux.

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lissage = (t) => t * t * (3 - 2 * t);

// Une rampe bornée entre deux instants de la séquence. Tout le découpage en phases
// passe par elle : c'est plus lisible qu'une cascade de `if`, et surtout ça permet
// à deux phases de SE CHEVAUCHER, ce dont une cascade est incapable — or c'est
// exactement ce qu'on veut ici, où le redressement commence pendant que la chauffe
// n'a pas fini.
const rampe = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)));

// Une bosse douce centrée sur `c`, nulle et plate en dehors. Sert aux à-coups
// ponctuels : le frôlement d'une masse, le souffle du redressement.
function bosse(u, c, demi) {
  const k = (u - c) / demi;
  if (k <= -1 || k >= 1) return 0;
  const v = 1 - k * k;
  return v * v;
}

// Générateur semé. Le projet en recopie six lignes dans chaque décor plutôt que de
// l'exporter, et on suit l'usage. Il n'est pas ici question de rejouabilité — une
// transition d'interface n'entre dans aucun instantané — mais d'éviter Math.random
// dans une boucle de frame, qui est la règle partout ailleurs. La graine avance
// d'une escale à l'autre : deux arrivées de suite ne se ressemblent pas, et aucune
// n'est vraiment livrée au hasard.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Textures ----------------------------------------------------------------
//
// Même principe que `radialTexture()` dans landmarks.js : rien n'est chargé d'un
// fichier, tout se peint au canevas au démarrage. Trois textures, une par usage.

// Le grain d'un trait. Étiré dans un quad long et fin, un simple dégradé radial
// donne un fuseau à bouts doux — ce qu'aucune couleur unie ne fait : un rectangle
// additif montre ses quatre arêtes, et deux cents rectangles font une grille.
function texGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// La traînée : dense à la tête, éteinte à la queue, effilée sur les bords. Le
// dégradé de longueur est peint d'abord, puis rogné par un dégradé de largeur en
// `destination-in` ; deux passes valent mieux qu'un dégradé conique approximatif,
// et ça ne coûte qu'une fois.
//
// Attention à l'orientation : `CanvasTexture` a `flipY` vrai par défaut, donc la
// LIGNE 0 du canevas se retrouve en v = 1. La tête se peint donc EN HAUT.
function texTrainee() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.globalCompositeOperation = 'destination-in';
  const b = ctx.createLinearGradient(0, 0, 64, 0);
  b.addColorStop(0, 'rgba(0,0,0,0)');
  b.addColorStop(0.5, 'rgba(0,0,0,1)');
  b.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Le voile : une VIGNETTE, transparente au centre, et c'est tout l'intérêt. Un
// voile plein devant l'objectif écrase l'image et fait « écran de chargement » ;
// une vignette laisse le vaisseau net au milieu et ne colore que les bords, là où
// l'œil lit la chaleur sans avoir à la regarder. `fillRect` déborde du rayon du
// dégradé, donc les quatre coins prennent la dernière teinte : c'est voulu.
function texVoile() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.38, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ArriveeEscale {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.type = null;
    this.duree = 0;
    this.t = 0;
    this.onDone = null;
    this.ship = null;
    this._enCours = false;
    this._graine = 1;
    this._alea = rng(1);

    // --- Ce qu'on emprunte, et qu'on rendra ---
    this._shipPos = new THREE.Vector3();
    this._shipRot = new THREE.Euler();
    this._shipVisible = true;
    this._camPos0 = new THREE.Vector3();
    this._camQuat0 = new THREE.Quaternion();
    this._camUp0 = new THREE.Vector3();
    this._fov0 = 0;
    this._fovEcrit = null; // le dernier champ qu'on ait posé, ou null si on n'y a pas touché

    // --- Repères de cadrage, relevés au départ ---
    this.home = new THREE.Vector3(); // la pose dans laquelle le vaisseau sera rendu
    this.camHome = new THREE.Vector3();
    this.lookHome = new THREE.Vector3();

    // La caméra est-elle réellement à nous ? On le VÉRIFIE au lieu de le supposer.
    // Si l'appelant n'a pas câblé `game.cameraOverride`, main.js repose la caméra
    // chez elle à chaque image et tout ce qu'on place par rapport à elle part de
    // travers. On compare donc, chaque image, la caméra retrouvée à celle qu'on
    // avait écrite ; au premier désaccord franc on lâche la caméra pour le reste
    // de la séquence et on se contente d'animer le vaisseau et les effets — ce qui
    // reste tout à fait regardable, alors qu'un voile posé à côté de l'écran, non.
    this._maitre = true;
    this._ecrite = new THREE.Vector3();
    this._aEcrit = false;

    // --- Le descripteur rendu à l'appelant, réutilisé d'une image à l'autre ---
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._cam = { pos: this._camPos, look: this._camLook, roll: 0, fov: 0 };

    // --- Ce que la chorégraphie écrit et que les effets lisent ---
    this._chaleur = 0; // opacité du voile
    this._debit = 0; // traits par seconde
    this._vitesse = 0; // vitesse des traits, unités/s
    this._secousse = 0; // amplitude du tremblement de caméra
    this._trainee = 0; // intensité de la traînée
    this._souffle = 0; // intensité de l'enveloppe de plasma
    this._cadre = 0; // part du décalage de caméra appliquée : nulle au départ ET à la fin
    this._roll = 0; // roulis d'image
    this._cote = 1; // de quel flanc on arrive, aux anneaux
    this._decal = new THREE.Vector3(); // le décalage de POSITION de caméra du lieu
    this._vise = new THREE.Vector3(); // et le décalage du POINT VISÉ, toujours vers le bas
    this._reste = 0; // fraction de trait en attente d'émission
    this._curseur = 0; // rotation dans le pool de traits

    // --- Vecteurs de travail ---
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._e = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._vue = new THREE.Vector3(); // axe de visée, pour tourner les quads vers l'objectif
    this._vit = new THREE.Vector3(); // vitesse du vaisseau, déduite d'une image à l'autre
    this._prec = new THREE.Vector3(); // sa position à l'image précédente
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._eul = new THREE.Euler();
    this._teinte = new THREE.Color();
    this._blanc = new THREE.Color(0xffffff);

    // --- Les six objets ---

    // `map` n'est ajouté que s'il existe : passer `map: undefined` à un matériau
    // fait japper three.js à chaque construction, et trois avertissements par
    // partie dans la console finissent par masquer ceux qui comptent.
    const additif = (color, opacity, map) => {
      const p = {
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      };
      if (map) p.map = map;
      return new THREE.MeshBasicMaterial(p);
    };

    // 1. LES TRAITS. Un seul pool pour les trois lieux : ce sont les mêmes deux
    // triangles, et seuls la couleur, la vitesse et le lieu de naissance changent.
    // Les séparer aurait triplé le coût de dessin pour rigoureusement rien.
    this.matStrie = additif(0xffffff, 0.9, texGrain());
    this.stries = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.matStrie, STRIES);
    this.stries.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.stries.frustumCulled = false;
    this.stries.renderOrder = 6;
    this.stries.visible = false;
    scene.add(this.stries);

    this.pool = [];
    for (let i = 0; i < STRIES; i++) {
      this.pool.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        vie: 0,
        duree: 1,
        long: 1,
        large: 0.1,
      });
    }

    // 2. LES MASSES du champ. Matière lambert et non PBR, pour la raison même du
    // décor qu'elles préfigurent : un caillou mat n'a aucun reflet à montrer, et
    // ces blocs couvrent beaucoup d'écran quand ils passent près.
    this.matMasse = new THREE.MeshLambertMaterial({
      color: 0x888888,
      flatShading: true,
      transparent: true,
      opacity: 0,
    });
    this.masses = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      this.matMasse,
      MASSES
    );
    this.masses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.masses.frustumCulled = false;
    this.masses.visible = false;
    scene.add(this.masses);

    this.blocs = [];
    for (let i = 0; i < MASSES; i++) {
      this.blocs.push({
        pos: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        rayon: 1,
        vitesse: 40,
      });
    }

    // 3. L'ENVELOPPE DE PLASMA. Deux cônes dans un seul appel de dessin : l'onde de
    // choc en avant du nez, le panache derrière. Le cône est OUVERT — un couvercle
    // additif se lit comme un disque plein posé devant la coque.
    this.matSouffle = additif(0xff8a3c, 0.5);
    this.matSouffle.side = THREE.DoubleSide;
    this.souffleMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 16, 1, true),
      this.matSouffle,
      2
    );
    this.souffleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.souffleMesh.frustumCulled = false;
    this.souffleMesh.renderOrder = 6;
    this.souffleMesh.visible = false;
    scene.add(this.souffleMesh);

    // 4. LA TRAÎNÉE. Sa matrice est posée à la main : elle est construite depuis un
    // repère (direction × largeur × normale) et non depuis un triplet
    // position/rotation/échelle, donc `matrixAutoUpdate` l'écraserait à chaque
    // image.
    this.matTrainee = additif(0xffffff, 0.7, texTrainee());
    this.matTrainee.side = THREE.DoubleSide;
    this.traineeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 8), this.matTrainee);
    this.traineeMesh.matrixAutoUpdate = false;
    this.traineeMesh.frustumCulled = false;
    this.traineeMesh.renderOrder = 6;
    this.traineeMesh.visible = false;
    scene.add(this.traineeMesh);

    // 5. LE VOILE. Sans test de profondeur et rendu en dernier : il doit couvrir
    // l'image quoi qu'il arrive. Il est posé LOIN devant l'objectif — dix unités —
    // et deux fois trop grand, et c'est délibéré : à une unité, le moindre écart
    // entre la caméra qu'on croit avoir et celle qui rend vraiment fait glisser le
    // voile en travers de l'écran ; à dix, la même erreur ne se voit plus.
    this.matVoile = additif(0xffffff, 0, texVoile());
    this.matVoile.depthTest = false;
    this.voile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.matVoile);
    this.voile.frustumCulled = false;
    this.voile.renderOrder = 999;
    this.voile.visible = false;
    scene.add(this.voile);

    // 6. L'ONDE : l'anneau qui marque l'instant. Un seul par séquence — c'est un
    // point d'exclamation, et deux points d'exclamation n'en font aucun.
    this.matOnde = additif(0xffffff, 0);
    this.matOnde.side = THREE.DoubleSide;
    this.onde = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 44, 1), this.matOnde);
    this.onde.frustumCulled = false;
    this.onde.renderOrder = 6;
    this.onde.visible = false;
    scene.add(this.onde);

    this._ondeVie = 0;
    this._ondeDuree = 1;
    this._ondeTaille = 1;
    this._ondeLance = false;
    this._ondePlate = false;
    this._ondePos = new THREE.Vector3();
  }

  get actif() {
    return this._enCours;
  }

  // `type` vaut 'surface' | 'anneaux' | 'champ'. Renvoie false si le type est
  // inconnu, ou si le vaisseau manque : l'appelant enchaîne alors directement,
  // sans transition — c'est l'ancien comportement, et il reste correct.
  start({ type, teinte, ship, onDone }) {
    const duree = DUREE[type];
    if (!duree || !ship) return false;
    if (this._enCours) this.annule();

    this.type = type;
    this.duree = duree;
    this.t = 0;
    this.ship = ship;
    this.onDone = onDone || null;
    this._enCours = true;

    // On relève TOUT ce qu'on va bouger, avant d'y toucher.
    this._shipPos.copy(ship.position);
    this._shipRot.copy(ship.rotation);
    this._shipVisible = ship.visible;
    this._camPos0.copy(this.camera.position);
    this._camQuat0.copy(this.camera.quaternion);
    this._camUp0.copy(this.camera.up);
    this._fov0 = this.camera.fov;

    this.home.copy(this._shipPos);
    this.camHome.copy(this._camPos0);
    // Le point visé au repos. On ne peut pas le lire — il vit dans main.js —, et on
    // n'en a pas besoin : `lookAt` donne la même orientation pour N'IMPORTE QUEL
    // point de l'axe de visée. On en prend donc un à trente-six unités, ce qui est
    // la distance réelle entre la caméra et sa cible en paysage, et l'orientation
    // rendue en fin de séquence est rigoureusement celle du départ.
    this.lookHome
      .set(0, 0, -1)
      .applyQuaternion(this._camQuat0)
      .multiplyScalar(36.6)
      .add(this._camPos0);

    this._maitre = true;
    this._aEcrit = false;
    this._fovEcrit = null;
    this._reste = 0;
    this._curseur = 0;
    this._ondeVie = 0;
    this._ondeLance = false;
    this._ondePlate = type === 'anneaux';
    this._roll = 0;
    this._cote = this.home.x > 0 ? -1 : 1;
    this._prec.copy(this.home);
    this._vit.set(0, 0, 0);
    for (const s of this.pool) s.vie = 0;

    this._graine = (this._graine + 7919) >>> 0;
    this._alea = rng(this._graine);

    this._teinte.set(teinte === undefined ? 0x9aa0a8 : teinte);
    this._couleurs();
    if (type === 'champ') this._semeMasses();

    return true;
  }

  // Les couleurs de la séquence découlent de la MATIÈRE du lieu, pas de son ciel :
  // c'est la règle d'escales.js, et c'est ce qui fait qu'arriver sur Europe et
  // arriver dans Valles Marineris ne se ressemblent pas.
  _couleurs() {
    const t = this._teinte;
    if (this.type === 'surface') {
      // L'ablation est blanche-orange quelle que soit la roche : on n'y met qu'un
      // quart de la teinte du lieu, juste assez pour que la glace de Triton ne
      // brûle pas exactement comme la rouille de Mars.
      this.matStrie.color.set(0xffb066).lerp(t, 0.25);
      this.matVoile.color.set(0xff7a2e).lerp(t, 0.18);
      this.matSouffle.color.set(0xff9440).lerp(t, 0.2);
      this.matTrainee.color.set(0xffc890).lerp(t, 0.2);
      this.matOnde.color.set(0xffd2a0);
    } else if (this.type === 'anneaux') {
      // La poussière d'anneaux EST la teinte, éclaircie : c'est de la glace, elle
      // renvoie la lumière au lieu de l'absorber.
      this.matStrie.color.copy(t).lerp(this._blanc, 0.45);
      this.matVoile.color.copy(t).lerp(this._blanc, 0.3);
      this.matTrainee.color.copy(t).lerp(this._blanc, 0.5);
      this.matOnde.color.copy(t).lerp(this._blanc, 0.55);
    } else {
      // Un champ de cailloux est sombre, et son décor l'assume déjà : les débris de
      // la transition n'ont aucune raison d'être les seuls objets lumineux du lieu.
      this.matStrie.color.copy(t).lerp(this._blanc, 0.18);
      this.matVoile.color.copy(t);
      this.matTrainee.color.copy(t).lerp(this._blanc, 0.25);
      this.matOnde.color.copy(t).lerp(this._blanc, 0.4);
      this.matMasse.color.copy(t).multiplyScalar(0.72);
    }
  }

  // ------------------------------------------------------------------- Boucle

  // `dt` doit être le temps RÉEL : une transition d'interface ne s'étire pas parce
  // qu'un ralenti d'esquive traînait encore (même règle que jump.js).
  //
  // Renvoie le descripteur { pos, look, roll, fov } à poser dans
  // `game.cameraOverride`, ou null quand la séquence est finie.
  update(dt) {
    if (!this._enCours) return null;

    // La caméra qu'on retrouve est-elle bien celle qu'on avait laissée ?
    if (
      this._maitre &&
      this._aEcrit &&
      this.camera.position.distanceToSquared(this._ecrite) > TOLERANCE_CAM * TOLERANCE_CAM
    ) {
      this._maitre = false;
    }

    this.t += dt;
    const u = Math.min(1, this.t / this.duree);

    this._chaleur = 0;
    this._debit = 0;
    this._vitesse = 0;
    this._secousse = 0;
    this._trainee = 0;
    this._souffle = 0;
    this._cadre = 0;
    this._roll = 0;
    this._decal.set(0, 0, 0);
    this._vise.set(0, 0, 0);

    if (this.type === 'surface') this._surface(u);
    else if (this.type === 'anneaux') this._anneaux(u);
    else this._champ(u);

    // La vitesse du vaisseau se DÉDUIT de son déplacement au lieu d'être écrite à
    // côté de la trajectoire. Deux formules à tenir d'accord finissent toujours par
    // diverger, et c'est la traînée qui part de travers sans qu'on comprenne
    // pourquoi. Sur la première image elle est nulle, et c'est correct.
    if (dt > 0) this._vit.subVectors(this.ship.position, this._prec).divideScalar(dt);
    this._prec.copy(this.ship.position);

    // LE SAUT DU DÉPART, et pourquoi le vaisseau cligne cinq images. À l'instant où
    // la séquence démarre, il est encore à son poste de combat ; on le téléporte à
    // trente unités de là. Vu de face, c'est un pop franc au milieu de l'écran.
    // Quatre-vingt-dix millisecondes d'invisibilité suffisent à le masquer — c'est
    // le temps qu'il faut à la caméra pour commencer à bouger, et l'œil ne voit
    // alors qu'un vaisseau qui ENTRE dans le cadre, pas un vaisseau qui s'y déplace.
    this.ship.visible = this.t > 0.09;

    this._poseCamera();
    this._effets(dt);

    if (this.t >= this.duree) {
      const fini = this.onDone;
      this._repose();
      this._enCours = false;
      this.onDone = null;
      fini?.();
      return null;
    }
    return this._cam;
  }

  // Annuler n'est pas finir : on rend le vaisseau et la caméra, et on se tait.
  // `onDone` n'est PAS appelé — celui qui coupe la séquence sait par définition ce
  // qu'il veut enchaîner, et l'appeler quand même l'exposerait à une double suite,
  // qui est le pire des deux maux.
  annule() {
    if (!this._enCours) return;
    this._repose();
    this._enCours = false;
    this.onDone = null;
  }

  // Le seul chemin de sortie, emprunté par la fin normale comme par l'annulation.
  // Tout ce qui a été relevé dans `start()` est reposé ici, dans le même ordre.
  _repose() {
    if (this.ship) {
      this.ship.position.copy(this._shipPos);
      this.ship.rotation.copy(this._shipRot);
      this.ship.visible = this._shipVisible;
    }
    // On ne repose la POSE de la caméra que si on l'avait vraiment. Si quelqu'un
    // d'autre la commande, la remettre serait une écriture de trop — et une
    // écriture PÉRIMÉE, par exemple après un changement d'orientation qui a rejoué
    // `fitCamera` et reculé la caméra pour tenir l'arène en portrait.
    if (this._maitre) {
      this.camera.position.copy(this._camPos0);
      this.camera.quaternion.copy(this._camQuat0);
      this.camera.up.copy(this._camUp0);
    }
    // LE CHAMP, LUI, SE REND TOUJOURS, et c'est une correction et non une
    // symétrie : main.js ne le recalcule qu'au redimensionnement, donc un `fov`
    // laissé ouvert de huit pour cent le reste jusqu'à la prochaine rotation de
    // l'écran. Le cas se produit précisément quand on a perdu la caméra en cours de
    // route : on a eu le temps d'écrire un champ élargi, pas celui de le refermer.
    // On ne le rend cependant que s'il vaut encore ce qu'on y avait mis — sinon
    // c'est `fitCamera` qui l'a recalculé depuis, et c'est lui qui a raison.
    if (this._fovEcrit !== null && Math.abs(this.camera.fov - this._fovEcrit) < 1e-3) {
      this.camera.fov = this._fov0;
      this.camera.updateProjectionMatrix();
    }
    this._fovEcrit = null;
    this.stries.visible = false;
    this.masses.visible = false;
    this.souffleMesh.visible = false;
    this.traineeMesh.visible = false;
    this.voile.visible = false;
    this.onde.visible = false;
    for (const s of this.pool) s.vie = 0;
    this._aEcrit = false;
  }

  // ------------------------------------------------- Les trois chorégraphies
  //
  // Chacune écrit `ship.position` et `ship.rotation`, et renseigne les grandeurs
  // que les effets vont lire. Toutes se terminent EXACTEMENT sur `home` et sur une
  // rotation nulle : ce n'est pas une élégance, c'est ce qui fait que la reprise en
  // main par le jeu ne se voit pas.

  // SURFACE — l'entrée atmosphérique.
  //
  // Le vaisseau tombe de quinze unités en piquant, la friction l'allume au
  // passage, et il ne se redresse qu'aux quatre cinquièmes de la course. Le
  // redressement est le seul moment où l'on respire, donc le seul qui ait le droit
  // d'être lent ; tout ce qui précède est en accélération.
  _surface(u) {
    const p = this.ship.position;
    const h = this.home;

    // La chute perd sa vitesse verticale en descendant, comme une vraie rentrée :
    // huit unités par seconde au plus fort, puis freinée par l'air. Une chute qui
    // ACCÉLÈRE jusqu'au bout se lit comme un crash, pas comme une arrivée.
    const chute = 1 - Math.pow(1 - rampe(u, 0.02, 0.82), 1.8);
    // Le rase-mottes final : la coque passe un cheveu SOUS son plan de vol avant de
    // s'y reposer. Sans ce creux, le redressement n'est qu'une fin de courbe, et
    // personne ne le remarque.
    // QUINZE UNITÉS, et pas trente : au-dessus, le vaisseau naît hors du bord haut
    // de l'image et il faudrait lever la caméra pour aller le chercher — ce que le
    // Soleil interdit (voir en tête de fichier). Quinze est la plus haute altitude
    // qui tienne dans le cadre au moment où le décalage de caméra finit de monter.
    p.y = THREE.MathUtils.lerp(h.y + 15, h.y, chute) - 0.85 * Math.sin(rampe(u, 0.7, 1) * Math.PI);
    p.z = THREE.MathUtils.lerp(-32, h.z, lissage(u));
    // Le vent de travers. Il meurt exactement à l'arrivée, sinon le vaisseau est
    // rendu à côté de sa colonne de tir.
    p.x = h.x + Math.sin(u * 17) * 1.5 * (1 - u) * (1 - u);

    const redresse = lissage(rampe(u, 0.58, 0.94));
    // Deux termes qui se recouvrent : le nez remonte de son piqué, ET il passe une
    // fraction de seconde au-dessus de l'horizontale. C'est ce dépassement-là qui
    // fait le geste d'un pilote qui cabre, plutôt qu'une courbe qui s'arrête.
    this.ship.rotation.x =
      PIQUE * 0.95 * (1 - redresse) + 0.34 * Math.sin(rampe(u, 0.62, 1) * Math.PI);
    this.ship.rotation.z = Math.sin(u * 21) * 0.14 * (1 - u) * (1 - u);
    this.ship.rotation.y = 0;

    // LA CHAUFFE : nulle en haut, où il n'y a rien à frotter ; maximale au milieu
    // de la descente ; éteinte au redressement. La puissance 1,25 retarde un peu le
    // pic — l'air s'épaissit progressivement, il ne s'allume pas d'un coup.
    const feu = Math.pow(Math.sin(rampe(u, 0.05, 0.88) * Math.PI), 1.25);
    this._chaleur = feu * 0.6;
    this._souffle = feu;
    this._trainee = feu * 0.95;
    this._debit = feu * 470;
    this._vitesse = 26 + feu * 22;
    this._secousse = feu * 0.34 + bosse(u, 0.82, 0.09) * 0.3;

    // La caméra MONTE ET RECULE sans se redresser : le cadre s'ouvre par le haut
    // pour laisser entrer le vaisseau, la plongée reste celle du jeu, et le Soleil
    // reste dehors avec douze degrés de marge. Le décalage part de zéro et y
    // revient : la séquence n'a donc AUCUN raccord, ni au début ni à la fin — pas
    // de coupe, pas de fondu au noir, rien qu'un mouvement continu, ce qui est très
    // exactement ce que « transition fluide » veut dire. La montée est rapide (un
    // quart de seconde) parce que le vaisseau, lui, tombe tout de suite.
    this._cadre = lissage(rampe(u, 0, 0.09)) * (1 - lissage(rampe(u, 0.62, 1)));
    this._decal.set(0, 10, 8);

    // L'onde de redressement : le souffle qui part quand la coque reprend
    // l'horizontale au ras du sol.
    if (!this._ondeLance && u >= 0.84) this._lanceOnde(p, 0.55, 15);
  }

  // ANNEAUX — l'arrivée par le côté.
  //
  // Le vaisseau ne tombe pas dans le plan des anneaux, il le REJOINT : il arrive de
  // trente unités sur le flanc, très incliné, longe la nappe, puis remonte
  // dedans. C'est la seule des trois arrivées qui soit une manœuvre plutôt qu'une
  // chute, et l'inclinaison en est le mot entier.
  _anneaux(u) {
    const p = this.ship.position;
    const h = this.home;
    // On arrive du côté OPPOSÉ à celui où le vaisseau doit être rendu : la traversée
    // est alors la plus longue possible dans le cadre, au lieu de finir dans un coin.
    const cote = this._cote;

    // Course latérale déjà lancée, puis qui se pose. `1-(1-k)^2,4` couvre les deux
    // tiers du chemin dans le premier tiers du temps : c'est ce qui donne
    // l'impression qu'on prend la manœuvre en route et non à son début.
    const avance = 1 - Math.pow(1 - rampe(u, 0, 0.94), 2.4);
    // Trente unités, et pas trente-six comme au premier jet : mesuré depuis le
    // cadrage de repos, trente-six sortait du champ EN PORTRAIT pendant les quatre
    // premiers dixièmes de seconde — soit un septième de la séquence passé à
    // regarder un vaisseau qu'on ne voit pas.
    p.x = h.x + cote * 30 * (1 - avance);

    // L'ALTITUDE, ET LE PIÈGE. La nappe est à y = -15,5 et son plan d'ombre à
    // -10,4. Faire passer le vaisseau DESSOUS était la première version, et elle
    // était fausse : la caméra est au-dessus, la nappe se retrouve entre elle et le
    // vaisseau, et on regarde une séquence d'arrivée dans laquelle on ne voit pas
    // le vaisseau arriver. On rase donc la nappe par le DESSUS, à huit unités et
    // demie, ce qui laisse deux unités de marge au-dessus du plan d'ombre. Si le
    // sentiment de proximité manque à l'œil, c'est la caméra qu'il faut descendre,
    // pas le vaisseau.
    const rase = THREE.MathUtils.lerp(-9.5, -8.5, lissage(rampe(u, 0.12, 0.52)));
    p.y = THREE.MathUtils.lerp(rase, h.y, lissage(rampe(u, 0.62, 1)));
    p.z = THREE.MathUtils.lerp(-18, h.z, lissage(u));

    // L'INCLINAISON. Déjà posée à l'image zéro, accentuée pendant la glisse, remise
    // à plat sur la fin. Le signe suit la convention du jeu : virer vers -X lève
    // l'aile droite, donc `rotation.z` positif — player.js écrit `-vx * 0.035`, ce
    // qui est la même chose vue de l'autre bout.
    const glisse = 1 - lissage(rampe(u, 0.55, 1));
    this.ship.rotation.z = cote * (0.85 + 0.22 * Math.sin(rampe(u, 0, 0.6) * Math.PI)) * glisse;
    // Le nez rentre dans le virage, puis se relève pour la remontée dans le plan.
    this.ship.rotation.y = cote * 0.24 * glisse;
    this.ship.rotation.x = 0.3 * Math.sin(rampe(u, 0.58, 1) * Math.PI);

    // LA POUSSIÈRE QUI ACCÉLÈRE. C'est elle, et pas le vaisseau, qui porte la
    // vitesse : à l'écran, une coque immobile n'en a aucune, une nappe qui file en a
    // forcément une. Débit et vitesse montent ensemble jusqu'aux trois quarts, puis
    // s'éteignent — le décor des anneaux a sa propre poussière, et deux poussières
    // superposées se voient tout de suite.
    const monte = lissage(rampe(u, 0.04, 0.74));
    const sortie = 1 - lissage(rampe(u, 0.8, 1));
    this._debit = (110 + 250 * monte) * sortie;
    this._vitesse = 40 + 78 * monte;
    this._chaleur = 0.24 * monte * sortie;
    this._trainee = 0.85 * sortie;
    this._secousse = 0.08 + 0.13 * monte;

    this._cadre = lissage(rampe(u, 0, 0.16)) * (1 - lissage(rampe(u, 0.6, 1)));
    // On descend de six unités et on se décale du côté d'où l'on vient : la nappe
    // cesse d'être un sol vu de haut pour devenir une surface qu'on longe. Six et
    // non douze : descendre la caméra RELÈVE le Soleil dans le cadre, et douze le
    // faisait entrer par le haut. On compense en visant six unités plus bas, ce qui
    // donne le même sentiment de rasance en plongeant DAVANTAGE au lieu de moins.
    this._decal.set(cote * 6, -6, 5);
    this._vise.set(0, -6, 0);
    // Le roulis d'image accompagne l'inclinaison, à un dixième près. Plus, et le
    // joueur croit que c'est SON vaisseau qui a fait tourner le monde.
    this._roll = cote * 0.15 * this._cadre;

    // L'onde de poussière soulevée quand la coque quitte la nappe pour rejoindre le
    // couloir de jeu. Posée à plat, dans le plan des anneaux : c'est le seul des
    // trois lieux où une onde ait une orientation évidente.
    if (!this._ondeLance && u >= 0.66) this._lanceOnde(p, 0.6, 18);
  }

  // CHAMP — on s'enfonce entre les masses.
  //
  // Deux évitements, pas trois : le troisième transformait la manœuvre en zigzag
  // décoratif, et un zigzag ne se lit pas comme un danger. Chaque écart est
  // JUSTIFIÉ à l'écran par un bloc qui passe du côté d'où l'on s'écarte — sans
  // cette synchronisation, le vaisseau a simplement l'air de flotter.
  _champ(u) {
    const p = this.ship.position;
    const h = this.home;

    // Une sinusoïde de deux périodes, enveloppée par une demi-sinusoïde. Les écarts
    // culminent à 5,4 unités et, surtout, l'enveloppe annule la VITESSE latérale
    // aux deux bouts. Sans elle, le vaisseau part de côté d'un coup au premier
    // écart, et l'inclinaison — déduite de la vitesse — sursaute avec lui.
    const k = rampe(u, 0.1, 0.9);
    p.x = h.x - 7.6 * Math.sin(k * Math.PI * 2) * Math.sin(k * Math.PI);
    p.y = THREE.MathUtils.lerp(h.y + 2.5, h.y, lissage(u)) + Math.sin(u * 26) * 0.45 * (1 - u);
    p.z = THREE.MathUtils.lerp(-32, h.z, lissage(u));

    // L'inclinaison suit la VITESSE latérale mesurée, et non une formule parallèle :
    // c'est la seule façon d'être certain qu'elle ne peut pas se décaler de la
    // trajectoire. Le facteur reprend celui de player.js, à ceci près qu'on
    // s'incline trois fois plus — on esquive, on ne se déplace pas.
    const vx = this._vit.x;
    this.ship.rotation.z = THREE.MathUtils.clamp(-vx * 0.038, -0.95, 0.95);
    this.ship.rotation.y = THREE.MathUtils.clamp(-vx * 0.014, -0.35, 0.35);
    this.ship.rotation.x = PIQUE * 0.2 * (1 - lissage(rampe(u, 0.68, 1)));

    // Les deux frôlements, aux quarts de la sinusoïde : là où l'écart est maximal,
    // c'est-à-dire à l'instant précis où le vaisseau a fini de se pousser hors de
    // la trajectoire du bloc.
    const frole = bosse(u, 0.3, 0.07) + bosse(u, 0.7, 0.07);

    const monte = lissage(rampe(u, 0.04, 0.8));
    const sortie = 1 - lissage(rampe(u, 0.84, 1));
    this._debit = (80 + 200 * monte) * sortie;
    this._vitesse = 52 + 58 * monte;
    // Le voile ne sert ici QU'aux frôlements. Un champ de cailloux est sombre, et un
    // halo permanent lui volerait sa seule qualité ; il ne s'allume donc qu'au
    // passage d'une masse, comme un reflet qui balaie la verrière.
    this._chaleur = 0.34 * frole;
    this._trainee = 0.45 * sortie;
    this._secousse = (0.09 + 0.1 * monte) * sortie + 0.42 * frole;
    this._cadre = lissage(rampe(u, 0, 0.14)) * (1 - lissage(rampe(u, 0.66, 1)));
    // On recule de dix unités et on vise trois plus bas : le couloir s'allonge
    // devant et se referme au-dessus de la tête. La caméra ne descend PAS — les
    // deux champs les plus précoces (L2 et les débris de croisière) ont encore un
    // Soleil de vingt unités de rayon, et le faire entrer dans le cadre effacerait
    // les masses qu'on est venu voir.
    this._decal.set(0, 0, 10);
    this._vise.set(0, -3, 0);

    // L'opacité des masses monte au début et retombe à zéro AVANT la fin : elles
    // doivent avoir disparu quand le décor du champ, qui a ses propres cailloux,
    // reprend la main.
    const vu = lissage(rampe(u, 0, 0.16)) * (1 - lissage(rampe(u, 0.8, 0.98)));
    this.matMasse.opacity = vu;
    this.masses.visible = vu > 0.01;

    if (!this._ondeLance && u >= 0.7) this._lanceOnde(p, 0.45, 11);
  }

  // ---------------------------------------------------------------- Caméra

  _poseCamera() {
    const p = this.ship.position;
    const c = this._cadre;

    // Le suivi latéral du jeu, repris tel quel (main.js : x × 0,22) mais BORNÉ.
    // Aux anneaux le vaisseau démarre à trente unités sur le flanc, et le suivi nu
    // aurait emmené la caméra six unités et demie de côté par-dessus les six du
    // cadrage : la traversée se voyait de trois quarts au lieu de face. La borne le
    // ramène à trois, et le fondu du cadrage le fait naître de zéro.
    const suivi = THREE.MathUtils.clamp((p.x - this.home.x) * 0.22, -3, 3);

    this._camPos.set(
      this.camHome.x + (suivi + this._decal.x) * c,
      this.camHome.y + this._decal.y * c,
      this.camHome.z + this._decal.z * c
    );

    // Le tremblement. On le fabrique ici plutôt que de le demander à `fx` : on n'a
    // pas `fx` sous la main, et surtout un tremblement de transition n'a rien à
    // faire dans la même enveloppe que celui des impacts, qui peut encore être en
    // train de retomber quand la séquence démarre. Trois sinusoïdes de périodes
    // sans rapport : ça ne boucle pas visiblement, et ça ne coûte rien.
    const s = this._secousse;
    if (s > 0) {
      this._camPos.x += Math.sin(this.t * 61.3) * s;
      this._camPos.y += Math.sin(this.t * 47.7 + 1.3) * s;
      this._camPos.z += Math.sin(this.t * 73.1 + 2.6) * s * 0.6;
    }

    // LE REGARD NE POURSUIT PAS LE VAISSEAU. La première version visait la coque à
    // quatre-vingt-huit pour cent, et c'est ce qui allait chercher le Soleil : viser
    // un point lointain à hauteur de vaisseau REDRESSE la caméra, puisque le point
    // visé au repos est très proche (trente unités devant, vingt et une plus bas) et
    // donc très plongeant. On se contente d'un décalage constant, toujours vers le
    // bas, plus le demi-suivi latéral que main.js applique déjà de son côté. Comme
    // tout est multiplié par le fondu du cadrage, la visée d'origine est rendue au
    // centième à la dernière image.
    this._camLook.set(
      this.lookHome.x + (this._vise.x + suivi * 0.5) * c,
      this.lookHome.y + this._vise.y * c,
      this.lookHome.z + this._vise.z * c
    );
    this._cam.roll = this._roll;

    // Le champ s'ouvre de huit pour cent au plus fort de la course. C'est peu, et
    // c'est voulu : au-delà, la distorsion des bords se remarque, et ce qu'on
    // cherche n'est pas un effet mais une sensation de vitesse dont on ne trouve
    // pas la cause.
    this._cam.fov = this._fov0 * (1 + 0.08 * c);

    if (!this._maitre) return;
    this.camera.position.copy(this._camPos);
    this.camera.up.set(Math.sin(this._roll), Math.cos(this._roll), 0);
    this.camera.lookAt(this._camLook);
    if (Math.abs(this.camera.fov - this._cam.fov) > 0.01) {
      this.camera.fov = this._cam.fov;
      this.camera.updateProjectionMatrix();
    }
    // On note le champ tel qu'on LAISSE la caméra, et pas celui qu'on a demandé :
    // c'est cette valeur-là que `_repose()` compare pour savoir si quelqu'un est
    // passé derrière nous entre-temps.
    this._fovEcrit = this.camera.fov;
    this._ecrite.copy(this._camPos);
    this._aEcrit = true;
  }

  // ---------------------------------------------------------------- Effets

  _effets(dt) {
    // Tout ce qui suit s'oriente sur la caméra, et il faut la BONNE : celle qu'on
    // vient d'écrire si on la tient, celle du jeu sinon.
    const camPos = this._maitre ? this._camPos : this.camera.position;
    if (this._maitre) this._vue.subVectors(this._camLook, camPos).normalize();
    else this._vue.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    this._stries(dt);
    this._trace();
    this._enveloppe();
    this._voile(camPos);
    this._anneau(dt, camPos);
    if (this.type === 'champ') this._masses(dt);
  }

  // Les traits. Un quad long et fin, orienté sur SA vitesse et tourné vers
  // l'objectif : c'est la seule construction qui donne un trait de vitesse sans
  // shader. Le repère est fabriqué à la main plutôt qu'avec `lookAt`, qui pose
  // l'axe Z sur la cible et donnerait un disque face au déplacement au lieu d'un
  // trait le long de celui-ci.
  _stries(dt) {
    this._reste += this._debit * dt;
    // Plafond d'émission : une image longue — un retour d'onglet, une compilation
    // de matière — ne doit pas vider le pool d'un coup et effacer tout ce qui
    // volait déjà.
    let n = Math.min(28, Math.floor(this._reste));
    this._reste -= n;
    while (n-- > 0) this._nait();

    let vivants = 0;
    for (let i = 0; i < STRIES; i++) {
      const s = this.pool[i];
      if (s.vie <= 0) continue;
      s.vie -= dt;
      if (s.vie <= 0) continue;
      s.pos.addScaledVector(s.vel, dt);

      const dir = this._a.copy(s.vel);
      const l = dir.length();
      if (l < 1e-4) continue;
      dir.divideScalar(l);
      const droite = this._b.crossVectors(dir, this._vue);
      const d2 = droite.lengthSq();
      // Un trait qui file droit dans l'axe de visée n'a plus de largeur : on lui en
      // donne une arbitraire plutôt que de le faire disparaître, sans quoi une
      // poignée de traits clignote chaque fois que la caméra tourne.
      if (d2 < 1e-6) droite.set(1, 0, 0);
      else droite.multiplyScalar(1 / Math.sqrt(d2));
      const normale = this._c.crossVectors(droite, dir);

      // Naissance et mort en fondu, sur la LARGEUR et non sur l'opacité : la matière
      // est partagée par tout le pool, donc son opacité ne peut pas être réglée
      // trait par trait. Un fuseau qui s'affine s'éteint tout aussi bien.
      const k = Math.min(1, s.vie * 8) * Math.min(1, (1 - s.vie / s.duree) * 6 + 0.25);
      droite.multiplyScalar(s.large * k);
      const longue = this._d.copy(dir).multiplyScalar(s.long);
      this._m.makeBasis(droite, longue, normale);
      this._m.setPosition(s.pos);
      this.stries.setMatrixAt(vivants++, this._m);
    }

    this.stries.count = vivants;
    this.stries.visible = vivants > 0;
    this.stries.instanceMatrix.needsUpdate = true;
  }

  // Où naît un trait, et où il va. C'est ici, et nulle part ailleurs, que les trois
  // lieux se distinguent vraiment ; partout ailleurs ce sont les mêmes deux
  // triangles.
  _nait() {
    const r = this._alea;
    // Le curseur circulaire seul écrase des traits ENCORE VIVANTS dès que le pool
    // sature, et ça se voit : des fuseaux qui s'éteignent en plein cadre au lieu de
    // sortir par le bord. Le pool a été dimensionné pour que ça n'arrive pas, mais
    // une frame longue peut le remplir quand même ; on cherche donc une place libre
    // sur huit essais avant d'abandonner et de recycler la plus ancienne, ce qui
    // reste préférable à ne rien émettre du tout.
    let s = this.pool[this._curseur];
    for (let essai = 0; essai < 8 && s.vie > 0; essai++) {
      this._curseur = (this._curseur + 1) % STRIES;
      s = this.pool[this._curseur];
    }
    this._curseur = (this._curseur + 1) % STRIES;
    const p = this.ship.position;

    if (this.type === 'surface') {
      // L'ablation : la matière s'arrache de la COQUE et part vers l'arrière du
      // déplacement. Elle naît donc collée au vaisseau, avec juste assez de
      // dispersion pour ne pas former un tube bien net.
      s.pos.set(p.x + (r() - 0.5) * 2.2, p.y + (r() - 0.5) * 1.2, p.z + (r() - 0.5) * 1.6);
      s.vel
        .copy(this._vit)
        .multiplyScalar(-0.55)
        .add(this._e.set((r() - 0.5) * 9, 3 + r() * 7, 5 + r() * 9));
      s.duree = 0.22 + r() * 0.16;
      s.long = 2.6 + r() * 4.5;
      s.large = 0.16 + r() * 0.22;
    } else if (this.type === 'anneaux') {
      // La poussière de la nappe. Elle vit au-dessus d'elle et sous le couloir de
      // jeu (entre -14 et -5), et elle file vers l'objectif : c'est le défilement,
      // et il est d'autant plus lisible que tous les traits partagent la même
      // direction. La composante latérale est celle de la traversée.
      // La bande est centrée à MI-CHEMIN entre le vaisseau et son poste, et non
      // sur le vaisseau : à l'image zéro il est trente unités sur le flanc, et une
      // poussière qui le suivrait laisserait le couloir de jeu entièrement vide,
      // c'est-à-dire l'endroit précis que la caméra regarde.
      s.pos.set((p.x + this.home.x) * 0.5 + (r() - 0.5) * 70, -14 + r() * 9, -60 - r() * 60);
      s.vel.set(-this._cote * (10 + r() * 12), (r() - 0.5) * 3, this._vitesse * (0.8 + r() * 0.5));
      // Traits courts en durée, longs en géométrie : c'est ce qui tient le pool sous
      // sa taille tout en donnant DAVANTAGE de matière à l'écran qu'une nuée de
      // grains qui vivent longtemps.
      s.duree = 0.35 + r() * 0.45;
      s.long = 7 + r() * 12;
      s.large = 0.1 + r() * 0.16;
    } else {
      // Le menu fretin du champ : des éclats, pas de la poussière. Ils naissent loin
      // et large, et remplissent l'espace entre les grosses masses — sans eux, douze
      // blocs SE COMPTENT, et un champ qui se compte n'est pas un champ.
      s.pos.set((r() - 0.5) * 70, -9 + r() * 20, -75 - r() * 55);
      s.vel.set((r() - 0.5) * 5, (r() - 0.5) * 4, this._vitesse * (0.75 + r() * 0.6));
      s.duree = 0.45 + r() * 0.5;
      s.long = 4 + r() * 8;
      s.large = 0.13 + r() * 0.2;
    }
    s.vie = s.duree;
  }

  // La traînée : un ruban tendu derrière le vaisseau, dont la longueur suit sa
  // vitesse réelle. La tête de la texture est en v = 1, donc à l'extrémité +Y du
  // repère : on fait pointer ce +Y vers l'AVANT et on recule le centre d'une
  // demi-longueur, ce qui pose la tête pile sur la coque.
  _trace() {
    const k = this._trainee;
    const v = this._vit.length();
    if (k <= 0.02 || v < 1) {
      this.traineeMesh.visible = false;
      return;
    }
    const dir = this._a.copy(this._vit).divideScalar(v);
    const droite = this._b.crossVectors(dir, this._vue);
    const d2 = droite.lengthSq();
    if (d2 < 1e-6) droite.set(1, 0, 0);
    else droite.multiplyScalar(1 / Math.sqrt(d2));
    const normale = this._c.crossVectors(droite, dir);

    const longueur = Math.min(26, 2 + v * 0.4) * (0.5 + k * 0.5);
    droite.multiplyScalar(1.1 + k * 1.5);
    const longue = this._d.copy(dir).multiplyScalar(longueur);
    this._m.makeBasis(droite, longue, normale);
    this._m.setPosition(this._p.copy(this.ship.position).addScaledVector(dir, -longueur * 0.5));
    this.traineeMesh.matrix.copy(this._m);
    this.traineeMesh.matrixWorldNeedsUpdate = true;
    this.matTrainee.opacity = 0.62 * k;
    this.traineeMesh.visible = true;
  }

  // L'enveloppe de plasma : l'onde de choc devant le nez, le panache derrière.
  // Réservée à l'entrée atmosphérique — c'est le seul des trois lieux où il y ait
  // quelque chose à frotter.
  _enveloppe() {
    const k = this._souffle;
    if (this.type !== 'surface' || k <= 0.02) {
      this.souffleMesh.visible = false;
      return;
    }
    const v = this._vit.length();
    // Faute de vitesse mesurable — la première image —, on se rabat sur l'axe du
    // vaisseau : mieux vaut une enveloppe posée droit qu'une enveloppe absente.
    const dir = v > 1 ? this._a.copy(this._vit).divideScalar(v) : this._a.set(0, 0, -1);
    const axeA = this._b.crossVectors(dir, this._vue);
    const a2 = axeA.lengthSq();
    if (a2 < 1e-6) axeA.set(1, 0, 0);
    else axeA.multiplyScalar(1 / Math.sqrt(a2));
    const axeB = this._c.crossVectors(axeA, dir);
    const p = this.ship.position;

    // L'onde de choc : pointe une unité devant le nez, base une unité et demie
    // derrière. Elle SERRE la coque — un cône large ne se lit plus comme une
    // compression d'air mais comme un abat-jour.
    const rc = 1.1 + k * 0.75;
    this._m.makeBasis(
      this._d.copy(axeA).multiplyScalar(rc),
      this._e.copy(dir).multiplyScalar(2.6),
      this._p.copy(axeB).multiplyScalar(rc)
    );
    this._m.setPosition(this._p.copy(p).addScaledVector(dir, -0.3));
    this.souffleMesh.setMatrixAt(0, this._m);

    // Le panache : pointe sur la coque, base loin derrière et large. C'est lui qui
    // porte le feu ; il grandit avec la chauffe.
    const lp = 5 + k * 9;
    const rp = 0.9 + k * 2.2;
    this._m.makeBasis(
      this._d.copy(axeA).multiplyScalar(rp),
      this._e.copy(dir).multiplyScalar(lp),
      this._p.copy(axeB).multiplyScalar(rp)
    );
    this._m.setPosition(this._p.copy(p).addScaledVector(dir, -lp * 0.5));
    this.souffleMesh.setMatrixAt(1, this._m);

    this.souffleMesh.instanceMatrix.needsUpdate = true;
    this.matSouffle.opacity = 0.16 + 0.3 * k;
    this.souffleMesh.visible = true;
  }

  // Le voile de chaleur, posé loin devant l'objectif et deux fois trop grand, pour
  // les raisons expliquées à sa construction.
  _voile(camPos) {
    if (this._chaleur <= 0.004) {
      this.voile.visible = false;
      return;
    }
    const d = 10;
    const haut = 2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * 1.9;
    this.voile.position.copy(camPos).addScaledVector(this._vue, d);
    // Le quad reprend l'orientation de la caméra, roulis d'image compris : on le
    // place dans l'axe puis on le fait regarder l'objectif, ce qui revient au même
    // et évite de recopier un quaternion qui n'est peut-être pas encore à jour.
    this.voile.up.set(Math.sin(this._roll), Math.cos(this._roll), 0);
    this.voile.lookAt(camPos);
    this.voile.scale.set(haut * Math.max(1, this.camera.aspect), haut, 1);
    this.matVoile.opacity = this._chaleur;
    this.voile.visible = true;
  }

  _lanceOnde(pos, vie, taille) {
    this._ondeLance = true;
    this._ondeVie = vie;
    this._ondeDuree = vie;
    this._ondeTaille = taille;
    this._ondePos.copy(pos);
  }

  _anneau(dt, camPos) {
    if (this._ondeVie <= 0) {
      this.onde.visible = false;
      return;
    }
    this._ondeVie -= dt;
    if (this._ondeVie <= 0) {
      this.onde.visible = false;
      return;
    }
    const k = 1 - this._ondeVie / this._ondeDuree;
    this.onde.position.copy(this._ondePos);
    if (this._ondePlate) this.onde.rotation.set(-Math.PI / 2, 0, 0);
    else this.onde.lookAt(camPos);
    // L'expansion décélère : un anneau qui grandit à vitesse constante se lit comme
    // un cercle qu'on redimensionne, pas comme un souffle qui se dissipe.
    this.onde.scale.setScalar(0.6 + this._ondeTaille * easeOut(k));
    this.matOnde.opacity = 0.85 * (1 - k) * (1 - k);
    this.onde.visible = true;
  }

  // --------------------------------------------------- Les masses du champ

  // Semées au démarrage de la séquence, et pratiquement pas recyclées : elle dure
  // trois secondes, et une masse met deux secondes à traverser le cadre. Deux
  // d'entre elles ne sont pas semées mais PLACÉES, à rebours de l'instant où elles
  // doivent frôler le vaisseau — c'est la seule façon d'être sûr que l'écart du
  // pilote a une cause visible à l'image, plutôt qu'une chance sur trois d'en avoir
  // une.
  _semeMasses() {
    const r = this._alea;
    const h = this.home;
    for (let i = 0; i < MASSES; i++) {
      const b = this.blocs[i];
      b.rot.set(r() * 6.283, r() * 6.283, r() * 6.283);
      b.spin.set((r() - 0.5) * 1.1, (r() - 0.5) * 1.1, (r() - 0.5) * 0.8);
      if (i < 2) {
        // Les deux frôlements, à 0,30 et 0,70 de la séquence — les sommets exacts de
        // la sinusoïde d'évitement, où le vaisseau est à 5,37 unités de son axe. Le
        // bloc est posé du côté OPPOSÉ à l'écart, à trois unités de la coque une
        // fois son rayon retranché, et son point de départ se calcule à rebours de
        // sa vitesse pour qu'il y soit à l'instant dit.
        const quand = i === 0 ? 0.3 : 0.7;
        const cote = i === 0 ? 1 : -1;
        b.rayon = 4.5 + r() * 3;
        b.vitesse = 62 + r() * 12;
        b.pos.set(
          h.x + cote * (5.37 + b.rayon + 3.2),
          h.y + 0.5 + r() * 3,
          THREE.MathUtils.lerp(-32, h.z, lissage(quand)) - b.vitesse * quand * this.duree
        );
      } else {
        b.rayon = 2.2 + r() * 5.5;
        b.vitesse = 44 + r() * 34;
        b.pos.set((r() - 0.5) * 62, -8 + r() * 19, -30 - r() * 130);
      }
    }
  }

  _masses(dt) {
    for (let i = 0; i < MASSES; i++) {
      const b = this.blocs[i];
      b.pos.z += b.vitesse * dt;
      b.rot.x += b.spin.x * dt;
      b.rot.y += b.spin.y * dt;
      b.rot.z += b.spin.z * dt;
      // Passé la caméra, on renvoie au fond. Cinquante-deux unités, comme dans le
      // décor du champ : c'est la valeur qui tient aussi en portrait, où la caméra
      // recule jusqu'à z = 39.
      if (b.pos.z > 52) b.pos.z = -150;
      this._q.setFromEuler(this._eul.copy(b.rot));
      this._m.compose(b.pos, this._q, this._p.setScalar(b.rayon));
      this.masses.setMatrixAt(i, this._m);
    }
    this.masses.instanceMatrix.needsUpdate = true;
  }
}
