// Géométries des vaisseaux, générées en code : aucun modèle externe.
// Style low-poly flat-shaded ; les accents émissifs sont amplifiés par le bloom.

import * as THREE from 'three';
import { PLAYER, GRAZE } from './constants.js';

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

// Trois carènes. Elles ne changent pas les statistiques — c'est la classe qui le
// fera plus tard — mais elles changent la silhouette, et c'est ce qu'on voit.
export const CARENES = [
  { id: 'dague', nom: 'Dague', nez: [0.42, 3.0], aile: [1.7, 1.1], angle: -0.42 },
  { id: 'faucon', nom: 'Faucon', nez: [0.55, 2.4], aile: [2.1, 0.9], angle: -0.62 },
  { id: 'enclume', nom: 'Enclume', nez: [0.62, 2.2], aile: [1.5, 1.5], angle: -0.2 },
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

  const hull = mat(L.hull, { metalness: 0.75, roughness: 0.3 });
  const dark = mat(L.dark, { metalness: 0.8, roughness: 0.4 });
  const accent = glow(L.accent);

  const fuselage = new THREE.Mesh(new THREE.ConeGeometry(C.nez[0], C.nez[1], 6), hull);
  fuselage.rotation.x = -Math.PI / 2;
  shell.add(fuselage);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), glow(0x9ffbff));
  cockpit.position.set(0, 0.28, 0.1);
  cockpit.scale.set(1, 0.7, 1.4);
  shell.add(cockpit);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(C.aile[0], 0.1, C.aile[1]), hull);
    wing.position.set(side * (C.aile[0] * 0.62), -0.05, 0.55);
    wing.rotation.y = side * C.angle;
    shell.add(wing);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.9), accent);
    tip.position.set(side * (C.aile[0] * 1.05), -0.05, 0.95);
    tip.rotation.y = side * C.angle;
    shell.add(tip);

    // PROPULSEURS : la tuyère grossit avec le niveau acheté. Le plus visible de
    // tous les modules, parce qu'on le regarde en permanence — il est derrière.
    const boost = 1 + (lv.engine || 0) * 0.13;
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * boost, 0.26 * boost, 0.7 * boost, 6),
      dark
    );
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 0.45, -0.08, 1.15);
    shell.add(engine);

    const exhaust = new THREE.Mesh(new THREE.SphereGeometry(0.16 * boost, 6, 6), accent);
    exhaust.position.set(side * 0.45, -0.08, 1.55);
    exhaust.name = 'exhaust';
    shell.add(exhaust);

    // CANONS JUMELÉS : un tube de plus par niveau, sur l'aile. On voit d'où sortent
    // les nouveaux tirs, ce qui rend l'achat lisible sans une ligne de texte.
    for (let n = 0; n < (lv.cannons || 0); n++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6), dark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * (0.7 + n * 0.34), -0.12, -0.35);
      shell.add(barrel);
    }

    // MISSILES : une nacelle sous l'aile par niveau.
    for (let n = 0; n < (lv.missiles || 0); n++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.6), dark);
      pod.position.set(side * (0.9 + n * 0.3), -0.2, 0.5);
      shell.add(pod);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5), accent);
      head.rotation.x = -Math.PI / 2;
      head.position.set(side * (0.9 + n * 0.3), -0.2, 0.14);
      shell.add(head);
    }

    // PALIERS DE COQUE : le blindage gagné avec les fragments. Palier II boulonne
    // une plaque sur chaque aile, palier III ajoute une dérive avant.
    if (tier >= 1) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.7), dark);
      plate.position.set(side * 0.85, 0.06, 0.5);
      plate.rotation.y = side * C.angle;
      shell.add(plate);
    }
    if (tier >= 2) {
      const canard = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.4), hull);
      canard.position.set(side * 0.6, 0.14, -0.6);
      canard.rotation.y = side * 0.5;
      canard.rotation.z = side * -0.25;
      shell.add(canard);
    }
  }

  // BOUCLIER : un anneau émetteur autour du fuselage, visible dès le premier niveau.
  if (lv.shield) {
    const emitter = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 5, 14), accent);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.z = 0.35;
    shell.add(emitter);
  }

  // RÉFLEXE CHRONO : un petit cadran sur le dos. Discret, mais on le cherche.
  if (lv.reflex) {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10), accent);
    dial.position.set(0, 0.3, 0.7);
    shell.add(dial);
  }

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.8), dark);
  fin.position.set(0, 0.35, 0.9);
  shell.add(fin);

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

function createBoss() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 10, 8),
    mat(0xff4757, { emissive: 0xff4757, emissiveIntensity: 0.4, roughness: 0.45 })
  );
  body.scale.set(1.3, 0.7, 1);
  g.add(body);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.1, 0.22, 6, 10),
    mat(0xffc857, { emissive: 0xffc857, emissiveIntensity: 0.5, metalness: 0.9 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.6, 5),
      mat(0x6e1220, { metalness: 0.8 })
    );
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 2.3, 0, 0.3);
    g.add(pod);
    const podGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), glow(0xff8080));
    podGlow.position.set(side * 2.3, 0, 1.15);
    g.add(podGlow);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), glow(0xffe066));
  eye.position.set(0, 0.2, 1.1);
  g.add(eye);
  return g;
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
