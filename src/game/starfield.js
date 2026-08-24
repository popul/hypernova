// Fond spatial : deux couches d'étoiles en parallaxe qui défilent vers la caméra,
// plus quelques nappes de nébuleuse en sprites additifs.

import * as THREE from 'three';

const FIELD = { xSpread: 90, yMin: -40, yMax: 10, zNear: 30, zFar: -120 };

function makeStarTexture() {
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

function makeNebulaTexture(colorInner, colorOuter) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, colorInner);
  grad.addColorStop(1, colorOuter);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Starfield {
  constructor(scene) {
    this.layers = [];
    const starTex = makeStarTexture();

    for (const [count, size, speed, opacity] of [
      [420, 0.55, 9, 0.9],
      [260, 1.0, 16, 0.65],
    ]) {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * FIELD.xSpread;
        positions[i * 3 + 1] = FIELD.yMin + Math.random() * (FIELD.yMax - FIELD.yMin);
        positions[i * 3 + 2] = FIELD.zFar + Math.random() * (FIELD.zNear - FIELD.zFar);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size,
        map: starTex,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xbfe8ff,
      });
      const points = new THREE.Points(geo, mat);
      points.renderOrder = -10;
      scene.add(points);
      this.layers.push({ points, speed, positions, geo });
    }

    // Nébuleuses lointaines, très discrètes.
    const nebulas = [
      {
        tex: makeNebulaTexture('rgba(80,40,160,0.5)', 'rgba(0,0,0,0)'),
        pos: [-35, -20, -90],
        scale: 90,
      },
      {
        tex: makeNebulaTexture('rgba(20,90,140,0.45)', 'rgba(0,0,0,0)'),
        pos: [40, -10, -100],
        scale: 110,
      },
      {
        tex: makeNebulaTexture('rgba(150,30,90,0.3)', 'rgba(0,0,0,0)'),
        pos: [0, -35, -80],
        scale: 70,
      },
    ];
    for (const n of nebulas) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: n.tex,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      sprite.position.set(...n.pos);
      sprite.scale.setScalar(n.scale);
      sprite.renderOrder = -20;
      scene.add(sprite);
    }
  }

  update(dt, speedScale = 1) {
    for (const layer of this.layers) {
      const pos = layer.positions;
      for (let i = 2; i < pos.length; i += 3) {
        pos[i] += layer.speed * speedScale * dt;
        if (pos[i] > FIELD.zNear) pos[i] = FIELD.zFar + (pos[i] - FIELD.zNear);
      }
      layer.geo.attributes.position.needsUpdate = true;
    }
  }
}
