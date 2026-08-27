// Géométries des vaisseaux, générées en code : aucun modèle externe.
// Style low-poly flat-shaded ; les accents émissifs sont amplifiés par le bloom.

import * as THREE from 'three';
import { PLAYER, GRAZE, BOSS } from './constants.js';

function mat(
  color,
  { emissive = 0x000000, emissiveIntensity = 1, metalness = 0.6, roughness = 0.35 } = {}
) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    metalness,
    roughness,
    flatShading: true,
  });
}

// toneMapped:false + couleur saturée → dépasse le seuil du bloom, halo garanti.
function glow(color) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

// Livrées : la coque du joueur est peinte, pas texturée. Une teinte de coque, une
// teinte d'accent pour tout ce qui brille, et c'est suffisant pour que deux pilotes
// se reconnaissent d'un coup d'œil dans un classement.
export const LIVREES = [
  { id: 'flotte', nom: 'Flotte', hull: 0xc8d6e8, dark: 0x2a3550, accent: 0x4ff2ff },
  { id: 'braise', nom: 'Braise', hull: 0xe8d0b8, dark: 0x4a2418, accent: 0xff9a3c },
  { id: 'menthe', nom: 'Menthe', hull: 0xd6f0e0, dark: 0x1c4038, accent: 0x5cffc0 },
  { id: 'orage', nom: 'Orage', hull: 0x9aa8c8, dark: 0x1e2238, accent: 0xb46cff },
  { id: 'or', nom: 'Or blanc', hull: 0xf0e6c8, dark: 0x3a3020, accent: 0xffc857 },
  { id: 'sang', nom: 'Corsaire', hull: 0xd8c0c0, dark: 0x40161c, accent: 0xff4d6d },
];

// ---------------------------------------------------------------- LES CARÈNES
//
// TROIS SILHOUETTES, ET RIEN QUE LA SILHOUETTE.
//
// Les trois coques ne se distinguaient que par trois nombres — longueur du nez,
// taille de l'aile, angle de flèche — posés sur le MÊME assemblage. Mesuré : leurs
// boîtes englobantes faisaient 3,20 × 2,49, 3,94 × 2,25 et 2,83 × 2,18 unités.
// Rasterisées dans la caméra du jeu, qui plonge de trente-cinq degrés et écrase donc
// la profondeur d'un facteur 0,57 quand elle garde la largeur en entier, il en
// restait trois taches de 126 × 89, 156 × 82 et 110 × 79 pixels — trois rapports de
// 1,41, 1,91 et 1,39, remplis à 288, 308 et 296 cases sur une même grille. Sept pour
// cent d'écart. Ce n'était pas trois vaisseaux, c'était le même trois fois.
//
// Ce qui se lit à cette taille n'est ni le nez, ni les tuyères, ni la peinture :
// c'est L'ÉLANCEMENT — largeur contre profondeur écrasée — et la MASSE. Les trois
// carènes sont donc redessinées autour de ces deux grandeurs, et chacune pousse la
// sienne jusqu'au bout. Même mesure, après :
//
//   dague   (ORION)    82 × 103 px, rapport 0,80. Plus longue que large : une lame,
//                      deux moignons d'ailes collés au corps, tout est dans l'axe.
//   faucon  (HÉLIOS)  172 × 72 px, rapport 2,39. Trois fois plus large que profonde :
//                      deux ailes en flèche parties du nez, saumons relevés.
//   enclume (VULCAIN) 108 × 89 px, rapport 1,22. Presque carrée, et deux fois plus
//                      haute que les deux autres : un fût LARGE DEVANT, une table
//                      posée dessus, et rien qui dépasse.
//
// L'ENCOMBREMENT NE GROSSIT PAS, ET CE N'EST PAS UNE COQUETTERIE. Le rayon de
// collision (PLAYER.radius) est le même pour les trois : une carène qui aurait
// l'air plus grosse sans se faire toucher davantage passerait pour une carène
// avantagée, et personne ne comprendrait pourquoi. Les trois emprises au sol
// mesurées après redessin — 5,9, 8,3 et 5,8 unités² — sont donc toutes INFÉRIEURES
// à celles d'avant (8,0, 8,9 et 6,2), et le point le plus éloigné de l'axe reste à
// 2,39 au pire, exactement comme avant. Trois contours de plus, zéro place de plus.
//
// Ce qui NE change pas non plus, et qui les garde de la même flotte : le facettage,
// les quatre mêmes matières (coque, sombre, accent, verrière), le nez qui pointe
// vers -Z, les tuyères nommées `exhaust`, et le fait que chaque module acheté
// AJOUTE quelque chose au contour. Les modules ne sont plus posés aux mêmes
// coordonnées pour tout le monde — un canon sous l'aile du faucon serait dans le
// vide sur la dague — mais ils racontent la même chose sur les trois.

// ------------------------------------------------------------------- UNE AILE
//
// Une aile est un QUADRILATÈRE : deux cordes de longueurs différentes, décalées
// l'une par rapport à l'autre. C'est cet écart — la flèche — qui fait qu'on lit
// « chasseur » plutôt que « planche ». L'ancienne version posait une BoxGeometry
// pivotée : corde constante d'un bout à l'autre, donc aucune flèche possible, et
// les trois carènes héritaient de la même planche à trois angles près.
//
// On déforme donc les sommets d'une boîte au lieu de la tourner. Deux pièges s'y
// cachent, et aucun des deux ne se voit avant d'avoir tout rebranché :
//
//  1. LE SENS DES FACES. Fabriquer l'aile bâbord en niant l'envergure retourne
//     l'ordre des triangles. three.js sait le rattraper sur un mesh dont la matrice
//     a un déterminant négatif — mais soutien.js FUSIONNE les carènes des ailiers
//     en appliquant les matrices aux géométries, et une géométrie n'a plus de
//     matrice à inspecter : les ailes gauches des deux ailiers disparaîtraient,
//     face arrière tournée vers la caméra. On inverse donc l'index à la main.
//  2. LES NORMALES restent celles de la boîte d'origine, et c'est délibéré : sous
//     flatShading, three.js ne les lit pas — il recalcule la normale par facette
//     dans le fragment, à partir des dérivées d'écran. L'attribut doit EXISTER
//     (mergeGeometries exige le même jeu d'attributs partout) mais son contenu est
//     mort. Le recalculer coûterait une passe pour rien.
//
// Corollaire de ce même mergeGeometries : tout ce qu'on assemble ici doit rester
// INDEXÉ. Les polyèdres de three.js (Octahedron, Icosahedron, Tetrahedron) ne le
// sont pas — en glisser un dans une carène ferait planter la fusion des ailiers,
// très loin d'ici et sans rapport apparent.
function aileGeo({ cote, envergure, emplanture, saumon, recul, epaisseur, diedre, ancrage }) {
  const geo = new THREE.BoxGeometry(1, epaisseur, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) + 0.5; // 0 à l'emplanture, 1 au saumon
    const corde = emplanture + (saumon - emplanture) * t;
    p.setX(i, cote * (ancrage[0] + t * envergure));
    p.setY(i, p.getY(i) + ancrage[1] + diedre * t);
    p.setZ(i, ancrage[2] + recul * t + p.getZ(i) * corde);
  }
  if (cote < 0) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  return geo;
}

// Les plans de coque. `corps` dessine ce qui appartient en propre à la carène ;
// tout le reste — empennage, tuyères, modules, paliers — est monté par
// createPlayerShip aux ancrages déclarés ici. Toutes les cotes sont exprimées
// AVANT le 0,78 que createPlayerShip applique en bloc à la fin, et ce facteur est
// le MÊME pour les trois : rapetisser une carène pour la faire tenir aurait été
// une façon déguisée de changer sa place dans l'arène.
const PLANS = {
  // ---------------------------------------------------------------- LA DAGUE
  // Deux fois plus longue que large. La règle de dessin est simple : RIEN NE
  // S'ÉCARTE DE L'AXE. Les ailes sont des moignons collés au fuselage, les tuyères
  // sont à demi enfoncées dans la queue, et le seul appendice qui dépasse est
  // l'accent des saumons. Ce qui reste à l'écran, c'est un trait.
  dague: {
    corps(shell, M) {
      // La lame : un cône à QUATRE pans, aplati de moitié, qui court d'un bout à
      // l'autre du vaisseau. Quatre pans et non six parce qu'un quadrilatère
      // aplati a des ARÊTES VIVES en haut et en bas — une section en losange, la
      // section d'une lame — quand un hexagone aplati rend un galet.
      //
      // Rayon 0,46 et non 0,36 : rasterisée à la taille du jeu, la version fine
      // rendait un trait de deux pixels sur son premier tiers, et un trait de deux
      // pixels sous le bloom, ce n'est plus une coque, c'est un fil. La largeur
      // hors-tout ne bouge pas pour autant — ce sont les saumons qui la fixent, à
      // trois fois cette distance de l'axe.
      shell.add(
        new THREE.Mesh(
          new THREE.ConeGeometry(0.46, 3.45, 4)
            .rotateX(-Math.PI / 2)
            .scale(1, 0.44, 1)
            .translate(0, 0, -0.2),
          M.hull
        )
      );

      // La soie. Elle s'arrête à mi-corps, et c'est tout l'intérêt : posée sur
      // TOUTE la longueur, cette pièce sombre couvrait le dessus du cône d'un bout
      // à l'autre — vue d'en haut, la dague devenait une baguette noire, et la
      // seule chose qu'on lisait d'elle était sa couleur, pas sa forme. Réduite à
      // l'arrière, elle laisse la moitié avant en coque claire : la lame brille,
      // la poignée est sombre, et l'œil sait aussitôt de quel côté ça pique.
      const soie = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 1.5), M.dark);
      soie.position.set(0, 0.19, 0.55);
      shell.add(soie);

      // La verrière est POUSSÉE LOIN DEVANT et étirée : c'est elle qui dit dans
      // quel sens va la lame. Centrée, elle en aurait fait un fer de flèche
      // symétrique, sans avant ni arrière.
      const verriere = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M.verriere);
      verriere.scale.set(0.95, 0.6, 2.4);
      verriere.position.set(0, 0.23, -0.55);
      shell.add(verriere);

      for (const cote of [-1, 1]) {
        shell.add(
          new THREE.Mesh(
            aileGeo({
              cote,
              envergure: 0.95,
              emplanture: 1.5,
              saumon: 0.45,
              recul: 0.85,
              epaisseur: 0.11,
              diedre: -0.04,
              ancrage: [0.3, -0.02, 0.35],
            }),
            M.hull
          )
        );
        const saumon = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.5), M.accent);
        saumon.position.set(cote * 1.25, -0.06, 1.2);
        shell.add(saumon);
      }
    },
    // Empennage bas et long : une dérive haute referait de la dague une croix vue
    // d'en haut, et une croix, c'est déjà l'enclume.
    derive: { t: [0.08, 0.46, 0.78], y: 0.3, z: 1.05 },
    moteur: { x: 0.32, y: -0.06, z: 1.34, r: [0.17, 0.22, 0.62], feu: 0.14, recul: 0.34 },
    // Des tubes de 1,4 — les plus longs des trois carènes — couchés LE LONG du nez
    // et serrés contre l'axe. Sur cette coque, un module doit allonger : posé en
    // travers il aurait épaissi la seule chose qui la distingue.
    canon: { x: 0.42, pas: 0.24, y: -0.12, z: -0.45, t: [0.06, 0.08, 1.4] },
    missile: { x: 0.66, pas: 0.26, y: -0.16, z: 0.45, t: [0.18, 0.15, 0.55] },
    plaque: { x: 0.72, y: 0.06, z: 0.62, ry: -0.55, t: [0.6, 0.14, 0.6] },
    // Le canard du palier III est PLAQUÉ sur la lame, pas planté dessus. Grand et
    // relevé — ce qu'il était — il posait deux plaques claires en pleine verrière,
    // et le bloom recollait les trois en une boule de lumière : la coque la plus
    // effilée du jeu finissait avec le nez le plus gros. À plat et en retrait, il
    // allonge au lieu d'élargir.
    canard: { x: 0.34, y: 0.02, z: -0.75, ry: 0.42, rz: -0.1, t: [0.46, 0.07, 0.3] },
    anneau: { r: 0.4, y: 0.12, z: 0.05 },
    cadran: [0, 0.42, 0.72],
  },

  // --------------------------------------------------------------- LE FAUCON
  // Deux fois plus large que profonde. Tout est dans l'envergure : le fuselage est
  // réduit à un fuseau qui ne pèse rien dans la silhouette, et les deux ailes
  // partent du NEZ pour finir derrière la poupe. Le bord d'attaque et l'axe du
  // fuselage forment donc un chevron unique, d'un saumon à l'autre — c'est ce
  // chevron qu'on reconnaît, pas le vaisseau qu'il y a dedans.
  faucon: {
    corps(shell, M) {
      shell.add(
        new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 2.0, 6)
            .rotateX(-Math.PI / 2)
            .scale(1, 0.58, 1)
            .translate(0, 0, 0.05),
          M.hull
        )
      );

      // Verrière large et basse, à ras du dos : sur cette carène la moindre bosse
      // sur l'axe casse le chevron.
      const verriere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.verriere);
      verriere.scale.set(1.7, 0.6, 1.25);
      verriere.position.set(0, 0.17, -0.25);
      shell.add(verriere);

      for (const cote of [-1, 1]) {
        shell.add(
          new THREE.Mesh(
            aileGeo({
              cote,
              envergure: 2.32,
              emplanture: 2.1,
              saumon: 0.55,
              recul: 1.2,
              epaisseur: 0.09,
              diedre: 0.32,
              ancrage: [0.24, 0.02, 0],
            }),
            M.hull
          )
        );
        // L'accent des saumons est DEBOUT et incliné vers l'extérieur. Couché comme
        // sur les deux autres carènes, il se serait confondu avec le bord de fuite
        // et l'aile n'aurait plus eu de fin ; debout, il ferme l'envergure par deux
        // traits verticaux — et c'est aussi toute la hauteur de cette carène.
        const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.5), M.accent);
        winglet.position.set(cote * 2.55, 0.46, 1.2);
        winglet.rotation.z = -cote * 0.42;
        shell.add(winglet);
      }
    },
    derive: { t: [0.09, 0.36, 0.66], y: 0.24, z: 0.85 },
    moteur: { x: 0.7, y: -0.06, z: 0.92, r: [0.19, 0.25, 0.7], feu: 0.16, recul: 0.4 },
    // Modules sous l'aile, et le plus loin possible du fuselage : c'est l'envergure
    // qu'ils doivent épaissir. Le pas entre deux canons est le double de celui de la
    // dague — il y a la place, et l'écart se voit.
    canon: { x: 0.95, pas: 0.4, y: -0.1, z: -0.35, t: [0.07, 0.09, 1.05] },
    missile: { x: 1.45, pas: 0.42, y: -0.16, z: 0.35, t: [0.2, 0.16, 0.58] },
    plaque: { x: 1.3, y: 0.26, z: 0.4, ry: -0.48, t: [0.8, 0.13, 0.62] },
    // Même correction que sur la dague, pour la même raison : posé près de l'axe,
    // le canard encombrait l'apex du chevron. Sorti sur le bord d'attaque, il
    // l'ÉPAISSIT — et le bord d'attaque est déjà, sur cette carène, ce qu'on lit.
    canard: { x: 1.05, y: 0.2, z: -0.55, ry: 0.45, rz: -0.22, t: [0.6, 0.07, 0.3] },
    anneau: { r: 0.42, y: 0.22, z: 0.1 },
    cadran: [0, 0.34, 0.62],
  },

  // -------------------------------------------------------------- L'ENCLUME
  // Presque carrée en plan, et deux fois plus haute que les deux autres. Le
  // « contrepoids à l'avant » n'est pas un appendice ajouté devant : c'est la COQUE
  // ELLE-MÊME qui est large devant et étroite derrière. Un fût hexagonal tronqué,
  // grand diamètre vers -Z, suffit à le dire — le vaisseau est un coin, pointe en
  // arrière, et sa masse est toute du côté où il va.
  enclume: {
    corps(shell, M) {
      shell.add(
        new THREE.Mesh(
          // CylinderGeometry couche son grand rayon (celui « du haut ») vers -Z une
          // fois pivotée de -π/2 : le 1,05 est donc bien la proue, et le 0,42 la
          // poupe. C'est contre-intuitif et ça se vérifie mal à l'œil.
          new THREE.CylinderGeometry(1.05, 0.42, 2.3, 6)
            .rotateX(-Math.PI / 2)
            .scale(1, 0.6, 1)
            .translate(0, 0.02, -0.15),
          M.hull
        )
      );

      // La table de l'enclume. Elle porte à elle seule la moitié de la hauteur, et
      // elle est posée EN AVANT : sous une caméra qui plonge, une masse haute se
      // lit comme une masse avancée, les deux se cumulent au lieu de se concurrencer.
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.56, 1.3), M.hull);
      table.position.set(0, 0.62, -0.55);
      shell.add(table);

      // La verrière est perchée sur la table, et c'est le point le plus haut du
      // vaisseau. Sur les deux autres carènes elle est à ras : ici elle dit qu'on
      // pilote depuis un promontoire, pas depuis une pointe.
      const verriere = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M.verriere);
      verriere.scale.set(1.05, 0.75, 1.15);
      verriere.position.set(0, 0.98, -0.25);
      shell.add(verriere);

      for (const cote of [-1, 1]) {
        // Des ailes qui n'en sont pas : corde énorme, envergure minuscule, presque
        // pas de flèche, et QUATRE FOIS l'épaisseur de celles du faucon. Amincies
        // elles seraient redevenues des ailes, et l'enclume serait redevenue un
        // chasseur un peu gros.
        //
        // L'emplanture est ENFONCÉE dans le fût (0,72 pour un fût qui en fait 0,78
        // à cette station). Posée au contact exact, elle laissait une couture que
        // la caméra du jeu transformait en fente : on lisait cinq blocs qui volent
        // en escadrille, pas une coque d'un seul tenant.
        shell.add(
          new THREE.Mesh(
            aileGeo({
              cote,
              envergure: 0.98,
              emplanture: 1.55,
              saumon: 1.25,
              recul: -0.1,
              epaisseur: 0.44,
              diedre: -0.12,
              // Poussée vers la PROUE : les saumons calés au milieu du fût
              // mettaient la station la plus large à mi-longueur, et une masse
              // centrée n'est pas un contrepoids, c'est un ventre.
              ancrage: [0.72, -0.06, -0.52],
            }),
            M.hull
          )
        );
        const epaule = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.62), M.accent);
        epaule.position.set(cote * 1.7, -0.18, -0.75);
        shell.add(epaule);
      }
    },
    // Pas une dérive : une cheminée. Large, courte, plantée sur le dos — elle
    // épaissit le contour au lieu de l'affiner.
    derive: { t: [0.36, 0.6, 0.46], y: 0.78, z: 0.55 },
    moteur: { x: 0.56, y: -0.08, z: 0.72, r: [0.3, 0.38, 0.76], feu: 0.24, recul: 0.42 },
    // Modules courts et gros, remontés sur les épaules : sur cette carène un tube
    // long se lirait comme un emprunt à la dague. Même compte de meshes, moitié
    // moins d'élancement.
    canon: { x: 0.62, pas: 0.34, y: 0.24, z: -0.7, t: [0.12, 0.15, 0.75] },
    missile: { x: 1.05, pas: 0.3, y: -0.24, z: -0.25, t: [0.3, 0.26, 0.62] },
    plaque: { x: 0.98, y: 0.24, z: -0.45, ry: 0, t: [0.8, 0.3, 0.9] },
    canard: { x: 0.78, y: 0.62, z: -1.0, ry: 0, rz: 0, t: [0.52, 0.34, 0.42] },
    anneau: { r: 0.85, y: 0.34, z: -0.3 },
    cadran: [0, 1.14, 0.15],
  },
};

// La liste que voit le joueur dans le menu d'apparence. Elle ne porte plus de
// cotes : elles vivent dans PLANS, où on les lit à côté du dessin qu'elles
// commandent.
export const CARENES = [
  { id: 'dague', nom: 'Dague', plan: PLANS.dague },
  { id: 'faucon', nom: 'Faucon', plan: PLANS.faucon },
  { id: 'enclume', nom: 'Enclume', plan: PLANS.enclume },
];

export function livree(id) {
  return LIVREES.find((l) => l.id === id) || LIVREES[0];
}

export function carene(id) {
  return CARENES.find((c) => c.id === id) || CARENES[0];
}

// Construit le vaisseau à partir d'une FICHE, et non plus en dur.
//
//   { livree, carene, tier, levels }
//
// C'est ce qui permet trois choses d'un seul coup : la personnalisation choisie à
// la création du pseudo, les paliers de coque gagnés avec les fragments, et — le
// plus important pour le joueur — le fait que CE QU'ON ACHÈTE SE VOIE. Un canon
// jumelé qui n'ajoute rien à la silhouette n'a pas été acheté, il a été coché.
export function createPlayerShip(fiche = {}) {
  const L = livree(fiche.livree);
  const C = carene(fiche.carene);
  const tier = Math.max(0, Math.min(2, fiche.tier ?? 0));
  const lv = fiche.levels || {};

  const g = new THREE.Group();
  const shell = new THREE.Group(); // la carène : mise à l'échelle sans toucher au repère
  g.add(shell);

  // Quatre matières et pas une de plus, les mêmes pour les trois carènes : c'est ce
  // qui les garde de la même flotte, et c'est aussi ce qui permet à soutien.js de
  // refondre un vaisseau entier en DEUX meshes (ce qui est éclairé, ce qui brille).
  const M = {
    hull: mat(L.hull, { metalness: 0.75, roughness: 0.3 }),
    dark: mat(L.dark, { metalness: 0.8, roughness: 0.4 }),
    accent: glow(L.accent),
    verriere: glow(0x9ffbff),
  };

  const P = C.plan;
  P.corps(shell, M);

  const derive = new THREE.Mesh(new THREE.BoxGeometry(...P.derive.t), M.dark);
  derive.position.set(0, P.derive.y, P.derive.z);
  shell.add(derive);

  for (const side of [-1, 1]) {
    // PROPULSEURS : la tuyère grossit avec le niveau acheté. Le plus visible de
    // tous les modules, parce qu'on le regarde en permanence — il est derrière.
    const boost = 1 + (lv.engine || 0) * 0.13;
    const mo = P.moteur;
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(mo.r[0] * boost, mo.r[1] * boost, mo.r[2] * boost, 6),
      M.dark
    );
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * mo.x, mo.y, mo.z);
    shell.add(engine);

    const exhaust = new THREE.Mesh(new THREE.SphereGeometry(mo.feu * boost, 6, 6), M.accent);
    exhaust.position.set(side * mo.x, mo.y, mo.z + mo.recul);
    exhaust.name = 'exhaust';
    shell.add(exhaust);

    // CANONS JUMELÉS : un tube de plus par niveau. On voit d'où sortent les
    // nouveaux tirs, ce qui rend l'achat lisible sans une ligne de texte.
    const ca = P.canon;
    for (let n = 0; n < (lv.cannons || 0); n++) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(ca.t[0], ca.t[1], ca.t[2], 6),
        M.dark
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * (ca.x + n * ca.pas), ca.y, ca.z);
      shell.add(barrel);
    }

    // MISSILES : une nacelle par niveau, ogive en avant du bidon.
    const mi = P.missile;
    for (let n = 0; n < (lv.missiles || 0); n++) {
      const x = side * (mi.x + n * mi.pas);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(...mi.t), M.dark);
      pod.position.set(x, mi.y, mi.z);
      shell.add(pod);
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(mi.t[0] * 0.45, mi.t[0] * 1.1, 5),
        M.accent
      );
      head.rotation.x = -Math.PI / 2;
      head.position.set(x, mi.y, mi.z - mi.t[2] * 0.5 - mi.t[0] * 0.5);
      shell.add(head);
    }

    // PALIERS DE COQUE : le blindage gagné avec les fragments. Palier II boulonne
    // une plaque sur chaque flanc, palier III ajoute une pièce à l'AVANT — un
    // canard sur les deux chasseurs, un contrefort sur l'enclume. Les deux paliers
    // sont placés par carène : le même point d'ancrage pour les trois aurait posé
    // la plaque du faucon en plein vide, à deux unités de son aile.
    if (tier >= 1) {
      const pl = P.plaque;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(...pl.t), M.dark);
      plate.position.set(side * pl.x, pl.y, pl.z);
      plate.rotation.y = side * pl.ry;
      shell.add(plate);
    }
    if (tier >= 2) {
      const cn = P.canard;
      const canard = new THREE.Mesh(new THREE.BoxGeometry(...cn.t), M.hull);
      canard.position.set(side * cn.x, cn.y, cn.z);
      canard.rotation.y = side * cn.ry;
      canard.rotation.z = side * cn.rz;
      shell.add(canard);
    }
  }

  // BOUCLIER : un anneau émetteur autour du fuselage, visible dès le premier
  // niveau. Rayon ET HAUTEUR suivent la coque. Le rayon parce que sur l'enclume il
  // ceinture un fût et sur la dague il serre une lame — deux fois moins large. La
  // hauteur parce qu'un anneau posé à y=0, comme il l'était, passe désormais SOUS
  // les ailes : sur le faucon, dont l'emplanture démarre à 0,24 de l'axe, il ne
  // dépassait plus nulle part et le module le plus cher du jeu ne se voyait plus.
  // Chaque carène le pose donc juste au-dessus de sa propre surface portante.
  if (lv.shield) {
    const emitter = new THREE.Mesh(new THREE.TorusGeometry(P.anneau.r, 0.05, 5, 14), M.accent);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, P.anneau.y, P.anneau.z);
    shell.add(emitter);
  }

  // RÉFLEXE CHRONO : un petit cadran sur le dos. Discret, mais on le cherche.
  if (lv.reflex) {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10), M.accent);
    dial.position.set(...P.cadran);
    shell.add(dial);
  }

  // La carène est plus petite que sa silhouette d'origine : elle donnait
  // l'impression d'un vaisseau bien plus large que sa vraie zone de collision.
  shell.scale.setScalar(0.78);

  // REPÈRE DE COLLISION : seul ce noyau peut être touché. Tout ce qui dépasse
  // (ailes, ailerons, réacteurs) est purement décoratif et traverse les balles.
  // toneMapped reste actif : sans ça le bloom en fait une tache qui noie le vaisseau.
  // depthTest désactivé : le repère doit rester lisible même quand la coque passe devant.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })
  );
  core.name = 'hitcore';
  core.renderOrder = 5;
  g.add(core);

  // Cercle au sol matérialisant exactement le rayon de collision.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLAYER.radius - 0.08, PLAYER.radius, 28),
    new THREE.MeshBasicMaterial({
      color: 0x8ffbff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  ring.name = 'hitring';
  ring.renderOrder = 4;
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);

  return g;
}

function createDrone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    mat(0xff5db1, { emissive: 0xff5db1, emissiveIntensity: 0.45 })
  );
  body.scale.set(1, 0.75, 1.1);
  g.add(body);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.45), mat(0x8e2d64));
    wing.position.set(side * 0.75, 0, 0);
    wing.rotation.z = side * 0.35;
    g.add(wing);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), glow(0xffe066));
  eye.position.set(0, 0.1, 0.5);
  g.add(eye);
  return g;
}

function createWasp() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.5, 5),
    mat(0xff3df0, { emissive: 0xff3df0, emissiveIntensity: 0.5 })
  );
  body.rotation.x = Math.PI / 2; // pointe vers +z (vers le joueur)
  g.add(body);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.55), mat(0x7a1d74));
    wing.position.set(side * 0.7, 0.05, -0.3);
    wing.rotation.y = side * 0.5;
    wing.rotation.z = side * 0.2;
    g.add(wing);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 5), glow(0xff9ff6));
    tip.position.set(side * 1.25, 0.16, -0.55);
    g.add(tip);
  }
  return g;
}

function createBrute() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.65, 0.8, 6),
    mat(0xff9f43, { emissive: 0xff9f43, emissiveIntensity: 0.35, roughness: 0.5 })
  );
  g.add(body);
  const armor = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.16, 6, 6),
    mat(0x5a3a1a, { metalness: 0.85 })
  );
  armor.rotation.x = Math.PI / 2;
  g.add(armor);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), glow(0xffc857));
  core.position.y = 0.45;
  g.add(core);
  return g;
}

// KORN, en trois états. Le combat se joue en trois actes, et personne ne compte des
// points de vie au milieu d'une nappe de balles : on regarde la SILHOUETTE. Chaque
// acte casse donc d'abord quelque chose qui change le contour — la couronne, puis un
// pod — et ne change une teinte qu'ensuite. C'est ce qui reste lisible à la taille
// où le boss apparaît sur un téléphone, c'est-à-dire minuscule.
//
// Les matériaux sont créés UNE fois et seulement réassignés. createEnemyShip clone
// un gabarit, et un clone partage ses matériaux par référence : une teinte posée en
// place sur la coque suivrait le boss suivant dès son entrée en scène.
//
// La coque S'ÉTEINT d'un acte à l'autre — c'est elle qui occupe le plus de pixels,
// c'est donc elle qui porte le message. L'émissif tombe avec elle : une coque
// « incandescente de rage » monterait en luminosité et se lirait comme une montée
// en puissance, exactement l'inverse de ce qu'on raconte. Ce qui brille à la fin,
// ce n'est plus le vaisseau, c'est ce qui sort de ses trous.
//
// L'anneau, lui, reste allumé aux trois actes : c'est sa BRÈCHE qui informe, et une
// couronne éteinte n'a plus de brèche — elle a juste disparu.
const BOSS_ETATS = [
  {
    hull: mat(0xff4757, { emissive: 0xff4757, emissiveIntensity: 0.4, roughness: 0.45 }),
    anneau: mat(0xffc857, { emissive: 0xffc857, emissiveIntensity: 0.5, metalness: 0.9 }),
    oeil: glow(0xffe066),
  },
  {
    // Le métal baisse en même temps que la peinture brûle : sans carte
    // d'environnement, une coque métallique ne renvoie que trois reflets et vire au
    // noir. C'est le diffus qui doit reprendre la main pour qu'elle reste une coque.
    hull: mat(0x7a1b26, {
      emissive: 0x3a0a04,
      emissiveIntensity: 0.5,
      roughness: 0.6,
      metalness: 0.3,
    }),
    anneau: mat(0xc07030, { emissive: 0xff7a1e, emissiveIntensity: 0.45, metalness: 0.9 }),
    oeil: glow(0xff6a1e),
  },
  {
    // La cendre. Éteinte, mais pas effacée : sous une coque vraiment noire il ne
    // reste qu'un bouquet de lueurs qui flottent, et on a perdu le vaisseau. Le gris
    // change aussi la TEINTE et pas seulement la valeur — rouge vif, sang brûlé,
    // cendre : trois actes qu'on distingue même à travers un écran de balles.
    // L'émissif ne sert pas à faire briller la coque, il sert à la RENDRE VISIBLE :
    // les trois lampes du secteur sont volontairement faibles pendant le combat, et
    // sans cet appoint la cendre tombe à un noir indistinct du vide. Il est gris et
    // non rouge — une lueur chaude se lirait comme un vaisseau qui repart.
    hull: mat(0x4d3b40, {
      emissive: 0x6a5a66,
      emissiveIntensity: 0.75,
      roughness: 0.85,
      metalness: 0.15,
    }),
    anneau: mat(0x7a4a24, { emissive: 0xff4a10, emissiveIntensity: 0.3, metalness: 0.9 }),
    oeil: glow(0xff1e2e),
  },
];

// Une seule teinte de tôle arrachée pour tous les morceaux qui pendent ou qui
// restent en moignon : on doit les lire comme une même carène éventrée, pas comme
// des pièces rapportées. Assez claire pour attraper le contre-jour — sur fond noir,
// une tôle vraiment noire est une tôle qu'on n'a pas dessinée.
const BOSS_TOLE = mat(0x4a1620, { metalness: 0.85, roughness: 0.6 });
const BOSS_BRAISE = glow(0xff7a2a);
const BOSS_BRAISE_VIVE = glow(0xffc061);
const BOSS_NOYAU = glow(0xfff2d0);
const BOSS_HALO = new THREE.MeshBasicMaterial({
  color: 0xff8a4a,
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

// Une brèche est un bulbe incandescent à demi ENFONCÉ dans la coque : ses bords
// s'effilent et disparaissent sous la carène, seule sa calotte ressort. Une plaque
// plate, elle, flotterait au-dessus d'une coque bombée dès qu'on la regarde de côté.
const BOSS_BRECHE = new THREE.SphereGeometry(1, 6, 5);

function bossBreche(taille, pos, ry, matiere) {
  const m = new THREE.Mesh(BOSS_BRECHE, matiere);
  m.scale.set(...taille);
  m.position.set(...pos);
  m.rotation.y = ry;
  return m;
}

function createBoss() {
  const g = new THREE.Group();
  const E = BOSS_ETATS[0];

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), E.hull);
  body.scale.set(1.3, 0.7, 1);
  body.name = 'bossHull';
  g.add(body);

  // Les trois couronnes existent en même temps, une seule est allumée. Reconstruire
  // une géométrie de tore en plein combat pour la rogner coûterait une allocation
  // pile au moment où l'écran est le plus chargé ; ici on bascule un booléen.
  const couronnes = new THREE.Group();
  couronnes.name = 'bossRings';
  couronnes.rotation.x = Math.PI / 2;
  const intacte = new THREE.Group();
  intacte.add(new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.22, 6, 10), E.anneau));
  const entamee = new THREE.Group();
  entamee.visible = false;
  entamee.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.22, 6, 8, Math.PI * 1.3).rotateZ(Math.PI * 0.45),
      E.anneau
    )
  );
  const moignons = new THREE.Group();
  moignons.visible = false;
  // Deux tronçons laissés bâbord et tribord : la brèche s'ouvre devant et derrière,
  // là où le regard passe. Un anneau rogné n'importe où ne se verrait pas.
  for (const depart of [-0.17, 0.83]) {
    moignons.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(2.1, 0.2, 5, 3, Math.PI * 0.34).rotateZ(Math.PI * depart),
        E.anneau
      )
    );
  }
  couronnes.add(intacte, entamee, moignons);
  g.add(couronnes);

  const podMat = mat(0x6e1220, { metalness: 0.8 });
  for (const side of [-1, 1]) {
    const bord = side < 0 ? 'L' : 'R';
    const pod = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 5), podMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 2.3, 0, 0.3);
    pod.name = `bossPod${bord}`;
    g.add(pod);
    const podGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), glow(0xff8080));
    podGlow.position.set(side * 2.3, 0, 1.15);
    podGlow.name = `bossPodGlow${bord}`;
    g.add(podGlow);
  }

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), E.oeil);
  eye.position.set(0, 0.2, 1.1);
  eye.name = 'bossEye';
  g.add(eye);

  // ACTE II : la coque s'ouvre. Les brèches sont sur le DOS parce que la caméra du
  // jeu regarde d'en haut — une avarie sous le ventre serait une avarie invisible.
  // La plaque de flanc, elle, pend sans se détacher : c'est le détail qui dit que le
  // vaisseau tient encore, mais mal.
  const degats2 = new THREE.Group();
  degats2.name = 'bossDmg2';
  degats2.visible = false;
  degats2.add(bossBreche([0.34, 0.6, 0.7], [-0.66, 0.62, 0.05], 0.35, BOSS_BRAISE));
  degats2.add(bossBreche([0.28, 0.5, 0.5], [0.92, 0.55, -0.42], -0.5, BOSS_BRAISE));
  // La plaque pend DANS la brèche de la couronne, et pas ailleurs : les avaries
  // groupées au même endroit racontent un coup encaissé, éparpillées elles ne
  // racontent qu'un vaisseau sale. C'est aussi le seul endroit où l'anneau ne la
  // masque pas.
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.11, 0.85), BOSS_TOLE);
  plaque.position.set(1.95, -0.5, 0.3);
  plaque.rotation.set(0.1, 0.3, -0.9);
  degats2.add(plaque);
  // La ligne d'arrachement rougeoie encore, posée sur l'arête de la coque : sans
  // elle, la plaque n'est qu'une tôle sombre sur fond noir et rien ne dit qu'elle
  // a été déchirée de quelque chose.
  const dechirure = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.95), BOSS_BRAISE);
  dechirure.position.set(1.86, 0.12, 0.35);
  degats2.add(dechirure);
  g.add(degats2);

  // ACTE III : le pod bâbord est arraché et le dos s'ouvre sur le noyau. C'est le
  // seul moment du jeu où l'on voit ce qu'il y a DEDANS — et il est blanc.
  const degats3 = new THREE.Group();
  degats3.name = 'bossDmg3';
  degats3.visible = false;
  const trappe = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 5, 8), BOSS_TOLE);
  trappe.rotation.x = Math.PI / 2;
  trappe.position.set(0, 0.98, -0.1);
  degats3.add(trappe);
  const noyau = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), BOSS_NOYAU);
  noyau.position.set(0, 1, -0.1);
  degats3.add(noyau);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 8), BOSS_HALO);
  halo.position.copy(noyau.position);
  degats3.add(halo);
  const moignon = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.55, 5), BOSS_TOLE);
  moignon.rotation.x = Math.PI / 2;
  moignon.position.set(-2.05, 0, -0.15);
  degats3.add(moignon);
  const arrachement = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), BOSS_BRAISE_VIVE);
  arrachement.position.set(-2.05, 0, 0.15);
  degats3.add(arrachement);
  degats3.add(bossBreche([0.34, 0.5, 0.5], [0.36, 0.55, 0.78], 0.8, BOSS_BRAISE_VIVE));
  g.add(degats3);

  // La taille de l'amiral vit dans les constantes, à côté de son rayon de
  // collision : les deux doivent bouger ensemble.
  g.scale.setScalar(BOSS.echelle);

  return g;
}

// Phase 1, 2 ou 3 : l'état de la carène du boss. Rien n'est construit ici — tout
// dort déjà dans le gabarit, éteint — donc deux appels de suite sur la même phase
// ne peuvent rien empiler, et une bascule ne coûte pas une allocation.
export function setBossPhase(group, phase) {
  const p = Math.min(3, Math.max(1, Math.round(phase) || 1));
  if (group.userData.bossPhase === p) return;
  const hull = group.getObjectByName('bossHull');
  if (!hull) return; // pas un boss : on ne casse rien au passage
  group.userData.bossPhase = p;

  const E = BOSS_ETATS[p - 1];
  hull.material = E.hull;
  const oeil = group.getObjectByName('bossEye');
  if (oeil) oeil.material = E.oeil;

  const couronnes = group.getObjectByName('bossRings');
  if (couronnes) {
    couronnes.children.forEach((niveau, i) => {
      niveau.visible = i === p - 1;
      for (const m of niveau.children) m.material = E.anneau;
    });
  }

  // Les avaries S'ACCUMULENT : l'acte III garde les brèches de l'acte II. Un boss
  // qui se répare entre deux phases raconterait l'exact contraire du combat.
  const d2 = group.getObjectByName('bossDmg2');
  if (d2) d2.visible = p >= 2;
  const d3 = group.getObjectByName('bossDmg3');
  if (d3) d3.visible = p >= 3;

  // Le pod bâbord s'efface au profit du moignon qui occupe sa place exacte.
  for (const nom of ['bossPodL', 'bossPodGlowL']) {
    const o = group.getObjectByName(nom);
    if (o) o.visible = p < 3;
  }
}

const BUILDERS = { drone: createDrone, wasp: createWasp, brute: createBrute, boss: createBoss };
const templates = new Map();

// Les matériaux restent partagés par type (le flash de dégât est fait par un pop
// d'échelle dans enemies.js) : garde le nombre de states GPU au minimum.
export function createEnemyShip(type) {
  if (!templates.has(type)) templates.set(type, BUILDERS[type]());
  return templates.get(type).clone(true);
}

export function createGem() {
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28),
    new THREE.MeshBasicMaterial({ color: 0xffc857, toneMapped: false })
  );
  gem.scale.set(1, 1.5, 1);
  return gem;
}

// ---- LES HUIT MODULES ----
//
// Ce qui tombe d'un ennemi détruit et se ramasse en vol : les améliorations
// elles-mêmes, devenues des objets. Le joueur doit pouvoir DÉCIDER d'aller en
// chercher un — donc savoir lequel c'est — sans le regarder, au milieu des
// balles, sur un écran de téléphone. Quatre règles en découlent, et aucune n'est
// une préférence esthétique : les quatre viennent d'avoir regardé les huit
// alignés à leur vraie taille dans le jeu, et d'en avoir raté la moitié.
//
//  1. ON DESSINE POUR LA CAMÉRA QU'ON A. Elle regarde de vingt et un mètres de
//     haut vers un point au ras du sol : trente-huit degrés au-dessus de
//     l'horizon. Une hauteur se voit donc aux quatre cinquièmes, une profondeur
//     aux trois cinquièmes, et une largeur en entier. Surtout, on voit le DESSUS
//     des choses — la première version empilait ses formes en hauteur, où elles
//     se cachent les unes les autres, et six modules sur huit rendaient une
//     tache. Ce qui distingue, ici, c'est l'EMPREINTE AU SOL.
//  2. UNE EMPREINTE PAR MODULE : un escalier, deux barres, un dard, une boule
//     cerclée, une tuyère et sa flamme, un fer à cheval, un cadran, une croix.
//     Huit contours qu'on nomme même en négatif — et c'est en négatif que le
//     bloom les rend.
//  3. UNE COULEUR PAR MODULE, et aucune n'appartient déjà au décor. L'or est pris
//     par les gemmes, le rose et le magenta par les ennemis et leurs explosions,
//     l'orange par les brutes : les huit teintes se partagent ce qui reste, du
//     vermillon au violet, avec trente degrés au minimum entre deux voisines. Là
//     où l'écart de teinte est le plus faible, l'écart de forme est le plus
//     grand — c'est cette contrainte qui a décidé des appariements.
//  4. RIEN QUI DÉPENDE DE L'AZIMUT. Le jeu fait tourner sur elles-mêmes les
//     choses qu'il laisse tomber. Une forme plate posée debout disparaîtrait un
//     quart de tour sur deux : tout ce qui est plat est donc posé À PLAT,
//     normale vers le haut, et son contour ne bouge plus.
//
// Taille : les huit sont dessinés à l'unité puis agrandis d'un même coefficient
// (voir MODULE_ECHELLE, plus bas). Mesuré à l'écran, à l'endroit exact où tombent
// les gemmes, chacun occupe entre cinquante et cinquante-six pixels de diagonale
// contre trente-cinq pour une gemme. Plus gros, parce que c'est une trouvaille et
// pas de la monnaie — mais pas beaucoup plus, sinon ça ne tombe plus du même
// monde.
const MODULE_TEINTES = {
  firerate: 0xb4ff1f, // chartreuse — franchement verte, pour ne pas virer à l'or
  cannons: 0x00f0c8, // turquoise
  missiles: 0xff4a33, // vermillon : une ogive
  shield: 0x2fc8ff, // cyan — la teinte qu'a déjà la bulle du bouclier en jeu
  engine: 0x4a63ff, // bleu roi : une flamme de tuyère
  magnet: 0xb44dff, // violet
  reflex: 0xeef4ff, // blanc glacé : le seul achromatique, donc jamais confondu
  hull: 0x3aff5e, // vert : ce qu'on lit « vie » sans avoir à l'expliquer
  inconnu: 0xffffff,
};

// LE HALO SE CALCULE, IL NE SE CHOISIT PAS.
//
// Le bloom du jeu ne déclenche pas sur une couleur, il déclenche sur une
// LUMINANCE, au-dessus de 0,55. Or les huit teintes ci-dessus s'étalent de 0,18
// (le bleu roi) à 0,90 (le blanc glacé) : à teintes brutes, mesuré à l'écran, le
// chartreuse et le vert avaient un halo énorme, le turquoise et le blanc aussi,
// et le bleu, le violet, le rouge et le cyan n'en avaient aucun. Quatre modules
// annonçaient leur présence à travers l'écran, quatre attendaient qu'on les
// remarque. Ce n'est pas une question de goût, c'est deux qualités d'objet.
//
// On ramène donc chaque teinte à la MÊME luminance, en la multipliant — et non
// en la délavant vers le blanc, ce qui lui coûterait justement la saturation qui
// la rend reconnaissable. Le résultat peut dépasser 1 : la cible de rendu du
// composer est en virgule flottante, elle le supporte, et c'est exactement à ça
// qu'elle sert. La teinte survit, seul le halo change.
//
// La valeur est réglée à l'œil, sur une capture des huit à leur vraie taille : à
// 1,05 tout le monde brillait, mais le halo débordait sur la forme et il ne
// restait qu'une bille lumineuse par module. Juste au-dessus du seuil, on garde
// le halo qui fait repérer de loin, et le contour qui fait reconnaître de près.

const MODULE_LUMINANCE = 0.74;

function calibre(hex, part = 1) {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return glow(c.multiplyScalar((MODULE_LUMINANCE / Math.max(0.02, lum)) * part));
}

// Chaque forme reçoit deux matériaux, jamais plus : la teinte calibrée, et la
// MÊME teinte au sixième de sa lumière — assez pour se détacher du vide, trop peu
// pour déclencher le halo. Un détail gris se lirait comme une pièce empruntée à un
// autre module ; à teinte égale, il se lit comme une ombre dans le même objet.
const MODULE_FORMES = {
  // Surcadenceur — trois départs de tir en escalier, de plus en plus petits. Ils
  // montent EN DIAGONALE et non à la verticale : empilés, ils se masquaient les uns
  // les autres sous cette caméra et ne faisaient qu'une tache. Décalés, on compte
  // trois plaques, et trois plaques identiques qui se répètent, c'est une cadence —
  // exactement ce que raconte la vignette de la boutique.
  //
  // Elles sont CARRÉES en plan, et l'escalier se décale aussi en profondeur. La
  // première version était faite de barres allongées : un quart de tour et elles se
  // présentaient par la tranche, l'escalier s'effondrait en un trait vertical, et un
  // trait vertical, c'était déjà les canons. Un carré ne se met pas de profil.
  firerate(vif, sourd) {
    const g = new THREE.Group();
    const plaque = new THREE.BoxGeometry(0.44, 0.16, 0.44);
    const etages = [
      [-0.3, -0.32, 0.12, 1, vif],
      [0, 0, 0, 0.84, vif],
      [0.3, 0.32, -0.12, 0.68, sourd],
    ];
    for (const [x, y, z, k, matiere] of etages) {
      const m = new THREE.Mesh(plaque, matiere);
      m.position.set(x, y, z);
      m.scale.set(k, 1, k);
      g.add(m);
    }
    return g;
  },

  // Canons jumelés — deux tubes debout sur leur joug. C'est la seule forme du lot
  // faite de deux barres parallèles : réduite à deux traits, elle reste elle-même.
  // Le joug est décalé vers l'avant pour rester visible d'en haut, sinon les tubes
  // s'asseyaient dessus et on ne voyait plus qu'eux.
  cannons(vif, sourd) {
    const g = new THREE.Group();
    const tube = new THREE.CylinderGeometry(0.13, 0.15, 0.8, 6);
    for (const cote of [-1, 1]) {
      const m = new THREE.Mesh(tube, vif);
      // Les deux tubes sont légèrement DÉCALÉS en profondeur : alignés, ils se
      // superposaient exactement un quart de tour sur deux et la paire devenait un
      // tube unique. En biais, il en reste toujours deux.
      m.position.set(cote * 0.29, 0.14, cote * -0.14);
      g.add(m);
    }
    // Le joug est CLAIR, et il l'est pour une raison mesurée : au quart de tour où
    // les deux tubes finissent malgré tout par se recouvrir, c'est lui seul qui
    // reste, et « une barre avec une traverse en bas » n'est aucun des sept autres.
    const joug = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.19, 0.24), vif);
    joug.rotation.y = 0.45;
    joug.position.set(0, -0.32, 0.1);
    g.add(joug);
    const embase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.34), sourd);
    embase.position.y = -0.32;
    g.add(embase);
    return g;
  },

  // Missiles Nova — un dard debout, pointe en haut, sur trois ailerons. Vu de
  // dessus les ailerons dessinent un Y, et non une croix : la croix était déjà
  // celle de la coque renforcée, et deux croix à trente mètres, c'est une croix.
  missiles(vif, sourd) {
    const g = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.0, 6), vif);
    corps.position.y = 0.16;
    g.add(corps);
    const aileron = new THREE.BoxGeometry(0.42, 0.3, 0.07);
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const a = new THREE.Mesh(aileron, vif);
      a.rotation.y = -angle;
      a.position.set(Math.cos(angle) * 0.22, -0.3, -Math.sin(angle) * 0.22);
      g.add(a);
    }
    const collier = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 4, 10), sourd);
    collier.rotation.x = -Math.PI / 2;
    collier.position.y = 0.16;
    g.add(collier);
    return g;
  },

  // Bouclier à ions — un noyau et son champ. L'anneau est posé à plat : c'est lui
  // qui donne au module sa largeur, et il garde exactement la même ellipse quel
  // que soit l'azimut. La ceinture sombre coupe la boule en deux, sans quoi le
  // halo en fait une bille lisse et le noyau disparaît dans sa propre lumière.
  shield(vif, sourd) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), vif));
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.075, 4, 16), vif);
    anneau.rotation.x = -Math.PI / 2;
    g.add(anneau);
    const ceinture = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.06, 4, 10), sourd);
    ceinture.rotation.x = -Math.PI / 2;
    ceinture.position.y = 0.09;
    g.add(ceinture);
    return g;
  },

  // Propulseurs — une tuyère COUCHÉE et sa flamme à trois langues. Debout, elle ne
  // montrait d'en haut que le disque de son col : un hexagone plein, c'est-à-dire
  // rien. Couchée dans l'axe de chute, on voit la cloche s'évaser puis les langues
  // s'effiler derrière, et l'INTERVALLE entre les deux est le détail qui décide de
  // tout — sans lui, le halo recolle la cloche à la flamme et il ne reste qu'une
  // goutte. C'est aussi le seul module qui pointe vers l'arrière : le dard des
  // missiles, lui, vise.
  engine(vif, sourd) {
    const g = new THREE.Group();
    const cloche = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.18, 0.5, 6), vif);
    cloche.rotation.x = Math.PI / 2; // le large vers +z : la poussée sort par là
    cloche.position.z = -0.06;
    g.add(cloche);
    const langue = new THREE.ConeGeometry(0.14, 0.52, 5);
    for (const [x, z, k] of [
      [0, 0.7, 1],
      [-0.22, 0.58, 0.7],
      [0.22, 0.58, 0.7],
    ]) {
      const f = new THREE.Mesh(langue, vif);
      f.rotation.x = Math.PI / 2;
      f.position.set(x, 0, z);
      f.scale.set(k, k, 1);
      g.add(f);
    }
    // La GUEULE, sombre, entre la cloche et les langues. C'est elle qui empêche le
    // halo de recoller les deux en une seule goutte : sans ce disque noir, la
    // tuyère rendait une bille à franges, et une bille à franges n'est pas un
    // propulseur.
    const gueule = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 6), sourd);
    gueule.rotation.x = Math.PI / 2;
    gueule.position.z = 0.2;
    g.add(gueule);
    const col = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.07, 4, 10), sourd);
    col.position.z = -0.3;
    g.add(col);
    return g;
  },

  // Aimant tracteur — un fer à cheval, posé À PLAT. Debout il aurait été plus
  // joli, et il aurait disparu un quart de tour sur deux ; à plat, son ouverture
  // tourne mais son contour ne change jamais. Les deux pôles sont sombres : sans
  // eux on lit un anneau ébréché, avec eux on lit un aimant.
  magnet(vif, sourd) {
    const g = new THREE.Group();
    const ouverture = Math.PI * 1.35;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 5, 16, ouverture), vif);
    arc.rotation.x = -Math.PI / 2;
    g.add(arc);
    const pole = new THREE.BoxGeometry(0.24, 0.23, 0.23);
    for (const a of [0, ouverture]) {
      const p = new THREE.Mesh(pole, sourd);
      p.position.set(Math.cos(a) * 0.42, 0, -Math.sin(a) * 0.42);
      p.rotation.y = -a;
      g.add(p);
    }
    return g;
  },

  // Réflexe Chrono — un cadran et son aiguille, à plat. Le premier essai était un
  // sablier plein : sous cette caméra on n'en voyait que le couvercle, et le blanc
  // — la teinte la plus lumineuse des huit — en faisait une boule de lumière sans
  // contour. Un anneau CREUX résout les deux d'un coup : il n'offre presque rien à
  // faire briller au bloom, et son trou noir au milieu est ce qui le distingue de
  // la boule du bouclier. L'aiguille tourne avec le module : elle avance.
  reflex(vif, sourd) {
    const g = new THREE.Group();
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 4, 18), vif);
    anneau.rotation.x = -Math.PI / 2;
    g.add(anneau);
    const aiguille = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.46), vif);
    aiguille.position.z = -0.21;
    g.add(aiguille);
    const index = new THREE.BoxGeometry(0.13, 0.11, 0.13);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const m = new THREE.Mesh(index, sourd);
      m.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
      g.add(m);
    }
    return g;
  },

  // Coque renforcée — deux plaques épaisses en croix, posées à plat. Empilées en
  // escalier, elles ressemblaient de trois quarts au surcadenceur, qui est déjà un
  // escalier ; à plat, elles dessinent d'en haut une croix pleine que rien d'autre
  // ne dessine. C'est aussi le seul module large et bas de la série, ce qui suffit
  // à le trouver en vision périphérique.
  hull(vif, sourd) {
    const g = new THREE.Group();
    const bras = new THREE.BoxGeometry(1.04, 0.24, 0.38);
    for (const angle of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(bras, vif);
      m.rotation.y = angle;
      g.add(m);
    }
    const noyau = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), sourd);
    noyau.position.y = 0.04;
    g.add(noyau);
    return g;
  },

  // Filet de sécurité. Un identifiant inconnu doit se VOIR — un cube blanc n'est
  // aucun des huit — plutôt que de se déguiser en module valide : sinon la faute
  // de frappe traverse tout le développement et arrive chez le joueur.
  inconnu(vif) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), vif));
    return g;
  },
};

const gabaritsModule = new Map();

// Les huit formes sont dessinées à l'unité, puis toutes agrandies d'un même
// coefficient. Mesurée à l'écran, à l'endroit exact où tombent les gemmes, une
// gemme occupe dix-sept pixels sur trente ; les modules dessinés à l'unité en
// occupaient trente-huit à quarante-six en diagonale, contre trente-quatre pour
// elle. Douze pour cent d'écart, ça ne dit pas « trouvaille », ça dit « grosse
// gemme ». Un cinquième de plus les met à cinquante, et là on voit tomber autre
// chose.
//
// L'échelle vit à l'INTÉRIEUR d'un groupe enveloppe, et pas sur l'objet rendu.
// Le jeu met à l'échelle ce qu'il ramasse — la piscine des gemmes fait
// exactement ça à chaque tirage — et un `scale.set()` posé de l'extérieur
// écraserait la taille de dessin au lieu de s'y ajouter.
//
// RÉGLÉ SUR UN TÉLÉPHONE, pas sur un écran de bureau. Mesuré en portrait à
// 391 × 778 — la taille où le jeu se joue vraiment : à 1,2, les modules faisaient
// de onze à dix-huit pixels de diagonale, c'est-à-dire à peine plus qu'un point.
// La mesure de référence à cinquante pixels avait été prise sur une fenêtre de
// 1728 de large, où tout est trois fois plus gros. À 2, ils tiennent entre dix-huit
// et trente pixels sur un téléphone, et restent lisibles sans encombrer.
const MODULE_ECHELLE = 2;

// Un gabarit par identifiant, cloné ensuite. Un clone partage ses géométries ET
// ses matériaux par référence : c'est exactement le contrat de createEnemyShip, et
// c'est la seule façon d'en tenir des dizaines en piscine sans multiplier d'autant
// le nombre d'états GPU. Rien n'est texturé, rien n'est éclairé — comme la gemme,
// ces objets sont en MeshBasic : sous une lampe, un module qui tombe dans un coin
// sombre de l'arène serait un module qu'on ne va pas chercher.
export function createModule(id) {
  const cle = MODULE_FORMES[id] ? id : 'inconnu';
  if (!gabaritsModule.has(cle)) {
    const teinte = MODULE_TEINTES[cle];
    const forme = MODULE_FORMES[cle](calibre(teinte), calibre(teinte, 0.17));
    forme.scale.setScalar(MODULE_ECHELLE);
    const enveloppe = new THREE.Group();
    enveloppe.name = `module:${cle}`;
    enveloppe.add(forme);
    gabaritsModule.set(cle, enveloppe);
  }
  return gabaritsModule.get(cle).clone(true);
}

// Anneau matérialisant la zone de frôlement : discret au repos, il s'embrase à
// chaque balle frôlée pour enseigner la mécanique sans un mot.
export function createGrazeAura() {
  const geo = new THREE.RingGeometry(GRAZE.radius - 0.12, GRAZE.radius + 0.06, 40);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8ffbff,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.name = 'grazeAura';
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export function createShieldMesh() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0x4ff2ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
}
