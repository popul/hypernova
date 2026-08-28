// Les bords de l'arène, et ce qui s'y passe.
//
// Deux problèmes tenaient ensemble : on ne voyait pas où était le bord, et le
// bouclage affichait un second vaisseau complet de l'autre côté — donc deux
// vaisseaux à l'écran, dont un seul répondait aux commandes.
//
// La solution est la même pour les deux : matérialiser la frontière par un rideau
// lumineux, et faire TRAVERSER le vaisseau au lieu de le dupliquer. Le vaisseau est
// tranché par un plan de découpe au niveau du bord, et le morceau manquant est
// dessiné à l'autre bord par le plan complémentaire. À aucun instant il n'y a deux
// vaisseaux : il y en a un, coupé en deux par une couture.

import * as THREE from 'three';
import { ARENA } from './constants.js';

function seamTexture() {
  const w = 64;
  const h = 8;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Dégradé dans la LARGEUR : un cœur net qui s'estompe de part et d'autre. C'est
  // ce profil qui fait lire un trait lumineux plutôt qu'un ruban plat.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(110,250,255,0)');
  g.addColorStop(0.5, 'rgba(220,255,255,1)');
  g.addColorStop(1, 'rgba(110,250,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ArenaEdges {
  constructor(scene) {
    this.seams = [];
    const tex = seamTexture();
    // La couture ne couvre QUE la bande de profondeur où le joueur peut se trouver,
    // plus une courte marge. Étendue au-delà, elle traversait tout l'écran en
    // diagonale et devenait un élément de décor permanent — alors que son seul rôle
    // est de dire « le bord est ici », à l'instant où c'est utile.
    // Géométrie de longueur unitaire : la zone étant recalculée à chaque cadrage,
    // la couture se met à l'échelle au lieu d'être reconstruite.

    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(side * ARENA.playerXMax, 0, 0);

      // Le trait, POSÉ À PLAT dans le plan de jeu. Une version verticale se lisait,
      // sous une caméra en plongée, comme un grand trapèze translucide en travers de
      // l'écran — un mur, alors que c'est précisément un passage.
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 1),
        new THREE.MeshBasicMaterial({
          map: tex,
          color: 0x6ffaff,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      );
      line.rotation.x = -Math.PI / 2;
      line.renderOrder = 2;
      group.add(line);

      // Un voile vertical très bas et très discret : il suggère l'épaisseur du
      // passage sans jamais masquer ce qui se trouve derrière.
      const veil = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1.6),
        new THREE.MeshBasicMaterial({
          map: tex,
          color: 0x6ffaff,
          transparent: true,
          opacity: 0.05,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      );
      veil.rotation.y = Math.PI / 2;
      veil.position.y = 0.8;
      veil.renderOrder = 2;
      group.add(veil);

      this.scene = scene;
      scene.add(group);
      this.seams.push({ group, line, veil, side, flash: 0 });
    }
    this.time = 0;
    this.setZone();
  }

  // Recalée après chaque cadrage : la couture couvre exactement la bande de
  // profondeur où le joueur peut se trouver, plus une courte marge.
  setZone() {
    const depth = ARENA.playerZMax - ARENA.playerZMin + 5;
    const midZ = (ARENA.playerZMax + ARENA.playerZMin) / 2;
    for (const s of this.seams) {
      s.group.position.z = midZ;
      s.line.scale.y = depth;
      s.veil.scale.x = depth;
    }
  }

  // Appelé au moment du bouclage : la couture s'embrase du côté franchi.
  ping(side) {
    const c = this.seams.find((x) => x.side === side);
    if (c) c.flash = 1;
  }

  update(dt, playerX) {
    this.time += dt;
    for (const s of this.seams) {
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 2.6);
      // La couture se révèle à l'approche : invisible au centre de l'arène, nette
      // quand on arrive dessus. Elle informe quand c'est utile et se tait sinon.
      const dist = Math.abs(ARENA.playerXMax * s.side - playerX);
      const near = THREE.MathUtils.clamp(1 - dist / (ARENA.wrapGhostZone * 1.6), 0, 1);
      const breathe = 0.03 + Math.sin(this.time * 1.7 + s.side) * 0.012;
      s.line.material.opacity = breathe + near * 0.2 + s.flash * 0.7;
      s.veil.material.opacity = near * 0.04 + s.flash * 0.18;
      s.line.scale.x = 1 + s.flash * 0.9;
    }
  }
}

// Borne arrière de la zone jouable, déduite du CADRAGE RÉEL.
//
// Elle était fixée à 17,5 alors que le bord bas de l'écran tombe à z = 16,3 en
// 16/9 : le vaisseau sortait du champ par le bas, ce qui se ressent comme un bug
// puisque plus rien ne dit où sont les limites. En portrait, la caméra recule
// tellement que le rayon du bord bas ne rencontre plus jamais le plan de jeu —
// il n'y a alors aucune contrainte, et on garde la valeur de repli.

// ---------------------------------------------------------------- LE CADRAGE
//
// ON NE VOLE PAS LÀ OÙ L'ON NE VOIT PAS LES BORDS.
//
// L'arène boucle : on sort par la gauche, on rentre par la droite. C'est une des
// manœuvres qui sauvent une vie, et elle demande de piloter JUSQU'AU BORD.
//
// Le serrage du portrait l'avait rendue impraticable. Mesuré sur un iPhone tenu
// droit : à la profondeur la plus proche du joueur, le bord gauche de l'arène
// tombait à huit centièmes d'écran HORS du cadre. Il fallait piloter dans le noir
// pour franchir la couture, sans voir ni où l'on allait ni quand on repasserait.
//
// LA PREMIÈRE CORRECTION ÉTAIT FAUSSE, et elle mérite d'être racontée. J'ai
// d'abord reculé la caméra jusqu'à ce que les bords rentrent : le champ s'élargit,
// donc ça devait marcher. Mesuré, le bord est passé de -0,086 à -0,117 — c'est
// devenu PIRE. La raison est que la limite basse du joueur se déduit du cadrage :
// reculer descend le bas de l'écran, donc étend la zone de jeu vers l'avant, vers
// la partie la plus étroite du champ. La zone gagnait plus vite que le champ.
//
// La bonne règle n'est donc pas « reculer assez » mais « ne pas laisser voler
// là où l'on ne voit plus les bords ». La zone de jeu s'arrête à la profondeur la
// plus avancée où l'arène tient encore dans le cadre. On perd un peu de course
// vers le bas sur un téléphone étroit ; on gagne de pouvoir franchir les bords
// partout où l'on a le droit d'aller, ce qui vaut infiniment plus.

// LA COUTURE SE GAGNE.
//
// Sortir par un bord pour rentrer par l'autre était acquis dès la première vague.
// C'est pourtant la manœuvre la plus forte du jeu — celle qui transforme un
// encerclement en fuite — et elle ne coûtait rien. Elle s'achète maintenant, et
// sans elle les bords sont des murs, ce qui est le comportement de toutes les
// bornes d'arcade dont ce jeu descend.
//
// La question se pose à un seul endroit, parce qu'elle a cinq réponses à donner :
// le déplacement du vaisseau, son fantôme de l'autre côté, l'aura qui le suit, le
// rayon d'HÉLIOS qui doit franchir la couture avec lui, et la couture elle-même
// qui ne doit s'allumer que si elle sert à quelque chose.
export function boucleActive(game) {
  return ARENA.wrap && (game?.levels?.couture | 0) > 0;
}

const MARGE_BORD = 0.035; // ce qu'on garde entre le bord de l'arène et celui de l'écran
const _coin = new THREE.Vector3();

// Où tombe le bord gauche de l'arène à cette profondeur, en fraction de largeur
// d'écran. Zéro, c'est le bord de l'écran ; négatif, c'est dehors.
function bordGauche(camera, z) {
  _coin.set(-ARENA.playerXMax, 0, z).project(camera);
  return (_coin.x + 1) / 2;
}

// Pour les épreuves, et pour qui voudra mesurer : où en est le bord à la limite
// de jeu la plus avancée.
export function bordArene(camera) {
  return bordGauche(camera, ARENA.playerZMax);
}

// La profondeur de jeu qu'on refuse de descendre en dessous. C'est à peu près ce
// dont on dispose en paysage : le portrait doit rendre la même course, pas moins.
// Ce qu'on garde entre le bas de la zone de jeu et le bas de l'écran.
const MARGE_BAS = 0.04;

// Le point le plus avancé de la zone de jeu tombe-t-il assez haut dans le cadre ?
// Un vaisseau qui sort par le bas de l'écran se ressent comme un bug, puisque plus
// rien ne dit où sont les limites.
function basVisible(camera) {
  _coin.set(0, 0, ARENA.playerZMax).project(camera);
  return (1 - _coin.y) / 2 < 1 - MARGE_BAS;
}

export function ajusteCadrage(camera, pose, serrageDepart = 1) {
  let serrage = serrageDepart;
  pose(serrage);
  // On recule jusqu'à ce que la zone de jeu — qui est FIXE — tienne tout entière
  // dans le cadre : ses bords à gauche et à droite, et son point le plus avancé
  // au-dessus du bas de l'écran. Reculer élargit et relève à la fois, donc les
  // deux conditions vont dans le même sens et la boucle converge.
  //
  // Le serrage du portrait reste le point de départ : il ne se relâche que de ce
  // qu'il faut, et pas d'un pouce de plus. Sans lui, un téléphone tenu droit
  // gâche quatre dixièmes de sa largeur en vide latéral.
  for (let i = 0; i < 30 && serrage < 1.85; i++) {
    if (bordGauche(camera, ARENA.playerZMax) >= MARGE_BORD && basVisible(camera)) break;
    serrage *= 1.04;
    pose(serrage);
  }
  return serrage;
}

// LA SIMULATION NE DÉPEND PLUS DE L'ÉCRAN. C'est la caméra qui s'adapte.
//
// `fitPlayZone` faisait l'inverse : elle DÉDUISAIT la zone de jeu du cadrage, en
// suivant le bas de l'écran. Deux joueurs n'avaient donc pas la même arène.
// Mesuré sur le banc à deux origines, une fenêtre de 1280×683 contre une de
// 500×811 :
//
//     playerZMax        14,096   contre   13,557
//     bulletCullZMax    26,296   contre   37,235
//
// Les conséquences vont bien au-delà du cadrage. Le spectateur voyait une AUTRE
// partie que celle qu'il regardait — mesuré : vingt-cinq points d'écart, soit un
// frôlement, crédité par une balle que l'hôte avait déjà effacée et que le
// spectateur gardait en vol jusqu'à z = 30,5. Et le jeu à DEUX repose sur le pas
// verrouillé, c'est-à-dire sur la promesse que les deux machines simulent
// exactement la même chose : elles ne le faisaient pas.
//
// Les bornes sont donc des constantes, les mêmes pour tout le monde, et c'est le
// CADRAGE qui a désormais la charge de les montrer — voir ajusteCadrage.
export function fitPlayZone() {
  return ARENA.playerZMax;
}

// Les deux demi-plans de la couture. Le vaisseau porte l'un, son prolongement de
// l'autre côté porte l'autre : leur réunion redonne exactement une coque.
//
// Ils sont créés UNE fois et ne quittent jamais les matières : on les déplace au
// lieu de les brancher et débrancher. Ajouter un plan de découpe à une matière déjà
// compilée force Three.js à recompiler son shader — soit un à-coup d'une image
// entière, garanti pile à l'instant où le joueur touche un bord à pleine vitesse.
// Hors bouclage, on repousse simplement le plan à l'infini : il ne coupe rien.
export const FAR_AWAY = 1e6;

export function makeWrapPlanes() {
  return {
    hull: new THREE.Plane(new THREE.Vector3(-1, 0, 0), FAR_AWAY),
    seam: new THREE.Plane(new THREE.Vector3(1, 0, 0), FAR_AWAY),
  };
}

// Oriente un plan pour garder l'intérieur de l'arène du côté demandé.
export function aimPlane(plane, side) {
  if (side === 0) {
    plane.constant = FAR_AWAY; // ne coupe plus rien
    return;
  }
  plane.normal.set(-side, 0, 0);
  plane.constant = ARENA.playerXMax;
}
