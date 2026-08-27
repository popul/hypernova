// L'ESCALE « CHAMP » — on ne regarde plus les cailloux, on est dedans.
//
// `createAsteroids` fait l'autre moitié du travail : quatre-vingt-dix rochers
// posés à cent unités sous le plan de jeu, qui disent « il y a un champ par là ».
// Ici on y est. La différence n'est pas une affaire de nombre, c'est une affaire
// de DISTANCE : des masses qui passent à dix unités, qu'on ne voit jamais en
// entier, et qui sortent du cadre par le côté au lieu de s'éteindre au loin.
//
// LE RISQUE, ET IL N'Y EN A QU'UN. Les tirs ennemis sont petits, rapides et
// roses, et un bloc de dix unités posé au mauvais endroit avale une salve entière
// sans que le joueur comprenne de quoi il est mort. D'où la règle qui commande
// tout le fichier :
//
//   AUCUN caillou — ni même un grain de poussière — n'existe à moins de dix-sept
//   unités de l'axe de jeu, ni à moins de neuf unités au-dessous du plan.
//
// Elle est appliquée à la SOURCE et non vérifiée après coup : la distance
// latérale d'un bloc se DÉDUIT de son rayon (|x| = 17 + rayon + …). Un tirage
// qu'on vérifie finit toujours par passer au travers un jour ou l'autre, et
// personne ne saura pourquoi cette partie-là était injouable.
//
// LA CAMÉRA EST PENCHÉE, et c'est ce qui décide de la composition. Elle est en
// (0, 21, 27) et regarde (0, 0, -3) : trente-cinq degrés vers le bas. Le monde
// au-DESSUS du plan de jeu est donc presque entièrement hors cadre — le bord haut
// de l'image ne monte qu'à y = 17,7 au niveau du vaisseau, et il redescend d'un
// huitième d'unité par unité de profondeur : à z = -100 il est déjà à y = 5.
// Un plafond de rochers ne se verrait pas ; il se contenterait de masquer la
// formation ennemie, qui arrive précisément par le haut de l'écran. Le champ se
// joue donc sur les CÔTÉS et par le DESSOUS, et les masses qui semblent passer
// au-dessus sont en réalité dans les coins hauts de l'image, très à droite ou
// très à gauche.
//
// BUDGET. Cinq appels de dessin — quatre couches instanciées et la poussière — et
// vingt mille quatre cent quarante triangles. La cible est le mobile, et le goulot
// y est le remplissage, pas la géométrie : d'où une matière lambert plutôt qu'une
// matière PBR. Un caillou mat n'a aucun reflet spéculaire à montrer, et ces
// masses-là couvrent la moitié de l'écran.

import * as THREE from 'three';
import { geometriesCailloux, matiereRoche, textureRoche } from '../cailloux.js';

// Générateur déterministe, repris de landmarks.js : deux parties de même graine
// doivent traverser le même champ, sinon ce n'est plus un lieu.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Le couloir de jeu. Le vaisseau va jusqu'à x = ±14,5, les tirs sont effacés à
// x = ±26 et z = -34, la formation descend jusque vers z = -45. On ne garde que
// deux unités et demie de marge latérale et six sous le plan : c'est peu, et
// c'est exprès — le champ doit passer PRÈS, sinon autant le laisser au loin.
const GARDE_X = 17;
const GARDE_Y = 9;

// Fin de course. La caméra est à z = 27 en paysage et recule jusqu'à z = 39 en
// portrait ; il faut que le bloc soit SORTI du cadre, et pas seulement passé, au
// moment où on le renvoie au fond. Cinquante-deux tient dans les deux formats.
const Z_RECYCLAGE = 52;

// Les trente premières unités de la course servent à faire grossir le bloc depuis
// rien. Le brouillard suffirait à masquer l'apparition sur les secteurs brumeux —
// mais pas sur tous, et le montage des décors le coupe par défaut (voir plus bas).
// Une échelle qui monte de zéro, elle, ne dépend de personne.
const RAMPE = 30;

// LA SOURDINE. Le montage des décors assombrit d'un tiers tout ce qu'il ajoute,
// pour que rien ne dispute la lisibilité aux projectiles ; ce champ-ci refuse la
// règle générale et fixe son ton lui-même, parce qu'il est le seul décor qu'on
// traverse au lieu de le regarder. Mesuré à l'écran sur les deux extrêmes de la
// table des escales — le brun sombre de la Ceinture et le gris métallique de L2 —
// un tiers en moins ne rendait pas les masses discrètes, il les rendait ILLISIBLES :
// des taches brunes sans facettes ni silhouette, c'est-à-dire précisément le
// papier peint qu'on cherchait à éviter. Un cinquième suffit, et la marge de
// lisibilité reste énorme : la roche est désaturée quand les tirs sont magenta
// saturé, et ces derniers sont en `toneMapped: false`, donc insensibles à
// l'exposition que l'escale baisse par ailleurs.
const SOURDINE = 0.78;

// LES QUATRE CALIBRES. Ce n'est pas une seule population qu'on regarde défiler à
// quatre vitesses : chaque couche a sa taille, sa densité, sa portée latérale et
// son ton. C'est le rapport entre elles qui fait la profondeur — une couche seule
// donne un papier peint qui glisse, quel que soit le nombre de cailloux dessus.
//
// `fond` est la part de blocs placés SOUS le plan de jeu plutôt que sur les
// flancs. Elle monte avec la distance : de près on est entre deux parois, de loin
// on survole un sol.
// Combien de silhouettes différentes on tire. Quatre suffisent : au-delà, les
// archétypes se ressemblent entre eux avant que l'œil ne s'en aperçoive, et
// chaque forme de plus est une géométrie de plus en mémoire.
const FORMES_PAR_COUCHE = 4;

const COUCHES = [
  // Les colosses. Seize, énormes, les plus rapides. Ils ne remplissent rien : ils
  // donnent l'échelle, et un seul qui traverse l'image en deux secondes vaut cent
  // cailloux moyens.
  {
    n: 16,
    detail: 2,
    cassures: 3,
    rayon: [6.5, 14],
    vitesse: 21,
    zLoin: -175,
    ton: 1,
    fond: 0.3,
    largeur: 100,
    creux: 24,
    ecart: 30,
    hauteur: 34,
  },
  // Les proches. Le gros du volume à hauteur de vaisseau.
  {
    n: 46,
    detail: 1,
    cassures: 2,
    rayon: [2.4, 5.6],
    vitesse: 13.5,
    zLoin: -185,
    ton: 0.9,
    fond: 0.45,
    largeur: 140,
    creux: 28,
    ecart: 44,
    hauteur: 38,
  },
  // Les médians. Ce sont eux qui font la DENSITÉ : assez nombreux pour qu'on ne
  // voie jamais de trou, assez petits pour ne rien coûter.
  {
    n: 108,
    detail: 1,
    cassures: 2,
    rayon: [1.1, 3],
    vitesse: 7.5,
    zLoin: -200,
    ton: 0.76,
    fond: 0.55,
    largeur: 190,
    creux: 38,
    ecart: 62,
    hauteur: 44,
  },
  // Le fond. Presque immobile, très étalé, très sombre : il ne se lit pas comme
  // des cailloux mais comme un SOL qui s'éloigne, et c'est ce qui referme le lieu.
  {
    n: 150,
    detail: 0,
    cassures: 1,
    rayon: [2, 6],
    vitesse: 2.8,
    zLoin: -260,
    ton: 0.5,
    fond: 0.8,
    largeur: 300,
    creux: 62,
    ecart: 110,
    hauteur: 50,
  },
];

// La poussière suit les mêmes règles de placement que les blocs, avec un rayon nul.
const POUSSIERE = {
  n: 240,
  fond: 0.55,
  largeur: 150,
  creux: 34,
  ecart: 46,
  hauteur: 40,
  zLoin: -110,
};

// OÙ NAÎT UN BLOC. La règle du couloir est ici, et nulle part ailleurs.
//
// Deux familles, et c'est volontairement tout ce qu'il y a. Les blocs de FLANC,
// dont la garde est horizontale et qui peuvent donc se promener à n'importe quelle
// hauteur — ce sont eux qui remplissent les quatre coins de l'image. Et les blocs
// de FOND, sous le plan de jeu, libres en x, qui passent sous le vaisseau.
//
// La dérive lente est TAILLÉE pour ne jamais rapprocher un bloc du couloir : celle
// d'un bloc de flanc pointe toujours vers l'extérieur, celle d'un bloc de fond
// toujours vers le bas. C'est ce qui rend la garantie vraie pendant toute la
// course, et pas seulement à la naissance — un champ qui dérive « un peu au
// hasard » finit par déposer une masse dans l'axe de tir à la trentième seconde.
function placer(c, rayon, r, cible) {
  if (r() < c.fond) {
    cible.x = (r() - 0.5) * c.largeur;
    cible.y = -(GARDE_Y + rayon) - Math.pow(r(), 1.5) * c.creux;
    cible.vx = (r() - 0.5) * 0.5;
    cible.vy = -r() * 0.3;
  } else {
    const cote = r() < 0.5 ? -1 : 1;
    cible.x = cote * (GARDE_X + rayon + Math.pow(r(), 0.75) * c.ecart);
    // Décentré vers le bas : au-dessus, le cadre se referme vite (voir l'entête).
    cible.y = (r() - 0.58) * c.hauteur;
    cible.vx = cote * r() * 0.4;
    cible.vy = (r() - 0.5) * 0.35;
  }
}

function grainTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createChamp({ teinte = 0x6b5a48, densite = 1, seed = 1 } = {}) {
  const group = new THREE.Group();
  const base = new THREE.Color(teinte);
  const r = rng(seed);
  // Le tirage du recyclage est séparé de celui de la naissance : replacer un bloc
  // en vol ne doit pas décaler la suite de la graine, sinon deux parties de même
  // graine divergeraient au premier hoquet d'image.
  const rr = rng(seed * 7919 + 13);
  // La texture de roche est peinte UNE fois et prêtée aux quatre couches.
  const planche = textureRoche({ seed });
  const dummy = new THREE.Object3D();
  const couleur = new THREE.Color();
  const couches = [];

  for (let ci = 0; ci < COUCHES.length; ci++) {
    const c = COUCHES[ci];
    const n = Math.max(1, Math.round(c.n * densite));
    // DE VRAIS CAILLOUX CASSÉS, et non plus une sphère bosselée.
    //
    // On partait d'un icosaèdre qu'on déformait par ondes puis qu'on rabotait de
    // trois plans. De loin ça allait ; de près ça restait une patate, parce qu'une
    // déformation par ondes est LISSE par construction et qu'aucune arête n'en
    // sort jamais franche. Les formes viennent maintenant d'une boîte découpée par
    // demi-espaces — c'est littéralement ce que fait une fracture — et la
    // silhouette est en segments droits, comme un morceau de quelque chose de plus
    // gros. Chaque couche pioche la sienne : on ne reconnaît plus la même patate
    // répétée d'un plan à l'autre.
    const formes = geometriesCailloux({
      nb: FORMES_PAR_COUCHE,
      seed: seed * 131 + ci * 17 + 1,
      detail: c.detail,
    });
    const geo = formes[ci % formes.length];
    const rGeo = geo.userData.rayon;
    for (const autre of formes) if (autre !== geo) autre.dispose();
    const ton = base.clone().multiplyScalar(c.ton * SOURDINE);
    const mat = matiereRoche({
      teinte: ton,
      seed,
      // Une seule planche prêtée aux quatre couches : quatre fois la même image
      // coûterait quatre mégaoctets pour rien.
      texture: planche,
      emission: 0.28,
      // Un plancher d'émission, et il ne sert qu'aux paliers du bout du voyage.
      // Passé Neptune, l'hémisphérique tombe à un quart et la teinte du lieu est
      // déjà presque noire : les faces qui ne regardent pas la lumière de bord
      // disparaissent entièrement, et l'escale ne montre plus rien du tout — un
      // détour qu'on a payé pour voir un endroit qui n'existe pas à l'image.
      // Un peu moins d'un tiers de l'albédo relève ces faces-là sans toucher aux
      // paliers éclairés, où l'apport se noie sous une lumière deux fois plus
      // forte. Ce n'est pas de la roche qui brille : c'est un noir qui n'est
      // jamais tout à fait le fond.
      flatShading: true,
      fog: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    // La boule englobante d'un champ de deux cents unités de large ne veut rien
    // dire : ou bien elle est toujours visible, ou bien elle escamote la moitié
    // des blocs. On coupe l'écrêtage plutôt que de le laisser deviner.
    mesh.frustumCulled = false;

    const blocs = [];
    for (let i = 0; i < n; i++) {
      const rayon = c.rayon[0] + Math.pow(r(), 1.7) * (c.rayon[1] - c.rayon[0]);

      // LE MÉLANGE DES SILHOUETTES. Un bloc sur cinq est un ÉCLAT : un axe long,
      // deux axes écrasés. C'est ce qui empêche le champ de ressembler à un sac de
      // pommes de terre, et un éclat qui tourne lentement se lit tout de suite
      // comme le morceau de quelque chose de beaucoup plus gros.
      let ex = 0.55 + r() * 0.9;
      let ey = 0.45 + r() * 0.85;
      let ez = 0.55 + r() * 0.9;
      if (r() < 0.22) {
        const axe = Math.floor(r() * 3);
        ex = axe === 0 ? 1 : 0.26 + r() * 0.2;
        ey = axe === 1 ? 1 : 0.26 + r() * 0.2;
        ez = axe === 2 ? 1 : 0.26 + r() * 0.2;
      }
      // Les trois facteurs sont normalisés sur le plus grand : quelle que soit la
      // déformation, le bloc tient exactement dans la boule de rayon `rayon`, qui
      // est celle dont on s'est servi pour le placer.
      const k = rayon / (rGeo * Math.max(ex, ey, ez));

      // Une masse tourne d'autant plus lentement qu'elle est grosse. Ce n'est pas
      // de la physique, c'est de la lecture : c'est la lenteur qui dit la taille.
      const lent = 0.45 / (1 + rayon * 0.32);

      const b = {
        rayon,
        ex: ex * k,
        ey: ey * k,
        ez: ez * k,
        x: 0,
        y: 0,
        z: c.zLoin + r() * (Z_RECYCLAGE - c.zLoin),
        vx: 0,
        vy: 0,
        // La vitesse varie DANS la couche. Sans ça, quatre plans rigides glissent
        // les uns sur les autres et on voit les plans, pas la profondeur.
        vz: c.vitesse * (0.82 + r() * 0.36),
        ax: r() * 6.2832,
        ay: r() * 6.2832,
        az: r() * 6.2832,
        rx: (r() - 0.5) * 1.2 * lent,
        ry: (r() - 0.5) * 1.2 * lent,
        rz: (r() - 0.5) * 1.2 * lent,
      };
      placer(c, rayon, r, b);
      blocs.push(b);

      // Teinte par instance. Un seul paramètre de luminosité et un seul de
      // température : la roche part au roux d'un côté, au gris froid de l'autre.
      // C'est assez pour que deux blocs voisins ne soient jamais le même objet, et
      // assez peu pour que la couleur du lieu reste celle qu'on lui a demandée.
      const v = 0.7 + Math.pow(r(), 0.8) * 0.6;
      const chaud = 0.93 + r() * 0.14;
      couleur.setRGB(v * chaud, v, v / chaud);
      mesh.setColorAt(i, couleur);
    }
    mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    couches.push({ c, mesh, blocs });
  }

  // LA POUSSIÈRE. C'est elle, et pas les blocs, qui donne la vitesse : une masse
  // de quinze unités qui passe à trente met deux secondes à traverser l'image, un
  // grain à cinq unités la traverse en un dixième. Sans elle, on flotte.
  //
  // Elle obéit à la même garde que les blocs. Un point d'un demi-pixel ne
  // masquerait aucun tir — mais il y en a deux cent quarante, et une bruine sur
  // l'axe de tir est exactement ce qu'on cherche à ne pas faire.
  const np = Math.max(20, Math.round(POUSSIERE.n * densite));
  const grains = new Float32Array(np * 3);
  const grainsV = new Float32Array(np * 3);
  const tmp = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let i = 0; i < np; i++) {
    placer(POUSSIERE, 0, r, tmp);
    grains[i * 3] = tmp.x;
    grains[i * 3 + 1] = tmp.y;
    grains[i * 3 + 2] = POUSSIERE.zLoin + r() * (Z_RECYCLAGE - POUSSIERE.zLoin);
    grainsV[i * 3] = tmp.vx;
    grainsV[i * 3 + 1] = tmp.vy;
    grainsV[i * 3 + 2] = 9 + r() * 19;
  }
  const geoGrains = new THREE.BufferGeometry();
  geoGrains.setAttribute('position', new THREE.BufferAttribute(grains, 3));
  const matGrains = new THREE.PointsMaterial({
    size: 0.62,
    map: grainTexture(),
    // Plus clair que la roche : un grain est trop petit pour montrer une face
    // éclairée, il faut qu'il porte sa lumière avec lui pour se voir passer.
    color: base.clone().multiplyScalar(1.2 * SOURDINE),
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    sizeAttenuation: true,
    fog: true,
  });
  const poussiere = new THREE.Points(geoGrains, matGrains);
  poussiere.frustumCulled = false;
  // Ordre de rendu non nul, et c'est délibéré : le montage des décors repousse
  // derrière tout le reste ce qu'il trouve à zéro. Un nuage transparent qui
  // n'écrit pas la profondeur et qu'on dessine EN PREMIER se fait recouvrir par
  // les blocs qui sont pourtant derrière lui.
  poussiere.renderOrder = 4;
  group.add(poussiere);

  return {
    group,
    // On traverse ce champ : il vit dans la même profondeur que le combat. Le
    // montage des décors lit ce drapeau et lui épargne les trois traitements
    // réservés au lointain — couper le brouillard, le mettre à l'échelle du
    // cadrage, l'assombrir d'un tiers. Chacun des trois le casserait à sa façon,
    // et le second le rendrait injouable : mettre un champ à l'échelle divise
    // aussi les DISTANCES, et ferait passer dans le couloir de jeu des masses
    // calibrées pour l'éviter.
    proche: true,
    update(dt) {
      // Un retour d'onglet ne doit pas téléporter le champ d'un bout à l'autre.
      const pas = Math.min(dt, 0.1);

      for (const { c, mesh, blocs } of couches) {
        for (let i = 0; i < blocs.length; i++) {
          const b = blocs[i];
          b.z += b.vz * pas;
          b.x += b.vx * pas;
          b.y += b.vy * pas;
          b.ax += b.rx * pas;
          b.ay += b.ry * pas;
          b.az += b.rz * pas;
          if (b.z > Z_RECYCLAGE) {
            b.z -= Z_RECYCLAGE - c.zLoin;
            // Replacé, et pas seulement reculé : les colosses bouclent en onze
            // secondes, et voir repasser le même bloc au même endroit trois fois
            // dans une vague suffit à défaire tout le décor.
            placer(c, b.rayon, rr, b);
          }
          const t = Math.max(0, Math.min(1, (b.z - c.zLoin) / RAMPE));
          const e = t * t * (3 - 2 * t);
          dummy.position.set(b.x, b.y, b.z);
          dummy.rotation.set(b.ax, b.ay, b.az);
          dummy.scale.set(b.ex * e, b.ey * e, b.ez * e);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }

      for (let i = 0; i < np; i++) {
        const j = i * 3;
        grains[j] += grainsV[j] * pas;
        grains[j + 1] += grainsV[j + 1] * pas;
        grains[j + 2] += grainsV[j + 2] * pas;
        if (grains[j + 2] > Z_RECYCLAGE) {
          placer(POUSSIERE, 0, rr, tmp);
          grains[j] = tmp.x;
          grains[j + 1] = tmp.y;
          grains[j + 2] = POUSSIERE.zLoin;
          grainsV[j] = tmp.vx;
          grainsV[j + 1] = tmp.vy;
        }
      }
      geoGrains.attributes.position.needsUpdate = true;
    },
  };
}
