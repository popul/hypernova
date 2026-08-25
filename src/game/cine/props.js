// Décors de la cinématique. Trois exigences ont guidé chaque choix :
// — la Terre doit être LA MÊME à chaque lancement (sinon on ne s'attache pas, et on
//   ne la reconnaît pas quand elle s'assombrit) ;
// — le cuirassé doit tenir en 4 draw calls malgré ses 130 unités de quille ;
// — l'essaim doit être une MASSE (320 vaisseaux), donc instancié.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../waves.js';

// mergeGeometries renvoie null au moindre désaccord d'attributs. Un mesh construit
// sur null plante au rendu, très loin de la cause : on échoue donc bruyamment ici.
function merge(parts, label) {
  const geo = mergeGeometries(parts, false);
  if (!geo) throw new Error(`Fusion de géométrie impossible : ${label}`);
  return geo;
}

// ---------------------------------------------------------------- La Terre

// Bruit de valeur lissé, sommé sur 4 octaves : donne des masses continentales
// continues là où des ellipses posées au hasard donnaient des taches.
function fbm2(rng) {
  const SIZE = 64;
  const grid = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x, y) => grid[(((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)];
  const smooth = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return (
      at(xi, yi) * (1 - u) * (1 - v) +
      at(xi + 1, yi) * u * (1 - v) +
      at(xi, yi + 1) * (1 - u) * v +
      at(xi + 1, yi + 1) * u * v
    );
  };
  return (x, y) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < 4; o++) {
      sum += smooth(x * freq, y * freq) * amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum;
  };
}

function makeEarthTexture() {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const noise = fbm2(mulberry32(20870224)); // graine FIXE : la même Terre à chaque partie
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * 2 - 1; // -1 pôle sud → +1 pôle nord
    for (let x = 0; x < W; x++) {
      const n = noise((x / W) * 9, (y / H) * 5);
      const land = n > 0.52;
      let r;
      let g;
      let b;
      if (land) {
        const alt = (n - 0.52) * 4;
        r = 42 + alt * 90;
        g = 96 + alt * 70;
        b = 52 + alt * 40;
      } else {
        const deep = 1 - Math.min(1, (0.52 - n) * 3);
        r = 12 + deep * 26;
        g = 46 + deep * 60;
        b = 108 + deep * 70;
      }
      // Calottes polaires : blanchiment progressif au-delà de 78 % de latitude.
      const polar = Math.max(0, (Math.abs(lat) - 0.78) / 0.22);
      if (polar > 0) {
        const w = Math.min(1, polar * 1.4);
        r += (235 - r) * w;
        g += (242 - g) * w;
        b += (250 - b) * w;
      }
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Lumières de villes sur la face nuit : une carte émissive ambrée, dense sur les
// terres, absente sur les océans.
function makeCityTexture() {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const noise = fbm2(mulberry32(20870224));
  const rng = mulberry32(915171);
  for (let i = 0; i < 2600; i++) {
    const x = rng() * W;
    const y = 20 + rng() * (H - 40);
    if (noise((x / W) * 9, (y / H) * 5) <= 0.54) continue; // seulement sur les terres
    const a = 0.25 + rng() * 0.75;
    const r = 0.5 + rng() * 1.6;
    ctx.fillStyle = `rgba(255,${180 + rng() * 50 - 25},${90 + rng() * 60},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCloudTexture() {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const noise = fbm2(mulberry32(778123));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = noise((x / W) * 12, (y / H) * 6);
      const a = Math.max(0, (n - 0.55) * 3.4);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

const FRESNEL_VERT = `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRESNEL_FRAG = `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), uPower);
    gl_FragColor = vec4(uColor * f, f * uOpacity);
  }
`;

// La Terre : surface, nuages, halo atmosphérique. 3 draw calls.
export function createEarth(radius = 26) {
  const group = new THREE.Group();

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshStandardMaterial({
      map: makeEarthTexture(),
      emissiveMap: makeCityTexture(),
      emissive: 0xffb066,
      emissiveIntensity: 1.5,
      roughness: 0.92,
      metalness: 0,
    })
  );
  surface.name = 'earth-surface';
  group.add(surface);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.012, 40, 26),
    new THREE.MeshStandardMaterial({
      map: makeCloudTexture(),
      transparent: true,
      opacity: 0.55,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
    })
  );
  clouds.name = 'earth-clouds';
  group.add(clouds);

  // Halo par fresnel en face arrière : remplace le sprite radial d'avant, qui
  // posait un voile bleu maximal au CENTRE du disque et lavait toute la texture.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.06, 40, 26),
    new THREE.ShaderMaterial({
      vertexShader: FRESNEL_VERT,
      fragmentShader: FRESNEL_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0x5aa8ff) },
        uPower: { value: 2.6 },
        uOpacity: { value: 1.0 },
      },
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.name = 'earth-halo';
  group.add(halo);

  group.userData = { surface, clouds, halo };
  return group;
}

// ---------------------------------------------------------- L'ÉCLIPSE (cuirassé)

// Bruit de surface tuilé : sans lui, un téléobjectif à 18 unités de la coque
// pendant 3 secondes ne montre qu'une saucisse grise.
function makeHullDetailTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const noise = fbm2(mulberry32(4242));
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = noise((x / S) * 8, (y / S) * 8);
      const plate = (Math.floor(x / 32) + Math.floor(y / 21)) % 2 ? 0.92 : 1.0;
      const v = (110 + n * 90) * plate;
      const i = (y * S + x) * 4;
      img.data[i] = v * 0.9;
      img.data[i + 1] = v * 0.92;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Le cuirassé : quille de 130 unités, gueule à mandibules articulées, œil.
// Coque et bandes lumineuses fusionnées → 4 draw calls au total.
export function createEclipse() {
  const group = new THREE.Group();
  const rng = mulberry32(99321);
  const LEN = 130;

  // --- Coque : échine segmentée + arceaux + excroissances, tout fusionné ---
  const hullParts = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const w = 9 + Math.sin(t * Math.PI) * 7; // fuselé aux extrémités
    const seg = new THREE.BoxGeometry(LEN / 9, w * 0.95, w * 1.15);
    seg.translate(-LEN / 2 + (LEN / 9) * (i + 0.5), 0, 0);
    hullParts.push(seg);
  }
  for (let i = 0; i < 24; i++) {
    const x = -LEN / 2 + 4 + (i / 23) * (LEN - 8);
    const r = 7 + Math.sin((i / 23) * Math.PI) * 4.2;
    const arc = new THREE.TorusGeometry(r, 1.15, 5, 10, Math.PI * 1.35);
    arc.rotateY(Math.PI / 2);
    arc.rotateX(Math.PI * 0.32);
    arc.translate(x, 0, 0);
    hullParts.push(arc);
  }
  for (let i = 0; i < 40; i++) {
    const g = new THREE.BoxGeometry(1.6 + rng() * 4, 1 + rng() * 3, 1 + rng() * 3);
    const x = -LEN / 2 + rng() * LEN;
    const a = rng() * Math.PI * 2;
    const r = 6 + rng() * 3;
    g.translate(x, Math.sin(a) * r * 0.5, Math.cos(a) * r);
    hullParts.push(g);
  }
  const hullGeo = merge(hullParts, 'coque du cuirassé');
  for (const p of hullParts) p.dispose();
  const hull = new THREE.Mesh(
    hullGeo,
    new THREE.MeshStandardMaterial({
      map: makeHullDetailTexture(),
      color: 0x4a4658,
      // Une pointe d'émissif : sous l'éclairage éteint du plan, une coque
      // purement diffuse deviendrait une silhouette noire sans surface.
      emissive: 0x1a1826,
      emissiveIntensity: 1,
      roughness: 0.82,
      metalness: 0.55,
      flatShading: false,
    })
  );
  hull.name = 'eclipse-hull';
  group.add(hull);

  // --- Bandes incandescentes : une seule géométrie non éclairée, pour le bloom ---
  const bandParts = [];
  for (let i = 0; i < 60; i++) {
    const x = -LEN / 2 + 6 + rng() * (LEN - 12);
    const a = rng() * Math.PI * 2;
    const len = 1.5 + rng() * 6;
    const b = new THREE.BoxGeometry(len, 0.32, 0.32);
    b.translate(x, Math.sin(a) * 4.6, Math.cos(a) * 8.2);
    bandParts.push(b);
  }
  const bandGeo = merge(bandParts, 'bandes du cuirassé');
  for (const p of bandParts) p.dispose();
  const bands = new THREE.Mesh(
    bandGeo,
    new THREE.MeshBasicMaterial({ color: 0xb14cff, toneMapped: false })
  );
  bands.name = 'eclipse-bands';
  group.add(bands);

  // --- La gueule : 8 mandibules articulées à l'avant (-X) ---
  const maw = new THREE.Group();
  maw.name = 'eclipse-maw';
  maw.position.set(-LEN / 2, 0, 0);
  const mandMat = new THREE.MeshStandardMaterial({
    color: 0x3a3444,
    roughness: 0.7,
    metalness: 0.6,
    flatShading: true,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const hinge = new THREE.Group();
    hinge.rotation.x = a;
    const mand = new THREE.Mesh(new THREE.ConeGeometry(1.5, 13, 4), mandMat);
    mand.rotation.z = Math.PI / 2;
    mand.position.set(-5.5, 0, 6.2);
    hinge.add(mand);
    hinge.userData.rest = a;
    maw.add(hinge);
  }
  const furnace = new THREE.Mesh(
    new THREE.SphereGeometry(5.5, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xf0d0ff, toneMapped: false })
  );
  furnace.name = 'eclipse-furnace';
  furnace.scale.setScalar(0.01);
  maw.add(furnace);
  group.add(maw);

  // --- L'œil : au flanc, c'est lui qu'on vise ---
  const eye = new THREE.Group();
  eye.name = 'eclipse-eye';
  eye.position.set(-18, 5.5, 8.6);
  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, toneMapped: false })
  );
  iris.name = 'eclipse-iris';
  eye.add(iris);
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0x1a0208 })
  );
  pupil.position.z = 2.3;
  eye.add(pupil);
  // Obturateurs : deux paupières qui se claquent quand on le frappe.
  const lidMat = new THREE.MeshStandardMaterial({
    color: 0x2c2636,
    roughness: 0.7,
    metalness: 0.5,
  });
  for (const sign of [-1, 1]) {
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(3.6, 18, 8, 0, Math.PI * 2, 0, 0.62),
      lidMat
    );
    lid.rotation.x = sign > 0 ? 0 : Math.PI;
    lid.position.y = sign * 3.5;
    lid.name = `eclipse-lid-${sign > 0 ? 'up' : 'down'}`;
    eye.add(lid);
  }
  group.add(eye);

  group.userData = { hull, bands, maw, eye, iris, furnace, length: LEN };
  return group;
}

// ------------------------------------------------------------ L'essaim instancié

// 320 drones en 2 InstancedMesh. L'ancienne version clonait 26 groupes de 5 meshes
// (≈130 draw calls) : instancier est un gain net, pas un coût.
export function createSwarm(count = 320) {
  // mergeGeometries renvoie null si on mélange indexé et non indexé : l'octaèdre
  // ne l'est pas, les boîtes le sont. On normalise tout en non indexé d'abord.
  const bodyParts = [
    new THREE.OctahedronGeometry(0.55).scale(1, 0.75, 1.1),
    new THREE.BoxGeometry(0.8, 0.08, 0.45).translate(0.75, 0, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.8, 0.08, 0.45).translate(-0.75, 0, 0).toNonIndexed(),
  ];
  const bodyGeo = merge(bodyParts, 'essaim');
  for (const p of bodyParts) p.dispose();

  const bodies = new THREE.InstancedMesh(
    bodyGeo,
    new THREE.MeshStandardMaterial({
      color: 0x7a1d5c,
      emissive: 0x30061f,
      roughness: 0.6,
      metalness: 0.4,
      flatShading: true,
    }),
    count
  );
  const eyes = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 6, 6).translate(0, 0.1, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffd166, toneMapped: false }),
    count
  );
  bodies.frustumCulled = false;
  eyes.frustumCulled = false;
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const group = new THREE.Group();
  group.add(bodies, eyes);
  group.userData = { bodies, eyes, count };
  return group;
}

// --------------------------------------------------------- Navettes et débris

export function createShuttles(count = 140) {
  const geo = merge(
    [
      new THREE.BoxGeometry(0.9, 0.34, 0.34),
      new THREE.BoxGeometry(0.26, 0.1, 0.9).translate(-0.3, 0, 0),
    ],
    'navettes'
  );
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0xc9d2de,
      emissive: 0x4a5666,
      roughness: 0.7,
      metalness: 0.3,
      flatShading: true,
    }),
    count
  );
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export function createDebris(count = 90) {
  const geo = new THREE.TetrahedronGeometry(1.1);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x6b6270,
      emissive: 0x2a1410,
      roughness: 0.85,
      metalness: 0.4,
      flatShading: true,
    }),
    count
  );
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}
