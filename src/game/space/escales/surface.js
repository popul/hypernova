// L'ESCALE DE SURFACE — le rase-mottes.
//
// Onze secteurs de vide, et le reproche est tombé tout seul : « c'est trop
// redondant l'espace ». Ce décor-ci est la réponse la plus littérale des trois :
// on descend, et le sol DÉFILE. Rien d'autre ne donne aussi vite la sensation
// d'aller vite — dans le vide, un vaisseau immobile à l'écran n'a aucune vitesse,
// alors qu'à trente unités d'un sol qui passe, il en a forcément une.
//
// Deux contraintes de cadrage commandent tout le dessin, et elles ne sont pas
// évidentes tant qu'on n'a pas ouvert main.js :
//
//  1. LA CAMÉRA REGARDE VERS LE BAS. Elle est à (0, 21, 27) et vise (0, 0, -3),
//     soit 35° de plongée pour un demi-champ vertical de 28°. L'horizon est donc
//     HORS CADRE en paysage : le sol ne borde pas l'image, il la remplit. Un
//     décor de sol est ici, littéralement, le fond de tous les combats — d'où un
//     sol sombre, un fondu agressif, et pas une seule surface additive au-dessus
//     de la ligne des ennemis.
//  2. LE FONDU EST DANS L'ALPHA DES SOMMETS, et pas seulement dans le
//     brouillard. On lève bien `proche`, donc Space nous laisse le brouillard du
//     secteur ; mais un décor ne devrait pas dépendre d'un réglage qui vit dans
//     un autre fichier pour rester lisible. Le fondu cuit dans la géométrie tient
//     tout seul, et il a un avantage propre : il finit en TRANSPARENT, pas en
//     noir. Le bord lointain du maillage disparaît donc quelle que soit la
//     couleur de fond du secteur, ce qu'aucun dégradé vers une teinte choisie
//     ici ne pourrait garantir.
//
// Budget tenu : trois appels de dessin (le sol, les rochers instanciés, la
// poussière), 12 870 triangles, une seule texture générée de 32×32.

import * as THREE from 'three';

// --- Aléa -------------------------------------------------------------------
// Le même générateur semé que landmarks.js. Il n'y est pas exporté, et l'exporter
// obligerait à modifier un fichier qui n'a rien demandé : on recopie les six
// lignes. Deux parties de même graine doivent traverser le même paysage.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Le générateur séquentiel ne convient PAS au terrain. Celui-ci est fabriqué une
// rangée à la fois, indéfiniment, et il faut pouvoir demander la hauteur d'un
// point arbitraire — celle sous un rocher, par exemple — sans dérouler toute la
// suite depuis le début. D'où un hachage de coordonnées : sans état, donc
// interrogeable dans le désordre, et déterministe à la graine près.
function hache(ix, iz, graine) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = (h ^ Math.imul(graine, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bruit de valeur bilinéaire, lissé en smoothstep. Pas de Perlin : à cette
// distance et sur des facettes de deux unités, la différence ne se voit pas, et
// celui-ci coûte quatre hachages.
function bruit(x, z, graine) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hache(ix, iz, graine);
  const b = hache(ix + 1, iz, graine);
  const c = hache(ix, iz + 1, graine);
  const d = hache(ix + 1, iz + 1, graine);
  const bas = a + (b - a) * ux;
  return bas + (c + (d - c) * ux - bas) * uz;
}

function fbm(x, z, graine, octaves) {
  let somme = 0;
  let amp = 0.5;
  let total = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    somme += bruit(x * f, z * f, graine + o * 101) * amp;
    total += amp;
    amp *= 0.5;
    f *= 2;
  }
  return somme / total;
}

// --- Le relief --------------------------------------------------------------
//
// Trois échelles, et chacune répond à une question différente. Un terrain qui
// n'en a qu'une se lit comme une nappe froissée, quelle que soit son amplitude :
// c'est le RAPPORT entre les échelles qui donne la taille, pas l'amplitude.
//
//  · la houle : où l'on est. Elle fait monter et descendre l'horizon.
//  · les crêtes : ce qu'on survole. C'est la seule chose qui produise une
//    silhouette découpée, donc la seule qui donne la vitesse quand elle passe.
//  · les cratères et les canyons : l'ÉCHELLE. Un cratère a une taille qu'on
//    connaît d'avance ; sans eux, le sol pourrait aussi bien être une plage vue
//    de trois mètres.
const MAILLE_CRATERES = 46;

// Bol paraboloïde plus bourrelet. Le bourrelet compte autant que le creux : sans
// lui on lit une flaque sombre, avec lui on lit un impact.
function crateres(x, z, graine) {
  let h = 0;
  const cx = Math.floor(x / MAILLE_CRATERES);
  const cz = Math.floor(z / MAILLE_CRATERES);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const gx = cx + i;
      const gz = cz + j;
      const tirage = hache(gx, gz, graine);
      if (tirage > 0.45) continue; // moins d'une maille sur deux : un semis régulier se voit
      const rayon = 7 + hache(gx, gz, graine + 3) * 13;
      const px = (gx + 0.15 + hache(gx, gz, graine + 1) * 0.7) * MAILLE_CRATERES;
      const pz = (gz + 0.15 + hache(gx, gz, graine + 2) * 0.7) * MAILLE_CRATERES;
      const d = Math.hypot(x - px, z - pz) / rayon;
      if (d > 1.4) continue;
      const prof = 2.4 + tirage * 11;
      const bord = (d - 1.02) * 5.5;
      h += -prof * Math.max(0, 1 - d * d) + prof * 0.42 * Math.exp(-bord * bord);
    }
  }
  return h;
}

// Les canyons suivent les lignes de crête d'un bruit très basse fréquence : elles
// serpentent, se ramifient et se referment toutes seules. Un canyon dessiné à la
// main aurait fallu le recycler à l'infini ; celui-ci est une propriété du champ.
function canyon(x, z, graine) {
  const c = Math.abs(fbm(x / 108, z / 108, graine, 2) * 2 - 1);
  const k = Math.max(0, 1 - c / 0.13);
  return 9.2 * k * k * (3 - 2 * k);
}

function relief(x, z, graine) {
  const houle = (fbm(x / 62, z / 62, graine, 4) - 0.5) * 6.6;
  const dos = 1 - Math.abs(fbm(x / 30, z / 30, graine + 17, 3) * 2 - 1);
  const cretes = Math.pow(dos, 2.2) * 7.4;
  // Une dernière octave, calée sur DEUX MAILLES ET DEMIE. C'est le seul réglage
  // du fichier qui dépende de la résolution du maillage, et il le doit : plus
  // long, les sommets voisins bougent ensemble et le premier plan devient une
  // nappe fondue ; plus court, il s'aligne sur la grille et on voit le damier.
  // Le rapport non entier est délibéré, c'est lui qui empêche le calage.
  const grain = (bruit(x / 5.5, z / 5.5, graine + 5) - 0.5) * 2.4;
  const brut = houle + cretes + grain + crateres(x, z, graine + 41);
  // Le facteur d'amplitude est ce qu'on a le plus tâtonné. Trop bas, le terrain
  // se lit comme de la boue : vu de trente-neuf unités de haut, quatre unités de
  // dénivelé ne produisent que vingt pour cent d'écart d'éclairement, et l'œil
  // n'y voit rien. Le plafond n'est pas la contrainte — le sol descend d'abord,
  // c'est vers le BAS qu'il y a de la place, et les canyons profonds portent la
  // dramaturgie que les crêtes ne peuvent pas porter sans monter vers le jeu.
  return (brut - canyon(x, z, graine + 73)) * 0.88;
}

// --- Cadrage ----------------------------------------------------------------
const COLS = 88;
// 66 rangées et pas une de plus : le fondu est TOTAL à 128 unités de l'œil,
// soit z = -90 dans l'axe, et la dernière rangée est à -101. Tout ce qu'on
// ajouterait derrière serait du triangle rigoureusement invisible, réémis
// quinze fois par seconde.
const RANGS = 66;
const MAILLE = 2.2;
const X0 = -((COLS - 1) * MAILLE) / 2; // ±95,7 : la largeur du champ à z = -60
const Z0 = 42; // le bord bas du cadre coupe le sol vers z = +5
const SOL = -23; // le plan moyen, vingt-trois unités sous le plan de jeu
const VITESSE = 32; // unités/seconde : assez pour que les crêtes filent

// L'œil de référence. On ne reçoit pas la caméra, et de toute façon `fitCamera`
// la déplace selon le format : ce point est le cadrage paysage, celui qui sert à
// calibrer le fondu. L'erreur en portrait joue sur l'intensité du fondu, jamais
// sur sa présence.
const OEIL_Y = 22;
const OEIL_Z = 30;

// Le fondu atmosphérique, cuit une fois pour toutes dans l'alpha des sommets.
//
// La courbe est calée sur le CAS SANS BROUILLARD, celui où le décor ne peut
// compter que sur lui-même — et la géométrie de la caméra rend le calage bien
// plus serré qu'on ne l'imagine. Comme elle plonge de 35°, le sol qui apparaît
// DERRIÈRE un ennemi est deux fois plus loin que lui : derrière la formation à
// z = -40, on voit le sol de z = -113. C'est donc là que le fondu doit être
// terminé, pas à -40. Avec une courbe plus douce, mesuré, le cinquième d'écran
// où arrive la formation sortait à 118 de luminance de pointe ; il est à 59.
//
// Les bornes se lisent en distance à l'œil et non en z, parce que le sol
// s'éloigne aussi sur les côtés : intact à 50 unités, éteint à 128.
//
// On a essayé de les relâcher une fois le brouillard acquis (58 et 140), en se
// disant qu'il ferait le travail du lointain. Mesuré : avec brouillard, ça ne
// rendait que trois points de luminance au premier plan — il domine déjà tout —,
// mais SANS lui le bas de l'image passait de 78 à 100 et la bande de la
// formation de 59 à 96. Un réglage qui ne gagne rien dans un cas et perd
// beaucoup dans l'autre n'est pas un arbitrage : on garde le serré.
function fondu(x, y, z) {
  const dy = y - OEIL_Y;
  const dz = z - OEIL_Z;
  const d = Math.sqrt(x * x + dy * dy + dz * dz);
  const t = Math.min(1, Math.max(0, (d - 50) / 78));
  const s = t * t * (3 - 2 * t);
  return Math.pow(1 - s, 1.3);
}

// Exagération verticale avec la distance, et affaissement de l'horizon.
//
// Deux tricheries de peintre assumées. La perspective écrase le relief lointain
// bien plus vite qu'elle ne le rétrécit : à quatre-vingts unités, une crête de
// six ne pèse plus rien, alors que le sol occupe encore le tiers de l'image. On
// l'étire donc d'un tiers pour lui rendre sa lisibilité. Et le sol s'affaisse
// au loin — la courbure de la planète —, ce qui a l'utilité annexe de faire
// plonger le fond du maillage au lieu de le laisser finir en falaise.
//
// Le passage d'un régime à l'autre ne se voit pas parce qu'il est lent : une
// crête met cinq secondes à traverser le champ, et le décalage de rangée qui la
// fait changer de gain ne modifie sa hauteur que de quatre centièmes d'unité.
//
// Écrit dans un objet partagé : `profil` est appelé une fois par rocher et par
// image, et quatre-vingts objets jetables par image finissent par se voir.
const PROFIL = { gain: 1, chute: 0 };
function profil(z) {
  const d = Math.max(0, Z0 - z);
  const k = Math.min(1, d / 175);
  PROFIL.gain = 1 + k * k * 0.55;
  PROFIL.chute = -(d * d) / 5600;
  return PROFIL;
}

// --- Texture de poussière ---------------------------------------------------
// Un seul disque flou de 32 pixels, partagé par les quelques centaines de grains.
function grainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSurface({ teinte = 0xb0603a, densite = 1, seed = 1 } = {}) {
  const graine = (seed >>> 0) * 7919 + 13;
  const r = rng(seed + 991);

  const group = new THREE.Group();
  // Tout le décor vit dans un sous-groupe. Space applique aux décors un facteur
  // de cadrage qui descend à 0,35 en portrait — pour une planète lointaine c'est
  // exactement ce qu'il faut, pour un sol c'est fatal : il remonterait de -21 à
  // -7, c'est-à-dire dans le plan de jeu. On le neutralise, sur ce décor et sur
  // lui seul, en compensant à chaque image l'échelle imposée au groupe parent.
  const monde = new THREE.Group();
  group.add(monde);

  const roche = new THREE.Color(teinte);
  // COMPENSATION DE TEINTE. Les escales ne choisissent pas des couleurs, elles
  // choisissent des MATIÈRES, et une glace de Triton (0x8fb8d8) réfléchit deux
  // fois et demie plus qu'une rouille de Mars (0xb0603a). Mesuré : à réglage
  // identique, le sol de Triton sortait à 182 de luminance là où celui de Mars
  // en faisait 154 — la même scène, mais l'une lisible et l'autre laiteuse.
  // On ramène donc chaque monde vers la même clarté à l'écran, sans l'y aplatir
  // tout à fait : l'exposant 0,65 laisse subsister l'écart, il l'empêche juste
  // de décider seul de la lisibilité du combat.
  const lum = 0.2126 * roche.r + 0.7152 * roche.g + 0.0722 * roche.b;
  const eclat = Math.min(1.5, Math.max(0.45, Math.pow(0.22 / Math.max(0.03, lum), 0.65)));
  // La perspective aérienne, à L'ENVERS de la peinture de paysage : le lointain
  // s'ASSOMBRIT au lieu de blanchir. Sur Terre c'est le ciel qui éclaircit les
  // lointains ; ici il n'y a pas de ciel, et surtout la moitié haute de l'image
  // est celle où se battent les ennemis. Un lointain qui pâlit y poserait
  // exactement la nappe claire qu'on s'interdit.
  const voile = roche.clone().multiplyScalar(0.3 * eclat);
  // La poussière, elle, est éclairée par en dessous et par la lune : c'est le
  // seul élément du décor qui ait le droit d'être plus clair que la roche.
  const poudre = roche.clone().lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(eclat);

  // --- Le sol ---------------------------------------------------------------
  const total = COLS * RANGS;
  const positions = new Float32Array(total * 3);
  const couleurs = new Float32Array(total * 4);
  // Hauteurs et couleurs BRUTES, en coordonnées de terrain. Elles glissent d'une
  // rangée à chaque pas ; les tableaux envoyés au GPU, eux, y ajoutent le profil
  // de distance, qui appartient à la rangée et non au terrain.
  const hauteurs = new Float32Array(total);
  const teintes = new Float32Array(total * 3);

  const gains = new Float32Array(RANGS);
  const chutes = new Float32Array(RANGS);
  for (let rg = 0; rg < RANGS; rg++) {
    const p = profil(Z0 - rg * MAILLE);
    gains[rg] = p.gain;
    chutes[rg] = p.chute;
  }

  const geo = new THREE.BufferGeometry();
  for (let rg = 0; rg < RANGS; rg++) {
    const z = Z0 - rg * MAILLE;
    for (let c = 0; c < COLS; c++) {
      const v = rg * COLS + c;
      const x = X0 + c * MAILLE;
      positions[v * 3] = x;
      positions[v * 3 + 2] = z;
      couleurs[v * 4 + 3] = fondu(x, SOL, z);
    }
  }

  // Indices en Uint16 : 7 040 sommets tiennent largement dessous, et un
  // Uint32Array doublerait la mémoire pour rien.
  const index = new Uint16Array((COLS - 1) * (RANGS - 1) * 6);
  let n = 0;
  for (let rg = 0; rg < RANGS - 1; rg++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = rg * COLS + c;
      index[n++] = a;
      index[n++] = a + 1;
      index[n++] = a + COLS;
      index[n++] = a + 1;
      index[n++] = a + COLS + 1;
      index[n++] = a + COLS;
    }
  }
  // Position et couleur sont réécrites à chaque maille franchie — une quinzaine
  // de fois par seconde —, l'index jamais : d'où l'usage dynamique sur les deux
  // premières seulement.
  const attrPos = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const attrCol = new THREE.BufferAttribute(couleurs, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attrPos);
  geo.setAttribute('color', attrCol);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  // Pas d'attribut de normales : `flatShading` les reconstruit par dérivées dans
  // le fragment, et une facette par quad est exactement le rendu voulu. C'est
  // aussi 84 ko de moins à réécrire à chaque pas de défilement.

  const solMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: true,
    // Lambert et pas Standard : le sol couvre la totalité de l'écran et le goulot
    // du jeu est le remplissage, pas les triangles. À rugosité 1 et métal 0, la
    // BRDF complète ne changeait rien de visible et coûtait le double.
    fog: true,
  });
  const sol = new THREE.Mesh(geo, solMat);
  monde.add(sol);

  // --- Les rochers ----------------------------------------------------------
  // Ce qui passe PRÈS. Le terrain seul donne le relief mais pas la vitesse : à
  // quarante unités, une crête met cinq secondes à traverser l'image, un rocher
  // du bas du cadre en met une.
  const nbRochers = Math.max(12, Math.round(78 * densite));
  const cailloux = new THREE.IcosahedronGeometry(1, 0);
  const sommets = cailloux.attributes.position;
  for (let i = 0; i < sommets.count; i++) {
    const s = 0.6 + r() * 0.7;
    sommets.setXYZ(i, sommets.getX(i) * s, sommets.getY(i) * s, sommets.getZ(i) * s);
  }
  cailloux.computeVertexNormals();
  const rochers = new THREE.InstancedMesh(
    cailloux,
    // Plus SOMBRES que le sol, pas plus clairs. À 0,8, mesuré, ils sortaient en
    // confettis orange posés dessus : le sol porte un éclairement rasant cuit
    // dans ses sommets, les rochers non, et à albédo égal ils gagnent toujours.
    new THREE.MeshLambertMaterial({
      color: roche.clone().multiplyScalar(0.45 * eclat),
      flatShading: true,
    }),
    nbRochers
  );
  rochers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nbRochers * 3), 3);
  rochers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rochers.instanceColor.setUsage(THREE.DynamicDrawUsage);
  monde.add(rochers);

  // La bande utile s'arrête au bord bas du cadre : passé z = +16, un rocher est
  // sous l'image et ne coûte plus que du recyclage.
  const Z_ROCHERS = 16;
  const PORTEE_ROCHERS = 124;
  const blocs = [];
  for (let i = 0; i < nbRochers; i++) {
    blocs.push({ z: Z_ROCHERS - (i / nbRochers) * PORTEE_ROCHERS, cycle: i });
  }

  // --- La poussière ---------------------------------------------------------
  // Elle reste BASSE et PROCHE, entre -19 et -10 et jamais au-delà de z = -60.
  // Mesuré au sol : un grain à y = -6 et z = -50 se projette à la hauteur d'écran
  // des ennemis les plus lointains, et un additif à cet endroit efface un tir.
  const nbGrains = Math.max(40, Math.round(240 * densite));
  const pousPos = new Float32Array(nbGrains * 3);
  const pousCol = new Float32Array(nbGrains * 3);
  const cycles = new Int32Array(nbGrains);
  for (let i = 0; i < nbGrains; i++) {
    pousPos[i * 3] = (hache(i, 0, graine + 301) - 0.5) * 96;
    pousPos[i * 3 + 1] = -19 + hache(i, 0, graine + 302) * 9;
    pousPos[i * 3 + 2] = 36 - r() * 96;
  }
  const pousGeo = new THREE.BufferGeometry();
  pousGeo.setAttribute('position', new THREE.BufferAttribute(pousPos, 3));
  pousGeo.setAttribute('color', new THREE.BufferAttribute(pousCol, 3));
  const poussiere = new THREE.Points(
    pousGeo,
    new THREE.PointsMaterial({
      size: 0.85,
      map: grainTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: poudre,
    })
  );
  monde.add(poussiere);

  // --- Fabrication d'une rangée --------------------------------------------
  // Appelée une fois par maille franchie, jamais plus : c'est tout le coût du
  // défilement côté processeur, quatre-vingt-huit points par pas.
  //
  // `rgPrec` désigne la rangée déjà calculée située une maille PLUS PRÈS. Elle
  // donne la pente en z pour rien : au moment où l'on fabrique la rangée du
  // fond, sa voisine est déjà en mémoire. Redemander la hauteur au champ aurait
  // coûté trois évaluations de bruit de plus par sommet, soit le triple du pas.
  function fabriqueRangee(rg, zTerrain, rgPrec) {
    let hGauche = null;
    for (let c = 0; c < COLS; c++) {
      const v = rg * COLS + c;
      const x = X0 + c * MAILLE;
      const h = relief(x, zTerrain, graine);
      hauteurs[v] = h;

      // La normale du champ de hauteur, à partir des deux voisins déjà connus.
      const dx = (h - (hGauche === null ? h : hGauche)) / MAILLE;
      const dz = (hauteurs[rgPrec * COLS + c] - h) / MAILLE;
      hGauche = h;
      const inv = 1 / Math.sqrt(dx * dx + dz * dz + 1);

      // LA LUMIÈRE RASANTE, cuite dans l'albédo.
      //
      // C'est la pièce qui fait tenir tout le décor, et elle est là parce que les
      // lampes de la scène ne peuvent pas le faire : elles tombent d'en haut
      // (6, 14, 8), et sur un sol horizontal elles donnent le même éclairement
      // partout. Mesuré : vingt pour cent d'écart entre une facette plate et une
      // pente à quinze degrés — un terrain fondu, illisible. Un soleil couchant
      // peint ici, à trois dixièmes de hauteur, porte cet écart à quatre pour un
      // sans toucher à la moyenne. Le relief se lit enfin, et le bas de l'image
      // ne s'est pas éclairci d'un cran.
      const ndl = Math.max(0, (-dx * -0.8 + 0.3 + -dz * 0.52) * inv);
      let k = 0.34 + ndl * 1.35;
      // L'albédo suit l'altitude : poussière claire soufflée sur les crêtes,
      // roche nue au fond des creux. C'est ce qui garde un cratère lisible quand
      // il se présente à contre-jour.
      const alt = Math.min(1, Math.max(0, (h + 5) / 11));
      // Le facteur d'ensemble n'est pas cosmétique : à pleine valeur, mesuré, le
      // premier plan sortait à 150 de rouge — une nappe orange vif derrière le
      // vaisseau et les premiers tirs. Un sol de shoot'em up est une matière
      // sombre que la lumière effleure, jamais une source.
      k *= (0.55 + alt * 0.5) * 0.95 * eclat;
      // Mouchetures : sans elles, les facettes se lisent comme du plastique
      // taillé. Longueur d'onde plus courte que la maille, donc chaque sommet
      // tire une valeur presque indépendante et le facettage s'en trouve cassé.
      k *= 0.84 + bruit(x / 6.5, zTerrain / 6.5, graine + 9) * 0.32;

      teintes[v * 3] = roche.r * k;
      teintes[v * 3 + 1] = roche.g * k;
      teintes[v * 3 + 2] = roche.b * k;
    }
  }

  // Recopie hauteurs et teintes dans les tampons GPU en y appliquant le profil de
  // distance et la perspective aérienne.
  function poseRangee(rg) {
    const gain = gains[rg];
    const chute = chutes[rg];
    for (let c = 0; c < COLS; c++) {
      const v = rg * COLS + c;
      positions[v * 3 + 1] = SOL + hauteurs[v] * gain + chute;
      // L'alpha ne bouge jamais : il ne dépend que de la rangée, et la rangée ne
      // se déplace pas. Seule la couleur voyage avec le terrain.
      const v0 = (1 - couleurs[v * 4 + 3]) * 0.55;
      const cr = teintes[v * 3];
      const cg = teintes[v * 3 + 1];
      const cb = teintes[v * 3 + 2];
      couleurs[v * 4] = cr + (voile.r - cr) * v0;
      couleurs[v * 4 + 1] = cg + (voile.g - cg) * v0;
      couleurs[v * 4 + 2] = cb + (voile.b - cb) * v0;
    }
  }

  let parcouru = 0; // distance totale : c'est elle qui convertit monde ↔ terrain
  for (let rg = 0; rg < RANGS; rg++) {
    fabriqueRangee(rg, Z0 - rg * MAILLE, Math.max(0, rg - 1));
    poseRangee(rg);
  }

  const bloc = new THREE.Object3D();
  const couleurBloc = new THREE.Color();

  // Place un rocher : position hachée sur son numéro de cycle — donc rejouable —,
  // assise sur le terrain, et éteinte au loin. L'extinction remplace un fondu
  // d'opacité qui aurait exigé un tri par profondeur pour trois pixels.
  function poseBloc(i) {
    const b = blocs[i];
    // Répartition TRIANGULAIRE, pas uniforme : un rocher garde son x pendant tout
    // son trajet, et le champ visible se resserre en approchant — à z = +7 il ne
    // fait plus que ±40. Semés uniformément sur ±89, les trois quarts sortaient
    // du cadre juste au moment où ils devenaient intéressants.
    const h1 = hache(i, b.cycle, graine + 201);
    const h2 = hache(i, b.cycle, graine + 208);
    const x = (h1 + h2 - 1) * 89;
    const zt = b.z - parcouru;
    const { gain, chute } = profil(b.z);
    const taille = 1 + hache(i, b.cycle, graine + 202) * 2.6;
    // Élancement au cube : presque tous les blocs sont écrasés, un sur dix se
    // dresse. Une distribution uniforme donnait une forêt d'éclats de verre —
    // trop de verticales tue la lecture « caillou » et rend le sol agressif.
    // Le plafond compte aussi : à 2,5 d'élancement, mesuré, les plus gros blocs
    // culminaient à -1, c'est-à-dire DANS le plan de jeu.
    const elan = hache(i, b.cycle, graine + 203);
    const plat = 0.35 + elan * elan * elan * 1.25;
    const f = fondu(x, SOL, b.z);
    // Les rochers sont OPAQUES : ils ne peuvent pas se fondre en transparence
    // comme le sol, et les assombrir seuls les transformait en découpes noires
    // — plus sombres que le fond — flottant là où le sol avait déjà disparu.
    // On les rentre donc dans la brume en les RÉDUISANT, et on leur garde un
    // tiers de clarté pour qu'ils ne creusent jamais un trou dans l'image.
    const vu = Math.min(1, Math.max(0, (f - 0.06) / 0.24));
    const t2 = taille * vu;
    bloc.position.set(x, SOL + relief(x, zt, graine) * gain + chute + t2 * plat * 0.42, b.z);
    bloc.rotation.set(
      hache(i, b.cycle, graine + 204) * 0.5,
      hache(i, b.cycle, graine + 205) * 6.28,
      hache(i, b.cycle, graine + 206) * 0.5
    );
    bloc.scale.set(t2, t2 * plat, t2 * (0.7 + hache(i, b.cycle, graine + 207) * 0.8));
    bloc.updateMatrix();
    rochers.setMatrixAt(i, bloc.matrix);
    const g = 0.3 + f * 0.7;
    couleurBloc.setRGB(g, g, g);
    rochers.setColorAt(i, couleurBloc);
  }
  for (let i = 0; i < nbRochers; i++) poseBloc(i);
  rochers.instanceMatrix.needsUpdate = true;
  rochers.instanceColor.needsUpdate = true;

  const posAttr = geo.attributes.position;
  const colAttr = geo.attributes.color;
  let glissement = 0;

  return {
    group,
    // Ce décor vit DANS la profondeur du combat, pas au fond du ciel : Space doit
    // lui appliquer le régime des décors proches — garder le brouillard (une
    // escale en monte exprès la densité), ne pas le mettre à l'échelle du cadrage,
    // et ne pas l'assombrir d'un tiers puisqu'il règle son ton lui-même.
    proche: true,
    update(dt) {
      // Space impose son facteur de cadrage au groupe ; on le défait ici, et sur
      // ce décor seul. On n'annule qu'un RÉTRÉCISSEMENT : si un jour quelqu'un
      // veut grossir le décor, ce sera son droit.
      const cadrage = Math.min(1, group.scale.x || 1);
      if (monde.scale.x * cadrage !== 1) monde.scale.setScalar(1 / cadrage);

      // dt borné : au retour d'un onglet en veille, il vaut plusieurs secondes,
      // et le décor rattraperait le retard en fabriquant cent rangées d'un coup
      // pour un paysage que personne n'a vu défiler.
      const pas = VITESSE * Math.min(dt, 0.1);
      parcouru += pas;
      glissement += pas;

      // Le maillage glisse d'une maille au plus, puis on décale les données d'une
      // rangée et il revient à sa place. Le raccord est exact — la rangée qui
      // arrive au loin est la seule à être calculée — donc aucune couture, et le
      // terrain n'est jamais ré-échantillonné : les crêtes restent accrochées aux
      // sommets au lieu de NAGER à travers la grille, ce qui est le défaut du sol
      // qu'on déforme sur place et qu'on remarque tout de suite sur une pente.
      let pasFranchis = 0;
      while (glissement >= MAILLE) {
        glissement -= MAILLE;
        hauteurs.copyWithin(0, COLS);
        teintes.copyWithin(0, COLS * 3);
        fabriqueRangee(RANGS - 1, Z0 - (RANGS - 1) * MAILLE + glissement - parcouru, RANGS - 2);
        pasFranchis++;
      }
      if (pasFranchis > 0) {
        for (let rg = 0; rg < RANGS; rg++) poseRangee(rg);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
      sol.position.z = glissement;

      for (let i = 0; i < nbRochers; i++) {
        const b = blocs[i];
        b.z += pas;
        if (b.z > Z_ROCHERS) {
          b.z -= PORTEE_ROCHERS;
          b.cycle += nbRochers;
        }
        poseBloc(i);
      }
      rochers.instanceMatrix.needsUpdate = true;
      rochers.instanceColor.needsUpdate = true;

      // La poussière va un peu plus vite que le sol : c'est faux physiquement, et
      // c'est ce qui la fait lire comme du vent plutôt que comme des cailloux
      // suspendus.
      const vent = pas * 1.25;
      for (let i = 0; i < nbGrains; i++) {
        let z = pousPos[i * 3 + 2] + vent;
        if (z > 36) {
          z -= 96;
          // Réensemencement HACHÉ, pas tiré au sort : un générateur séquentiel
          // serait consommé au rythme des images, et deux machines de cadences
          // différentes ne verraient plus la même poussière à la même graine.
          cycles[i]++;
          pousPos[i * 3] = (hache(i, cycles[i], graine + 301) - 0.5) * 96;
          pousPos[i * 3 + 1] = -19 + hache(i, cycles[i], graine + 302) * 9;
        }
        pousPos[i * 3 + 2] = z;
        // Chaque grain naît et meurt en fondu : un grain qui apparaît d'un coup
        // au fond se remarque plus que le défilement lui-même.
        const f = fondu(pousPos[i * 3], pousPos[i * 3 + 1], z);
        pousCol[i * 3] = pousCol[i * 3 + 1] = pousCol[i * 3 + 2] = f;
      }
      pousGeo.attributes.position.needsUpdate = true;
      pousGeo.attributes.color.needsUpdate = true;
    },
  };
}
