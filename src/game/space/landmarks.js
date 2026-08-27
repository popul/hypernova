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
import { createAnneaux } from './escales/anneaux.js';
import { createChamp } from './escales/champ.js';
import { createSurface } from './escales/surface.js';

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
// `detail` multiplie la RÉSOLUTION de la texture, pas ce qu'elle dessine.
//
// Une planète de rayon 30 et une de rayon 110 partageaient la même image de
// 512 × 256 : sur la seconde, chaque texel est agrandi presque quatre fois. Les
// lumières de ville, carrés d'un pixel et demi, devenaient des taches crème de
// deux unités de côté — on les prenait pour des débris posés devant la Terre.
//
// Tout ce qui doit garder sa taille APPARENTE est donc multiplié par `detail` :
// les bandes, les continents, la tache de Jupiter, l'écart entre deux lumières
// d'un même amas. Une seule chose ne l'est pas, et c'est le but de l'opération :
// le point de lumière lui-même, qui reste à un pixel et demi de canevas et
// rétrécit donc d'autant sur la sphère.
//
// À `detail` = 1 le dessin est rigoureusement identique à ce qu'il était : tous
// les facteurs valent un, et le tirage aléatoire consomme la même suite.
function surfaceTexture(recipe, seed, detail = 1) {
  const d = Math.max(1, Math.round(detail));
  const w = 512 * d;
  const h = 256 * d;
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
    const th = (3 + r() * (recipe.stripes ? 14 : 8)) * d;
    ctx.globalAlpha = 0.1 + r() * 0.24;
    ctx.fillStyle = recipe.band;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16 * d) ctx.lineTo(x, y + Math.sin((x / d) * 0.03 + i) * 3 * d);
    ctx.lineTo(w, y + th);
    for (let x = w; x >= 0; x -= 16 * d)
      ctx.lineTo(x, y + th + Math.sin((x / d) * 0.03 + i) * 3 * d);
    ctx.closePath();
    ctx.fill();
  }

  // Continents : des taches irrégulières, pour les mondes solides.
  if (recipe.land) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = recipe.land;
    for (let i = 0; i < 26; i++) {
      const cx = r() * w;
      const cy = 30 * d + r() * (h - 60 * d);
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        const rad = (10 + r() * 34) * (recipe.clouds > 0.3 ? 1 : 0.6) * d;
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
    ctx.ellipse(w * 0.62, h * 0.62, 46 * d, 22 * d, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lumières de ville sur la face nuit : quelques amas, jamais un semis régulier.
  if (recipe.lights) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd9a0';
    for (let i = 0; i < 170 * d; i++) {
      const cx = r() * w;
      const cy = 40 * d + r() * (h - 80 * d);
      for (let k = 0; k < 5; k++) {
        // Le point de lumière garde sa taille de CANEVAS : c'est ce qui le fait
        // rétrécir sur la sphère quand la texture gagne en résolution.
        ctx.fillRect(cx + (r() - 0.5) * 22 * d, cy + (r() - 0.5) * 14 * d, 1.4, 1.4);
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
  // Une planète vue de près a besoin d'une texture plus fine — voir surfaceTexture.
  detail = 1,
} = {}) {
  const recipe = PLANETES[kind] || PLANETES.earth;
  const group = new THREE.Group();

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 44, 30),
    new THREE.MeshStandardMaterial({
      map: surfaceTexture(recipe, seed + kind.length * 31, detail),
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
const ELIDE_OMBRE = 0x4a4740;
const ELIDE_FEU = 0xffb15c;

// La texture de coque. C'est elle, et pas la géométrie, qui fait la différence
// entre « une boîte grise » et « un morceau de vaisseau » — un cube texturé se lit
// comme une section de coque, un cube nu se lit comme un cube.
//
// Quatre couches, et aucune n'est décorative :
//  1. LES LIGNES DE PANNEAU, irrégulières. Une grille régulière se lit comme du
//     carrelage ; ce sont les tailles inégales qui font croire à des tôles posées
//     par quelqu'un qui avait une raison de les poser comme ça.
//  2. LES RIVETS le long de certaines coutures — pas de toutes. Ils donnent
//     l'échelle : sans eux on ne sait pas si l'objet fait trois mètres ou trois cents.
//  3. LES COULURES verticales. Dix mille ans de rien, ça se voit.
//  4. LES MARQUAGES au pochoir. Trois blocs suffisent : on ne les lit pas, on
//     reconnaît qu'il y a quelque chose d'écrit, et donc que quelqu'un l'a écrit.
//
// Une seconde passe en niveaux de gris sert de carte de relief : les lignes de
// panneau creusent réellement la surface au lieu d'être peintes dessus.
let _elideTex = null;

function elideTextures() {
  if (_elideTex) return _elideTex;
  const S = 512;
  const col = document.createElement('canvas');
  const bmp = document.createElement('canvas');
  col.width = col.height = bmp.width = bmp.height = S;
  const c = col.getContext('2d');
  const b = bmp.getContext('2d');
  const r = rng(4711);

  c.fillStyle = '#b9b3a4';
  c.fillRect(0, 0, S, S);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, S, S);

  // 1. Panneaux : découpe récursive, ce qui donne des tailles inégales sans avoir
  // à les écrire une par une.
  const panneaux = [];
  const decouper = (x, y, w, h, prof) => {
    if (prof <= 0 || w < 48 || h < 48) {
      panneaux.push([x, y, w, h]);
      return;
    }
    const vertical = w > h ? r() < 0.75 : r() < 0.25;
    const t = 0.32 + r() * 0.36;
    if (vertical) {
      decouper(x, y, w * t, h, prof - 1);
      decouper(x + w * t, y, w * (1 - t), h, prof - 1);
    } else {
      decouper(x, y, w, h * t, prof - 1);
      decouper(x, y + h * t, w, h * (1 - t), prof - 1);
    }
  };
  decouper(0, 0, S, S, 4);

  for (const [x, y, w, h] of panneaux) {
    // Chaque tôle a sa teinte propre : une coque n'est jamais d'une seule couleur,
    // les plaques ne viennent pas du même bain.
    const v = 0.88 + r() * 0.2;
    c.fillStyle = `rgba(${(185 * v) | 0},${(179 * v) | 0},${(164 * v) | 0},1)`;
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(40,38,34,0.55)';
    c.lineWidth = 1.6;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    b.fillStyle = `rgb(${(150 + r() * 20) | 0},${(150 + r() * 20) | 0},${(150 + r() * 20) | 0})`;
    b.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);

    // 2. Rivets, sur une couture sur trois.
    if (r() < 0.34) {
      const n = Math.max(3, Math.floor(w / 22));
      for (let i = 0; i < n; i++) {
        const rx = x + 6 + (i * (w - 12)) / Math.max(1, n - 1);
        for (const ry of [y + 5, y + h - 5]) {
          c.fillStyle = 'rgba(70,66,58,0.7)';
          c.beginPath();
          c.arc(rx, ry, 1.6, 0, Math.PI * 2);
          c.fill();
          b.fillStyle = '#c8c8c8';
          b.beginPath();
          b.arc(rx, ry, 1.6, 0, Math.PI * 2);
          b.fill();
        }
      }
    }
  }

  // 3. Coulures.
  for (let i = 0; i < 60; i++) {
    const x = r() * S;
    const y = r() * S;
    const h = 20 + r() * 130;
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(60,54,44,0.22)');
    g.addColorStop(1, 'rgba(60,54,44,0)');
    c.fillStyle = g;
    c.fillRect(x, y, 1 + r() * 3, h);
  }

  // 4. Marquages au pochoir et bande d'avertissement.
  c.fillStyle = 'rgba(48,44,38,0.75)';
  for (let i = 0; i < 4; i++) {
    const x = r() * (S - 90);
    const y = r() * (S - 20);
    for (let k = 0; k < 3 + ((r() * 4) | 0); k++) {
      c.fillRect(x + k * 13, y, 8, 12);
    }
  }
  const by = r() * (S - 30);
  for (let x = 0; x < S; x += 22) {
    c.fillStyle = x % 44 === 0 ? 'rgba(210,150,60,0.5)' : 'rgba(50,46,40,0.5)';
    c.beginPath();
    c.moveTo(x, by);
    c.lineTo(x + 11, by);
    c.lineTo(x + 22, by + 14);
    c.lineTo(x + 11, by + 14);
    c.closePath();
    c.fill();
  }

  const mk = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const map = mk(col);
  map.colorSpace = THREE.SRGBColorSpace;
  _elideTex = { map, bump: mk(bmp) };
  return _elideTex;
}

function elideMat(dark = false, repeat = 1) {
  const { map, bump } = elideTextures();
  const m = map.clone();
  const bp = bump.clone();
  m.repeat.set(repeat, repeat);
  bp.repeat.set(repeat, repeat);
  m.needsUpdate = bp.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    color: dark ? ELIDE_OMBRE : 0xffffff,
    map: dark ? null : m,
    bumpMap: dark ? null : bp,
    bumpScale: 0.6,
    roughness: 0.86,
    metalness: 0.3,
  });
}

// Greebles : les petits volumes rapportés qui couvrent les coques de vaisseaux au
// cinéma. Leur rôle n'est pas décoratif — ils CASSENT la silhouette primitive. Un
// pavé nu se lit comme un pavé quelle que soit sa texture ; le même pavé hérissé
// de trente détails se lit comme une machine.
function greeble(group, mat, { count, spread, seed = 1, scale = 1 }) {
  const r = rng(seed);
  const geos = [
    () => new THREE.BoxGeometry(0.9, 0.35, 1.4),
    () => new THREE.BoxGeometry(0.5, 0.5, 0.5),
    () => new THREE.CylinderGeometry(0.3, 0.3, 0.5, 6),
    () => new THREE.BoxGeometry(1.8, 0.25, 0.4),
  ];
  for (let i = 0; i < count; i++) {
    const g = geos[(r() * geos.length) | 0]();
    const m = new THREE.Mesh(g, mat);
    m.position.set((r() - 0.5) * spread[0], (r() - 0.5) * spread[1], (r() - 0.5) * spread[2]);
    m.rotation.set(r() * 0.4, r() * Math.PI, r() * 0.4);
    m.scale.setScalar(scale * (0.6 + r() * 1.1));
    group.add(m);
  }
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
  // LA TUYÈRE. Une cloche de réacteur arrachée. Ce qui la rend reconnaissable n'est
  // pas la cloche — c'est le COL étranglé derrière elle, la couronne d'injecteurs
  // autour, et l'anneau de cardan qui l'attachait. Sans ces trois pièces, un cône
  // creux n'est qu'un cône creux.
  nozzle(g, mat, dark) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(8, 19, 24, 24, 4, true), mat);
    bell.material.side = THREE.DoubleSide;
    g.add(bell);
    // Le col : la vraie signature d'une tuyère, l'étranglement avant la sortie.
    const col = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 8, 7, 20), mat);
    col.position.y = 15.5;
    g.add(col);
    const chambre = new THREE.Mesh(new THREE.SphereGeometry(6.4, 18, 12), mat);
    chambre.position.y = 22;
    g.add(chambre);
    // Injecteurs en couronne : douze tubes, et l'échelle apparaît.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const inj = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 5, 6), dark);
      inj.position.set(Math.cos(a) * 5.6, 20, Math.sin(a) * 5.6);
      g.add(inj);
    }
    // Anneau de cardan, brisé d'un côté : c'est par là qu'elle s'est détachée.
    const gimbal = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.85, 8, 24, Math.PI * 1.5), dark);
    gimbal.position.y = 13;
    gimbal.rotation.x = Math.PI / 2;
    g.add(gimbal);
    greeble(g, dark, { count: 26, spread: [16, 24, 16], seed: 12, scale: 0.8 });
    g.rotation.z = 0.55;
  },

  // LA DÉCHIRURE. Deux tronçons désalignés et, entre eux, le squelette à nu. C'est
  // le VIDE au milieu qui raconte : une coque entière n'est pas une épave.
  torn(g, mat, dark) {
    const avant = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8.5, 26, 16, 3), mat);
    avant.rotation.z = Math.PI / 2;
    avant.position.set(-19, 0, 0);
    g.add(avant);
    const arriere = new THREE.Mesh(new THREE.CylinderGeometry(8, 6.5, 18, 16, 2), mat);
    arriere.rotation.z = Math.PI / 2;
    arriere.rotation.y = 0.24;
    arriere.position.set(20, -5.5, 3);
    g.add(arriere);
    // Les tôles arrachées, en éventail : la déchirure elle-même.
    const r = rng(66);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const tole = new THREE.Mesh(new THREE.BoxGeometry(5 + r() * 4, 0.35, 3 + r() * 2), mat);
      tole.position.set(-6 + r() * 3, Math.sin(a) * 7.5, Math.cos(a) * 7.5);
      tole.rotation.set(a, r() * 0.5, (r() - 0.5) * 1.2);
      g.add(tole);
    }
    ajouteMembrures(g, dark, { count: 6, radius: 7.5, span: 16, seed: 21, jitter: 0.45 });
    greeble(g, dark, { count: 34, spread: [46, 14, 14], seed: 33, scale: 0.85 });
  },

  // L'HABITAT. Un tambour à hublots, avec sa couronne d'accostage à un bout et ses
  // radiateurs déployés. Les hublots donnent l'échelle humaine — c'est le seul
  // morceau dont on peut dire « des gens devaient dormir là ».
  habitat(g, mat, dark) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 22, 28, 3), mat);
    drum.rotation.z = Math.PI / 2;
    g.add(drum);
    for (const x of [-11.6, 11.6]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 10, 0, Math.PI * 2, 0, 0.5), mat);
      cap.rotation.z = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      cap.position.x = x;
      g.add(cap);
    }
    // Deux rangées de hublots, régulières : une coque d'habitat EST régulière.
    for (let rang = 0; rang < 2; rang++) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 8), dark);
        w.position.set(-5 + rang * 10, Math.sin(a) * 12.1, Math.cos(a) * 12.1);
        w.rotation.x = -a + Math.PI / 2;
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
    }
    // Couronne d'accostage.
    const port = new THREE.Mesh(new THREE.TorusGeometry(4.2, 1.1, 8, 20), dark);
    port.position.x = 13;
    port.rotation.y = Math.PI / 2;
    g.add(port);
    // Radiateurs : deux grands panneaux plats, la seule surface lisse de la pièce.
    for (const s of [-1, 1]) {
      const rad = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 9), mat);
      rad.position.set(0, s * 14, 0);
      rad.rotation.x = s * 0.25;
      g.add(rad);
    }
    greeble(g, dark, { count: 30, spread: [22, 24, 24], seed: 44, scale: 0.8 });
  },

  // LA SOUTE. Longue, cerclée, close. Ce sont les cerclages réguliers et les
  // portes de chargement qui la font lire — un pavé lisse ne dit rien.
  hold(g, mat, dark) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 46, 8, 6), mat);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    for (let i = 0; i < 6; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(9.4, 0.9, 6, 8), dark);
      band.position.x = -20 + i * 8;
      band.rotation.y = Math.PI / 2;
      g.add(band);
    }
    // Portes de chargement : deux grands rectangles en creux, alignés.
    for (const x of [-10, 6]) {
      const porte = new THREE.Mesh(new THREE.BoxGeometry(9, 1, 11), dark);
      porte.position.set(x, 8.4, 0);
      g.add(porte);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(9, 10, 8), mat);
    cap.rotation.z = -Math.PI / 2;
    cap.position.x = 28;
    g.add(cap);
    greeble(g, dark, { count: 30, spread: [44, 16, 16], seed: 55, scale: 0.75 });
  },

  // LE RELAIS. Petit, intact, et le SEUL morceau encore alimenté. Sa parabole et
  // son mât le rendent identifiable au premier coup d'œil, ce qui compte parce que
  // c'est le morceau qu'on cherche.
  relay(g, mat, dark) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.2, 24, 8), mat);
    g.add(mast);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.22, 5, 10), dark);
      ring.position.y = -10 + i * 5;
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(9, 28, 14, 0, Math.PI * 2, 0, 0.95), mat);
    dish.material.side = THREE.DoubleSide;
    dish.position.y = 11;
    dish.rotation.x = Math.PI + 0.45;
    g.add(dish);
    // Le cornet au foyer : sans lui, une parabole n'est qu'un bol.
    const feed = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 8), dark);
    feed.position.set(0, 6.5, 3.2);
    feed.rotation.x = -0.45;
    g.add(feed);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6.5, 4), dark);
      stay.position.set(Math.cos(a) * 2.4, 8.6, 1.6 + Math.sin(a) * 2.4);
      stay.rotation.z = Math.cos(a) * 0.42;
      stay.rotation.x = Math.sin(a) * 0.42;
      g.add(stay);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.5, 5.5), mat);
    box.position.y = -10;
    g.add(box);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 6),
      new THREE.MeshBasicMaterial({ color: ELIDE_FEU, toneMapped: false })
    );
    lamp.position.set(2.6, -10, 2.6);
    lamp.userData.clignote = true;
    lamp.material.userData.garderVif = true; // une lampe assombrie n'est plus une lampe
    g.add(lamp);
    greeble(g, dark, { count: 14, spread: [7, 22, 7], seed: 77, scale: 0.5 });
  },

  // LA TÊTE. Le poste de commande : la proue effilée, la baie vitrée, et l'anneau
  // de dérive. Le plus gros morceau, et celui qu'il faut reconnaître de loin.
  head(g, mat, dark) {
    const prow = new THREE.Mesh(new THREE.CylinderGeometry(4, 15, 34, 16, 4), mat);
    prow.rotation.z = Math.PI / 2;
    prow.position.x = -16;
    g.add(prow);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(15, 13, 26, 16, 3), mat);
    body.rotation.z = Math.PI / 2;
    body.position.x = 15;
    g.add(body);
    ajouteMembrures(g, dark, { count: 5, radius: 16, span: 24, seed: 5, jitter: 0.06 });
    // La baie : trois vitres en bandeau, inclinées. C'est ce qui dit « un poste ».
    for (let i = 0; i < 3; i++) {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.6, 3.4), dark);
      bay.position.set(-24 + i * 5, 5.2 - i * 0.5, 0);
      bay.rotation.z = -0.28;
      g.add(bay);
    }
    // Anneau de dérive, incliné : la silhouette qu'on reconnaît de loin.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(17, 1.4, 8, 28), mat);
    ring.position.x = 24;
    ring.rotation.y = Math.PI / 2;
    ring.rotation.z = 0.22;
    g.add(ring);
    greeble(g, dark, { count: 46, spread: [56, 26, 26], seed: 99, scale: 1.05 });
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
  // La MÊME texture de coque que l'épave élide, assombrie. C'est un point de
  // l'histoire autant qu'un choix graphique : ANDEL et la seconde arche sortent du
  // même chantier, et le joueur doit pouvoir le reconnaître sans qu'on le lui dise.
  const { map, bump } = elideTextures();
  const m = map.clone();
  const bp = bump.clone();
  m.repeat.set(6, 2);
  bp.repeat.set(6, 2);
  m.needsUpdate = bp.needsUpdate = true;
  const coque = new THREE.MeshStandardMaterial({
    color: 0x4a4550, // teinte sombre appliquée PAR-DESSUS la texture
    map: m,
    bumpMap: bp,
    bumpScale: 1.1,
    emissive: 0x0b0a12,
    roughness: 0.9,
    metalness: 0.45,
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
      userData: { garderVif: true },
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
// Les décors d'ESCALE vivent dans leur propre dossier : ils sont d'une autre
// nature que ceux d'ici. Ceux de ce fichier se posent à des centaines d'unités et
// ne servent que de fond ; ceux-là, on les traverse.
const FACTORIES = {
  planet: createPlanet,
  moon: createMoon,
  hulk: createHulk,
  korn: createKorn,
  asteroids: createAsteroids,
  anneaux: createAnneaux,
  champ: createChamp,
  surface: createSurface,
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
