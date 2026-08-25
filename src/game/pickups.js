// Crédits droppés par les ennemis : gemmes dorées attirées par l'aimant du vaisseau.

import * as THREE from 'three';
import { createGem } from './ships.js';
import { PICKUPS, ARENA } from './constants.js';

const POOL_SIZE = 60;

export class Pickups {
  constructor(scene) {
    this.entries = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = createGem();
      mesh.visible = false;
      scene.add(mesh);
      this.entries.push({ mesh, active: false, vel: new THREE.Vector3(), age: 0, value: 0 });
    }
    this._tmp = new THREE.Vector3();
  }

  dropFrom(pos, totalValue, count) {
    // Valeur fractionnaire : l'arrondi n'a lieu qu'à l'encaissement, sinon il rendait
    // au joueur une partie du rabais (voire davantage sur les gros drops).
    const value = totalValue / count;
    for (let n = 0; n < count; n++) {
      const entry = this.entries.find((e) => !e.active);
      if (!entry) return;
      entry.active = true;
      entry.age = 0;
      entry.value = value;
      entry.mesh.visible = true;
      entry.called = false;
      entry.mesh.position.copy(pos);
      entry.vel.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 2, 2 + Math.random() * 5);
    }
  }

  // vacuum=true : tout aspirer vers le joueur (fin de vague).
  update(dt, playerPos, magnetRadius, onCollect, vacuum = false) {
    for (const e of this.entries) {
      if (!e.active) continue;
      e.age += dt;
      if (e.age > PICKUPS.lifetime) {
        e.active = false;
        e.mesh.visible = false;
        continue;
      }
      // Une gemme passée SOUS le joueur est perdue : elle sort du champ. On la
      // retire tout de suite plutôt que de la laisser clignoter hors écran.
      if (e.mesh.position.z > ARENA.playerZMax + 4) {
        e.active = false;
        e.mesh.visible = false;
        continue;
      }
      const dist = this._tmp.copy(playerPos).sub(e.mesh.position).length();
      // Une gemme APPELÉE rentre, quoi qu'il arrive et d'où qu'elle soit : c'est
      // toute la différence avec l'aimant, qui ne fait qu'élargir une zone.
      if (e.called) {
        this._tmp.normalize();
        e.vel.lerp(this._tmp.multiplyScalar(PICKUPS.callPull), Math.min(1, 9 * dt));
      } else if (vacuum || dist < magnetRadius) {
        this._tmp.normalize();
        const pull = vacuum ? PICKUPS.magnetPull * 1.6 : PICKUPS.magnetPull;
        e.vel.lerp(this._tmp.multiplyScalar(pull), Math.min(1, 8 * dt));
      } else {
        // Chute vers le joueur : la friction freine l'impulsion latérale de
        // l'explosion, mais l'accélération en z tient bon et donne une vitesse
        // limite d'environ 4,5 u/s. C'est ce qui fait que les gemmes ARRIVENT.
        e.vel.x *= 1 - 2.6 * dt;
        e.vel.y *= 1 - 2.6 * dt;
        e.vel.z += (PICKUPS.fallAccel - e.vel.z * 2.2) * dt;
      }
      e.mesh.position.addScaledVector(e.vel, dt);
      e.mesh.rotation.y += 4 * dt;
      // Clignote quand la gemme va expirer.
      const remaining = PICKUPS.lifetime - e.age;
      e.mesh.visible = remaining > 2.5 || Math.sin(e.age * 18) > -0.2;

      if (dist < PICKUPS.collectRadius) {
        e.active = false;
        e.mesh.visible = false;
        onCollect(e.value, e.mesh.position);
      }
    }
  }

  // L'onde de l'Appel. Elle balaie l'écran depuis le vaisseau et marque tout ce
  // qu'elle rencontre : les gemmes touchées rentrent, les autres continuent de
  // tomber. On renvoie combien on en a attrapé, pour que le jeu puisse le dire.
  call(origin, radius) {
    let pris = 0;
    for (const e of this.entries) {
      if (!e.active || e.called) continue;
      if (this._tmp.copy(origin).sub(e.mesh.position).length() > radius) continue;
      e.called = true;
      pris++;
    }
    return pris;
  }

  activeCount() {
    let n = 0;
    for (const e of this.entries) if (e.active) n++;
    return n;
  }

  clear() {
    for (const e of this.entries) {
      e.active = false;
      e.mesh.visible = false;
    }
  }
}
