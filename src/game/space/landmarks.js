// Les objets remarquables du fond : ce qui donne l'ÉCHELLE.
//
// Un champ d'étoiles n'a ni distance ni taille — il est identique à trois mètres et
// à trois années-lumière. Il faut un objet dont on connaît la taille pour que le
// vide en devienne un, et c'est le seul rôle de ces pièces : elles ne sont jamais
// jouables, jamais devant, jamais brillantes au point de disputer la lisibilité aux
// projectiles.
//
// Budget : tout est bas-poly, sans ombre, et les multitudes passent par InstancedMesh.
// Chaque fabrique renvoie { group, update(dt) } et rien d'autre.

import * as THREE from 'three';

// Générateur déterministe : le même secteur doit se ressembler d'une partie à
// l'autre, sinon ce n'est plus un lieu, seulement du bruit.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialTexture(stops, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Texture de surface planétaire : des bandes bruitées, suffisantes à cette distance.
function bandedTexture(base, band, seed) {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const y = r() * h;
    const th = 2 + r() * 9;
    ctx.globalAlpha = 0.08 + r() * 0.22;
    ctx.fillStyle = band;
    ctx.beginPath();
    // Bandes légèrement ondulées : une ligne droite se lit comme une texture ratée.
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
    ctx.lineTo(w, y + th);
    for (let x = w; x >= 0; x -= 16) ctx.lineTo(x, y + th + Math.sin(x * 0.05 + i) * 2.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Géante gazeuse annelée -------------------------------------------------
// L'anneau est vu presque par la tranche : c'est l'inclinaison qui fait la planète,
// vu de face on ne lit qu'un disque.
function createRinged({
  body = 0x4a6fa5,
  band = 0xa8d4ff,
  ring = 0x9fd8ff,
  seed = 7,
  tilt = 0.34,
} = {}) {
  const group = new THREE.Group();
  const R = 30;
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(R, 40, 28),
    new THREE.MeshStandardMaterial({
      map: bandedTexture(
        `#${new THREE.Color(body).getHexString()}`,
        `#${new THREE.Color(band).getHexString()}`,
        seed
      ),
      roughness: 0.95,
      metalness: 0,
    })
  );
  group.add(planet);

  const rings = new THREE.Mesh(
    new THREE.RingGeometry(R * 1.35, R * 2.1, 96, 1),
    new THREE.MeshBasicMaterial({
      color: ring,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  rings.rotation.x = -Math.PI / 2 + tilt;
  rings.rotation.z = 0.2;
  group.add(rings);

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(R * 1.15, R * 1.3, 96, 1),
    new THREE.MeshBasicMaterial({
      color: ring,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  inner.rotation.copy(rings.rotation);
  group.add(inner);

  group.position.set(-38, -34, -108);
  return {
    group,
    update(dt) {
      planet.rotation.y += dt * 0.012;
      rings.rotation.z += dt * 0.004;
    },
  };
}

// --- Naine rouge ------------------------------------------------------------
// Une étoile n'est pas une sphère lumineuse : c'est une sphère plus un halo bien
// plus grand qu'elle. Le halo fait 90 % du travail.
function createStar() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(16, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xff7a3c })
  );
  group.add(core);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture([
        [0, 'rgba(255,200,140,0.9)'],
        [0.28, 'rgba(255,120,50,0.45)'],
        [1, 'rgba(255,60,20,0)'],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.8,
    })
  );
  halo.scale.setScalar(110);
  group.add(halo);

  // Protubérance : une boucle de plasma qui tourne lentement. C'est le seul détail
  // qui dit « ça vit » plutôt que « c'est une balle orange ».
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(20, 0.7, 6, 48, Math.PI * 0.7),
    new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.5 })
  );
  arc.rotation.set(0.4, 0.6, 0);
  group.add(arc);

  group.position.set(44, -30, -120);
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      halo.scale.setScalar(110 + Math.sin(t * 0.6) * 4);
      arc.rotation.z += dt * 0.06;
      core.material.color.setHSL(0.045, 0.95, 0.5 + Math.sin(t * 1.3) * 0.03);
    },
  };
}

// --- Champ d'astéroïdes -----------------------------------------------------
// Une seule géométrie, une seule matière, un seul appel de dessin pour 90 rochers.
function createAsteroids(count = 90) {
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 0);
  // On déforme les sommets une fois pour toutes : des icosaèdres parfaits se lisent
  // comme des dés, pas comme des cailloux.
  const pos = geo.attributes.position;
  const r = rng(4242);
  for (let i = 0; i < pos.count; i++) {
    const s = 0.68 + r() * 0.62;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
  }
  geo.computeVertexNormals();

  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 1, metalness: 0.05 }),
    count
  );
  const dummy = new THREE.Object3D();
  const spin = [];
  for (let i = 0; i < count; i++) {
    dummy.position.set((r() - 0.5) * 190, -14 - r() * 40, -55 - r() * 75);
    dummy.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28);
    dummy.scale.setScalar(1.4 + r() * 6.5);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    spin.push({
      obj: dummy.clone(),
      rx: (r() - 0.5) * 0.25,
      ry: (r() - 0.5) * 0.25,
      drift: 1.5 + r() * 4,
    });
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  return {
    group,
    update(dt) {
      for (let i = 0; i < spin.length; i++) {
        const s = spin[i];
        s.obj.rotation.x += s.rx * dt;
        s.obj.rotation.y += s.ry * dt;
        // Dérive vers la caméra, puis on renvoie au fond : le champ ne s'épuise pas.
        s.obj.position.z += s.drift * dt;
        if (s.obj.position.z > 20) s.obj.position.z = -130;
        s.obj.updateMatrix();
        mesh.setMatrixAt(i, s.obj.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// --- Épave ------------------------------------------------------------------
// Une silhouette sombre, éclairée seulement sur la tranche. Ce qu'on ne voit pas
// d'elle fait davantage que ce qu'on en voit.
function createDerelict() {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f3a,
    roughness: 0.9,
    metalness: 0.4,
  });
  const r = rng(90210);

  // Coque brisée en deux tronçons désalignés : une épave entière n'est pas une épave.
  const front = new THREE.Mesh(new THREE.BoxGeometry(58, 11, 13), hullMat);
  front.position.set(-14, 0, 0);
  front.rotation.z = 0.06;
  group.add(front);
  const back = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 11), hullMat);
  back.position.set(26, -4.5, 2);
  back.rotation.z = -0.22;
  back.rotation.y = 0.12;
  group.add(back);

  // Nervures : le squelette mis à nu entre les deux morceaux.
  for (let i = 0; i < 7; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(5.5 + r() * 1.5, 0.42, 5, 16), hullMat);
    rib.position.set(2 + i * 2.2, -1 - i * 0.5, 0.8);
    rib.rotation.y = Math.PI / 2;
    rib.rotation.x = (r() - 0.5) * 0.3;
    group.add(rib);
  }

  // Les rares hublots encore alimentés. Trois suffisent : c'est leur rareté qui
  // raconte qu'il y a peut-être quelqu'un dedans.
  const lit = new THREE.MeshBasicMaterial({ color: 0xffc07a, transparent: true, opacity: 0.85 });
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lit.clone());
    w.position.set(-34 + i * 17, 2.2 + (r() - 0.5) * 3, 6.6);
    group.add(w);
    lamps.push({ m: w.material, phase: r() * 6.28 });
  }

  group.position.set(30, -26, -95);
  group.rotation.y = -0.35;
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      group.rotation.z = Math.sin(t * 0.07) * 0.03;
      group.position.y = -26 + Math.sin(t * 0.11) * 1.2;
      // Les hublots clignotent de façon irrégulière : une alimentation qui lâche.
      for (const l of lamps) {
        l.m.opacity = 0.25 + Math.max(0, Math.sin(t * 2.1 + l.phase)) * 0.7;
      }
    },
  };
}

// --- Pulsar -----------------------------------------------------------------
// Deux faisceaux opposés qui balaient. Le balayage est lent exprès : à la vitesse
// réelle d'un pulsar milliseconde, ce serait un stroboscope injouable.
function createPulsar() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xdce8ff })
  );
  group.add(core);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture([
        [0, 'rgba(220,235,255,0.95)'],
        [0.3, 'rgba(120,150,255,0.4)'],
        [1, 'rgba(40,60,180,0)'],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glow.scale.setScalar(46);
  group.add(glow);

  const beams = [];
  for (const sign of [1, -1]) {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(9, 96, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x9fb8ff,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    beam.position.y = sign * 48;
    beam.rotation.z = sign > 0 ? 0 : Math.PI;
    group.add(beam);
    beams.push(beam);
  }

  group.position.set(-30, -22, -100);
  group.rotation.z = 0.5;
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      group.rotation.y += dt * 0.55;
      // Le cœur bat une fois par tour : c'est l'à-coup qui fait le phare.
      const beat = Math.pow(Math.max(0, Math.sin(t * 0.55 * Math.PI)), 8);
      core.scale.setScalar(1 + beat * 0.5);
      glow.scale.setScalar(46 + beat * 22);
      for (const b of beams) b.material.opacity = 0.08 + beat * 0.22;
    },
  };
}

// --- L'anomalie -------------------------------------------------------------
// Le secteur du boss. Pas de source lumineuse : un trou, un disque incliné, et la
// lumière qui manque au lieu de celle qu'on ajoute.
function createVoid() {
  const group = new THREE.Group();
  const hole = new THREE.Mesh(
    new THREE.SphereGeometry(13, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  group.add(hole);

  const disc = new THREE.Mesh(
    new THREE.RingGeometry(14, 40, 128, 2),
    new THREE.MeshBasicMaterial({
      color: 0x9a4bff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  disc.rotation.x = -Math.PI / 2 + 0.5;
  group.add(disc);

  // Anneau de photons : le liseré net qui détache le trou du fond.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(13.6, 0.4, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0xd0a0ff, transparent: true, opacity: 0.55 })
  );
  group.add(halo);

  group.position.set(0, -30, -110);
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      disc.rotation.z += dt * 0.16;
      halo.lookAt(0, 21, 27); // toujours face à la caméra, sinon il disparaît de profil
      disc.material.opacity = 0.24 + Math.sin(t * 0.8) * 0.07;
    },
  };
}

const FACTORIES = {
  ringed: createRinged,
  star: createStar,
  asteroids: createAsteroids,
  derelict: createDerelict,
  pulsar: createPulsar,
  void: createVoid,
};

// Un décor se désigne soit par son nom seul, soit par un objet portant ses
// réglages : deux secteurs peuvent ainsi partager une forme sans se ressembler.
export function createLandmark(spec) {
  const id = typeof spec === 'string' ? spec : spec.id;
  const make = FACTORIES[id];
  if (!make) throw new Error(`Décor inconnu : ${id}`);
  return make(typeof spec === 'string' ? undefined : spec);
}

// Libère géométries et matières d'un décor retiré. Sans ça, vingt vagues laissent
// vingt planètes en mémoire GPU — invisibles, mais bien là.
export function disposeLandmark(landmark) {
  landmark.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}
