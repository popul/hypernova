// Effets "juice" : particules poolées (un seul THREE.Points), ondes de choc,
// screenshake par trauma, hit-stop (ralenti bref). Aucune allocation en boucle chaude.

import * as THREE from 'three';
import { FX } from './constants.js';

const MAX_PARTICLES = 1400;
const HIDDEN_Y = -1000;

function makeDotTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export class Fx {
  constructor(scene) {
    this.scene = scene;

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.baseColor = new Float32Array(MAX_PARTICLES * 3);
    this.cursor = 0;

    for (let i = 0; i < MAX_PARTICLES; i++) this.positions[i * 3 + 1] = HIDDEN_Y;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      map: makeDotTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Ondes de choc (anneaux) poolées.
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.05, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      this.rings.push({ mesh: ring, life: 0, maxLife: 0.5 });
    }

    this.trauma = 0;
    this.shakeOffset = new THREE.Vector3();
    this.hitStopTimer = 0;
    this._tmpColor = new THREE.Color();
  }

  burst(pos, colorHex, { count = 18, speed = 9, life = 0.6, spread = 1 } = {}) {
    this._tmpColor.set(colorHex);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const i3 = i * 3;
      this.positions[i3] = pos.x + (Math.random() - 0.5) * spread;
      this.positions[i3 + 1] = pos.y + (Math.random() - 0.5) * spread;
      this.positions[i3 + 2] = pos.z + (Math.random() - 0.5) * spread;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.35 + Math.random() * 0.65);
      this.velocities[i3] = Math.sin(phi) * Math.cos(theta) * v;
      this.velocities[i3 + 1] = Math.cos(phi) * v * 0.6;
      this.velocities[i3 + 2] = Math.sin(phi) * Math.sin(theta) * v;
      const l = life * (0.6 + Math.random() * 0.8);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.baseColor[i3] = this._tmpColor.r;
      this.baseColor[i3 + 1] = this._tmpColor.g;
      this.baseColor[i3 + 2] = this._tmpColor.b;
    }
  }

  // opts.faceCamera : oriente l'anneau face à l'objectif. Sans ça, un anneau posé
  // à plat est vu par la tranche dans les plans horizontaux et se réduit à un trait.
  // Opt-in délibéré : le jeu garde ses anneaux à plat (bombe, Overdrive).
  shockwave(pos, colorHex, maxScale = 5, opts = null) {
    const slot = this.rings.find((r) => r.life <= 0);
    if (!slot) return;
    slot.mesh.material.color.set(colorHex);
    slot.mesh.position.copy(pos);
    if (opts?.faceCamera && opts.camera) {
      slot.mesh.quaternion.copy(opts.camera.quaternion);
    } else {
      slot.mesh.rotation.set(-Math.PI / 2, 0, 0);
    }
    slot.mesh.visible = true;
    slot.life = slot.maxLife;
    slot.maxScale = maxScale;
  }

  explosionSmall(pos, colorHex) {
    this.burst(pos, colorHex, { count: 16, speed: 8, life: 0.55 });
    this.burst(pos, 0xffffff, { count: 6, speed: 4, life: 0.3 });
    this.addShake(0.22);
  }

  explosionBig(pos, colorHex) {
    this.burst(pos, colorHex, { count: 42, speed: 13, life: 0.9 });
    this.burst(pos, 0xffe6a0, { count: 20, speed: 6, life: 0.7 });
    this.shockwave(pos, colorHex, 7);
    this.addShake(0.55);
    this.hitStop();
  }

  trail(pos, colorHex) {
    this.burst(pos, colorHex, { count: 1, speed: 0.6, life: 0.35, spread: 0.15 });
  }

  addShake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  hitStop(duration = FX.hitStopDuration) {
    this.hitStopTimer = Math.max(this.hitStopTimer, duration);
  }

  // Avance les effets avec le dt réel et renvoie le dt gameplay (ralenti si hit-stop).
  tick(realDt) {
    // Particules.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= realDt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = HIDDEN_Y;
        this.colors[i3] = this.colors[i3 + 1] = this.colors[i3 + 2] = 0;
        continue;
      }
      this.positions[i3] += this.velocities[i3] * realDt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * realDt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * realDt;
      this.velocities[i3] *= 0.98;
      this.velocities[i3 + 1] *= 0.98;
      this.velocities[i3 + 2] *= 0.98;
      const fade = this.life[i] / this.maxLife[i];
      this.colors[i3] = this.baseColor[i3] * fade;
      this.colors[i3 + 1] = this.baseColor[i3 + 1] * fade;
      this.colors[i3 + 2] = this.baseColor[i3 + 2] * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    // Anneaux.
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= realDt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(0.5 + t * r.maxScale);
      r.mesh.material.opacity = (1 - t) * 0.8;
    }

    // Screenshake.
    this.trauma = Math.max(0, this.trauma - FX.shakeDecay * realDt * this.trauma - 0.02 * realDt);
    const s = this.trauma * this.trauma;
    this.shakeOffset.set(
      (Math.random() - 0.5) * 2 * s * 1.4,
      (Math.random() - 0.5) * 2 * s * 1.0,
      (Math.random() - 0.5) * 2 * s * 0.8
    );

    // Hit-stop.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= realDt;
      return realDt * FX.hitStopScale;
    }
    return realDt;
  }
}
