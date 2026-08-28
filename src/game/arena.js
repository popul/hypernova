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
const _ray = new THREE.Vector3();

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

const MARGE_BORD = 0.035; // ce qu'on garde entre le bord de l'arène et celui de l'écran
const _coin = new THREE.Vector3();

// Où tombe le bord gauche de l'arène à cette profondeur, en fraction de largeur
// d'écran. Zéro, c'est le bord de l'écran ; négatif, c'est dehors.
function bordGauche(camera, z) {
  _coin.set(-ARENA.playerXMax, 0, z).project(camera);
  return (_coin.x + 1) / 2;
}

// La profondeur la plus avancée où les deux bords tiennent encore dans le cadre.
// Le champ se resserre à mesure qu'on approche de la caméra, donc la fonction est
// monotone et une simple dichotomie suffit.
function zOuLesBordsTiennent(camera, zMin, zMax) {
  if (bordGauche(camera, zMax) >= MARGE_BORD) return zMax;
  if (bordGauche(camera, zMin) < MARGE_BORD) return zMin; // même au fond, ça ne tient pas
  let bas = zMin;
  let haut = zMax;
  for (let i = 0; i < 24; i++) {
    const m = (bas + haut) / 2;
    if (bordGauche(camera, m) >= MARGE_BORD) bas = m;
    else haut = m;
  }
  return bas;
}

// Pour les épreuves, et pour qui voudra mesurer : où en est le bord à la limite
// de jeu la plus avancée.
export function bordArene(camera) {
  return bordGauche(camera, ARENA.playerZMax);
}

// La profondeur de jeu qu'on refuse de descendre en dessous. C'est à peu près ce
// dont on dispose en paysage : le portrait doit rendre la même course, pas moins.
const ZONE_MINI = 13;

// LE SERRAGE SE RELÂCHE JUSQU'À RENDRE UNE VRAIE ZONE DE JEU.
//
// Les deux leviers se répondent, et il faut les deux. Borner la zone à ce qu'on
// voit, seul, écrase la course à deux unités sur un téléphone étroit — injouable.
// Reculer la caméra, seul, ne fait qu'étendre la zone vers la partie la plus
// étroite du champ et empire le problème (mesuré : le bord passe de -0,086 à
// -0,117). Ensemble : on borne la zone à ce qui se voit, PUIS on recule jusqu'à ce
// que cette zone bornée redevienne assez profonde pour jouer.
//
// `pose(serrage)` est fourni par l'appelant : lui seul sait où vit sa caméra et
// comment elle recule. On place, on mesure, on recommence.
export function ajusteCadrage(camera, pose, serrageDepart = 1) {
  let serrage = serrageDepart;
  pose(serrage);
  fitPlayZone(camera);
  for (let i = 0; i < 14 && serrage < 1; i++) {
    if (ARENA.playerZMax >= ZONE_MINI) break;
    serrage = Math.min(1, serrage * 1.04);
    pose(serrage);
    fitPlayZone(camera);
  }
  return serrage;
}

export function fitPlayZone(camera) {
  _ray.set(0, -1, 0.5).unproject(camera).sub(camera.position);
  // Le rayon doit descendre vers le plan pour le couper devant la caméra.
  if (_ray.y < -1e-4) {
    const t = -camera.position.y / _ray.y;
    const zBottom = camera.position.z + _ray.z * t;
    if (t > 0 && zBottom > ARENA.playerZMin + 4) {
      // Deux bornes, et l'on garde la plus contraignante : le bas de l'écran, et
      // la profondeur au-delà de laquelle on ne verrait plus les bords de l'arène.
      const parLeBas = zBottom - ARENA.playerZMargin;
      ARENA.playerZMax = Math.min(
        parLeBas,
        zOuLesBordsTiennent(camera, ARENA.playerZMin + 4, parLeBas)
      );
      // Les projectiles s'effacent APRÈS le bas de l'écran, jamais devant. La borne
      // était fixe (26) alors que le champ visible, lui, dépend du cadrage : en
      // portrait il descend plus bas, et l'on voyait les tirs ennemis s'évaporer en
      // plein vol derrière le vaisseau. Une balle doit sortir du champ, pas
      // disparaître dedans.
      ARENA.bulletCullZMax = zBottom + 10;
      return ARENA.playerZMax;
    }
  }
  ARENA.playerZMax = 14;
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
