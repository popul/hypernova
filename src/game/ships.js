// Géométries des vaisseaux, générées en code : aucun modèle externe.
// Style low-poly flat-shaded ; les accents émissifs sont amplifiés par le bloom.

import * as THREE from 'three';

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

export function createPlayerShip() {
  const g = new THREE.Group();

  const hull = mat(0xc8d6e8, { metalness: 0.75, roughness: 0.3 });
  const dark = mat(0x2a3550, { metalness: 0.8, roughness: 0.4 });

  const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 6), hull);
  fuselage.rotation.x = -Math.PI / 2;
  g.add(fuselage);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), glow(0x9ffbff));
  cockpit.position.set(0, 0.28, 0.1);
  cockpit.scale.set(1, 0.7, 1.4);
  g.add(cockpit);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.1), hull);
    wing.position.set(side * 1.05, -0.05, 0.55);
    wing.rotation.y = side * -0.42;
    g.add(wing);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.9), glow(0x4ff2ff));
    tip.position.set(side * 1.78, -0.05, 0.95);
    tip.rotation.y = side * -0.42;
    g.add(tip);

    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.7, 6), dark);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 0.45, -0.08, 1.15);
    g.add(engine);

    const exhaust = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), glow(0x4ff2ff));
    exhaust.position.set(side * 0.45, -0.08, 1.55);
    exhaust.name = 'exhaust';
    g.add(exhaust);
  }

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.8), dark);
  fin.position.set(0, 0.35, 0.9);
  g.add(fin);

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
