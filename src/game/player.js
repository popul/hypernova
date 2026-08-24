// Vaisseau du joueur : déplacement latéral avec inertie et roulis, tir multi-canons,
// missiles auto-guidés, bouclier rechargeable, invulnérabilité post-respawn.

import * as THREE from 'three';
import { createPlayerShip, createShieldMesh } from './ships.js';
import { ARENA, PLAYER, OVERDRIVE } from './constants.js';

export class Player {
  constructor(scene) {
    this.group = createPlayerShip();
    this.group.position.set(0, 0, ARENA.playerZ);
    scene.add(this.group);

    this.shieldMesh = createShieldMesh();
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);

    this.exhausts = [];
    this.group.traverse((o) => {
      if (o.name === 'exhaust') this.exhausts.push(o);
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

  reset({ keepUpgrades = true } = {}) {
    this.group.position.set(0, 0, ARENA.playerZ);
    this.vx = 0;
    this.alive = true;
    this.group.visible = true;
    this.invulnTimer = PLAYER.respawnInvuln;
    this.fireCooldown = 0;
    this.missileTimer = 0;
    if (!keepUpgrades) {
      this.shieldUp = false;
      this.shieldRechargeTimer = 0;
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
    this.group.position.x = THREE.MathUtils.clamp(
      this.group.position.x + this.vx * dt,
      -ARENA.playerXMax,
      ARENA.playerXMax
    );
    // Roulis + léger lacet selon la vitesse.
    this.group.rotation.z = -this.vx * 0.035;
    this.group.rotation.y = -this.vx * 0.012;

    // Halo moteur qui pulse, plus fort en mouvement.
    const pulse = 1 + Math.sin(this.time * 30) * 0.25 + Math.abs(this.vx) * 0.02;
    for (const e of this.exhausts) e.scale.setScalar(pulse);

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
