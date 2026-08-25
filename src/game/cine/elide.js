// Les décors de l'époque élide : ce que la cinématique doit montrer et que le jeu
// n'a jamais à afficher. Tout le reste — l'arche, l'épave, les planètes, le Soleil —
// est importé directement de space/landmarks.js, pour que l'introduction montre
// EXACTEMENT les objets que le joueur rencontrera ensuite. Un prologue qui présente
// des formes qu'on ne reverra jamais ne présente rien.

import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// L'étoile des Élides, en train de mourir. Elle ne pâlit pas : elle GONFLE et
// rougit, ce qui est à la fois exact et beaucoup plus inquiétant qu'une lumière
// qui baisse. C'est elle qui explique en trois secondes pourquoi ils sont partis.
export function createDyingStar() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 22),
    new THREE.MeshBasicMaterial({ color: 0xff8340, toneMapped: false })
  );
  g.add(core);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,190,120,0.9)');
  grad.addColorStop(0.3, 'rgba(255,110,50,0.4)');
  grad.addColorStop(1, 'rgba(180,30,10,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  g.add(halo);

  let t = 0;
  let gonfle = 1;
  return {
    group: g,
    setSwell(v) {
      gonfle = v;
    },
    update(dt) {
      t += dt;
      const r = 18 * gonfle;
      core.scale.setScalar(r * (1 + Math.sin(t * 1.7) * 0.01));
      halo.scale.setScalar(r * 4.6);
      // Plus elle gonfle, plus elle rougit : la couleur EST le compte à rebours.
      core.material.color.setHSL(0.09 - (gonfle - 1) * 0.05, 0.95, 0.58 - (gonfle - 1) * 0.1);
    },
  };
}

// Le fleuve. Ceux qu'on charge dans ANDEL : un flot de points lumineux qui coule
// vers la fente et disparaît dedans.
//
// C'est volontairement abstrait. Montrer des visages serait à la fois hors budget
// et moins fort : un peuple qui devient un courant, puis rien, dit exactement ce
// qu'on lui a fait.
export function createRiver(count = 900) {
  const pos = new Float32Array(count * 3);
  const seed = rng(31337);
  const etat = [];
  for (let i = 0; i < count; i++) {
    etat.push({ k: seed(), v: 0.16 + seed() * 0.2, off: (seed() - 0.5) * 9 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.5,
      color: 0xffd9a0,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  points.frustumCulled = false;

  let flux = 1;
  return {
    group: points,
    setFlow(v) {
      flux = v;
      points.material.opacity = 0.95 * v;
    },
    update(dt) {
      for (let i = 0; i < etat.length; i++) {
        const e = etat[i];
        e.k += e.v * dt * flux;
        if (e.k > 1) e.k -= 1;
        // Une courbe qui part de loin, converge, et s'engouffre.
        const k = e.k;
        const conv = Math.pow(1 - k, 1.6);
        pos[i * 3] = -70 + k * 70 + e.off * conv * 0.4;
        pos[i * 3 + 1] = e.off * conv * 1.4 + Math.sin(k * 6 + i) * conv * 2;
        pos[i * 3 + 2] = e.off * conv * 1.1;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// La flotte qui s'enfuit : quelques feux rapides qui partent DANS L'AUTRE SENS.
// Leur petitesse est le sujet — ils tiennent tous dans un coin de l'écran pendant
// qu'on charge un peuple entier de l'autre côté.
export function createFleeingFleet(count = 14) {
  const g = new THREE.Group();
  const seed = rng(505);
  const nefs = [];
  const mat = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, toneMapped: false });
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 5), mat);
    m.rotation.x = -Math.PI / 2;
    const n = {
      mesh: m,
      base: new THREE.Vector3((seed() - 0.5) * 22, (seed() - 0.5) * 10, (seed() - 0.5) * 16),
      v: 26 + seed() * 22,
    };
    m.position.copy(n.base);
    g.add(m);
    nefs.push(n);
  }
  let t = 0;
  let go = 0;
  return {
    group: g,
    launch() {
      go = 1;
    },
    update(dt) {
      if (!go) return;
      t += dt;
      for (const n of nefs) {
        n.mesh.position.z = n.base.z - n.v * t;
        n.mesh.position.x = n.base.x + Math.sin(t * 0.6) * 2;
      }
    },
  };
}

// Les mondes qu'il ouvre. Dix mille ans de recherche compressés en quelques
// secondes : des sphères qui apparaissent, se fendent, s'éteignent. On ne les
// regarde jamais assez longtemps pour s'y attacher, et c'est le propos.
export function createTornWorlds(count = 7) {
  const g = new THREE.Group();
  const seed = rng(818);
  const mondes = [];
  for (let i = 0; i < count; i++) {
    const grp = new THREE.Group();
    const r = 5 + seed() * 5;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(seed(), 0.4, 0.35),
      roughness: 1,
      flatShading: true,
    });
    // Deux moitiés : elles s'écartent quand le monde est ouvert.
    const demis = [1, -1].map((s) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI), mat);
      m.rotation.y = s > 0 ? 0 : Math.PI;
      grp.add(m);
      return { m, s };
    });
    const coeur = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.6, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false })
    );
    coeur.visible = false;
    grp.add(coeur);
    grp.position.set((seed() - 0.5) * 90, (seed() - 0.5) * 40, -40 - seed() * 120);
    grp.visible = false;
    g.add(grp);
    mondes.push({ grp, demis, coeur, r, ouvert: 0, t0: i / count });
  }
  let t = 0;
  return {
    group: g,
    // p va de 0 à 1 sur toute la séquence : chaque monde s'ouvre à son tour.
    setProgress(p) {
      t = p;
      for (const w of mondes) {
        const k = THREE.MathUtils.clamp((p - w.t0) * 5, 0, 1);
        w.grp.visible = k > 0.02;
        w.ouvert = k;
        for (const d of w.demis) d.m.position.x = d.s * k * w.r * 1.5;
        w.coeur.visible = k > 0.25;
        w.coeur.scale.setScalar(1 - k * 0.5);
        w.coeur.material.opacity = 1 - k;
      }
    },
    update(dt) {
      void dt;
      void t;
    },
  };
}
