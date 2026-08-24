// Pools de projectiles : traçantes joueur, tirs ennemis, missiles à tête chercheuse.
// Les meshes sont créés une fois puis recyclés (visible on/off), jamais alloués en jeu.

import * as THREE from 'three';
import { ARENA } from './constants.js';

// Halo doux réutilisé par les projectiles ennemis (lisibilité sur fond étoilé).
function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,61,240,0.55)');
  grad.addColorStop(1, 'rgba(255,61,240,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function outOfBounds(p) {
  return (
    p.z < ARENA.bulletCullZMin || p.z > ARENA.bulletCullZMax || Math.abs(p.x) > ARENA.bulletCullXMax
  );
}

class Pool {
  constructor(scene, size, makeMesh, radius) {
    this.radius = radius;
    this.entries = [];
    for (let i = 0; i < size; i++) {
      const mesh = makeMesh();
      mesh.visible = false;
      scene.add(mesh);
      this.entries.push({ mesh, active: false, vel: new THREE.Vector3(), age: 0 });
    }
  }

  spawn(pos, vel) {
    const entry = this.entries.find((e) => !e.active);
    if (!entry) return null;
    entry.active = true;
    entry.age = 0;
    entry.mesh.position.copy(pos);
    entry.vel.copy(vel);
    entry.mesh.visible = true;
    // Suivi du frôlement (balles ennemies) et de la perforation (balles joueur).
    entry.minDistSq = Infinity;
    entry.grazed = false;
    entry.pierce = 0;
    if (entry.hitIds) entry.hitIds.length = 0;
    else entry.hitIds = [];
    return entry;
  }

  kill(entry) {
    entry.active = false;
    entry.mesh.visible = false;
  }

  clear() {
    for (const e of this.entries) this.kill(e);
  }

  forEachActive(fn) {
    for (const e of this.entries) {
      if (e.active) fn(e);
    }
  }
}

export class PlayerBullets extends Pool {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(0.13, 0.13, 1.1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8ffbff, toneMapped: false });
    super(scene, 70, () => new THREE.Mesh(geo, mat), 0.35);
  }

  update(dt) {
    this.forEachActive((e) => {
      e.mesh.position.addScaledVector(e.vel, dt);
      if (outOfBounds(e.mesh.position)) this.kill(e);
    });
  }
}

export class EnemyBullets extends Pool {
  constructor(scene) {
    // Noyau blanc chaud + coque magenta + halo : impossible à confondre avec une étoile
    // (les étoiles sont petites, bleutées et lentes ; les tirs sont gros, roses et rapides).
    const coreGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff3fb, toneMapped: false });
    const shellGeo = new THREE.SphereGeometry(0.27, 10, 10);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0xff3df0,
      transparent: true,
      opacity: 0.75,
      toneMapped: false,
    });
    const glowTex = makeGlowTexture();
    const makeMesh = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(coreGeo, coreMat));
      g.add(new THREE.Mesh(shellGeo, shellMat));
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      halo.scale.setScalar(1.7);
      g.add(halo);
      return g;
    };
    super(scene, 90, makeMesh, 0.38);
  }

  // slow < 1 ralentit les balles ennemies (effet Overdrive).
  update(dt, slow = 1) {
    this.forEachActive((e) => {
      e.mesh.position.addScaledVector(e.vel, dt * slow);
      // Légère pulsation pour la lisibilité des tirs ennemis.
      const s = 1 + Math.sin(e.age * 20) * 0.15;
      e.age += dt;
      e.mesh.scale.setScalar(s);
      if (outOfBounds(e.mesh.position)) this.kill(e);
    });
  }
}

const MISSILE_SPEED = 24;
const MISSILE_TURN = 6; // vitesse de rotation du vecteur vitesse (rad/s équivalent)
const MISSILE_LIFETIME = 3.2;

export class Missiles extends Pool {
  constructor(scene, fx) {
    const makeMesh = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffc857, toneMapped: false })
      );
      // lookAt oriente le +Z local vers la cible : le nez du cône doit pointer +Z.
      body.rotation.x = Math.PI / 2;
      g.add(body);
      return g;
    };
    super(scene, 10, makeMesh, 0.5);
    this.fx = fx;
    this._tmp = new THREE.Vector3();
  }

  launch(pos, target) {
    const entry = this.spawn(
      pos,
      this._tmp.set((Math.random() - 0.5) * 6, 0, -MISSILE_SPEED * 0.5)
    );
    if (entry) entry.target = target;
    return entry;
  }

  update(dt) {
    this.forEachActive((e) => {
      e.age += dt;
      if (e.age > MISSILE_LIFETIME) {
        this.kill(e);
        return;
      }
      const target = e.target && e.target.alive ? e.target : null;
      if (target) {
        this._tmp
          .copy(target.group.position)
          .sub(e.mesh.position)
          .normalize()
          .multiplyScalar(MISSILE_SPEED);
        e.vel.lerp(this._tmp, Math.min(1, MISSILE_TURN * dt));
      }
      e.vel.setLength(MISSILE_SPEED);
      e.mesh.position.addScaledVector(e.vel, dt);
      e.mesh.lookAt(this._tmp.copy(e.mesh.position).add(e.vel));
      this.fx.trail(e.mesh.position, 0xffc857);
      if (outOfBounds(e.mesh.position)) this.kill(e);
    });
  }
}
