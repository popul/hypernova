// LA CARRIÈRE — des silhouettes et de la matière, à l'usage des décors.
//
// Un astéroïde raté se reconnaît tout de suite : c'est une patate. On prend un
// icosaèdre, on tire ses sommets au hasard, et on obtient une masse bosselée sans
// arête, sans face, sans direction — un galet de rivière. Or un caillou de
// l'espace ne s'est jamais érodé : il s'est BRISÉ. Il n'a que des faces plates et
// des arêtes vives, ses proportions sont franchement inégales, et sa silhouette
// est faite de segments DROITS. C'est cette silhouette-là qu'on fabrique ici, et
// elle ne s'obtient pas en déformant une sphère : on part d'un bloc et on le
// COUPE, exactement comme la nature l'a fait.
//
// Deux moitiés, et elles se partagent le travail proprement :
//
//   • la GÉOMÉTRIE fait la silhouette — ce qu'on lit de loin, en une image, sur
//     le bord de la masse ;
//   • la TEXTURE fait la matière — ce qu'on lit de près, à l'intérieur du bord,
//     quand un colosse couvre la moitié de l'écran.
//
// Chacune est mauvaise au travail de l'autre. Mettre les cratères dans la
// géométrie coûte des centaines de triangles pour un relief de trois pixels ;
// mettre la silhouette dans la texture ne marche pas du tout.
//
// CE QUI EST ICI ET CE QUI N'Y EST PAS. Ce fichier ne connaît ni le placement, ni
// la vitesse, ni le recyclage, ni la garde du couloir de jeu : il rend des
// géométries de rayon 1 et une matière, et rien d'autre. Les décors décident du
// reste. C'est ce qui permet au champ traversé et au champ lointain de partager
// les mêmes cailloux sans partager leurs règles, qui n'ont rien à voir.
//
// LE BUDGET, mesuré. La cible est le mobile, et le goulot y est le remplissage,
// pas la géométrie. D'où trois décisions :
//   — pas de matière PBR : une roche mate n'a pas de reflet spéculaire à montrer ;
//   — pas de relief par défaut : le `bumpMap` de three.js coûte TROIS lectures de
//     texture par pixel (voir `relief` plus bas), sur des masses qui couvrent la
//     moitié de l'image. Le relief des cratères est donc peint dans l'albédo, où
//     il est gratuit ;
//   — une seule texture partagée par toutes les couches d'un même décor.

import * as THREE from 'three';

// Générateur déterministe, repris de landmarks.js : deux parties de même graine
// doivent traverser les mêmes cailloux, sinon ce n'est plus un lieu.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
// Tolérance de coupe. Elle sert deux fois — décider de quel côté d'un plan tombe
// un sommet, et reconnaître deux sommets confondus — et les deux usages veulent la
// même valeur : à l'échelle d'un caillou de rayon 1, deux points distants de
// moins d'un cent-millième sont le même point.
const EPS = 1e-5;

// ============================================================================
// LA GÉOMÉTRIE
// ============================================================================

// Un polyèdre convexe est ici une liste de FACES, chaque face étant un polygone
// convexe donné par ses sommets [x, y, z] dans le sens antihoraire vu de
// L'EXTÉRIEUR. Cette convention n'est pas décorative : c'est elle, et rien
// d'autre, qui décide de quel côté three.js allumera la face. Une face montée à
// l'envers n'est pas sombre, elle est INVISIBLE — et un caillou troué au hasard
// est très difficile à diagnostiquer une fois qu'il tourne.
function boite(demi) {
  const s = demi;
  const c = [
    [-s, -s, -s],
    [s, -s, -s],
    [s, s, -s],
    [-s, s, -s],
    [-s, -s, s],
    [s, -s, s],
    [s, s, s],
    [-s, s, s],
  ];
  return [
    [c[4], c[5], c[6], c[7]],
    [c[1], c[0], c[3], c[2]],
    [c[5], c[1], c[2], c[6]],
    [c[0], c[4], c[7], c[3]],
    [c[3], c[7], c[6], c[2]],
    [c[0], c[1], c[5], c[4]],
  ];
}

// Le capuchon d'une coupe : la section d'un solide convexe par un plan est un
// polygone convexe, donc on n'a pas besoin de chaîner les arêtes coupées. Il
// suffit de ramasser tous les points tombés SUR le plan et de les trier par angle
// autour de leur centre — l'ordre angulaire est le bon ordre, et il l'est
// toujours, précisément parce que le solide est convexe.
function capuchon(points, n) {
  if (points.length < 3) return null;

  // Deux faces voisines produisent le même point de coupe, chacune de son côté :
  // sans ce dédoublonnage, le tri angulaire rendrait un polygone à sommets
  // doubles, et le triangle dégénéré qui en sort donne une normale NaN.
  const uniques = [];
  for (const p of points) {
    let vu = false;
    for (const q of uniques) {
      if (
        Math.abs(p[0] - q[0]) < EPS &&
        Math.abs(p[1] - q[1]) < EPS &&
        Math.abs(p[2] - q[2]) < EPS
      ) {
        vu = true;
        break;
      }
    }
    if (!vu) uniques.push(p);
  }
  if (uniques.length < 3) return null;

  // Une base du plan. On croise `n` avec l'axe dont il est le PLUS ÉLOIGNÉ : avec
  // l'axe le plus proche, le produit vectoriel serait presque nul et la base
  // partirait en vrille numérique.
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  const axe = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  let u = [
    n[1] * axe[2] - n[2] * axe[1],
    n[2] * axe[0] - n[0] * axe[2],
    n[0] * axe[1] - n[1] * axe[0],
  ];
  const lu = Math.hypot(u[0], u[1], u[2]);
  u = [u[0] / lu, u[1] / lu, u[2] / lu];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of uniques) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  cx /= uniques.length;
  cy /= uniques.length;
  cz /= uniques.length;

  // (u, v, n) est direct : vu depuis le côté +n, l'angle croissant tourne dans le
  // sens antihoraire. Le tri ascendant donne donc directement le bon sens.
  return uniques
    .map((p) => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const dz = p[2] - cz;
      const a = Math.atan2(dx * v[0] + dy * v[1] + dz * v[2], dx * u[0] + dy * u[1] + dz * u[2]);
      return { p, a };
    })
    .sort((m, o) => m.a - o.a)
    .map((m) => m.p);
}

// Une coupe : on garde ce qui vérifie p·n ≤ d. Sutherland–Hodgman sur chaque face,
// puis le capuchon. Les faces conservent leur sens de parcours à la découpe, donc
// on n'a à s'occuper du sens que pour le capuchon.
function couper(faces, n, d) {
  const restantes = [];
  const bord = [];
  for (const face of faces) {
    const gardee = [];
    const m = face.length;
    for (let i = 0; i < m; i++) {
      const a = face[i];
      const b = face[(i + 1) % m];
      const da = a[0] * n[0] + a[1] * n[1] + a[2] * n[2] - d;
      const db = b[0] * n[0] + b[1] * n[1] + b[2] * n[2] - d;
      if (da <= EPS) gardee.push(a);
      if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
        const t = da / (da - db);
        gardee.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    if (gardee.length < 3) continue;
    restantes.push(gardee);
    for (const p of gardee) {
      if (Math.abs(p[0] * n[0] + p[1] * n[1] + p[2] * n[2] - d) <= EPS) bord.push(p);
    }
  }
  const cap = capuchon(bord, n);
  if (cap) restantes.push(cap);
  return restantes;
}

// LES ARCHÉTYPES, et c'est le cœur du fichier.
//
// Six formes tirées au hasard donnent six masses qui se ressemblent : le hasard
// tire autour de sa moyenne, et la moyenne d'un caillou est une patate. On impose
// donc les contrastes au lieu de les espérer, et on les parcourt dans l'ordre —
// demander quatre formes garantit d'avoir les quatre PREMIÈRES, qui sont les
// quatre les plus différentes entre elles.
//
//   `e`         l'anisotropie, appliquée après la coupe. C'est elle qui fait les
//               proportions inégales, et elle est cuite dans la géométrie plutôt
//               que laissée à l'échelle d'instance — voir la note sur les UV.
//   `franches`  des coupes PROFONDES, en plus des coupes de forme. Chacune donne
//               une grande face plate : c'est le morceau manifestement cassé.
//   `dispersion` l'étalement des distances de coupe. À zéro, tous les plans sont
//               à la même distance et on obtient un dé taillé ; c'est l'inégalité
//               des distances qui donne des facettes de tailles très différentes.
const ARCHETYPES = [
  // Le bloc. Trapu, presque isotrope, une seule grande cassure. C'est la forme de
  // référence : celle à laquelle les cinq autres doivent se comparer.
  { nom: 'bloc', e: [1, 0.94, 0.88], franches: 1, dispersion: 0.34 },
  // L'éclat. Un axe long, deux écrasés. Un éclat qui tourne lentement se lit
  // immédiatement comme le morceau de quelque chose de beaucoup plus gros — c'est
  // la forme qui raconte le mieux qu'il s'est passé quelque chose ici.
  { nom: 'eclat', e: [1.75, 0.6, 0.5], franches: 2, dispersion: 0.3 },
  // La dalle. Plate. Vue par la tranche elle disparaît presque, vue de face elle
  // occupe tout : la même masse ne fait jamais deux fois la même image.
  { nom: 'dalle', e: [1.3, 0.38, 1.12], franches: 2, dispersion: 0.24 },
  // Le coin. Trois cassures franches qui se rejoignent : un angle vif, et deux
  // faces qui prennent la lumière très différemment de part et d'autre.
  { nom: 'coin', e: [1.14, 1.05, 0.7], franches: 3, dispersion: 0.44 },
  // Le noyau. Aucune cassure franche mais une forte dispersion : beaucoup de
  // petites facettes inégales, aucune grande face. C'est le caillou qui n'a pas
  // cassé net, et il fait respirer le lot.
  { nom: 'noyau', e: [1, 1.06, 0.92], franches: 0, dispersion: 0.5 },
  // La lame. Deux axes longs, un très mince. Cas extrême de la dalle, et le seul
  // qui donne une silhouette VRAIMENT effilée quand elle se présente de profil.
  { nom: 'lame', e: [1.5, 1.22, 0.32], franches: 2, dispersion: 0.28 },
];

// Le nombre de plans de forme selon le niveau de détail. Ces valeurs ne sont pas
// un réglage esthétique, elles sortent d'une mesure de taille apparente — voir la
// note de `geometriesCailloux`.
//
// Le rendement décroît, et il faut le savoir avant de monter le curseur : plus le
// solide a déjà été coupé, plus il est petit, et plus les plans suivants passent à
// côté sans rien enlever. Mesuré sur les six archétypes, de 20 à 28 plans on ne
// gagne que 15 % de triangles. Le niveau 3 existe pour les cas où l'on veut cette
// marge ; il ne remplace pas le niveau 2, il le prolonge à peine.
const PLANS = [9, 14, 20, 28];

// Des directions bien réparties. Deux raisons, et la seconde n'est pas cosmétique :
// des directions tirées au hasard laissent des trous, et un trou dans la
// couverture de la sphère veut dire un demi-espace que rien ne coupe — donc un
// solide NON BORNÉ, donc les faces de la boîte de départ qui survivent, donc un
// caillou avec un côté parfaitement carré. La suite de Fibonacci sur la sphère,
// à peine bruitée, ne laisse jamais de trou.
function directions(nb, r) {
  const or = Math.PI * (3 - Math.sqrt(5));
  const d = [];
  for (let i = 0; i < nb; i++) {
    const y = 1 - ((i + 0.2 + r() * 0.6) / nb) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = or * i + (r() - 0.5) * 0.8;
    d.push([Math.cos(th) * rad, y, Math.sin(th) * rad]);
  }
  return d;
}

function directionLibre(r) {
  const z = r() * 2 - 1;
  const rad = Math.sqrt(Math.max(0, 1 - z * z));
  const th = r() * TAU;
  return [Math.cos(th) * rad, Math.sin(th) * rad, z];
}

// Un caillou. Rayon exactement 1, origine au centre de son englobante.
function unCaillou({ seed, plans, arch, motifs, couleurSommets }) {
  const r = rng(seed);

  // La boîte de départ est très large devant les distances de coupe (au plus 1) :
  // avec des directions bien réparties, chacun de ses coins est nécessairement
  // au-delà d'au moins un plan, donc aucune de ses faces ne survit. Le caillou ne
  // garde rien de la boîte, qui n'est là que pour donner un solide à couper.
  let faces = boite(2.4);

  // Les normales sortent unitaires de `directions` et `directionLibre` : la
  // distance de coupe est donc bien une distance, et pas une distance divisée
  // par une longueur qu'on aurait oubliée.
  for (const n of directions(plans, r)) {
    faces = couper(faces, n, 1 - Math.pow(r(), 1.2) * arch.dispersion);
  }
  for (let k = 0; k < arch.franches; k++) {
    const n = directionLibre(r);
    faces = couper(faces, n, 0.4 + r() * 0.24);
  }

  // --- Soudure -------------------------------------------------------------
  // Chaque face porte ses propres copies de ses sommets, et deux faces voisines
  // ont calculé le même point par deux chemins différents : il diffère au
  // dernier bit. Tout ce qui suit (recentrage, anisotropie, rugosité) doit
  // s'appliquer IDENTIQUEMENT aux copies d'un même point, sans quoi la coque
  // s'ouvre — c'est exactement le piège documenté dans `champ.js`, où déplacer
  // sommet par sommet séparait les faces. On soude donc une fois, on transforme
  // les points soudés, et les faces suivent.
  const soudes = [];
  const index = faces.map((face) =>
    face.map((p) => {
      for (let i = 0; i < soudes.length; i++) {
        const q = soudes[i];
        if (
          Math.abs(p[0] - q[0]) < EPS &&
          Math.abs(p[1] - q[1]) < EPS &&
          Math.abs(p[2] - q[2]) < EPS
        ) {
          return i;
        }
      }
      soudes.push(p);
      return soudes.length - 1;
    })
  );

  // --- Recentrage ----------------------------------------------------------
  // Les coupes sont asymétriques, donc le solide ne tombe pas sur l'origine. Ce
  // n'est pas qu'une affaire de rotation : les décors déduisent leur garde du
  // RAYON, et le rayon est le plus grand |sommet| mesuré depuis l'origine. Un
  // caillou décentré de 20 % annonce un rayon 20 % trop grand et se fait écarter
  // du couloir de jeu pour rien. On recentre sur l'englobante, pas sur le
  // barycentre des sommets : c'est l'englobante qui décide du rayon.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of soudes) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  }
  let rayon = 0;
  for (const p of soudes) {
    for (let k = 0; k < 3; k++) p[k] = (p[k] - (min[k] + max[k]) / 2) * arch.e[k];
    rayon = Math.max(rayon, Math.hypot(p[0], p[1], p[2]));
  }
  // Rayon exactement 1, quel que soit l'archétype : le décor n'a alors qu'un
  // nombre à connaître, et sa garde reste juste s'il change de forme.
  for (const p of soudes) {
    p[0] /= rayon;
    p[1] /= rayon;
    p[2] /= rayon;
  }

  // --- Triangulation -------------------------------------------------------
  // En éventail depuis le premier sommet : une face est convexe, donc l'éventail
  // est toujours valide, et il coûte deg−2 triangles là où un éventail depuis le
  // centre en coûterait deg.
  //
  // CE QUI A ÉTÉ ESSAYÉ ET RETIRÉ. Une « rugosité » déplaçant chaque sommet soudé
  // le long de son rayon, pour que les grandes faces ne soient pas d'une seule
  // valeur en ombrage plat. À l'écran, désastre : une face non plane triangulée
  // en éventail donne des triangles très effilés près du sommet de départ, et
  // trois pour cent de déplacement suffisent à leur donner des normales
  // aberrantes. On voyait des ÉCLATS NOIRS en travers des grands pans, qu'on
  // prenait pour des fissures dans la coque. Un éventail depuis le barycentre
  // corrigerait les proportions mais coûterait deg triangles au lieu de deg−2, et
  // la texture fait déjà ce travail-là mieux et pour rien. Les faces restent donc
  // rigoureusement planes.
  let nbTri = 0;
  for (const f of index) nbTri += f.length - 2;

  const position = new Float32Array(nbTri * 9);
  const uv = new Float32Array(nbTri * 6);
  // Décalages de motif propres à cette forme : sans eux, les six cailloux d'un
  // lot montrent tous exactement la même région de la texture, et le lot entier
  // porte la même tache au même endroit.
  const dec = [r(), r(), r(), r(), r(), r()];
  const k = motifs / 2;
  let o = 0;

  for (const f of index) {
    const a = soudes[f[0]];
    const b0 = soudes[f[1]];
    const c0 = soudes[f[2]];

    // PROJECTION SUR BOÎTE, décidée par l'axe dominant de la normale — et décidée
    // UNE FOIS PAR FACE, ce qui est tout le sujet de ce bloc.
    //
    // Le dépliage sphérique d'un icosaèdre pince la texture aux pôles et la coupe
    // le long d'un méridien ; sur un caillou anguleux, la couture tombe au milieu
    // d'un pan et se voit. Avec la projection sur boîte, la coupure ne peut
    // tomber QUE là où deux faces changent d'axe dominant, c'est-à-dire sur une
    // arête vive — l'endroit exact où la roche est censée être discontinue.
    //
    // MAIS : la normale doit être choisie sur la face, pas sur chaque triangle de
    // l'éventail. Les triangles d'une face plane ont bien la même normale, à
    // l'erreur de calcul près ; quand deux composantes sont presque égales — un
    // pan à quarante-cinq degrés, ce qui est fréquent ici — cette erreur suffit à
    // faire basculer la comparaison d'un triangle à l'autre. On voyait alors une
    // COUTURE VERTICALE en plein milieu d'un grand pan, avec les cratères
    // décalés de part et d'autre. Une seule normale pour toute la face, et le
    // problème n'existe plus.
    //
    // La projection est calculée APRÈS l'anisotropie, sur les coordonnées réelles
    // de l'objet : une lame écrasée d'un facteur trois ne montre donc pas un
    // grain étiré d'un facteur trois. C'est aussi la raison pour laquelle
    // l'anisotropie est cuite ici plutôt que laissée à l'échelle d'instance —
    // voir l'avertissement de `geometriesCailloux`.
    const nx = Math.abs((b0[1] - a[1]) * (c0[2] - a[2]) - (b0[2] - a[2]) * (c0[1] - a[1]));
    const ny = Math.abs((b0[2] - a[2]) * (c0[0] - a[0]) - (b0[0] - a[0]) * (c0[2] - a[2]));
    const nz = Math.abs((b0[0] - a[0]) * (c0[1] - a[1]) - (b0[1] - a[1]) * (c0[0] - a[0]));
    // `su` et `sv` désignent les deux coordonnées conservées par la projection,
    // `d0` le couple de décalages qui va avec — un par axe, pour que les trois
    // faces d'un même caillou ne montrent pas trois fois la même région.
    const su = nx >= ny && nx >= nz ? 2 : 0;
    const sv = nx >= ny && nx >= nz ? 1 : ny >= nz ? 2 : 1;
    const d0 = nx >= ny && nx >= nz ? 0 : ny >= nz ? 2 : 4;

    for (let i = 1; i < f.length - 1; i++) {
      const t = [a, soudes[f[i]], soudes[f[i + 1]]];
      for (let j = 0; j < 3; j++) {
        const p = t[j];
        position[o * 9 + j * 3] = p[0];
        position[o * 9 + j * 3 + 1] = p[1];
        position[o * 9 + j * 3 + 2] = p[2];
        uv[o * 6 + j * 2] = p[su] * k + dec[d0];
        uv[o * 6 + j * 2 + 1] = p[sv] * k + dec[d0 + 1];
      }
      o++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // Géométrie non indexée : `computeVertexNormals` donne alors la vraie normale
  // de face à chacun des trois coins, ce qui est exactement ce que veut
  // `flatShading`.
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  if (couleurSommets) {
    // Attribut de couleur plein de un. Il n'a de sens qu'avec une matière en
    // `vertexColors: true` — et il ne sert alors qu'à AUTORISER ce drapeau,
    // parce que sans attribut `color` three.js déclare quand même la variable
    // dans la nuance et l'instance sort noire. La couleur qu'on veut vraiment
    // est `instanceColor`, qui emprunte le même chemin. À savoir tout de même :
    // `instanceColor` fonctionne parfaitement SANS `vertexColors` ni cet
    // attribut, et c'est le montage le plus économe — c'est pourquoi
    // `matiereRoche` propose de couper les deux ensemble.
    const blanc = new Float32Array(nbTri * 9).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(blanc, 3));
  }

  geo.userData = { rayon: 1, forme: arch.nom, triangles: nbTri, sommets: soudes.length };
  return geo;
}

/**
 * Un jeu de géométries variées, prêtes pour `InstancedMesh`.
 *
 * Chaque géométrie a un rayon de exactement 1, son origine au centre de son
 * englobante, des UV en projection sur boîte, et porte dans `userData` sa forme,
 * son nombre de triangles et son nombre de sommets.
 *
 * LE NIVEAU DE DÉTAIL, ET SA MESURE. La caméra du champ est en (0, 21, 27), son
 * champ vertical fait 56° en paysage. Un caillou de rayon R à la distance D
 * occupe donc, sur une image de H pixels de haut, 2·R·H / (D · 2·tan 28°), soit
 * environ 1,88·R·H/D pixels de diamètre. Sur un téléphone en paysage à 780 pixels
 * de haut rendus, avec les distances réelles des quatre couches de `champ.js` —
 * un colosse de rayon 14 passe au plus près à 31 unités de la caméra, un
 * « proche » de 5,6 à une quarantaine :
 *
 *   couche     R      D      diamètre écran   détail  triangles  segments  le +
 *                                                     (mesurés)  de silh.  long
 *   colosses  14     31–46    500 à 660 px      2       56–68       ~18    ~140 px
 *   proches    5,6   ~40      ~205 px           2       56–68       ~18     ~43 px
 *   médians    3     ~40      ~110 px           1       44–56       ~13     ~30 px
 *   fond       6    ~200       ~44 px           0       24–32       ~10     ~13 px
 *
 * La colonne qui décide est la DERNIÈRE : la longueur du segment de silhouette
 * moyen, mesurée sur soixante-quatre points de vue répartis sur la sphère (21 %
 * du diamètre au niveau 2, 26 % au niveau 0). Tant qu'un segment reste sous
 * environ cent cinquante pixels, l'œil lit « bloc cassé » ; au-delà il lit
 * « facette », et on est retombé sur le dé. C'est le seul seuil qui compte, et
 * c'est lui qui fixe le niveau de chaque couche.
 *
 * Ce qu'il ne faut PAS faire, c'est monter le détail pour arrondir la silhouette.
 * Un vrai bloc brisé a des segments DROITS, et c'est exactement ce qui le
 * distingue d'une patate — le but n'est pas de les faire disparaître mais de les
 * garder assez courts pour qu'ils se lisent comme des arêtes et non comme des
 * pans. Le fond, à 44 pixels de diamètre, n'a d'ailleurs aucune arête lisible :
 * ses 24 triangles y sont déjà généreux.
 *
 * Pour le champ lointain de `landmarks.js`, où les rochers passent à 100 unités
 * pour un rayon de 8 au plus, soit une quarantaine de pixels, `detail: 0` suffit.
 *
 * Le lot complet des six formes coûte 168 triangles au niveau 0, 276 au niveau 1,
 * 380 au niveau 2, 452 au niveau 3 — et ce coût est payé UNE FOIS, quel que soit
 * le nombre d'instances.
 *
 * LE COÛT CACHÉ, et il faut le dire clairement : un `InstancedMesh` ne dessine
 * qu'une géométrie. Demander six formes pour une couche, c'est six appels de
 * dessin au lieu d'un. Sur les quatre couches de `champ.js`, passer de 1 à 4
 * formes fait passer le décor de 5 à 17 appels — ce qui reste très en dessous de
 * ce qu'un mobile encaisse, mais ce n'est plus la même page. Quatre formes par
 * couche donnent déjà les quatre archétypes les plus contrastés ; c'est le
 * réglage recommandé, et six ne se justifie que sur la couche qu'on voit le mieux.
 *
 * @param {object}  o
 * @param {number}  o.nb         nombre de formes (1 à 6, dans l'ordre des archétypes)
 * @param {number}  o.seed       graine
 * @param {number}  o.detail     0 à 3, voir le tableau ci-dessus
 * @param {number}  o.motifs     nombre de tuiles de texture sur le DIAMÈTRE du
 *                               caillou. Pour un grain de taille constante dans
 *                               le monde, prendre à peu près le rayon typique de
 *                               la couche divisé par deux.
 * @param {boolean} o.couleurSommets  ajoute un attribut `color` blanc, requis par
 *                               une matière en `vertexColors: true` (celle de
 *                               `champ.js` aujourd'hui).
 * @returns {THREE.BufferGeometry[]}
 *
 * AVERTISSEMENT SUR L'ÉCHELLE D'INSTANCE. L'anisotropie est déjà dans la
 * géométrie. Si l'appelant applique en plus une échelle très inégale par
 * instance, il étire la TEXTURE dans la même proportion, et le grain devient
 * strié. Un triplet d'échelle entre 0,8 et 1,25 ne se voit pas ; au-delà, mieux
 * vaut demander plus de formes et garder l'échelle d'instance uniforme.
 */
export function geometriesCailloux({
  nb = 6,
  seed = 1,
  detail = 1,
  motifs = 1.6,
  couleurSommets = true,
} = {}) {
  const plans = PLANS[Math.max(0, Math.min(PLANS.length - 1, Math.round(detail)))];
  const total = Math.max(1, Math.min(ARCHETYPES.length, Math.round(nb)));
  const out = [];
  for (let i = 0; i < total; i++) {
    out.push(
      unCaillou({
        // Chaque forme a sa propre graine, dérivée de celle du lot : ajouter une
        // septième forme ne doit pas changer les six premières.
        seed: (seed * 2654435761 + i * 40503 + 7) >>> 0,
        plans,
        arch: ARCHETYPES[i % ARCHETYPES.length],
        motifs,
        couleurSommets,
      })
    );
  }
  return out;
}

// ============================================================================
// LA MATIÈRE
// ============================================================================

// Bruit de valeur tuilable. La grille est échantillonnée modulo sa taille, donc
// le motif se raccorde à lui-même par construction — c'est indispensable, la
// projection sur boîte fait se répéter la texture plusieurs fois sur un même
// caillou et une couture s'y verrait immédiatement.
function grille(n, r) {
  const t = new Float32Array(n * n);
  for (let i = 0; i < t.length; i++) t[i] = r();
  return t;
}

// Pré-calcul des index et poids d'interpolation d'une colonne. L'interpolation
// est séparable : on paie une fois par colonne au lieu d'une fois par pixel, ce
// qui divise le coût de la génération par trois environ.
function colonnes(n, taille) {
  const i0 = new Int32Array(taille);
  const i1 = new Int32Array(taille);
  const s = new Float32Array(taille);
  for (let x = 0; x < taille; x++) {
    const f = (x / taille) * n;
    const a = Math.floor(f);
    const t = f - a;
    i0[x] = ((a % n) + n) % n;
    i1[x] = (i0[x] + 1) % n;
    s[x] = t * t * (3 - 2 * t);
  }
  return { i0, i1, s };
}

// Répète un dessin aux positions du pavage où il a une chance de se voir. C'est
// la seule façon simple d'obtenir un cratère à cheval sur le bord qui se
// raccorde de l'autre côté.
//
// L'écrêtage n'est pas une coquetterie : la première version dessinait les NEUF
// copies dans tous les cas, et la génération d'une planche de 512 coûtait 126 ms
// sur un ordinateur de bureau — donc un demi-quart de seconde de gel sur un
// téléphone, au moment précis où l'escale se met en place. Or un motif qui ne
// touche pas le bord n'a besoin que d'une copie, et c'est le cas de la grande
// majorité d'entre eux. On passe la boîte englobante du motif (centre et demi-
// diagonale) et on ne dessine que les copies qui retombent dans la planche.
function partout(ctx, taille, x, y, rad, dessin) {
  for (let dx = -1; dx <= 1; dx++) {
    const cx = x + dx * taille;
    if (cx + rad < 0 || cx - rad > taille) continue;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = y + dy * taille;
      if (cy + rad < 0 || cy - rad > taille) continue;
      ctx.save();
      ctx.translate(dx * taille, dy * taille);
      dessin();
      ctx.restore();
    }
  }
}

// Un contour fermé presque rond, mais pas rond. Un cercle parfait se lit comme un
// cercle et non comme un cratère ; à l'inverse, deux ou trois harmoniques fortes
// donnent un PENTAGONE, ce qui est pire — on l'a eu à l'écran, et vingt pentagones
// sur une planche ne se lisent plus du tout comme de la géologie. Il faut donc
// beaucoup d'harmoniques et de très petites amplitudes : c'est l'irrégularité
// FINE du bourrelet qui fait le cratère.
function contour(ctx, x, y, rad, r, ovale) {
  const nb = 30;
  const p1 = r() * TAU;
  const p2 = r() * TAU;
  const p3 = r() * TAU;
  const p4 = r() * TAU;
  ctx.beginPath();
  for (let i = 0; i <= nb; i++) {
    const a = (i / nb) * TAU;
    const k =
      rad *
      (1 +
        Math.sin(a * 2 + p1) * 0.055 +
        Math.sin(a * 3 + p2) * 0.045 +
        Math.sin(a * 5 + p3) * 0.032 +
        Math.sin(a * 9 + p4) * 0.02);
    const px = x + Math.cos(a) * k;
    const py = y + Math.sin(a) * k * ovale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// L'englobante d'une polyligne, sous la forme que `partout` attend : un centre et
// un rayon. Approximation par excès, ce qui est le bon sens de l'erreur — au pire
// on redessine une copie invisible, jamais l'inverse.
function etendue(pts, marge) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    rad: Math.hypot(x1 - x0, y1 - y0) / 2 + marge * 2,
  };
}

// Une ligne brisée, tracée deux fois : la fissure et son liseré de lumière.
// Le liseré est décalé d'un pixel VERS la lumière convenue, ce qui est tout ce
// qui sépare une entaille d'un trait de crayon posé sur la surface.
function entaille(ctx, pts, large, sombre, clair) {
  ctx.lineWidth = large;
  ctx.globalAlpha = clair;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(pts[0][0] - large * 0.8, pts[0][1] - large * 0.8);
  for (const p of pts) ctx.lineTo(p[0] - large * 0.8, p[1] - large * 0.8);
  ctx.stroke();
  ctx.globalAlpha = sombre;
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.stroke();
}

/**
 * La texture de roche, générée au canevas. Aucun fichier image.
 *
 * LA LUMIÈRE EST PEINTE DEDANS, et c'est un choix, pas un raccourci. Un cratère
 * n'est visible que par son ombre : sans relief peint, il ne reste qu'un rond
 * plus sombre, c'est-à-dire une tache. On peint donc la paroi proche de la
 * lumière en ombre et la paroi opposée en lumière — l'inverse d'une bosse, et
 * c'est ce qui fait creuser l'œil. La contrepartie est connue : la direction de
 * lumière peinte est fixe, alors que le caillou tourne et que la lumière du lieu
 * vient d'où elle veut. Sur de la roche mate et poussiéreuse, à cette taille,
 * personne ne le relève ; sur du métal, ce serait impossible. L'alternative
 * honnête serait un `bumpMap`, et elle coûte trois lectures de texture par pixel
 * — voir `relief` dans `matiereRoche`.
 *
 * LA PLANCHE SE RACCORDE À ELLE-MÊME. Ce n'est pas un raffinement : la projection
 * sur boîte répète la texture une à trois fois sur un même caillou, et une
 * couture y tomberait en plein milieu d'un pan. Le bruit se raccorde par
 * construction (grille échantillonnée modulo) et tout ce qui est DESSINÉ l'est
 * neuf fois, aux neuf positions du pavage.
 *
 * `userData.valeurMoyenne` porte la luminance moyenne LINÉAIRE de la planche.
 * `matiereRoche` s'en sert pour compenser la couleur — voir là-bas.
 *
 * @param {object} o
 * @param {number} o.seed
 * @param {number} o.taille  côté en pixels. 512 par défaut : avec `motifs` autour
 *                 de 1,5, un colosse de 600 pixels à l'écran reçoit environ 750
 *                 texels sur sa largeur — la planche n'est donc jamais
 *                 grossie, seulement un peu réduite, ce qui est le bon sens de
 *                 l'erreur. 256 divise l'empreinte mémoire par quatre
 *                 (1 Mo → 256 ko, mipmaps en sus) et la durée de génération
 *                 d'autant ; c'est le repli pour les téléphones faibles.
 * @returns {THREE.CanvasTexture}
 */
export function textureRoche({ seed = 1, taille = 512 } = {}) {
  const r = rng(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = taille;
  const ctx = canvas.getContext('2d');
  const ech = taille / 512;

  // --- 1. Le fond : cinq octaves de bruit de valeur ------------------------
  // Cinq, et pas trois. Avec trois octaves qui s'arrêtaient à une quarantaine de
  // cellules, la planche n'avait aucun détail sous douze pixels : à l'écran, sur
  // un colosse rendu presque texel pour texel, elle se lisait comme de
  // l'aquarelle sur du papier — de grandes taches molles et rien dedans. Les
  // deux octaves ajoutées descendent le détail à deux ou trois pixels, ce qui
  // est le grain proprement dit. Il disparaît dans les mipmaps dès qu'on
  // s'éloigne, et c'est exactement ce qu'on attend d'un grain.
  const oct = [
    { n: 5, a: 0.34 },
    { n: 13, a: 0.25 },
    { n: 37, a: 0.19 },
    { n: 97, a: 0.13 },
    { n: 211, a: 0.09 },
  ].map((o) => ({ ...o, t: grille(o.n, r), c: colonnes(o.n, taille) }));
  const somme = oct.reduce((s, o) => s + o.a, 0);

  const img = ctx.createImageData(taille, taille);
  const px = img.data;
  for (let y = 0; y < taille; y++) {
    for (const o of oct) {
      const f = (y / taille) * o.n;
      const a = Math.floor(f);
      const t = f - a;
      const j = ((a % o.n) + o.n) % o.n;
      o.j0 = j * o.n;
      o.j1 = ((j + 1) % o.n) * o.n;
      o.sy = t * t * (3 - 2 * t);
    }
    for (let x = 0; x < taille; x++) {
      let v = 0;
      for (const o of oct) {
        const s = o.c.s[x];
        const ia = o.c.i0[x];
        const ib = o.c.i1[x];
        const h = o.t[o.j0 + ia] + (o.t[o.j0 + ib] - o.t[o.j0 + ia]) * s;
        const b = o.t[o.j1 + ia] + (o.t[o.j1 + ib] - o.t[o.j1 + ia]) * s;
        v += (h + (b - h) * o.sy) * o.a;
      }
      v /= somme;
      // Poivre : une variation d'un seul pixel, sous le seuil de la marbrure.
      // Elle ne survit pas au premier mipmap, donc elle ne coûte rien de loin ;
      // de près c'est elle qui empêche la surface d'être lisse.
      const g = 0.3 + v * 0.68 + (r() - 0.5) * 0.1;
      // Le clair part au roux, le sombre au gris froid : c'est ce que fait une
      // poussière minérale éclairée, et ça évite une planche entièrement neutre
      // qui rendrait toute teinte demandée un peu morte.
      const w = 0.94 + v * 0.14;
      const i = (y * taille + x) * 4;
      px[i] = Math.max(0, Math.min(255, g * w * 255));
      px[i + 1] = Math.max(0, Math.min(255, g * 255));
      px[i + 2] = Math.max(0, Math.min(255, (g / w) * 255));
      px[i + 3] = 255;
    }
  }

  // --- 2. Les piqûres -------------------------------------------------------
  // Le criblage de micro-impacts, la marque de fabrique d'un régolithe. Elles
  // sont écrites directement dans les pixels plutôt que dessinées : à un ou deux
  // pixels de rayon, le canevas les antialiaserait en flaques grises, et c'est
  // leur NETTETÉ qui les fait lire. Le modulo les fait se raccorder toutes
  // seules, sans avoir à repasser neuf fois.
  const piqures = Math.round(520 * ech * ech);
  for (let i = 0; i < piqures; i++) {
    const cx = Math.floor(r() * taille);
    const cy = Math.floor(r() * taille);
    const rad = (0.6 + Math.pow(r(), 2) * 2.6) * ech;
    const force = 0.28 + r() * 0.4;
    const e = Math.ceil(rad);
    for (let dy = -e; dy <= e; dy++) {
      for (let dx = -e; dx <= e; dx++) {
        const q = Math.hypot(dx, dy);
        if (q > rad) continue;
        // Le fond du trou est sombre, et le bord bas-droit reçoit la lumière :
        // même convention que les cratères, à l'échelle du pixel. Le rehaut est
        // réservé aux piqûres d'au moins deux pixels de rayon — en dessous, il
        // tombait sur la moitié des pixels du trou au lieu d'un liseré, et la
        // planche se retrouvait criblée d'ÉTINCELLES BLANCHES parfaitement
        // visibles à l'écran.
        const k =
          rad > 2 && dx + dy > rad * 0.75 ? 1 + force * 0.28 : 1 - force * (1 - (q / rad) * 0.7);
        const j = ((((cy + dy) % taille) + taille) % taille) * taille;
        const jx = (((cx + dx) % taille) + taille) % taille;
        const o = (j + jx) * 4;
        px[o] = Math.max(0, Math.min(255, px[o] * k));
        px[o + 1] = Math.max(0, Math.min(255, px[o + 1] * k));
        px[o + 2] = Math.max(0, Math.min(255, px[o + 2] * k));
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // --- 3. Les plaques -------------------------------------------------------
  // De grandes zones à peine plus claires ou plus sombres. Elles font croire à
  // des couches de matériau différent, et surtout elles cassent l'homogénéité du
  // bruit — un bruit seul, même à cinq octaves, reste statistiquement uniforme
  // et se lit comme du papier. En dégradé radial et non en polygone : la
  // première version en polygones montrait ses ARÊTES DROITES à travers la
  // roche, ce qui donnait des formes géométriques flottant sur la surface.
  for (let i = 0; i < 11; i++) {
    const x = r() * taille;
    const y = r() * taille;
    const rad = (26 + r() * 78) * ech;
    const clair = r() < 0.45;
    const al = 0.07 + r() * 0.1;
    partout(ctx, taille, x, y, rad, () => {
      const g = ctx.createRadialGradient(x, y, rad * 0.15, x, y, rad);
      g.addColorStop(0, clair ? `rgba(255,255,255,${al})` : `rgba(0,0,0,${al})`);
      g.addColorStop(1, clair ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    });
  }

  // --- 4. Les cratères ------------------------------------------------------
  // Distribution en puissance : beaucoup de petits, très peu de grands. Une
  // taille unique de cratère est ce qui trahit le plus vite une texture faite à
  // la main. Le plus grand reste sous un dixième de la planche, sinon la
  // répétition du pavage se voit dès qu'on demande deux motifs par caillou.
  for (let i = 0; i < 34; i++) {
    const x = r() * taille;
    const y = r() * taille;
    const rad = (4 + Math.pow(r(), 2.6) * 34) * ech;
    const ovale = 0.74 + r() * 0.34;
    const forme = seed + 1000 + i * 37;
    // La PROFONDEUR varie d'un cratère à l'autre. Tous creusés pareil, ils se
    // lisent comme des trous dans un gruyère : c'est l'uniformité qui trahit,
    // pas la forme. Les plus effacés sont d'anciens impacts que la poussière a
    // comblés, et ce sont eux qui donnent une histoire à la surface.
    const creux = 0.45 + Math.pow(r(), 0.7) * 0.55;
    partout(ctx, taille, x, y, rad * 1.8, () => {
      // Le tablier d'éjecta : un halo sombre et flou tout autour. C'est lui qui
      // POSE le cratère sur la roche au lieu de le laisser flotter dessus.
      ctx.globalAlpha = 1;
      const h = ctx.createRadialGradient(x, y, rad * 0.9, x, y, rad * 1.8);
      h.addColorStop(0, `rgba(0,0,0,${(0.16 * creux).toFixed(3)})`);
      h.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = h;
      ctx.beginPath();
      ctx.arc(x, y, rad * 1.8, 0, TAU);
      ctx.fill();

      // Le bol. La lumière est convenue en haut à gauche : la paroi du HAUT
      // GAUCHE tourne le dos à la lumière et reste dans l'ombre, la paroi du bas
      // droite la reçoit de plein fouet. C'est l'inverse exact d'une bosse, et
      // c'est tout ce qui sépare un trou d'une boule.
      const g = ctx.createLinearGradient(x - rad, y - rad, x + rad, y + rad);
      g.addColorStop(0, `rgba(0,0,0,${(0.46 * creux).toFixed(3)})`);
      g.addColorStop(0.42, `rgba(0,0,0,${(0.17 * creux).toFixed(3)})`);
      g.addColorStop(0.72, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, `rgba(255,255,255,${(0.28 * creux).toFixed(3)})`);
      ctx.fillStyle = g;
      contour(ctx, x, y, rad, rng(forme), ovale);
      ctx.fill();

      // Le bourrelet, éclairé du côté OPPOSÉ au bol : la matière éjectée forme un
      // anneau en relief autour du trou, donc sa lumière est celle d'une bosse.
      // C'est ce renversement, sur deux pixels de large, qui fait la lecture.
      const b = ctx.createLinearGradient(x - rad, y - rad, x + rad, y + rad);
      b.addColorStop(0, `rgba(255,255,255,${(0.3 * creux).toFixed(3)})`);
      b.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      b.addColorStop(1, `rgba(0,0,0,${(0.26 * creux).toFixed(3)})`);
      ctx.strokeStyle = b;
      ctx.lineWidth = Math.max(1, rad * 0.13);
      contour(ctx, x, y, rad * 1.04, rng(forme), ovale);
      ctx.stroke();
    });
  }

  // --- 5. Les entailles -----------------------------------------------------
  // COURTES, et c'est tout le sujet. La première version tirait de longues
  // polylignes qui traversaient la planche : à l'écran, des gribouillis à
  // l'encre, parfaitement reconnaissables comme un dessin. Une fêlure de roche
  // est courte, fine, et il y en a beaucoup — on en met donc trois fois plus,
  // trois fois plus courtes, et deux fois plus discrètes.
  ctx.lineCap = 'round';
  for (let i = 0; i < 24; i++) {
    const x0 = r() * taille;
    const y0 = r() * taille;
    let a = r() * TAU;
    const seg = 2 + Math.floor(r() * 3);
    const pts = [[x0, y0]];
    for (let k = 0; k < seg; k++) {
      a += (r() - 0.5) * 1.4;
      const p = pts[pts.length - 1];
      const pas = (6 + r() * 20) * ech;
      pts.push([p[0] + Math.cos(a) * pas, p[1] + Math.sin(a) * pas]);
    }
    const large = Math.max(1, (0.7 + r() * 1.1) * ech);
    const sombre = 0.18 + r() * 0.16;
    const e = etendue(pts, large);
    partout(ctx, taille, e.x, e.y, e.rad, () => entaille(ctx, pts, large, sombre, sombre * 0.5));
  }

  // --- 6. Les veines --------------------------------------------------------
  // Un ou deux filons clairs, plus larges et plus doux que les entailles. Ils
  // n'existent que pour donner à la roche une couleur qui n'est pas la sienne :
  // une masse d'une seule teinte, même bien texturée, reste un objet peint.
  for (let i = 0; i < 3; i++) {
    const x0 = r() * taille;
    const y0 = r() * taille;
    let a = r() * TAU;
    const pts = [[x0, y0]];
    for (let k = 0; k < 6; k++) {
      a += (r() - 0.5) * 0.8;
      const p = pts[pts.length - 1];
      const pas = (22 + r() * 34) * ech;
      pts.push([p[0] + Math.cos(a) * pas, p[1] + Math.sin(a) * pas]);
    }
    const al = 0.12 + r() * 0.12;
    const large = Math.max(1, (2.5 + r() * 5) * ech);
    const e = etendue(pts, large);
    partout(ctx, taille, e.x, e.y, e.rad, () => {
      ctx.globalAlpha = al;
      ctx.strokeStyle = '#fff4e2';
      ctx.lineWidth = large;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;

  // --- 7. La valeur moyenne -------------------------------------------------
  // Une texture qui multiplie la couleur assombrit forcément la matière : une
  // planche de valeur moyenne 0,7 rend une roche 30 % plus sombre que la teinte
  // demandée, et le décor perd le ton que l'escale avait choisi. On mesure donc
  // la moyenne pour que `matiereRoche` puisse la compenser. La mesure est faite
  // en LINÉAIRE — c'est là que le produit a lieu dans la nuance — et sur un pixel
  // sur seize, ce qui est statistiquement identique et seize fois plus rapide.
  const lu = ctx.getImageData(0, 0, taille, taille).data;
  let acc = 0;
  let n = 0;
  for (let y = 0; y < taille; y += 4) {
    for (let x = 0; x < taille; x += 4) {
      const i = (y * taille + x) * 4;
      for (let k = 0; k < 3; k++) {
        const c = lu[i + k] / 255;
        acc += c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      }
      n += 3;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Sur un caillou, presque toutes les faces sont vues de biais : sans
  // anisotropie, le filtrage choisit le mipmap du côté le plus comprimé et la
  // roche devient une bouillie grise dès qu'elle s'incline. Quatre suffisent ;
  // three.js écrête tout seul à ce que la machine sait faire.
  tex.anisotropy = 4;
  tex.userData = { valeurMoyenne: acc / n };
  return tex;
}

/**
 * Une matière de roche, avec sa texture générée.
 *
 * Rendue en `MeshLambertMaterial` et en ombrage plat : une roche mate n'a aucun
 * reflet spéculaire à montrer, et ces masses-là couvrent la moitié de l'écran sur
 * un appareil où le remplissage est le goulot. Tout paramètre supplémentaire est
 * transmis tel quel au constructeur, ce qui permet de forcer une autre classe de
 * réglages sans toucher à ce fichier.
 *
 * @param {object} o
 * @param {number|THREE.Color} o.teinte   la couleur VOULUE à l'écran, une fois la
 *                 texture appliquée. La matière divise par la valeur moyenne de
 *                 la planche pour que ce soit vrai. Sans cette division, la
 *                 texture rendrait la roche quatre dixièmes plus sombre que la
 *                 teinte demandée (la planche pèse 0,33 en linéaire), et
 *                 l'appelant passerait son temps à rattraper à la main une valeur
 *                 qu'il n'a pas demandée — pire, il la rattraperait DIFFÉREMMENT
 *                 selon la graine, puisque la moyenne dépend du tirage.
 * @param {number} o.seed
 * @param {number} o.taille   côté de la texture générée, voir `textureRoche`.
 * @param {THREE.Texture} o.texture  une planche déjà générée, à PARTAGER entre
 *                 plusieurs matières. Fortement recommandé quand un décor fait
 *                 une matière par couche : quatre planches de 512 coûtent 4 Mo
 *                 pour quatre fois la même chose.
 * @param {number} o.emission  fraction de la teinte ajoutée en émission. Elle
 *                 relève les faces qui ne regardent aucune lumière, ce dont les
 *                 paliers de fin de voyage ont besoin. Elle n'est PAS compensée
 *                 par la valeur moyenne : l'émission ne passe pas par la texture,
 *                 la corriger la ferait sortir trop claire.
 * @param {number} o.relief   à zéro, aucun relief calculé. Au-dessus, la planche
 *                 sert aussi de `bumpMap` et `relief` devient `bumpScale`. À
 *                 n'activer qu'en connaissance de cause : `dHdxy_fwd` de three.js
 *                 fait TROIS lectures de la texture par pixel, ce qui quadruple
 *                 le coût de remplissage d'une surface qui occupe déjà la moitié
 *                 de l'image. C'est le réglage à mesurer sur un vrai téléphone
 *                 avant de le laisser allumé, et la raison pour laquelle le
 *                 relief des cratères est peint dans l'albédo.
 * @param {boolean} o.couleurSommets  laisse `vertexColors` allumé, et il faut
 *                 alors que la géométrie porte l'attribut `color` — c'est le cas
 *                 par défaut. Le couper des DEUX côtés (ici et sur
 *                 `geometriesCailloux`) est plus économe et ne coûte rien :
 *                 vérifié à l'écran, `setColorAt` continue de teinter chaque
 *                 instance sans `vertexColors`. La nuance de three.js déclare en
 *                 effet `USE_COLOR` dans le fragment dès qu'il y a un
 *                 `instanceColor`, indépendamment de `vertexColors`. Ce qui rend
 *                 l'instance NOIRE, c'est uniquement `vertexColors: true` sur une
 *                 géométrie SANS attribut `color` : le drapeau déclare alors
 *                 l'attribut dans le vertex, personne ne le remplit, et il vaut
 *                 zéro.
 * @returns {THREE.MeshLambertMaterial}
 *
 * LIBÉRATION. `disposeLandmark` parcourt le groupe et appelle `material.dispose()`
 * et `material.map.dispose()`. La matière n'a donc qu'UNE seule texture, et quand
 * `relief` est allumé, `bumpMap` est la même instance que `map` : un seul
 * `dispose` les libère toutes les deux, et il n'y a rien à ajouter au parcours.
 * Les géométries sont des `BufferGeometry` ordinaires, `dispose()` les couvre.
 */
export function matiereRoche({
  teinte = 0x6b5a48,
  seed = 1,
  taille = 512,
  texture = null,
  emission = 0,
  relief = 0,
  couleurSommets = true,
  ...reste
} = {}) {
  const map = texture ?? textureRoche({ seed, taille });
  const base = new THREE.Color(teinte);
  const moyenne = map.userData?.valeurMoyenne || 1;

  const params = {
    color: base.clone().multiplyScalar(1 / moyenne),
    map,
    flatShading: true,
    vertexColors: couleurSommets,
    fog: true,
    ...reste,
  };
  if (emission > 0) params.emissive = base.clone().multiplyScalar(emission);
  if (relief > 0) {
    params.bumpMap = map;
    params.bumpScale = relief;
  }
  return new THREE.MeshLambertMaterial(params);
}
