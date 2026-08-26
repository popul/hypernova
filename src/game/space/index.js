// Le ciel : étoiles en parallaxe, nébuleuses, objet remarquable, et le fondu d'un
// secteur au suivant.
//
// Remplace l'ancien champ d'étoiles, qui était strictement identique de la vague 1
// à la vague 30. Ici chaque vague a son lieu, et le changement de lieu se produit
// PENDANT le saut lumière — donc à couvert du flash, sans aucun raccord visible.

import * as THREE from 'three';
import { createLandmark, createSun, disposeLandmark } from './landmarks.js';

const FIELD = { xSpread: 90, yMin: -40, yMax: 10, zNear: 30, zFar: -120 };
const LAYERS = [
  { count: 420, size: 0.42, speed: 9 },
  { count: 240, size: 0.78, speed: 16 },
];
const FADE = 1.1; // secondes de transition d'un secteur à l'autre

// LE SECTEUR SE DURCIT. Le combat de boss se joue en trois actes, et le décor est
// ce qui l'annonce avant la barre de vie : la lumière tombe, la brume monte, les
// étoiles s'éteignent, et une braise s'allume loin derrière l'arène.
//
// Ce sont des FACTEURS, jamais des couleurs absolues. Le durcissement doit tenir
// au-dessus des onze paliers du voyage, du bleu de l'orbite terrestre au violet de
// l'héliopause, sans jamais effacer le lieu où l'on se bat.
//
// L'exposition qui baisse a un effet gratuit et précieux : les projectiles ennemis
// sont en MeshBasicMaterial toneMapped:false, donc rigoureusement insensibles à
// elle. Assombrir le secteur ne les touche pas — ça les DÉTACHE.
const DURCISSEMENT = [
  { fog: 1, expo: 1, hemi: 1, key: 1, teinte: 0, etoiles: 1, gueule: 0, nebuleuse: 1 },
  {
    fog: 1.18,
    expo: 0.95,
    hemi: 0.86,
    key: 0.92,
    teinte: 0.3,
    etoiles: 0.88,
    gueule: 26,
    nebuleuse: 1.12,
  },
  {
    fog: 1.5,
    expo: 0.87,
    hemi: 0.62,
    key: 0.78,
    teinte: 0.62,
    etoiles: 0.7,
    gueule: 70,
    nebuleuse: 1.35,
  },
  {
    fog: 2,
    expo: 0.77,
    hemi: 0.4,
    key: 0.6,
    teinte: 1,
    etoiles: 0.48,
    gueule: 150,
    nebuleuse: 1.6,
  },
];
const PHASE_FADE = 0.55; // secondes : assez pour qu'on sente basculer, trop court pour attendre
const TEINTE_FOND = new THREE.Color(0x1a0416); // le fond et la brume virent au sang séché
const TEINTE_RIM = new THREE.Color(0xb84cff); // le contre-jour vire au violet, comme le biome de boss
const TEINTE_GUEULE = new THREE.Color(0xff3a1e);
const GUEULE_BOSS = new THREE.Vector3(0, -3, -46); // derrière la formation, hors du champ

function blankPalette() {
  return {
    bg: new THREE.Color(),
    fog: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    rim: new THREE.Color(),
    star: new THREE.Color(),
    density: 0.0075,
    intensity: 1.1,
    exposure: 1.15,
  };
}

function copyPalette(dst, src) {
  dst.bg.copy(src.bg);
  dst.fog.copy(src.fog);
  dst.hemiSky.copy(src.hemiSky);
  dst.hemiGround.copy(src.hemiGround);
  dst.rim.copy(src.rim);
  dst.star.copy(src.star);
  dst.density = src.density;
  dst.intensity = src.intensity;
  dst.exposure = src.exposure;
}

function starTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(200,230,255,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function nebulaTexture(inner) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Space {
  constructor(scene, { lights, renderer } = {}) {
    this.scene = scene;
    this.lights = lights;
    this.renderer = renderer;
    this.layers = [];
    this.nebulas = [];
    // Un palier porte PLUSIEURS décors : la Terre et sa Lune dans le même plan, une
    // épave élide devant une géante gazeuse. Un seul objet par secteur interdisait
    // par construction toute composition de profondeur.
    this.landmarks = [];
    // Le Soleil, lui, est persistant : il ne change pas d'un palier à l'autre, il
    // RÉTRÉCIT. Le détruire et le reconstruire donnerait un objet qui change, pas
    // un astre dont on s'éloigne — et c'est tout le sujet du voyage.
    this.sun = createSun();
    this.sun.group.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        m.fog = false;
      }
    });
    scene.add(this.sun.group);
    this.warp = 0;

    const tex = starTexture();
    for (const [i, def] of LAYERS.entries()) {
      const positions = new Float32Array(def.count * 3);
      for (let n = 0; n < def.count; n++) {
        positions[n * 3] = (Math.random() - 0.5) * FIELD.xSpread;
        positions[n * 3 + 1] = FIELD.yMin + Math.random() * (FIELD.yMax - FIELD.yMin);
        positions[n * 3 + 2] = FIELD.zFar + Math.random() * (FIELD.zNear - FIELD.zFar);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: def.size,
        map: tex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xbfe8ff,
      });
      const points = new THREE.Points(geo, mat);
      points.renderOrder = -10;
      points.frustumCulled = false;
      scene.add(points);

      // Les mêmes étoiles en segments, invisibles hors du saut. Un PointsMaterial ne
      // sait pas s'étirer : sans cette seconde représentation, un « passage en
      // lumière » ne serait qu'un champ de points qui va plus vite.
      const line = new Float32Array(def.count * 6);
      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.BufferAttribute(line, 3));
      const streaks = new THREE.LineSegments(
        lgeo,
        new THREE.LineBasicMaterial({
          color: 0xdfefff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      streaks.renderOrder = -9;
      streaks.frustumCulled = false;
      streaks.visible = false;
      scene.add(streaks);

      this.layers.push({ points, streaks, positions, line, geo, lgeo, speed: def.speed, index: i });
    }

    // Cibles de fondu : on interpole des couleurs, jamais on ne les remplace d'un
    // coup — un fond qui change de teinte en une image se lit comme un bug d'affichage.
    this.from = blankPalette();
    this.to = blankPalette();
    this.fadeT = 1;
    this.starOpacity = [0.55, 0.4];
    // Compensation de cadrage. Le champ HORIZONTAL varie énormément selon le
    // format : 87° en 16/9, mais 37° sur un téléphone en portrait, où fitCamera
    // resserre pour garder l'arène dans le champ. Un décor calibré en paysage
    // grossit donc de 2,8 fois dans un cadre portrait — mesuré — et la planète
    // déborde de partout. On le remet à sa taille apparente prévue.
    this.framing = 1;
    this._c = new THREE.Color();

    // Phase de boss. On garde la phase courante en FLOTTANT, pas en entier : c'est
    // elle qu'on interpole, et une ambiance qui bascule en une image se lit comme
    // un changement de scène, pas comme une montée en tension.
    this.phase = 0;
    this.phaseFrom = 0;
    this.phaseTo = 0;
    this.phaseT = 1;
    this._dur = { ...DURCISSEMENT[0] };
    // Le fondu de secteur et celui de phase sont indépendants : on peut être en
    // plein durcissement sans changer de lieu. On retient donc où en est le fondu
    // de secteur pour pouvoir repeindre à tout moment sans le faire reculer.
    this._fadeK = 1;
    // Ces trois-là appartiennent à main.js, pas au ciel. On note leur valeur de
    // repos pour pouvoir la rendre intacte à la fin du combat.
    this._rimBase = lights?.rimLight?.intensity ?? 0.7;
    this._keyBase = lights?.keyLight?.intensity ?? 1.6;
    this._gueuleHome = lights?.mawLight?.position.clone() ?? null;
  }

  // 1, 2, 3 — l'acte en cours du combat de boss. 0 remet le secteur exactement tel
  // que le biome l'a laissé : le combat est fini, on respire.
  setBossPhase(phase) {
    const p = Math.min(3, Math.max(0, Math.round(phase) || 0));
    if (this.phaseTo === p) return;
    this.phaseFrom = this.phase;
    this.phaseTo = p;
    this.phaseT = 0;
  }

  // Les facteurs de l'instant, interpolés entre les deux actes encadrants. Écrit
  // dans un objet de travail : une bascule dure une trentaine d'images, ce n'est
  // pas une raison pour y allouer trente objets.
  _durcir() {
    const i = Math.floor(this.phase);
    const a = DURCISSEMENT[i];
    const b = DURCISSEMENT[Math.min(DURCISSEMENT.length - 1, i + 1)];
    const f = this.phase - i;
    for (const cle in a) this._dur[cle] = a[cle] + (b[cle] - a[cle]) * f;
    return this._dur;
  }

  // Reçoit la demi-tangente du champ horizontal courant. La taille apparente d'un
  // objet lointain lui est inversement proportionnelle : on compense donc en
  // rapetissant les décors d'autant. Un objet dans le vide n'a pas d'échelle
  // propre, le réduire ne se voit pas — c'est ce qui rend l'astuce possible.
  setFraming(tanHalfH) {
    const REF = 0.946; // valeur en 16/9, le format de référence
    this.framing = Math.min(1, tanHalfH / REF);
    this._applyFraming();
  }

  _applyFraming() {
    for (const l of this.landmarks) {
      const base = l.group.userData.baseScale ?? l.group.scale.x;
      l.group.userData.baseScale = base;
      l.group.scale.setScalar(base * this.framing);
    }
    this.sun.setSize(this.sunSize * this.framing);
  }

  // Bascule de secteur. `instant` sert au démarrage d'une partie, où il n'y a rien
  // à fondre : le joueur n'a pas encore vu l'écran précédent.
  setBiome(biome, { instant = false } = {}) {
    if (this.biome?.id === biome.id && !instant) return;
    this.biome = biome;

    // Le fondu part de la cible actuelle, pas de l'état interpolé : sur deux
    // changements rapprochés, repartir de l'entre-deux ferait un aller-retour.
    copyPalette(this.from, this.to);
    this.to.bg.setHex(biome.bg);
    this.to.fog.setHex(biome.fog.color);
    this.to.hemiSky.setHex(biome.hemi.sky);
    this.to.hemiGround.setHex(biome.hemi.ground);
    this.to.rim.setHex(biome.rim);
    this.to.star.setHex(biome.star.color);
    this.to.density = biome.fog.density;
    this.to.intensity = biome.hemi.intensity;
    this.to.exposure = biome.exposure;
    this.starOpacity = biome.star.opacity;

    this._buildNebulas(biome.nebulas);
    this._buildLandmarks(biome.landmark);
    if (biome.sun != null) {
      this.sunSize = biome.sun;
      this.sun.setSize(biome.sun * this.framing);
    }

    if (instant) {
      copyPalette(this.from, this.to);
      this._applyPalette(1); // applique VRAIMENT : sans cet appel, la première vague
      this.fadeT = 1; // se jouerait avec le fond noir par défaut de la scène
      for (const n of this.nebulas) n.sprite.material.opacity = n.target;
    } else {
      this.fadeT = 0;
    }
  }

  // Interpole la palette entre l'ancien secteur et le nouveau, et la pose sur la
  // scène, les lampes et l'exposition — les quatre doivent bouger ENSEMBLE, sinon
  // le lieu ne change pas, seule sa couleur change.
  _applyPalette(k) {
    this._fadeK = k;
    const c = this._c;
    const d = this._durcir();
    this.scene.background.copy(c.copy(this.from.bg).lerp(this.to.bg, k));
    this.scene.fog.color.copy(c.copy(this.from.fog).lerp(this.to.fog, k));
    if (d.teinte > 0) {
      this.scene.background.lerp(TEINTE_FOND, d.teinte * 0.5);
      this.scene.fog.color.lerp(TEINTE_FOND, d.teinte * 0.7);
    }
    this.scene.fog.density = THREE.MathUtils.lerp(this.from.density, this.to.density, k) * d.fog;
    if (this.lights) {
      const L = this.lights;
      L.hemi.color.copy(c.copy(this.from.hemiSky).lerp(this.to.hemiSky, k));
      L.hemi.groundColor.copy(c.copy(this.from.hemiGround).lerp(this.to.hemiGround, k));
      L.hemi.intensity = THREE.MathUtils.lerp(this.from.intensity, this.to.intensity, k) * d.hemi;
      L.rimLight.color.copy(c.copy(this.from.rim).lerp(this.to.rim, k)).lerp(TEINTE_RIM, d.teinte);
      // Le contre-jour MONTE pendant que la lampe principale tombe : le boss et la
      // formation se détachent en silhouette au lieu de disparaître dans le noir.
      L.rimLight.intensity = this._rimBase * (1 + d.teinte * 0.8);
      if (L.keyLight) L.keyLight.intensity = this._keyBase * d.key;
      // La braise derrière l'arène. Elle ne s'allume que pour lui, et elle rentre
      // chez elle éteinte : la cinématique se sert de la même lampe.
      if (L.mawLight) {
        L.mawLight.color.copy(TEINTE_GUEULE);
        L.mawLight.intensity = d.gueule;
        if (d.gueule > 0) L.mawLight.position.copy(GUEULE_BOSS);
        else if (this._gueuleHome) L.mawLight.position.copy(this._gueuleHome);
      }
    }
    if (this.renderer) {
      this.renderer.toneMappingExposure =
        THREE.MathUtils.lerp(this.from.exposure, this.to.exposure, k) * d.expo;
    }
    for (const l of this.layers) {
      l.points.material.color.copy(c.copy(this.from.star).lerp(this.to.star, k));
    }
  }

  _buildNebulas(defs) {
    for (const n of this.nebulas) {
      this.scene.remove(n.sprite);
      n.sprite.material.map.dispose();
      n.sprite.material.dispose();
    }
    this.nebulas = [];
    for (const [color, pos, scale] of defs) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: nebulaTexture(color),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      sprite.position.set(...pos);
      sprite.scale.setScalar(scale);
      sprite.renderOrder = -20;
      this.scene.add(sprite);
      this.nebulas.push({ sprite, target: 0.55 });
    }
  }

  _buildLandmarks(specs) {
    for (const l of this.landmarks) {
      this.scene.remove(l.group);
      disposeLandmark(l);
    }
    this.landmarks = [];
    this.sunSize = this.sunSize ?? 26;
    for (const spec of specs || []) {
      const l = createLandmark(spec);
      l.group.traverse((o) => {
        o.frustumCulled = false;
        if (o.renderOrder === 0) o.renderOrder = -15;
        // Le brouillard NE S'APPLIQUE PAS aux décors lointains. Il existe pour
        // fondre les éléments de jeu à quelques dizaines d'unités ; appliqué à une
        // planète placée à quatre cents, il l'effaçait complètement — mesuré,
        // 99,94 % d'opacité de brouillard. Une planète n'est pas dans la brume :
        // elle est dans le vide, et le vide est parfaitement transparent.
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
          m.fog = false;
          // Le décor est ASSOMBRI d'un tiers. Règle non négociable du jeu : les
          // projectiles ennemis sont roses et vifs, et doivent le rester seuls.
          // Une planète qui remplit le fond à pleine luminosité les noie, et le
          // joueur perd la seule information dont il a vraiment besoin.
          if (m.color && !m.userData?.garderVif) m.color.multiplyScalar(0.66);
        }
      });
      this.scene.add(l.group);
      this.landmarks.push(l);
    }
    // Le cadrage se réapplique après chaque reconstruction, sinon un changement de
    // secteur ramènerait des décors calibrés pour le paysage.
    this._applyFraming();
  }

  // 0 = vol normal, 1 = passage en lumière. Les points s'effacent au profit des
  // segments, dont la longueur EST la vitesse ressentie.
  setWarp(amount) {
    this.warp = THREE.MathUtils.clamp(amount, 0, 1);
  }

  update(dt, speedScale = 1) {
    // Fondu de secteur.
    let repeindre = false;
    if (this.fadeT < 1) {
      this.fadeT = Math.min(1, this.fadeT + dt / FADE);
      const t = this.fadeT;
      this._fadeK = t * t * (3 - 2 * t); // lissage aux deux bouts
      repeindre = true;
    }
    // Bascule d'acte. Elle repeint la même palette avec d'autres facteurs, d'où le
    // fondu de secteur figé à sa valeur courante : les deux ne se marchent pas dessus.
    if (this.phaseT < 1) {
      this.phaseT = Math.min(1, this.phaseT + dt / PHASE_FADE);
      const t = this.phaseT;
      this.phase = THREE.MathUtils.lerp(this.phaseFrom, this.phaseTo, t * t * (3 - 2 * t));
      repeindre = true;
    }
    if (repeindre) this._applyPalette(this._fadeK);

    // Les nébuleuses montent en opacité à l'arrivée dans le secteur — et elles
    // enflent encore d'un acte à l'autre : le ciel se charge à mesure qu'il tombe.
    for (const n of this.nebulas) {
      const o = n.sprite.material;
      const cible = Math.min(1, n.target * this._dur.nebuleuse);
      o.opacity += (cible - o.opacity) * Math.min(1, dt * 1.6);
      o.color.setRGB(1, 1, 1).lerp(TEINTE_RIM, this._dur.teinte * 0.5);
    }

    this.sun.update(dt);
    for (const l of this.landmarks) l.update(dt);

    // Défilement. Pendant le saut, les étoiles filent bien plus vite : c'est la
    // seule chose qui donne une sensation de vitesse, le vaisseau étant immobile
    // à l'écran par construction.
    const boost = 1 + this.warp * this.warp * 26;
    for (const layer of this.layers) {
      const pos = layer.positions;
      const step = layer.speed * speedScale * boost * dt;
      for (let i = 2; i < pos.length; i += 3) {
        pos[i] += step;
        if (pos[i] > FIELD.zNear) pos[i] = FIELD.zFar + ((pos[i] - FIELD.zNear) % 150);
      }
      layer.geo.attributes.position.needsUpdate = true;

      const w = this.warp;
      // Les étoiles s'éteignent d'un acte à l'autre. C'est le plus discret des
      // signes et le plus efficace : le ciel se vide, on se retrouve seul avec lui.
      layer.points.material.opacity =
        this.starOpacity[layer.index] * this._dur.etoiles * (1 - w * 0.9);
      layer.streaks.visible = w > 0.02;
      if (!layer.streaks.visible) continue;

      // Un segment par étoile, orienté vers la caméra. La longueur suit le carré du
      // taux de saut pour que l'étirement se déclenche tard et vite.
      const len = 2 + w * w * 62;
      const line = layer.line;
      for (let n = 0, p = 0, q = 0; n < pos.length / 3; n++, p += 3, q += 6) {
        line[q] = pos[p];
        line[q + 1] = pos[p + 1];
        line[q + 2] = pos[p + 2];
        line[q + 3] = pos[p];
        line[q + 4] = pos[p + 1];
        line[q + 5] = pos[p + 2] - len;
      }
      layer.lgeo.attributes.position.needsUpdate = true;
      layer.streaks.material.opacity =
        Math.min(0.85, w * 1.3) * this.starOpacity[layer.index] * 1.6;
    }
  }
}
