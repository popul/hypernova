// Vaisseau du joueur : déplacement latéral avec inertie et roulis, tir multi-canons,
// missiles auto-guidés, bouclier rechargeable, invulnérabilité post-respawn.

import * as THREE from 'three';
import { createPlayerShip, createShieldMesh, createGrazeAura } from './ships.js';
import { ARENA, PLAYER, OVERDRIVE } from './constants.js';

export class Player {
  constructor(scene) {
    this.group = createPlayerShip();
    this.group.position.set(0, 0, ARENA.playerZ);
    scene.add(this.group);

    this.shieldMesh = createShieldMesh();
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);

    // Aura de frôlement : matérialise la zone où une balle rapporte de l'énergie.
    // Sans elle, la mécanique centrale du jeu reste invisible.
    this.grazeAura = createGrazeAura();
    this.group.add(this.grazeAura);
    this.grazeFlash = 0;

    // Double pour le bouclage de l'arène (voir _updateGhost).
    this.ghost = createPlayerShip();
    this.ghost.traverse((o) => {
      if (o.name === 'hitcore' || o.name === 'hitring') o.visible = false;
    });
    this.ghost.visible = false;
    scene.add(this.ghost);

    this.exhausts = [];
    this.hitMarkers = [];
    this.group.traverse((o) => {
      if (o.name === 'exhaust') this.exhausts.push(o);
      if (o.name === 'hitcore' || o.name === 'hitring') this.hitMarkers.push(o);
    });

    this.vx = 0;
    this.fireCooldown = 0;
    this.missileTimer = 0;
    this.shieldUp = false;
    this.shieldRechargeTimer = 0;
    this.invulnTimer = 0;
    this.alive = true;
    this.time = 0;
    this._tmp = new THREE.Vector3();
  }

  get position() {
    return this.group.position;
  }

  // Le repère de collision n'a de sens qu'en jeu : en gros plan cinématique, il
  // flotterait à travers la coque.
  showHitMarkers(visible) {
    for (const m of this.hitMarkers) m.visible = visible;
  }

  // Double affiché de l'autre côté quand on approche d'un bord : sans lui, le
  // bouclage serait une téléportation incompréhensible.
  _updateGhost() {
    if (!ARENA.wrap || !this.ghost) return;
    const x = this.group.position.x;
    const span = ARENA.playerXMax * 2;
    const nearRight = ARENA.playerXMax - x < ARENA.wrapGhostZone;
    const nearLeft = x + ARENA.playerXMax < ARENA.wrapGhostZone;
    if (nearRight || nearLeft) {
      this.ghost.visible = this.group.visible;
      this.ghost.position.set(
        x + (nearRight ? -span : span),
        this.group.position.y,
        this.group.position.z
      );
      this.ghost.rotation.copy(this.group.rotation);
    } else {
      this.ghost.visible = false;
    }
  }

  // shieldRecharge : délai avant que le bouclier ne revienne. À 0 il réapparaîtrait
  // instantanément — c'est justement ce qu'on ne veut plus après une mort.
  reset({ keepUpgrades = true, shieldRecharge = 0 } = {}) {
    this.group.position.set(0, 0, ARENA.playerZ);
    this.vx = 0;
    this.alive = true;
    this.group.visible = true;
    this.invulnTimer = keepUpgrades ? PLAYER.respawnInvuln : PLAYER.respawnInvulnAfterDeath;
    this.fireCooldown = 0;
    this.missileTimer = 0;
    if (!keepUpgrades) {
      this.shieldUp = false;
      this.shieldRechargeTimer = shieldRecharge;
    }
    this.shieldMesh.visible = this.shieldUp;
  }

  update(dt, game) {
    if (!this.alive) return;
    this.time += dt;
    const { input, stats, bullets, missiles, enemies, audio, fx } = game;

    // Déplacement avec accélération/friction pour un feeling précis mais vivant.
    // Tactile : le vaisseau rejoint la position du doigt (vitesse plafonnée par les stats,
    // pour que l'amélioration Propulseurs garde son intérêt sur mobile).
    let targetVx;
    if (input.touchActive) {
      const targetX = this._touchWorldX(input.touchNdc, game.camera);
      targetVx = THREE.MathUtils.clamp(
        (targetX - this.group.position.x) * 8,
        -stats.speed,
        stats.speed
      );
    } else {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      targetVx = dir * stats.speed;
    }
    this.vx += (targetVx - this.vx) * Math.min(1, 14 * dt);
    let nx = this.group.position.x + this.vx * dt;
    if (ARENA.wrap) {
      const span = ARENA.playerXMax * 2;
      if (nx > ARENA.playerXMax) nx -= span;
      else if (nx < -ARENA.playerXMax) nx += span;
    } else {
      nx = THREE.MathUtils.clamp(nx, -ARENA.playerXMax, ARENA.playerXMax);
    }
    this.group.position.x = nx;
    this._updateGhost();
    // Roulis + léger lacet selon la vitesse.
    this.group.rotation.z = -this.vx * 0.035;
    this.group.rotation.y = -this.vx * 0.012;

    // Halo moteur qui pulse, plus fort en mouvement.
    const pulse = 1 + Math.sin(this.time * 30) * 0.25 + Math.abs(this.vx) * 0.02;
    for (const e of this.exhausts) e.scale.setScalar(pulse);

    // L'aura de frôlement respire doucement, et s'embrase quand une balle est frôlée.
    if (this.grazeFlash > 0) this.grazeFlash = Math.max(0, this.grazeFlash - dt * 2.6);
    const auraBase = 0.09 + Math.sin(this.time * 2.2) * 0.03;
    this.grazeAura.material.opacity = auraBase + this.grazeFlash * 0.75;
    this.grazeAura.scale.setScalar(1 + this.grazeFlash * 0.22);

    // Tir principal (accéléré pendant l'Overdrive).
    this.fireCooldown -= dt;
    if (input.fire && this.fireCooldown <= 0) {
      const rate = stats.fireRate * (game.odTimer > 0 ? OVERDRIVE.odFireMul : 1);
      this.fireCooldown = 1 / rate;
      this._shoot(stats, bullets, audio, fx);
    }

    // Missiles auto.
    if (stats.missileCount > 0) {
      this.missileTimer -= dt;
      if (this.missileTimer <= 0 && enemies.hasTargets()) {
        this.missileTimer = stats.missileInterval;
        const targets = enemies.pickTargets(stats.missileCount);
        for (const t of targets) {
          missiles.launch(this._tmp.copy(this.group.position).add({ x: 0, y: 0.2, z: -0.5 }), t);
        }
        audio.missile();
      }
    }

    // Recharge du bouclier.
    if (stats.shieldMax > 0 && !this.shieldUp) {
      this.shieldRechargeTimer -= dt;
      if (this.shieldRechargeTimer <= 0) {
        this.shieldUp = true;
        this.shieldMesh.visible = true;
        audio.shieldHit();
      }
    }
    if (this.shieldUp) {
      this.shieldMesh.material.opacity = 0.13 + Math.sin(this.time * 4) * 0.05;
    }

    // Clignotement d'invulnérabilité.
    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      this.group.visible = Math.sin(this.time * 30) > -0.4;
      if (this.invulnTimer <= 0) this.group.visible = true;
    }
  }

  // Projette la position du doigt (NDC) sur la ligne de déplacement du vaisseau (y=0, z=playerZ).
  _touchWorldX(ndc, camera) {
    this._tmp.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position);
    const t = (ARENA.playerZ - camera.position.z) / this._tmp.z;
    return camera.position.x + this._tmp.x * t;
  }

  _shoot(stats, bullets, audio, fx) {
    const p = this.group.position;
    const speed = PLAYER.bulletSpeed;
    const spawn = (dx, angle = 0) => {
      bullets.spawn(
        this._tmp.set(p.x + dx, 0, p.z - 1.2),
        new THREE.Vector3(Math.sin(angle) * speed, 0, -Math.cos(angle) * speed)
      );
    };
    if (stats.streams === 1) {
      spawn(0);
    } else if (stats.streams === 2) {
      spawn(-0.5);
      spawn(0.5);
    } else {
      spawn(0);
      spawn(-0.7, -0.05);
      spawn(0.7, 0.05);
    }
    audio.shoot();
    fx.burst(this._tmp.set(p.x, 0, p.z - 1.6), 0x8ffbff, {
      count: 2,
      speed: 3,
      life: 0.15,
      spread: 0.3,
    });
  }

  // Renvoie 'invuln' | 'shield' | 'hit' selon ce qui encaisse.
  takeHit(game) {
    if (this.invulnTimer > 0 || !this.alive) return 'invuln';
    if (this.shieldUp) {
      this.shieldUp = false;
      this.shieldMesh.visible = false;
      this.shieldRechargeTimer = game.stats.shieldRecharge;
      game.audio.shieldHit();
      game.fx.shockwave(this.group.position, 0x4ff2ff, 4);
      game.fx.addShake(0.3);
      return 'shield';
    }
    return 'hit';
  }

  die(game) {
    this.alive = false;
    this.group.visible = false;
    game.fx.explosionBig(this.group.position, 0x4ff2ff);
    game.audio.playerHit();
  }
}
