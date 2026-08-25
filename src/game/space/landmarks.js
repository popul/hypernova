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

// --- Planète -----------------------------------------------------------------
//
// Une seule fabrique pour la Terre, Mars, Jupiter, Saturne et Neptune. Ce qui les
// distingue n'est pas la forme — c'est une sphère dans tous les cas — mais la
// SURFACE et l'atmosphère. D'où une table de recettes plutôt que cinq fonctions.
//
// Le halo atmosphérique compte autant que la texture : sans lui, une planète est
// une balle peinte posée sur du noir. C'est le liseré au bord qui la rend ronde.
const PLANETES = {
  earth: {
    body: '#16407a',
    band: '#2f7bbd',
    land: '#2f6b3a',
    clouds: 0.5,
    air: 0x6fb8ff,
    lights: true,
  },
  mars: { body: '#8c3a1c', band: '#c96a35', land: '#5c2410', clouds: 0.08, air: 0xff9a5c },
  jupiter: { body: '#a8794a', band: '#e8cfa8', stripes: 34, air: 0xffcf9a, spot: true },
  saturn: { body: '#c2a878', band: '#e8dcbc', stripes: 26, air: 0xffe6b0 },
  neptune: { body: '#1d3f8c', band: '#4a7fd8', stripes: 16, air: 0x5a86ff },
};

// Surface planétaire : bandes bruitées, taches de continent, lumières de nuit.
// Suffisant à cette distance, et généré une fois pour toutes.
function surfaceTexture(recipe, seed) {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const r = rng(seed);

  ctx.fillStyle = recipe.body;
  ctx.fillRect(0, 0, w, h);

  // Bandes : elles font la géante gazeuse. Légèrement ondulées, parce qu'une ligne
  // droite se lit immédiatement comme une texture ratée.
  const bands = recipe.stripes ?? 22;
  for (let i = 0; i < bands; i++) {
    const y = r() * h;
    const th = 3 + r() * (recipe.stripes ? 14 : 8);
    ctx.globalAlpha = 0.1 + r() * 0.24;
    ctx.fillStyle = recipe.band;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
    ctx.lineTo(w, y + th);
    for (let x = w; x >= 0; x -= 16) ctx.lineTo(x, y + th + Math.sin(x * 0.03 + i) * 3);
    ctx.closePath();
    ctx.fill();
  }

  // Continents : des taches irrégulières, pour les mondes solides.
  if (recipe.land) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = recipe.land;
    for (let i = 0; i < 26; i++) {
      const cx = r() * w;
      const cy = 30 + r() * (h - 60);
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        const rad = (10 + r() * 34) * (recipe.clouds > 0.3 ? 1 : 0.6);
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad * 0.62;
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // La grande tache rouge de Jupiter : un seul détail, mais c'est CE détail qui
  // fait qu'on la reconnaît sans légende.
  if (recipe.spot) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#c9553a';
    ctx.beginPath();
    ctx.ellipse(w * 0.62, h * 0.62, 46, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lumières de ville sur la face nuit : quelques amas, jamais un semis régulier.
  if (recipe.lights) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd9a0';
    for (let i = 0; i < 170; i++) {
      const cx = r() * w;
      const cy = 40 + r() * (h - 80);
      for (let k = 0; k < 5; k++) {
        ctx.fillRect(cx + (r() - 0.5) * 22, cy + (r() - 0.5) * 14, 1.4, 1.4);
      }
    }
  }

  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPlanet({
  kind = 'earth',
  radius = 30,
  pos = [-34, -36, -104],
  rings = null,
  seed = 7,
} = {}) {
  const recipe = PLANETES[kind] || PLANETES.earth;
  const group = new THREE.Group();

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 44, 30),
    new THREE.MeshStandardMaterial({
      map: surfaceTexture(recipe, seed + kind.length * 31),
      roughness: 0.95,
      metalness: 0,
    })
  );
  group.add(planet);

  // Halo d'atmosphère : une sphère un peu plus grande, vue par l'intérieur, dont
  // seul le bord reste visible. C'est ce liseré qui donne la rondeur.
  const air = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.055, 36, 24),
    new THREE.MeshBasicMaterial({
      color: recipe.air,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(air);

  let ringMesh = null;
  if (rings) {
    ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * rings.inner, radius * rings.outer, 128, 2),
      new THREE.MeshBasicMaterial({
        color: rings.color ?? 0xe0d6b8,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2 + (rings.tilt ?? 0.3);
    ringMesh.rotation.z = 0.18;
    group.add(ringMesh);
    // La division de Cassini : un anneau fin plus sombre, qui suffit à faire lire
    // « anneaux » plutôt que « disque ».
    const gap = new THREE.Mesh(
      new THREE.RingGeometry(radius * (rings.outer * 0.78), radius * (rings.outer * 0.84), 128, 1),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    gap.rotation.copy(ringMesh.rotation);
    group.add(gap);
  }

  group.position.set(...pos);
  return {
    group,
    update(dt) {
      planet.rotation.y += dt * 0.014;
      if (ringMesh) ringMesh.rotation.z += dt * 0.003;
    },
  };
}

// --- Lune --------------------------------------------------------------------
// Une bille cratérisée. Son seul rôle est de donner une seconde échelle à côté de
// la planète : deux objets de tailles connues valent mieux qu'un.
export function createMoon({ radius = 5, pos = [22, -18, -78], tint = 0xb8b4ac } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const r = rng(4242);
  ctx.fillStyle = `#${new THREE.Color(tint).getHexString()}`;
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 90; i++) {
    const cx = r() * 256;
    const cy = r() * 128;
    const rad = 1.5 + r() * 9;
    ctx.globalAlpha = 0.14 + r() * 0.2;
    ctx.fillStyle = r() > 0.5 ? '#000000' : '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 18),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
  );
  const group = new THREE.Group();
  group.add(mesh);
  group.position.set(...pos);
  return {
    group,
    update(dt) {
      mesh.rotation.y += dt * 0.02;
    },
  };
}
// --- Le Soleil ---------------------------------------------------------------
// L'indicateur central du voyage, et le seul qu'on n'ait jamais besoin
// d'expliquer : il rétrécit à chaque palier. Il est donc PERSISTANT — construit
// une fois, redimensionné à chaque saut — parce qu'un objet qu'on détruit et
// reconstruit ne peut pas donner l'impression de s'éloigner, seulement de changer.
export function createSun() {
  const group = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false })
  );
  group.add(core);

  // Le halo fait l'essentiel : une étoile, c'est une petite sphère et beaucoup de
  // lumière autour. Il déborde largement du disque, comme un vrai éblouissement.
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture([
        [0, 'rgba(255,250,235,0.95)'],
        [0.18, 'rgba(255,225,170,0.5)'],
        [0.45, 'rgba(255,170,90,0.16)'],
        [1, 'rgba(255,120,40,0)'],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  group.add(halo);

  group.position.set(0, 34, -150);
  let t = 0;
  let taille = 26;
  return {
    group,
    // Rayon apparent, piloté par le palier. Loin du Soleil il devient un point,
    // et c'est à cet instant que le joueur comprend où il est allé.
    setSize(r) {
      taille = r;
    },
    update(dt) {
      t += dt;
      const r = taille;
      core.scale.setScalar(r);
      // Le halo garde une taille relative constante, sauf tout au fond où on lui
      // laisse un minimum : sinon le Soleil disparaît complètement et l'échelle
      // de comparaison est perdue.
      halo.scale.setScalar(Math.max(3.5, r * 4.2) * (1 + Math.sin(t * 0.5) * 0.02));
    },
  };
}

// --- L'épave élide -----------------------------------------------------------
// Les morceaux de la seconde arche, éparpillés du Soleil à l'espace interstellaire.
// C'est ce qu'on remonte pendant tout le jeu, et c'est aussi ce qu'on porte : les
// améliorations de la boutique sortent de cette ferraille.
//
// Un vocabulaire de formes commun aux six variantes, pour qu'on les reconnaisse
// comme appartenant au MÊME vaisseau : des membrures apparentes, une coque pâle
// d'os, des ouvertures hexagonales, et une seule lumière ambre — morte partout
// sauf sur le relais. C'est cette lumière unique qui dit « il y a eu quelqu'un ».
const ELIDE_OS = 0xb9b3a4; // la teinte de coque : pâle, mate, exsangue
const ELIDE_OMBRE = 0x4a4740;
const ELIDE_FEU = 0xffb15c;

function elideMat(dark = false) {
  return new THREE.MeshStandardMaterial({
    color: dark ? ELIDE_OMBRE : ELIDE_OS,
    roughness: 0.88,
    metalness: 0.35,
    flatShading: true,
  });
}

// Membrures : les côtes d'une carcasse. Elles servent dans toutes les variantes,
// et ce sont elles, plus que la silhouette, qui font lire « épave » et non « caisse ».
function ajouteMembrures(
  group,
  mat,
  { count, radius, span, axis = 'x', jitter = 0.35, seed = 11 }
) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const k = count === 1 ? 0.5 : i / (count - 1);
    const rad = radius * (0.72 + Math.sin(k * Math.PI) * 0.28);
    const cote = new THREE.Mesh(new THREE.TorusGeometry(rad, rad * 0.055, 5, 14), mat);
    const along = (k - 0.5) * span;
    if (axis === 'x') {
      cote.position.set(along, 0, 0);
      cote.rotation.y = Math.PI / 2;
    } else {
      cote.position.set(0, 0, along);
    }
    cote.rotation.x += (r() - 0.5) * jitter;
    cote.rotation.z += (r() - 0.5) * jitter;
    group.add(cote);
  }
}

const HULKS = {
  // La tuyère : une cloche de réacteur arrachée, plantée dans le sol martien.
  nozzle(g, mat, dark) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(9, 20, 26, 14, 1, true), mat);
    bell.rotation.z = 0.5;
    bell.material.side = THREE.DoubleSide;
    g.add(bell);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8, 14, 10), dark);
    col.position.set(-7.5, 15, 0);
    col.rotation.z = 0.5;
    g.add(col);
    ajouteMembrures(g, dark, { count: 4, radius: 13, span: 20, axis: 'z', seed: 3 });
  },

  // La déchirure : la section qui a cédé. C'est ici que l'arche s'est ouverte,
  // et c'est pour ça que la ceinture d'astéroïdes n'est pas une ceinture.
  torn(g, mat, dark) {
    for (const [i, len] of [26, 17].entries()) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(len, 13, 15), mat);
      t.position.set(i === 0 ? -18 : 20, i === 0 ? 0 : -6, i === 0 ? 0 : 3);
      t.rotation.z = i === 0 ? 0.05 : -0.34;
      t.rotation.y = i === 0 ? 0 : 0.2;
      g.add(t);
    }
    // Entre les deux tronçons, le squelette nu : c'est le vide qui raconte.
    ajouteMembrures(g, dark, { count: 7, radius: 7.5, span: 17, seed: 21, jitter: 0.5 });
  },

  // L'habitat : un tambour à hublots. Fait pour des gens qui n'y ont jamais dormi.
  habitat(g, mat, dark) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 20, 16, 1), mat);
    drum.rotation.z = Math.PI / 2;
    g.add(drum);
    const r = rng(77);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 0.6), dark);
      w.position.set((r() - 0.5) * 16, Math.sin(a) * 13.2, Math.cos(a) * 13.2);
      w.lookAt(0, 0, 0);
      g.add(w);
    }
    ajouteMembrures(g, dark, { count: 3, radius: 14.5, span: 19, seed: 9, jitter: 0.08 });
  },

  // La soute : longue, close, régulière. Elle contenait ce qu'on emporte quand on
  // part pour toujours.
  hold(g, mat, dark) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(46, 12, 12), mat);
    g.add(body);
    for (let i = 0; i < 5; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.6, 13.4, 13.4), dark);
      band.position.x = -20 + i * 10;
      g.add(band);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 5, 8), dark);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = 25;
    g.add(cap);
  },

  // Le relais : petit, intact, et le SEUL morceau encore alimenté. Sa lampe est la
  // seule lumière élide de tout le jeu.
  relay(g, mat, dark) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 22, 8), mat);
    g.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 12, 0, Math.PI * 2, 0, 1.0), mat);
    dish.material.side = THREE.DoubleSide;
    dish.position.y = 11;
    dish.rotation.x = Math.PI + 0.5;
    g.add(dish);
    const box = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), dark);
    box.position.y = -9;
    g.add(box);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 8, 6),
      new THREE.MeshBasicMaterial({ color: ELIDE_FEU, toneMapped: false })
    );
    lamp.position.set(2.4, -9, 2.4);
    lamp.userData.clignote = true;
    g.add(lamp);
  },

  // La tête : le poste de commande. Le plus gros morceau, le plus loin, celui que
  // personne n'a jamais atteint — et c'est là que dort la clé.
  head(g, mat, dark) {
    const prow = new THREE.Mesh(new THREE.ConeGeometry(15, 34, 9), mat);
    prow.rotation.z = -Math.PI / 2;
    prow.position.x = -14;
    g.add(prow);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(15, 12, 26, 9), mat);
    body.rotation.z = Math.PI / 2;
    body.position.x = 16;
    g.add(body);
    ajouteMembrures(g, dark, { count: 5, radius: 16, span: 24, seed: 5, jitter: 0.06 });
    // Une baie vitrée, éteinte. On voit qu'il y avait un poste, et qu'il est vide.
    const bay = new THREE.Mesh(new THREE.BoxGeometry(9, 3.5, 12), dark);
    bay.position.set(-20, 5, 0);
    g.add(bay);
  },
};

export function createHulk({ variant = 'torn', pos = [0, -24, -90], scale = 1, spin = 0.02 } = {}) {
  const group = new THREE.Group();
  const mat = elideMat(false);
  const dark = elideMat(true);
  (HULKS[variant] || HULKS.torn)(group, mat, dark);
  group.position.set(...pos);
  group.scale.setScalar(scale);
  group.rotation.y = -0.4;

  const lampes = [];
  group.traverse((o) => {
    if (o.userData.clignote) lampes.push(o.material);
  });

  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      // Une épave dérive : elle ne tourne pas sur un axe propre, elle bascule.
      group.rotation.z = Math.sin(t * 0.06) * 0.04;
      group.rotation.y += dt * spin * 0.35;
      group.position.y += Math.sin(t * 0.09) * dt * 0.6;
      // La seule lumière encore vivante de tout le voyage, et elle faiblit.
      for (const m of lampes) {
        m.opacity = 0.3 + Math.max(0, Math.sin(t * 1.7)) * 0.7;
        m.transparent = true;
      }
    },
  };
}

// --- KORN --------------------------------------------------------------------
// Ce qu'il montre de lui à l'héliopause. Il n'a pas de vaisseau amiral et pas de
// forme propre : il EST l'arche, celle qu'on a remplie d'un peuple et refermée.
//
// Une seule idée porte tout le dessin, et il ne faut pas la rater : **il est
// SCELLÉ**. Une couture court sur toute sa longueur, la lumière filtre par la
// fente — les gens sont là-dedans — et elle ne s'ouvre pas. Ce n'est pas une
// gueule, c'est un couvercle. La différence entre un monstre et un drame tient à
// ce détail-là.
export function createKorn() {
  const group = new THREE.Group();
  // La coque reste sombre — c'est un couvercle, pas un vaisseau éclairé — mais
  // jamais NOIRE. Mesuré : à 0x1c1a1f, sous l'éclairage mourant de l'héliopause
  // encore assombri de 45 % par le mode boss, il occupait 127 % de la largeur de
  // l'écran et restait littéralement invisible. Une masse qu'on ne voit pas ne
  // pèse rien.
  const coque = new THREE.MeshStandardMaterial({
    color: 0x2e2a35,
    emissive: 0x0b0a12,
    roughness: 0.9,
    metalness: 0.45,
    flatShading: true,
  });
  const r = rng(1010);

  // Le corps : un fuseau énorme, vu de trop près pour qu'on en voie les bouts.
  const LEN = 220;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(30, 26, LEN, 14, 1), coque);
  body.rotation.z = Math.PI / 2;
  group.add(body);
  const prow = new THREE.Mesh(new THREE.ConeGeometry(30, 52, 14), coque);
  prow.rotation.z = -Math.PI / 2;
  prow.position.x = -LEN / 2 - 24;
  group.add(prow);

  // Les membrures. Le même vocabulaire que l'épave élide : c'est ce qui dit, sans
  // une ligne de texte, qu'ils sortent du même chantier.
  for (let i = 0; i < 13; i++) {
    const k = i / 12;
    const rad = 30 * (0.9 + Math.sin(k * Math.PI) * 0.16);
    const cote = new THREE.Mesh(new THREE.TorusGeometry(rad, 1.5, 5, 18), coque);
    cote.position.x = (k - 0.5) * LEN * 0.94;
    cote.rotation.y = Math.PI / 2;
    group.add(cote);
  }

  // LA COUTURE. Une fente qui court sur toute la longueur, et la lumière de
  // l'intérieur qui en sort. C'est la seule chose lumineuse de tout l'objet.
  const fente = new THREE.Mesh(
    new THREE.PlaneGeometry(LEN * 0.92, 5.5),
    new THREE.MeshBasicMaterial({
      color: 0xffc98a,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  fente.position.set(0, 29.5, 0);
  fente.rotation.x = -Math.PI / 2;
  group.add(fente);

  // Deux lèvres de part et d'autre : elles rendent la fente FERMÉE plutôt que
  // simplement lumineuse. Sans elles, on lit une bande de néon.
  for (const s of [-1, 1]) {
    const levre = new THREE.Mesh(new THREE.BoxGeometry(LEN * 0.94, 3, 5.5), coque);
    levre.position.set(0, 28.5, s * 4.6);
    group.add(levre);
  }

  // Les unités de maintenance, sur sa peau. Ce sont elles que le joueur abat
  // depuis le début du jeu — les voir sur lui referme la boucle.
  const ouvriers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.5, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1, flatShading: true }),
    90
  );
  const dummy = new THREE.Object3D();
  const orbites = [];
  for (let i = 0; i < 90; i++) {
    orbites.push({
      x: (r() - 0.5) * LEN,
      a: r() * Math.PI * 2,
      v: (0.05 + r() * 0.16) * (r() > 0.5 ? 1 : -1),
      rad: 30.5 + r() * 1.5,
    });
  }
  group.add(ouvriers);

  // Le liseré. Une enveloppe légèrement plus grande, vue par l'intérieur, dont
  // seul le bord subsiste à l'écran — le même procédé que l'atmosphère des
  // planètes. C'est lui, et lui seul, qui détache la masse du fond étoilé et
  // permet enfin d'en lire la taille.
  const lisere = new THREE.Mesh(
    new THREE.CylinderGeometry(32.5, 28.5, LEN * 1.02, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x6a4a9a,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  lisere.rotation.z = Math.PI / 2;
  group.add(lisere);

  group.position.set(6, -46, -120);
  group.rotation.y = 0.12;
  group.rotation.z = 0.05;

  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      // Il tourne très lentement. Une masse pareille n'a aucune raison de se presser,
      // et c'est cette lenteur qui donne sa taille.
      group.rotation.y = 0.12 + Math.sin(t * 0.03) * 0.05;
      // La lumière de la fente respire : il y a quelque chose de vivant dedans.
      fente.material.opacity = 0.62 + Math.sin(t * 0.55) * 0.2;
      lisere.material.opacity = 0.26 + Math.sin(t * 0.4) * 0.05;
      for (let i = 0; i < orbites.length; i++) {
        const o = orbites[i];
        o.a += o.v * dt;
        dummy.position.set(o.x, Math.sin(o.a) * o.rad, Math.cos(o.a) * o.rad);
        dummy.lookAt(o.x, 0, 0);
        dummy.updateMatrix();
        ouvriers.setMatrixAt(i, dummy.matrix);
      }
      ouvriers.instanceMatrix.needsUpdate = true;
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
const FACTORIES = {
  planet: createPlanet,
  moon: createMoon,
  hulk: createHulk,
  korn: createKorn,
  asteroids: createAsteroids,
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
