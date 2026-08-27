// L'AURA DE FURIE — les quatre secondes où le vaisseau brûle.
//
// La demande était une citation, et il faut la prendre au mot : « des gerbes
// d'énergie comme dans Dragon Ball Z ». L'aura de Super Saiyan n'est pas « du jaune
// autour du personnage ». Ce qui la fait reconnaître au premier coup d'œil, c'est
// cinq choses qui arrivent EN MÊME TEMPS, et en retirer une seule la fait retomber
// au rang de halo :
//   · une colonne qui MONTE sans jamais s'arrêter et se déchire en haut ;
//   · des langues de feu qui se détachent du corps et se dissipent au-dessus ;
//   · du gravier chassé DEHORS au sol, puis aspiré en tournoyant ;
//   · une respiration par à-coups — l'aura n'est jamais deux fois la même ;
//   · des arcs qui claquent, mais seulement à la crête de la poussée.
//
// CE QUI A VRAIMENT DÉCIDÉ DE LA FORME, pourtant, n'est dans aucune de ces cinq
// lignes. Les balles visées sont roses (0xff3df0) et les balles droites sont AMBRE
// (0xffa23d) — c'est-à-dire à trois doigts du doré de l'Overdrive. Une aura pleine,
// même magnifique, poserait un voile de la couleur des projectiles exactement là où
// le joueur doit les lire. D'où trois partis pris qui ne se négocient pas :
//
//   · TOUT est additif, sans écriture de profondeur. Une aura additive ne peut pas
//     CACHER une balle : au pire elle lui vole du contraste. Ce qui la cacherait
//     vraiment, c'est le BLOOM (seuil 0,55 dans main.js), qui étale la lumière sur
//     les pixels voisins. Le plafond réel n'est donc pas l'opacité mais la
//     LUMINANCE CUMULÉE, et on la tient sous le seuil partout sauf sur le contour.
//   · le manteau est un TUBE, pas un cône plein, et les langues sont poussées contre
//     sa paroi. Une coquille vue de face ne fait que deux couches en son milieu et
//     beaucoup plus au ras du bord : l'aura brille donc sur sa silhouette et reste
//     creuse au centre. C'est la propriété qui décide de tout — le milieu de la
//     colonne, sur une caméra inclinée de trente-cinq degrés, c'est exactement
//     l'endroit de l'écran d'où les balles arrivent.
//   · la masse claire vit AU-DESSUS du plan des balles : l'enveloppe des sommets
//     culmine vers y = 1,15 et ne vaut plus que 0,45 au ras de y = 0.
//
// CE QUE ÇA DONNE, MESURÉ (capture d'écran, image finale, aura à pleine furie) :
// elle touche 7,4 % de l'écran, dont 4,2 % au-dessus de +0,05 de luminance, 1,2 %
// au-dessus de +0,15 et 0,49 % seulement au-dessus de +0,30. La surface franchement
// éblouissante passe de 0,23 à 0,64 % de l'écran. Le contraste d'une balle ennemie
// perd 42 à 75 % dans les deux unités et demie devant le vaisseau, 15 à 27 % à trois
// unités, et moins de 10 % au-delà de cinq — c'est-à-dire que le couloir de lecture
// utile reste intact et que seul le corps-à-corps se paie. Les chiffres sont dans
// _manteau() et _langues(), avec ce qui les a fait bouger.
//
// Rien n'est alloué dans update(). Trois pools posés au constructeur, et la vie de
// chaque langue et de chaque gravier est une FONCTION PURE de l'horloge : pas de
// naissance, pas de mort, pas de liste libre. Chacun a reçu sa phase une fois pour
// toutes et `frac(horloge × vitesse + phase)` fait tout le reste — ce qui, en prime,
// rend l'effet parfaitement reproductible d'un rejeu à l'autre.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA } from './constants.js';

// Un bruit déterministe et sans état : la même graine rend toujours la même valeur.
// Il sert à deux choses très différentes — peindre la texture une fois pour toutes,
// et REDESSINER un arc électrique à l'identique pendant les trois images qu'il dure.
// Math.random() ne savait faire ni l'un ni l'autre : un éclair retiré au sort à
// chaque image n'est pas un éclair, c'est de la neige.
function bruit(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---- Dimensions ----
//
// Le vaisseau fait 1,6 unité de large et l'anneau de frôlement, qui est une
// information de JEU, vit à 2,7. Toute l'aura tient donc à l'intérieur de 2,0 :
// elle ne doit jamais recouvrir l'anneau, sous peine d'effacer la mécanique
// centrale au moment précis où le joueur la joue le plus.
const BASE_Y = -0.5; // le pied de la colonne, juste sous la coque
const HAUTEUR = 3.1;
const RAYON_BAS = 0.72;
const RAYON_HAUT = 1.5;
const SOUFFLE_INT = 1.05; // la nappe au sol : un ANNEAU, pas un disque —
const SOUFFLE_EXT = 1.95; // le centre reste vide, c'est là qu'est le vaisseau

// LA COLONNE PENCHE EN ARRIÈRE, ET C'EST UNE MESURE DE LISIBILITÉ DÉGUISÉE EN STYLE.
//
// La caméra ne regarde le plateau que de trente-cinq degrés au-dessus de l'horizon.
// Conséquence : le haut du monde et l'avant du monde tombent presque au même endroit
// à l'écran — une colonne parfaitement verticale se dresse donc pile dans le couloir
// par lequel les balles descendent. Neuf degrés de renversement vers la caméra et
// trois dixièmes d'unité de recul rendent environ un cinquième de ce couloir, pour
// un coût nul. Et cela se lit comme ce que c'est censé être : le vaisseau fonce vers
// le haut de l'écran, ses flammes doivent traîner derrière lui, pas se tenir droites.
const RECUL = 0.3;
const PENCHE = 0.16; // radians
const TAN_PENCHE = Math.tan(PENCHE);

// Vingt-six langues plutôt que dix-huit, et deux fois plus petites. À dix-huit et
// grand format, mesuré à l'écran, elles se lisaient comme une rangée de dents : des
// blocs séparés, comptables à l'œil, qui n'ont jamais l'air d'un feu. Une flamme est
// une MULTITUDE — c'est le nombre, pas la taille, qui la fabrique.
const LANGUES = 26;
const GRAVIERS = 34;
const ARCS = 4;
const ARC_SEGMENTS = 7;

// Le rayon de la colonne à une hauteur donnée : les arcs s'y accrochent, sans quoi
// ils claquent dans le vide à côté de la flamme au lieu de courir dessus.
function rayonColonne(y) {
  const v = Math.min(1, Math.max(0, (y - BASE_Y) / HAUTEUR));
  return RAYON_BAS + (RAYON_HAUT - RAYON_BAS) * v;
}

// ---- Textures ----
//
// Le drapé de flammes. Il doit se raccorder dans les DEUX sens : en x parce qu'il
// fait le tour du tube, en y parce qu'on le fait défiler sans fin. Une couture
// verticale balaierait la colonne une fois par cycle — le genre de défaut qu'on ne
// voit plus jamais une fois qu'on l'a vu.
function textureFlammes(w = 128, h = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  // `lighter` : les traînées s'ADDITIONNENT au lieu de se recouvrir. Peintes en
  // source-over, deux traînées qui se croisaient laissaient un bord net à
  // l'intersection — un raccord de calque, très exactement ce qu'une flamme n'a pas.
  ctx.globalCompositeOperation = 'lighter';

  // Une tache posée neuf fois autour du cadre. C'est ça, et rien d'autre, qui rend
  // la texture torique : ce qui déborde à droite rentre à gauche, pour de vrai.
  const tache = (x, y, r, a) => {
    for (let dx = -w; dx <= w; dx += w) {
      for (let dy = -h; dy <= h; dy += h) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,250,238,${a})`);
        g.addColorStop(0.45, `rgba(255,216,152,${a * 0.42})`);
        g.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  };

  // Quarante-quatre langues, chacune un chapelet de taches remontant une ligne
  // légèrement dérivante. Un simple dégradé vertical donnait un rideau : c'est
  // l'IRRÉGULARITÉ des longueurs et des dérives qui fait le feu.
  for (let i = 0; i < 44; i++) {
    const x0 = bruit(i * 3.1) * w;
    const y0 = bruit(i * 5.7 + 9) * h;
    const longueur = h * (0.16 + bruit(i * 2.3 + 4) * 0.34);
    const derive = (bruit(i * 7.9 + 2) - 0.5) * 26;
    const grosseur = 5 + bruit(i * 11.3 + 6) * 9;
    const pas = Math.max(3, grosseur * 0.5);
    for (let d = 0; d <= longueur; d += pas) {
      const f = d / longueur;
      const enfle = Math.sin(Math.PI * Math.pow(f, 0.6));
      tache(
        (x0 + derive * f + w) % w,
        (y0 - d + h * 2) % h,
        grosseur * (0.35 + enfle * 0.9),
        0.05 + enfle * 0.15
      );
    }
  }

  // Le piqué. Sans lui la texture n'a que de grosses masses molles et l'aura se lit
  // comme de la fumée. Il reste rare et minuscule : son travail est de scintiller,
  // pas de boucher les trous — ce sont les trous qui laissent voir les balles.
  for (let i = 0; i < 200; i++) {
    tache(bruit(i * 13.7 + 1) * w, bruit(i * 17.3 + 5) * h, 1 + bruit(i * 4.1) * 2.2, 0.34);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Le dedans d'une langue détachée. La silhouette, elle, est déjà dans la géométrie ;
// cette texture ne s'occupe que de la LUMIÈRE : pincée au pied, incandescente au
// quart, éteinte à la pointe. v = 0 est en bas de l'image parce que three retourne
// les canvas — le pied de la flamme se peint donc en bas.
function textureLangue(w = 32, h = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(255,236,200,0.5)');
  g.addColorStop(0.22, 'rgba(255,253,244,1)');
  g.addColorStop(0.62, 'rgba(255,198,112,0.4)');
  g.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Trois sillons clairs. Une langue parfaitement lisse est une goutte de plastique ;
  // il suffit de trois nervures pour qu'elle redevienne une flamme.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const x = (0.2 + i * 0.3) * w;
    const v = ctx.createLinearGradient(0, h, 0, h * 0.15);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.35, 'rgba(255,248,225,0.42)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = v;
    ctx.fillRect(x - 2, 0, 4, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Géométrie ----
//
// Une coquille du manteau. Trois choses y sont CUITES une fois pour toutes, et
// c'est ce qui permet de n'avoir qu'un seul objet dessiné pour trois enveloppes :
//   · l'échelle des UV en v, qui décide de la VITESSE apparente du défilement —
//     une même translation de texture couvre plus de monde là où v est étiré ;
//   · la vrille, un décalage de u proportionnel à la hauteur : la coquille interne
//     monte en hélice pendant que l'externe monte droit, et les deux cessent de se
//     déplacer comme un seul bloc ;
//   · la couleur de sommet, qui porte À LA FOIS le fondu et la teinte. Sous un
//     mélange additif, le noir EST le transparent : une couleur de sommet nulle
//     efface le sommet, aucune transparence n'est nécessaire pour ça.
function coquille({ rBas, rHaut, hauteur, yBase, radial, etages, uvEchelle, vrille, teinte, env }) {
  const g = new THREE.CylinderGeometry(rHaut, rBas, hauteur, radial, etages, true);
  g.translate(0, yBase + hauteur / 2, 0);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const n = pos.count;
  const couleurs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // La hauteur relative se relit sur le SOMMET, pas sur l'uv que three a posé :
    // on ne veut pas dépendre du sens dans lequel le générateur a numéroté ses
    // anneaux, qui n'est écrit nulle part et peut changer.
    const f = Math.min(1, Math.max(0, (pos.getY(i) - yBase) / hauteur));
    uv.setX(i, uv.getX(i) + f * vrille);
    uv.setY(i, f * uvEchelle);
    const k = env(f);
    couleurs[i * 3] = teinte.r * k;
    couleurs[i * 3 + 1] = teinte.g * k;
    couleurs[i * 3 + 2] = teinte.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
  return g;
}

// Le profil d'une langue de feu : nul au pied, renflé au quart, effilé jusqu'à la
// pointe. Un cône simple, essayé en premier, donnait une quille de bateau — c'est
// le renflement bas qui fait la flamme, et lui seul.
function profilLangue() {
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const v = i / 4;
    const r = Math.sin(Math.PI * Math.pow(v, 0.72)) * 0.5 * (1 - v * 0.55);
    pts.push(new THREE.Vector2(Math.max(0.004, r), v));
  }
  return pts;
}

// DEUX tours de révolution par langue, pas un.
//
// Sous un mélange additif il n'y a ni ombre ni dégradé : une surface se dessine à
// plat, et son bord est franc. Vue à l'écran, une langue simple ne ressemblait donc
// pas à une flamme mais à un cristal — un galet lumineux à arête nette, facettes
// comptables. Le remède ne coûte que des triangles : une seconde révolution un tiers
// plus large, à couleur de sommet basse, enveloppe la première. Au bord on ne
// traverse que le voile, au centre le voile ET le noyau — le dégradé qu'aucune
// matière n'aurait donné sort tout seul de la superposition. Les deux sont fusionnés :
// c'est toujours UN maillage instancié, donc toujours un seul appel de dessin.
function geometrieLangue() {
  const teinte = (g, k) => {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    c.fill(k);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const pts = profilLangue();
  const voile = new THREE.LatheGeometry(pts, 8).scale(1.45, 1.12, 1.45);
  const noyau = new THREE.LatheGeometry(pts, 8).scale(0.78, 1, 0.78);
  return mergeGeometries([teinte(voile, 0.26), teinte(noyau, 1)]);
}

export class Aura {
  constructor(scene) {
    this.scene = scene;

    this.texFlammes = textureFlammes();
    this.texLangue = textureLangue();

    // ---- Le manteau : trois coquilles, un seul appel de dessin ----
    //
    // La matière est BLANCHE et ce sont les sommets qui portent l'or. C'est le seul
    // moyen d'avoir un cœur blanc-chaud, un corps doré et un souffle ambré sans
    // trois matières — une couleur de matière dorée ne peut que noircir, jamais
    // blanchir, ce qui interdisait le cœur incandescent.
    // LA TEINTE EST UN CHOIX DE LISIBILITÉ AVANT D'ÊTRE UN CHOIX DE GOÛT. Posée
    // d'instinct à (1 · 0,74 · 0,30), l'aura tombait sur la couleur exacte des balles
    // droites (0xffa23d, soit 1 · 0,64 · 0,24) : à la capture d'écran, une balle ambre
    // traversant la colonne y disparaissait presque, quand une balle rose à côté
    // restait parfaitement nette. On remonte donc le vert d'un cran — l'or vire au
    // citron, s'éloigne de l'orange, et se rapproche au passage de la référence
    // demandée : l'aura de Super Saiyan est jaune, pas orange.
    const orChaud = new THREE.Color(1.0, 0.96, 0.78);
    const or = new THREE.Color(1.0, 0.87, 0.34);
    const ambre = new THREE.Color(1.0, 0.75, 0.26);

    const geoManteau = mergeGeometries([
      // L'externe : le corps de la colonne. Son enveloppe culmine à 53 % de la
      // hauteur, soit y ≈ 1,15 — juste au-dessus de la coque, et surtout bien
      // au-dessus du plan des balles, où elle ne pèse plus que 0,45. Le facteur
      // (1 − v) est linéaire et non adouci : c'est ce qui DISSOUT la crête au lieu
      // de la couper. Avec un exposant plus mou, le haut de la colonne restait à
      // 60 % de sa force jusqu'au dernier anneau et l'aura se terminait par un ourlet.
      coquille({
        rBas: RAYON_BAS,
        rHaut: RAYON_HAUT,
        hauteur: HAUTEUR,
        yBase: BASE_Y,
        radial: 18,
        etages: 5,
        uvEchelle: 1.3,
        vrille: 0.06,
        teinte: or,
        env: (v) => Math.pow(v, 1.15) * (1 - v) * 4.41,
      }),
      // L'interne : le cœur. Plus court, plus serré, franchement vrillé — c'est lui
      // qui donne à la colonne son mouvement de torsion, invisible sur une coquille
      // unique quelle que soit la texture.
      // Volontairement DISCRÈTE, et c'est le contraire de l'instinct : un cœur
      // brillant, c'est un cœur qui bouche. Sa contribution est plafonnée à 0,42 —
      // elle suffit à donner à la colonne un axe et une torsion, pas à en faire une
      // masse. Le spectaculaire se joue sur la paroi ; le milieu doit rester une
      // fenêtre.
      coquille({
        rBas: 0.34,
        rHaut: 0.74,
        hauteur: 2.2,
        yBase: BASE_Y,
        radial: 14,
        etages: 4,
        uvEchelle: 0.62,
        vrille: 0.55,
        teinte: orChaud,
        env: (v) => Math.pow(v, 0.9) * Math.pow(1 - v, 0.8) * 1.35,
      }),
      // Le souffle. Une coquille très évasée et très basse : les mêmes traînées, mais
      // couchées, filent donc vers l'EXTÉRIEUR au lieu de monter. Zéro travail
      // supplémentaire, et le vent qui repousse sort du même défilement que le reste.
      // Vue de la caméra, qui n'est qu'à trente-cinq degrés au-dessus du plan, elle
      // est écrasée par la perspective : il lui faut une enveloppe pleine pour peser
      // autant que la colonne, alors qu'elle est deux fois moins lumineuse en soi.
      coquille({
        rBas: SOUFFLE_INT,
        rHaut: SOUFFLE_EXT,
        hauteur: 0.42,
        yBase: BASE_Y - 0.18,
        radial: 20,
        etages: 1,
        uvEchelle: 0.5,
        vrille: 0.22,
        teinte: ambre,
        env: (v) => Math.sin(Math.PI * v) * 1.05,
      }),
    ]);

    this.matManteau = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: this.texFlammes,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      // DoubleSide fait la paroi avant ET la paroi arrière : c'est ce qui donne son
      // volume au tube. Et l'on GARDE le test de profondeur — la coque opaque masque
      // la paroi du fond, ce qui creuse la colonne et retire une couche pile au
      // milieu de l'écran, là où le joueur regarde.
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });

    this.manteau = new THREE.Mesh(geoManteau, this.matManteau);
    this.manteau.rotation.x = PENCHE;
    this.manteau.frustumCulled = false;
    this.manteau.visible = false;
    scene.add(this.manteau);

    // Le prolongement de l'autre côté de la couture, aux mêmes conditions que la
    // coque : quand le vaisseau se dessine en deux morceaux, son aura ne peut pas
    // rester d'un seul côté. Seul le MANTEAU est doublé, et il partage géométrie et
    // matière — donc un appel de dessin, zéro mémoire. Doubler aussi les langues, le
    // gravier et les arcs aurait coûté trois appels de plus pour des détails que
    // personne ne cherche à ce moment-là.
    this.couture = new THREE.Mesh(geoManteau, this.matManteau);
    this.couture.rotation.x = PENCHE;
    this.couture.frustumCulled = false;
    this.couture.visible = false;
    scene.add(this.couture);

    // ---- Les langues détachées ----
    // 0,7 NOYAIT LE VAISSEAU. Mesuré dans le jeu, sur un carré de quatre-vingt-dix
    // pixels autour de la coque : l'aura complète faisait passer les pixels
    // saturés de 12,7 % à 33,8 %, et en éteignant les pièces une à une, les
    // langues expliquaient dix-sept de ces vingt et un points — le manteau et le
    // gravier ne pesaient presque rien. Ce sont elles qui se superposent en
    // additif juste devant la coque, et à cet endroit précis on ne voyait plus
    // son propre vaisseau. Une aura doit entourer, pas remplir.
    this.matLangue = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: this.texLangue,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    this.meshLangues = new THREE.InstancedMesh(geometrieLangue(), this.matLangue, LANGUES);
    this.meshLangues.frustumCulled = false;
    this.meshLangues.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.meshLangues.visible = false;
    scene.add(this.meshLangues);

    // ---- Le gravier soulevé ----
    //
    // Un tétraèdre ÉCRASÉ, pas un point. Sous un mélange additif il n'y a ni ombre
    // ni relief : la silhouette est la seule chose qui reste, et une silhouette
    // régulière se lit comme une étincelle. Aplatie sur un axe et tournée, elle
    // redevient l'éclat de quelque chose de cassé.
    this.matGravier = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    this.meshGraviers = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(1, 0),
      this.matGravier,
      GRAVIERS
    );
    this.meshGraviers.frustumCulled = false;
    this.meshGraviers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.meshGraviers.visible = false;
    scene.add(this.meshGraviers);

    // ---- Les arcs ----
    //
    // `linewidth` ne fait rien sous WebGL : un trait fera toujours un pixel, quoi
    // qu'on demande. C'est ici une bonne nouvelle — un fil blanc d'un pixel passe
    // au-dessus du seuil du bloom et en ressort nimbé, ce qui donne exactement la
    // décharge. Un tube épais aurait coûté vingt fois plus cher pour ressembler à
    // une nouille.
    this.arcsPos = new Float32Array(ARCS * ARC_SEGMENTS * 2 * 3);
    const geoArcs = new THREE.BufferGeometry();
    geoArcs.setAttribute('position', new THREE.BufferAttribute(this.arcsPos, 3));
    this.matArcs = new THREE.LineBasicMaterial({
      color: 0xfff6dd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    this.meshArcs = new THREE.LineSegments(geoArcs, this.matArcs);
    this.meshArcs.frustumCulled = false;
    this.meshArcs.visible = false;
    scene.add(this.meshArcs);

    // ---- Les personnalités, tirées une fois pour toutes ----
    //
    // Chaque langue et chaque gravier reçoit ici sa phase, sa vitesse et sa taille,
    // et ne les rendra plus. Deux conséquences, toutes deux voulues : aucun tirage
    // au sort pendant la partie, et une trajectoire qui n'est plus qu'une fonction
    // du temps — donc pas un octet d'état à faire vivre, ni à remettre à zéro.
    this.langues = [];
    for (let i = 0; i < LANGUES; i++) {
      this.langues.push({
        phase: bruit(i * 1.7 + 0.3),
        vitesse: 0.85 + bruit(i * 2.9 + 5) * 0.75,
        angle: bruit(i * 4.3 + 11) * Math.PI * 2,
        tournoie: (bruit(i * 6.1 + 17) - 0.5) * 1.6,
        // UNE COURONNE, PAS UNE GERBE. Nées près de l'axe, les langues bouchaient le
        // centre de la colonne — et le centre de la colonne, sur une caméra inclinée
        // de trente-cinq degrés seulement, c'est exactement l'endroit de l'écran par
        // où arrivent les balles. Mesuré : une balle ambre posée à une unité du
        // vaisseau disparaissait entièrement. Repoussées vers la paroi, les mêmes
        // langues laissent un trou au milieu, et c'est par ce trou qu'on joue.
        rayon: 0.62 + bruit(i * 8.7 + 23) * 0.68,
        taille: 0.4 + bruit(i * 3.7 + 29) * 0.42,
        epaisseur: 0.7 + bruit(i * 9.3 + 31) * 0.6,
        penche: 0.05 + bruit(i * 5.9 + 37) * 0.16,
      });
    }
    this.graviers = [];
    for (let i = 0; i < GRAVIERS; i++) {
      this.graviers.push({
        phase: bruit(i * 2.1 + 1.1),
        vitesse: 0.5 + bruit(i * 3.3 + 7) * 0.55,
        angle: bruit(i * 5.5 + 13) * Math.PI * 2,
        spin: (bruit(i * 7.1 + 19) - 0.5) * 5.2,
        large: 0.7 + bruit(i * 4.9 + 27) * 0.8,
        haut: 0.5 + bruit(i * 6.7 + 33) * 0.5,
        // Mesuré à l'écran : à cette distance de caméra, une unité de monde vaut
        // environ trente et un pixels sur huit cents de haut. Le gravier tenait à
        // l'origine dans 0,05 unité, soit UN PIXEL ET DEMI — il n'existait tout
        // simplement pas à l'image. Trois fois plus gros, il fait trois à sept
        // pixels : de la poussière qui scintille, ce qui est le bon ordre de grandeur.
        taille: 0.08 + bruit(i * 8.1 + 41) * 0.1,
        aplat: 0.45 + bruit(i * 10.1 + 43) * 0.4,
      });
    }
    this.arcs = [];
    for (let i = 0; i < ARCS; i++) {
      this.arcs.push({ phase: bruit(i * 12.1 + 3), cadence: 2.3 + bruit(i * 14.3 + 47) * 1.6 });
    }

    // ---- État ----
    this.horloge = 0;
    this.niveau = 0; // l'intensité RÉELLEMENT affichée, qui poursuit la demandée
    this.eclat = 0; // le coup d'allumage, qui retombe tout seul
    this.allumee = false;
    this.audioTimer = 0;

    // Scratch : tout ce qui serait sinon alloué soixante fois par seconde.
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    // clear() n'a pas de `game` sous la main — et c'est très bien, c'est un
    // extincteur, pas une image. On retient donc l'audio de la dernière frame.
    this._audio = null;

    // setColorAt crée le tampon de couleurs à la première invocation : on le force
    // ici, sinon la première image d'Overdrive alloue deux tableaux typés.
    this._c.setRGB(0, 0, 0);
    for (let i = 0; i < LANGUES; i++) this.meshLangues.setColorAt(i, this._c);
    for (let i = 0; i < GRAVIERS; i++) this.meshGraviers.setColorAt(i, this._c);
    this.meshLangues.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.meshGraviers.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  // LA RESPIRATION.
  //
  // Cinq battements de périodes incommensurables. Leur somme ne se répète qu'au bout
  // de plusieurs minutes, quand l'Overdrive n'en dure que quatre secondes : à
  // l'échelle de l'effet, elle ne se répète jamais.
  //
  // Le premier essai n'en avait que trois, et surtout un TERME DOMINANT — 0,27 sur un
  // total de 0,50. Mesuré : les crêtes tombaient toutes les 0,76 s à seize pour cent
  // près. Ce n'était pas une aura qui respire, c'était un cœur qui bat, et l'œil
  // trouve un pouls régulier en moins d'une seconde. Cinq termes de poids VOISINS,
  // dont deux lents, montent l'irrégularité des écarts entre crêtes à cinquante-quatre
  // pour cent : là, plus rien ne s'anticipe.
  //
  // L'exposant final est ce qui transforme une houle en À-COUPS. Élevée au carré, la
  // somme passe le plus clair de son temps en bas — moyenne 0,30 pour un maximum de
  // 1 — et ne monte que par pointes. Sans lui, l'aura ondulait joliment sans jamais
  // donner l'impression de POUSSER.
  _respire(t) {
    const r =
      0.5 +
      0.16 * Math.sin(t * 3.11) +
      0.17 * Math.sin(t * 5.17 + 1.7) +
      0.16 * Math.sin(t * 8.31 + 4.1) +
      0.13 * Math.sin(t * 13.77 + 0.6) +
      0.09 * Math.sin(t * 21.13 + 2.4);
    const c = Math.min(1, Math.max(0, r));
    return c * c;
  }

  // `intensite` ∈ [0, 1] : 0 éteinte, 1 pleine furie. Le jeu la pilote.
  update(dt, game, intensite = 0) {
    this._audio = game?.audio || null;
    const cible = Math.min(1, Math.max(0, intensite));

    // Le jeu dit COMBIEN, l'aura décide À QUELLE VITESSE. Branchée en direct sur
    // `intensite`, elle s'allumait et s'éteignait au trait ; or ce qui fait qu'une
    // aura est une aura, c'est son inertie — elle jaillit, puis elle retombe en
    // soufflant. Montée trois fois et demie plus vive que la descente, pour ça. Le
    // min(1, …) protège d'une image longue, qui ferait sinon dépasser la cible.
    const k = cible > this.niveau ? 12 : 3.4;
    this.niveau += (cible - this.niveau) * Math.min(1, k * dt);

    if (this.niveau < 0.005 && cible <= 0) {
      if (this.allumee) this._eteint();
      return;
    }
    if (!this.allumee) {
      this.allumee = true;
      this.eclat = 1; // l'aura ne s'allume pas, elle EXPLOSE puis se stabilise
    }

    this.horloge += dt;
    this.eclat = Math.max(0, this.eclat - dt * 3.6);
    const t = this.horloge;
    const n = this.niveau;
    const bat = this._respire(t);

    const p = game.player.position;
    this._manteau(dt, p, n, bat);
    this._langues(t, p, n, bat);
    this._graviers(t, p, n);
    this._arcs(t, p, n, bat);

    // Un tremblement continu, moins fort que celui d'HÉLIOS : c'est le souffle rendu
    // physique, pas un impact. Il monte avec l'intensité et s'arrête avec elle.
    game.fx?.addShake?.(0.15 * n * dt);

    // Le son est entretenu, donc envoyé à vingt hertz et non soixante : chaque appel
    // pose une automation dans le graphe WebAudio, et il n'y a rien à gagner à en
    // poser trois fois plus que l'oreille n'en distingue. On lui passe l'intensité
    // LÉGÈREMENT battue par la respiration, pour que l'image et le son gonflent
    // ensemble — l'irrégularité fine, elle, est fabriquée dans audio.js.
    this.audioTimer -= dt;
    if (this.audioTimer <= 0) {
      this.audioTimer = 0.05;
      game.audio?.furie?.(Math.min(1, n * (0.82 + bat * 0.26)));
    }
  }

  _manteau(dt, p, n, bat) {
    // Le défilement est COMMUN aux trois coquilles : une seule translation de
    // texture, trois vitesses apparentes, parce que l'échelle des v est cuite dans
    // chaque géométrie. On replie l'offset dans [-1, 0] — la période de la texture
    // vaut exactement 1 quel que soit l'étirement, donc le repli est invisible, et
    // sans lui l'offset dérive vers des valeurs où le float perd son piqué.
    const o = this.texFlammes.offset;
    o.y -= (0.62 + bat * 0.8) * dt;
    if (o.y < -1) o.y += 1;
    // Une lente rotation en u : la colonne tourne autour de son axe sans qu'aucun
    // sommet ne bouge. C'est le seul mouvement qu'on obtient gratuitement.
    o.x += dt * 0.05;
    if (o.x > 1) o.x -= 1;

    // L'OPACITÉ EST LE VRAI GARDE-FOU, et le chiffre ne se devine pas : il vient de
    // l'histogramme de la texture, mesuré. Ses traînées valent 0,25 de luminance en
    // MOYENNE, 15 % de sa surface dépasse 0,5 et 3 % seulement dépasse 0,75.
    //
    // Premier réglage tenté, 0,15 : mesuré à l'écran, la colonne ajoutait 0,04 de
    // luminance — invisible, littéralement. C'est le piège du coefficient prudent :
    // on croit doser une transparence quand on multiplie déjà une texture qui est
    // aux trois quarts noire.
    //
    // À 0,42, la masse tiède de la colonne monte à ~0,19 de luminance, et seules ses
    // veines les plus chaudes franchissent le seuil du bloom (0,55). C'est exactement
    // la répartition qu'on cherchait : ce qui éblouit, ce sont les FILAMENTS — deux
    // ou trois pour cent des pixels — et jamais la masse. Une aura qui n'aveugle nulle
    // part n'impressionne pas ; une aura qui aveugle partout efface le jeu.
    this.matManteau.opacity = n * 0.42 * (0.55 + bat * 0.5 + this.eclat * 0.35);

    // Le coup d'allumage gonfle la colonne, mais il est BORNÉ, et par une valeur
    // qui n'a rien d'esthétique : au maximum de la bouffée le rayon monte à 2,65 et
    // l'anneau de frôlement vit à 2,70. Un dixième de plus et l'aura recouvrait la
    // seule chose de l'écran qui explique au joueur pourquoi sa jauge se remplit.
    const large = (0.92 + bat * 0.16 + this.eclat * 0.28) * (0.55 + n * 0.45);
    const haut = (0.84 + bat * 0.32 + this.eclat * 0.22) * (0.6 + n * 0.4);
    this.manteau.visible = true;
    this.manteau.position.set(p.x, p.y, p.z + RECUL);
    this.manteau.scale.set(large, haut, large);
    // Pas de rotation recopiée du vaisseau, et c'est délibéré : la coque roule quand
    // elle vire, l'aura non. Une flamme obéit au haut du monde, pas au haut du pilote —
    // couchée avec le roulis, elle se lisait comme une écharpe accrochée à l'aile.
    // Le renversement, lui, est posé une fois pour toutes au constructeur.

    if (ARENA.wrap && ARENA.playerXMax - Math.abs(p.x) < ARENA.wrapGhostZone) {
      const span = ARENA.playerXMax * 2;
      this.couture.visible = true;
      this.couture.position.set(p.x > 0 ? p.x - span : p.x + span, p.y, p.z + RECUL);
      this.couture.scale.copy(this.manteau.scale);
    } else {
      this.couture.visible = false;
    }
  }

  _langues(t, p, n, bat) {
    // `count` fait moins de travail, il ne cache pas du travail : les instances
    // au-delà ne sont tout simplement pas dessinées. À faible intensité l'aura a donc
    // vraiment moins de langues, et pas vingt-six langues invisibles.
    const combien = Math.max(1, Math.round(LANGUES * (0.32 + n * 0.68)));
    this.meshLangues.count = combien;
    this.meshLangues.visible = true;
    this.meshLangues.position.set(p.x, p.y, p.z + RECUL);

    // Plafonné : au coup d'allumage la somme dépassait 1,6, et une couleur au-delà
    // de 1 ne fait plus qu'une chose — écrêter vers le blanc pur. La bouffée doit se
    // voir comme de l'OR qui gonfle, pas comme un flash d'appareil photo.
    const feu = Math.min(1.15, n * (0.5 + bat * 0.62 + this.eclat * 0.5));
    for (let i = 0; i < combien; i++) {
      const L = this.langues[i];
      const u = (t * L.vitesse + L.phase) % 1;
      const angle = L.angle + t * L.tournoie;
      // Elle s'écarte en montant : une langue qui garde son rayon fait un tube dans
      // le tube, et la colonne redevient un cylindre régulier.
      const r = L.rayon * (0.78 + u * 0.62);
      // Le renversement du manteau est une rotation de maillage ; ici il n'y a pas de
      // maillage commun, alors on le refait à la main — un décalage en z proportionnel
      // à la hauteur, ce qui est exactement ce que cette rotation calcule.
      const y = BASE_Y + 0.15 + u * (2.5 + L.taille * 1.6);
      this._p.set(Math.cos(angle) * r, y, Math.sin(angle) * r + (y - BASE_Y) * TAN_PENCHE);
      // LES PROPORTIONS, ET C'EST TOUT CE QUI COMPTE ICI. Premier essai, une langue
      // large d'une unité pour un et demi de haut : mesurée à l'écran, elle se lisait
      // comme une FEUILLE — un pétale doré posé à côté du vaisseau. Une flamme n'est
      // pas une forme, c'est un RAPPORT : quatre à cinq fois plus haute que large,
      // sans quoi le cerveau range l'objet dans « végétal » et pas dans « feu ».
      // Elle s'étire ET s'amincit en montant, et c'est ce couple-là, pas la taille,
      // qui donne l'impression d'être emportée plutôt que de simplement grandir.
      const e = L.taille * L.epaisseur * 0.58 * (1 - u * 0.55);
      this._s.set(e, L.taille * (0.78 + u * 2.0), e);
      // Penchée vers l'extérieur, dans le plan qui la contient : verticale, elle
      // ressemblait à une bougie posée à côté du vaisseau.
      this._e.set(Math.sin(angle) * L.penche, 0, -Math.cos(angle) * L.penche);
      this._q.setFromEuler(this._e);
      this.meshLangues.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
      // Nulle aux deux bouts : une langue naît de rien et se dissout dans rien. Sous
      // un mélange additif, une couleur noire suffit à l'effacer — pas besoin d'une
      // opacité par instance, qui n'existe de toute façon pas.
      const f = Math.sin(Math.PI * Math.pow(u, 0.62)) * feu;
      this._c.setRGB(f, f * 0.88, f * 0.45);
      this.meshLangues.setColorAt(i, this._c);
    }
    this.meshLangues.instanceMatrix.needsUpdate = true;
    this.meshLangues.instanceColor.needsUpdate = true;
  }

  _graviers(t, p, n) {
    const combien = Math.max(1, Math.round(GRAVIERS * (0.25 + n * 0.75)));
    this.meshGraviers.count = combien;
    this.meshGraviers.visible = true;
    this.meshGraviers.position.set(p.x, p.y, p.z + RECUL);

    for (let i = 0; i < combien; i++) {
      const G = this.graviers[i];
      const u = (t * G.vitesse + G.phase) % 1;
      // DEUX TEMPS, et c'est la signature du manga : le sol chasse d'abord le
      // gravier DEHORS, puis la colonne l'aspire. Une simple montée verticale, testée
      // en premier, donnait de la pluie à l'envers — il manquait la bourrasque.
      const pousse = 1 - Math.exp(-u * 7);
      const leve = Math.max(0, u - 0.18) / 0.82;
      const r = 0.45 + G.large * pousse - 0.5 * leve * leve;
      const angle = G.angle + t * G.spin * (0.35 + leve * 1.9);
      const y = BASE_Y + 3.1 * G.haut * leve * leve;
      this._p.set(Math.cos(angle) * r, y, Math.sin(angle) * r + (y - BASE_Y) * TAN_PENCHE);
      const s = G.taille * (1 - u * 0.3);
      this._s.set(s, s * G.aplat, s * (1.6 - G.aplat));
      this._e.set(t * G.spin, angle * 1.7, t * G.spin * 0.6);
      this._q.setFromEuler(this._e);
      this.meshGraviers.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
      // Franchement DORÉ, pas blanc cassé. À (1 · 0,87 · 0,6) l'éclat passait le seuil
      // du bloom sur ses trois canaux, en ressortait blanc, et vingt-six graviers
      // blancs autour du vaisseau ressemblaient à la neige d'un écran de télévision.
      // La saturation est ce qui distingue un débris chaud d'un artefact.
      // Il s'allume EN MONTANT, et pas au décollage. À pleine lumière dès le premier
      // dixième, le gravier passait le plus clair de sa vie à briller au ras de y = 0,
      // c'est-à-dire précisément dans le plan où voyagent les balles — trente-quatre
      // éclats posés là valaient à eux seuls le reste de l'aura. Il naît maintenant
      // sombre et s'allume à mesure qu'il quitte ce plan.
      const f = Math.min(1, u * 3.2) * Math.pow(1 - u, 0.55) * n;
      this._c.setRGB(f, f * 0.82, f * 0.36);
      this.meshGraviers.setColorAt(i, this._c);
    }
    this.meshGraviers.instanceMatrix.needsUpdate = true;
    this.meshGraviers.instanceColor.needsUpdate = true;
  }

  _arcs(t, p, n, bat) {
    // Ils ne claquent qu'AU SOMMET de la poussée : hors des crêtes de respiration et
    // en deçà de la moitié de l'intensité, il n'y a rien. C'est ce qui les rend
    // rares, donc lisibles comme un événement. Allumés en permanence, ils passaient
    // pour un défaut d'affichage.
    const pret = n > 0.5 && bat > 0.48;
    let vivants = 0;
    for (let a = 0; a < ARCS; a++) {
      const A = this.arcs[a];
      const cycle = t * A.cadence + A.phase;
      const ep = Math.floor(cycle);
      const debut = a * ARC_SEGMENTS * 2 * 3;
      if (!pret || cycle - ep > 0.13) {
        // Rangé loin, jamais détruit : la géométrie ne change pas de taille, seul son
        // contenu bouge. Un setDrawRange par arc aurait fragmenté l'appel de dessin.
        for (let k = 0; k < ARC_SEGMENTS * 2; k++) {
          this.arcsPos[debut + k * 3] = 0;
          this.arcsPos[debut + k * 3 + 1] = -1000;
          this.arcsPos[debut + k * 3 + 2] = 0;
        }
        continue;
      }
      vivants++;
      // Le tracé ne dépend que de l'ÉPOQUE, pas de l'instant : pendant les trois
      // images où l'arc vit, il reste rigoureusement le même. C'est cette immobilité
      // qui le fait lire comme une décharge et non comme du bruit.
      const a0 = bruit(ep * 17.3 + a) * Math.PI * 2;
      const course = 1.1 + bruit(ep * 5.1 + a * 3.7) * 2.3;
      const y0 = BASE_Y + 0.5 + bruit(ep * 9.7 + a * 2.3) * 0.7;
      const y1 = y0 + 0.6 + bruit(ep * 3.3 + a * 5.9) * 1.2;
      let px = 0;
      let py = 0;
      let pz = 0;
      for (let k = 0; k <= ARC_SEGMENTS; k++) {
        const f = k / ARC_SEGMENTS;
        const ang = a0 + course * f;
        const y = y0 + (y1 - y0) * f;
        const r = rayonColonne(y) * (1.02 + (bruit(ep * 3.1 + a * 11.3 + k * 7.7) - 0.5) * 0.4);
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        // Chaque point sert de fin au segment précédent et de début au suivant :
        // c'est ce qui transforme une polyligne en LineSegments sans trou.
        if (k > 0) {
          const j = debut + (k - 1) * 6;
          this.arcsPos[j] = px;
          this.arcsPos[j + 1] = py;
          this.arcsPos[j + 2] = pz;
          this.arcsPos[j + 3] = x;
          this.arcsPos[j + 4] = y;
          this.arcsPos[j + 5] = z;
        }
        px = x;
        py = y;
        pz = z;
      }
    }
    this.meshArcs.visible = vivants > 0;
    if (!this.meshArcs.visible) return;
    this.meshArcs.position.copy(p);
    this.meshArcs.geometry.attributes.position.needsUpdate = true;
    this.matArcs.opacity = 0.5 + n * 0.45;
  }

  _eteint() {
    this.allumee = false;
    this.niveau = 0;
    this.eclat = 0;
    // L'horloge repart de zéro pour que chaque Overdrive s'allume sur la même image :
    // le coup de départ est un moment de jeu, il ne doit pas dépendre de la dernière
    // fois qu'on l'a joué.
    this.horloge = 0;
    this.manteau.visible = false;
    this.couture.visible = false;
    this.meshLangues.visible = false;
    this.meshGraviers.visible = false;
    this.meshArcs.visible = false;
    this.matManteau.opacity = 0;
    this._audio?.furie?.(0);
  }

  clear() {
    this._eteint();
  }
}
