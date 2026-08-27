// Crédits droppés par les ennemis : gemmes dorées attirées par l'aimant du vaisseau.

import * as THREE from 'three';
import { createGem } from './ships.js';
// En namespace : la carène des modules vit dans ships.js, et son absence ne doit
// pas empêcher le jeu de démarrer.
import * as Ships from './ships.js';
import { PICKUPS, ARENA } from './constants.js';
import { entre, ecart } from '../core/rng.js';

const POOL_SIZE = 60;

export class Pickups {
  constructor(scene) {
    this.entries = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = createGem();
      mesh.visible = false;
      scene.add(mesh);
      this.entries.push({
        mesh,
        active: false,
        vel: new THREE.Vector3(),
        age: 0,
        value: 0,
        big: false,
      });
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
      entry.big = false;
      entry.mesh.scale.set(1, 1.5, 1);
      entry.mesh.visible = true;
      entry.called = false;
      entry.mesh.position.copy(pos);
      entry.vel.set(ecart(4), ecart(1), entre(2, 7));
    }
  }

  // La grosse pièce des enchaînements. Elle part moins vite sur les côtés que les
  // gemmes ordinaires : on doit avoir le temps de la voir et d'aller la chercher,
  // sinon la récompense se remarque encore moins que celle qu'elle remplace.
  dropBig(pos) {
    const entry = this.entries.find((e) => !e.active);
    if (!entry) return false;
    entry.active = true;
    entry.age = 0;
    entry.value = PICKUPS.bigValue;
    entry.big = true;
    entry.mesh.scale.set(PICKUPS.bigScale, PICKUPS.bigScale * 1.5, PICKUPS.bigScale);
    entry.mesh.visible = true;
    entry.called = false;
    entry.mesh.position.copy(pos);
    entry.vel.set(ecart(1.5), 0, entre(1.5, 3.5));
    return true;
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
      // La grosse pièce tourne plus lentement : une masse se lit à son inertie.
      // UNE PIÈCE TOURNE AUTOUR DE SON DIAMÈTRE, pas sur elle-même. C'est ce qui
      // la fait miroiter — face, tranche, face — et c'est à ce miroitement qu'on
      // la reconnaît de loin, bien avant d'en distinguer la forme. Une rotation
      // sur l'axe Y la ferait pivoter à plat comme une assiette.
      e.mesh.rotation.x += (e.big ? 2.4 : 4.2) * dt;
      // Un léger roulis en plus : deux axes qui tournent à des vitesses
      // différentes empêchent l'œil de voir un cycle, et la pièce paraît culbuter
      // au lieu de tourner en machine.
      e.mesh.rotation.z += (e.big ? 0.9 : 1.4) * dt;
      // Clignote quand la gemme va expirer.
      const remaining = PICKUPS.lifetime - e.age;
      e.mesh.visible = remaining > 2.5 || Math.sin(e.age * 18) > -0.2;

      if (dist < PICKUPS.collectRadius) {
        e.active = false;
        e.mesh.visible = false;
        onCollect(e.value, e.mesh.position, e.big);
      }
    }
  }

  // Instantané des gemmes en vol. Une vague peut commencer alors que l'argent de la
  // précédente tombe encore : sans ces quelques lignes, un replay repartirait d'un
  // ciel vide là où le joueur avait de la monnaie en approche.
  instantane() {
    const out = [];
    for (const e of this.entries) {
      if (!e.active) continue;
      out.push([
        e.mesh.position.x,
        e.mesh.position.y,
        e.mesh.position.z,
        e.vel.x,
        e.vel.y,
        e.vel.z,
        e.value,
        e.age,
        e.big ? 1 : 0,
        e.called ? 1 : 0,
      ]);
    }
    return out;
  }

  restaure(liste) {
    this.clear();
    if (!liste) return;
    for (const g of liste) {
      const entry = this.entries.find((e) => !e.active);
      if (!entry) return;
      entry.active = true;
      entry.mesh.position.set(g[0], g[1], g[2]);
      entry.vel.set(g[3], g[4], g[5]);
      entry.value = g[6];
      entry.age = g[7];
      entry.big = !!g[8];
      entry.called = !!g[9];
      const k = entry.big ? PICKUPS.bigScale : 1;
      entry.mesh.scale.set(k, k * 1.5, k);
      entry.mesh.visible = true;
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

  forEachActive(fn) {
    for (const e of this.entries) if (e.active) fn(e);
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

// LES MODULES DU MODE SURVIE.
//
// Un pool à part, et non un drapeau sur les gemmes : une gemme et un module n'ont
// ni la même durée de vie, ni la même valeur, ni la même façon de tomber. Les
// mélanger aurait obligé chaque ligne du code de collecte à demander « lequel des
// deux es-tu ? » — et c'est précisément le genre de question qu'on finit par
// oublier de poser quelque part.
export class Modules {
  constructor(scene) {
    this.scene = scene;
    this.entries = [];
    this._tmp = new THREE.Vector3();
  }

  // Les meshes sont créés à la demande et gardés : huit identifiants possibles, et
  // rarement plus de deux ou trois en vol à la fois.
  _libre(id) {
    let e = this.entries.find((x) => !x.active && x.id === id);
    if (e) return e;
    const mesh = Ships.createModule ? Ships.createModule(id) : createGem();
    mesh.visible = false;
    this.scene.add(mesh);
    e = { id, mesh, active: false, vel: new THREE.Vector3(), age: 0, called: false };
    this.entries.push(e);
    return e;
  }

  lache(pos, id) {
    const e = this._libre(id);
    e.active = true;
    e.age = 0;
    e.called = false;
    e.mesh.visible = true;
    e.mesh.position.copy(pos);
    // Il monte un peu avant de redescendre : une trouvaille doit se REMARQUER, et
    // rien n'attire l'œil comme un objet qui ne fait pas ce que font les autres.
    //
    // `ecart` et non Math.random : la trajectoire d'un module change ce que le
    // joueur ramasse, donc l'issue de la partie. Tout ce qui décide passe par le
    // générateur semé, sans quoi le replay dérive — mesuré : quatre points de
    // contrôle en désaccord sur une partie de quarante-cinq secondes.
    e.vel.set(ecart(1), 0, -3.5);
    return true;
  }

  update(dt, playerPos, magnetRadius, onCollect, vacuum = false) {
    for (const e of this.entries) {
      if (!e.active) continue;
      e.age += dt;
      // Plus patient qu'une gemme : on renonce rarement à un module, il faut donc
      // avoir le temps d'aller le chercher.
      if (e.age > PICKUPS.lifetime * 1.6 || e.mesh.position.z > ARENA.playerZMax + 5) {
        e.active = false;
        e.mesh.visible = false;
        continue;
      }
      const dist = this._tmp.copy(playerPos).sub(e.mesh.position).length();
      if (e.called) {
        this._tmp.normalize();
        e.vel.lerp(this._tmp.multiplyScalar(PICKUPS.callPull), Math.min(1, 9 * dt));
      } else if (vacuum || dist < magnetRadius * 1.35) {
        // Rayon d'attraction plus large que pour l'argent : rater un module par
        // deux dixièmes d'unité serait une frustration, pas une difficulté.
        this._tmp.normalize();
        e.vel.lerp(this._tmp.multiplyScalar(PICKUPS.magnetPull), Math.min(1, 8 * dt));
      } else {
        e.vel.x *= 1 - 1.6 * dt;
        e.vel.z += (PICKUPS.fallAccel * 0.62 - e.vel.z * 2.2) * dt;
      }
      e.mesh.position.addScaledVector(e.vel, dt);
      e.mesh.rotation.y += 2.2 * dt;
      e.mesh.rotation.z = Math.sin(e.age * 3) * 0.25;
      const reste = PICKUPS.lifetime * 1.6 - e.age;
      e.mesh.visible = reste > 3 || Math.sin(e.age * 16) > -0.3;
      if (dist < PICKUPS.collectRadius * 1.5) {
        e.active = false;
        e.mesh.visible = false;
        onCollect(e.id, e.mesh.position);
      }
    }
  }

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

  forEachActive(fn) {
    for (const e of this.entries) if (e.active) fn(e);
  }

  clear() {
    for (const e of this.entries) {
      e.active = false;
      e.mesh.visible = false;
    }
  }
}
