// Vaisseau du joueur : déplacement latéral avec inertie et roulis, tir multi-canons,
// missiles auto-guidés, bouclier rechargeable, invulnérabilité post-respawn.

import * as THREE from 'three';
import { createPlayerShip, createShieldMesh, createGrazeAura } from './ships.js';
import { makeWrapPlanes, aimPlane } from './arena.js';
import { ARENA, PLAYER, OVERDRIVE, ROLL } from './constants.js';

// Demi-envergure de la coque (bouts d'ailes compris, échelle de carène appliquée).
// C'est la distance à partir de laquelle la coque mord sur le bord et doit être
// tranchée. La chiffrer ici plutôt que de la deviner évite le défaut classique :
// une couture qui s'ouvre trop tôt (deux morceaux flottants) ou trop tard (un saut).
const HALF_WIDTH = 1.85 * 0.78 + 0.1;

export class Player {
  constructor(scene, fiche = {}) {
    this.scene = scene;
    this.fiche = fiche;
    this.group = createPlayerShip(fiche);
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

    // Le prolongement de la coque de l'autre côté de la couture. Ce n'est PAS un
    // second vaisseau : les deux morceaux sont découpés par des demi-plans
    // complémentaires, donc à tout instant on voit exactement une coque, coupée.
    this.seam = createPlayerShip(fiche);
    this.seam.traverse((o) => {
      if (o.name === 'hitcore' || o.name === 'hitring') o.visible = false;
    });
    this.seam.visible = false;
    scene.add(this.seam);

    // Les plans sont posés dès la construction, donc compilés avec le reste : plus
    // aucune recompilation en cours de partie.
    this.planes = makeWrapPlanes();
    this._collectParts();

    this.vx = 0;
    this.vz = 0;
    // Pirouette : sens (-1/+1), temps restant, et délai avant la suivante.
    this.roll = 0;
    this.rollDir = 0;
    this.rollCooldown = 0;
    this.fireCooldown = 0;
    this.missileTimer = 0;
    this.shieldUp = false;
    this.shieldRechargeTimer = 0;
    this.invulnTimer = 0;
    this.alive = true;
    this.time = 0;
    this._tmp = new THREE.Vector3();
    this._aim = new THREE.Vector3();
  }

  get position() {
    return this.group.position;
  }

  // Reconstruit la coque à partir d'une nouvelle fiche : livrée, carène, palier,
  // modules achetés. Appelé après chaque achat et à chaque palier gagné — c'est
  // tout l'intérêt, un module qu'on ne voit pas apparaître n'a pas été acheté,
  // il a été coché.
  //
  // On conserve la position et l'orientation : la reconstruction doit être
  // invisible autrement que par la silhouette qui change.
  rebuild(fiche) {
    this.fiche = { ...this.fiche, ...fiche };
    const pos = this.group.position.clone();
    const rot = this.group.rotation.clone();
    const visible = this.group.visible;

    for (const vieux of [this.group, this.seam]) {
      this.scene.remove(vieux);
      vieux.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) m.dispose();
      });
    }

    this.group = createPlayerShip(this.fiche);
    this.group.position.copy(pos);
    this.group.rotation.copy(rot);
    this.group.visible = visible;
    this.scene.add(this.group);

    this.seam = createPlayerShip(this.fiche);
    this.seam.traverse((o) => {
      if (o.name === 'hitcore' || o.name === 'hitring') o.visible = false;
    });
    this.seam.visible = false;
    this.scene.add(this.seam);

    this.group.add(this.shieldMesh);
    this.group.add(this.grazeAura);
    this._collectParts();
  }

  // Recense les pièces animées et les matières à découper. Rappelé après chaque
  // reconstruction, sinon les tuyères cessent de pulser et la couture cesse de
  // trancher — deux pannes silencieuses.
  _collectParts() {
    this.exhausts = [];
    this.hitMarkers = [];
    this.group.traverse((o) => {
      if (o.name === 'exhaust') this.exhausts.push(o);
      if (o.name === 'hitcore' || o.name === 'hitring') this.hitMarkers.push(o);
    });
    const attach = (root, plane) =>
      root.traverse((o) => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.clippingPlanes = [plane];
        }
      });
    attach(this.group, this.planes.hull);
    attach(this.seam, this.planes.seam);
  }

  // Le repère de collision n'a de sens qu'en jeu : en gros plan cinématique, il
  // flotterait à travers la coque.
  showHitMarkers(visible) {
    for (const m of this.hitMarkers) m.visible = visible;
  }

  // La couture. Tant que la coque tient entière dans l'arène, rien n'est découpé et
  // rien n'est dupliqué. Dès qu'elle mord sur un bord, on tranche : le morceau resté
  // à l'intérieur est dessiné ici, le morceau qui dépasse est dessiné à l'autre bord.
  // C'est un seul objet qui traverse une frontière, pas deux objets côte à côte.
  _updateSeam() {
    if (!ARENA.wrap || !this.seam) return;
    const x = this.group.position.x;
    const span = ARENA.playerXMax * 2;
    const overRight = ARENA.playerXMax - x < HALF_WIDTH;
    const overLeft = x + ARENA.playerXMax < HALF_WIDTH;

    if (!overRight && !overLeft) {
      aimPlane(this.planes.hull, 0);
      aimPlane(this.planes.seam, 0);
      this.seam.visible = false;
      return;
    }

    // La coque garde le côté où elle est ; son prolongement garde l'autre.
    const side = overRight ? 1 : -1;
    aimPlane(this.planes.hull, side);
    aimPlane(this.planes.seam, -side);

    this.seam.visible = this.group.visible;
    this.seam.position.set(
      x + (overRight ? -span : span),
      this.group.position.y,
      this.group.position.z
    );
    this.seam.rotation.copy(this.group.rotation);
    this.seam.scale.copy(this.group.scale);
  }

  // Vrai tant que le tonneau protège. Lu par les collisions de projectiles, et
  // PAS par celles d'ennemis : se jeter dans un vaisseau doit rester mortel,
  // sinon la pirouette devient une touche « annuler le danger ».
  get rolling() {
    return this.roll > 0;
  }

  // Déclenche le tonneau. Renvoie false si l'on n'est pas en mesure de le faire —
  // c'est l'appelant qui décide alors de refuser bruyamment ou de se taire.
  startRoll(dir) {
    if (this.roll > 0 || this.rollCooldown > 0 || !this.alive) return false;
    this.roll = ROLL.duration;
    this.rollDir = dir;
    this.rollCooldown = ROLL.duration + ROLL.cooldown;
    return true;
  }

  // shieldRecharge : délai avant que le bouclier ne revienne. À 0 il réapparaîtrait
  // instantanément — c'est justement ce qu'on ne veut plus après une mort.
  reset({ keepUpgrades = true, shieldRecharge = 0 } = {}) {
    this.group.position.set(0, 0, ARENA.playerZ);
    this.vx = 0;
    this.vz = 0;
    this.roll = 0;
    this.rollCooldown = 0;
    this.group.rotation.z = 0;
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

  // L'état complet du vaisseau, pour qu'une vague puisse repartir d'ici. Position et
  // vitesse ne suffisent pas : un tir en recharge, une invulnérabilité qui court ou
  // un tonneau en cours changent la suite de la partie.
  instantane() {
    return [
      this.group.position.x,
      this.group.position.z,
      this.vx,
      this.vz,
      this.fireCooldown,
      this.missileTimer,
      this.invulnTimer,
      this.shieldUp ? 1 : 0,
      this.shieldRechargeTimer,
      this.roll,
      this.rollDir,
      this.rollCooldown,
      this.time,
      this.alive ? 1 : 0,
    ];
  }

  restaure(e) {
    if (!e) return;
    this.group.position.x = e[0];
    this.group.position.z = e[1];
    this.vx = e[2];
    this.vz = e[3];
    this.fireCooldown = e[4];
    this.missileTimer = e[5];
    this.invulnTimer = e[6];
    this.shieldUp = !!e[7];
    this.shieldRechargeTimer = e[8];
    this.roll = e[9];
    this.rollDir = e[10];
    this.rollCooldown = e[11];
    this.time = e[12];
    this.alive = !!e[13];
    this.group.visible = this.alive;
    this.shieldMesh.visible = this.shieldUp;
    this.group.rotation.set(0, 0, 0);
    this._updateSeam();
  }

  // `bord` est le POSTE DE PILOTAGE : la commande du joueur, ses statistiques, sa
  // coque, sa furie. En solo c'est le jeu lui-même, et rien ne change. À deux, le
  // second vaisseau reçoit son propre poste — sans quoi il volerait avec les
  // commandes du premier, ce qui est exactement le bogue qu'on veut rendre
  // impossible à écrire.
  update(dt, game, bord = game) {
    if (!this.alive) return;
    this.time += dt;
    const { bullets, missiles, enemies, audio, fx } = game;
    // Les statistiques sont celles du POSTE : deux joueurs n'ont pas les mêmes
    // améliorations. Tout le reste — projectiles, ennemis, son, effets — est
    // partagé, puisqu'il n'y a qu'une arène.
    const { stats } = bord;

    // Pendant le ralenti d'esquive, le MONDE ralentit et le vaisseau non : son
    // déplacement est intégré avec le temps réel, pas avec le temps de jeu.
    //
    // Plafonner sa vitesse de pointe ne suffisait pas — mesuré : l'approche la plus
    // courte d'un tir mortel passait seulement de 0,38 à 0,83, sous le rayon de
    // collision. Parce que le facteur limitant n'est pas la vitesse, c'est
    // l'INERTIE : le vaisseau mettait toujours le même temps de jeu à s'inverser,
    // donc exactement le même temps relatif à la balle. En intégrant tout son
    // mouvement en temps réel, il réagit comme d'habitude pendant que la balle rampe.
    //
    // Seul le déplacement en profite : cadence de tir, bouclier et invulnérabilité
    // restent en temps de jeu. Le Réflexe sauve une vie, il ne fait pas de dégâts.
    const pdt = game.timeScale ? dt / game.timeScale : dt;
    const maxSpeed = stats.speed;

    // Déplacement avec accélération/friction pour un feeling précis mais vivant.
    // Tactile : le vaisseau rejoint la position du doigt (vitesse plafonnée par les stats,
    // pour que l'amélioration Propulseurs garde son intérêt sur mobile).
    // Le vaisseau ne lit plus les entrées : il lit une COMMANDE, déjà exprimée dans
    // le monde et arrondie. C'est ce qui permet de rejouer une partie — et ce qui
    // fait qu'une partie jouée au doigt sur un téléphone se rejoue à l'identique
    // sur un écran large, où les mêmes pixels désigneraient un autre point.
    const cmd = bord.cmd;
    let targetVx;
    let targetVz;
    if (cmd.vise) {
      targetVx = THREE.MathUtils.clamp((cmd.ax - this.group.position.x) * 8, -maxSpeed, maxSpeed);
      // Le doigt pilote aussi la profondeur : le geste est une position dans le
      // plan, pas une abscisse. Un pouce qui glisse vers le haut avance.
      const zSpeed = maxSpeed * ARENA.playerZSpeedMul;
      targetVz = THREE.MathUtils.clamp((cmd.az - this.group.position.z) * 8, -zSpeed, zSpeed);
    } else {
      targetVx = cmd.dx * maxSpeed;
      targetVz = cmd.dz * maxSpeed * ARENA.playerZSpeedMul;
    }
    // La pirouette prend la main sur le pilotage : on est engagé, on ne corrige
    // plus. C'est ce qui en fait une décision et non un bouton d'invulnérabilité.
    if (this.rollCooldown > 0) this.rollCooldown -= dt;
    if (this.roll > 0) {
      this.roll -= dt;
      const k = 1 - Math.max(0, this.roll) / ROLL.duration;
      // Signe NÉGATIF, comme le roulis normal juste en dessous : partir à droite
      // fait plonger l'aile droite. Avec le signe opposé, le vaisseau tournait
      // dans le sens contraire de sa trajectoire — un tonneau qui contredit le
      // déplacement se lit comme une erreur, pas comme une figure.
      this.group.rotation.z = -this.rollDir * k * Math.PI * 2;
      targetVx = this.rollDir * ROLL.push;
      targetVz = 0;
      if (this.roll <= 0) this.group.rotation.z = 0;
    }

    this.vx += (targetVx - this.vx) * Math.min(1, 14 * pdt);
    this.vz += (targetVz - this.vz) * Math.min(1, 11 * pdt);

    let nx = this.group.position.x + this.vx * pdt;
    if (ARENA.wrap) {
      const span = ARENA.playerXMax * 2;
      if (nx > ARENA.playerXMax) {
        nx -= span;
        game.arenaEdges?.ping(1);
      } else if (nx < -ARENA.playerXMax) {
        nx += span;
        game.arenaEdges?.ping(-1);
      }
    } else {
      nx = THREE.MathUtils.clamp(nx, -ARENA.playerXMax, ARENA.playerXMax);
    }
    this.group.position.x = nx;
    // La profondeur, elle, est BORNÉE : boucler en z n'aurait aucun sens (on
    // ressortirait dans la formation ennemie) et un mur y est parfaitement lisible,
    // puisque le haut et le bas de l'écran sont visibles.
    this.group.position.z = THREE.MathUtils.clamp(
      this.group.position.z + this.vz * pdt,
      ARENA.playerZMin,
      ARENA.playerZMax
    );
    this._updateSeam();

    // Roulis + léger lacet selon la vitesse, et tangage selon l'avance : le nez
    // pique en avançant, se relève en reculant. C'est ce qui rend l'axe lisible.
    if (this.roll <= 0) this.group.rotation.z = -this.vx * 0.035;
    this.group.rotation.y = -this.vx * 0.012;
    this.group.rotation.x = this.vz * 0.03;

    // Halo moteur qui pulse, plus fort en mouvement — et franchement plus fort en
    // accélération : la poussée doit se voir.
    const thrust = Math.max(0, -this.vz) * 0.06;
    const pulse = 1 + Math.sin(this.time * 30) * 0.25 + Math.abs(this.vx) * 0.02 + thrust;
    for (const e of this.exhausts) e.scale.setScalar(pulse);

    // L'aura de frôlement respire doucement, et s'embrase quand une balle est frôlée.
    if (this.grazeFlash > 0) this.grazeFlash = Math.max(0, this.grazeFlash - dt * 2.6);
    const auraBase = 0.09 + Math.sin(this.time * 2.2) * 0.03;
    this.grazeAura.material.opacity = auraBase + this.grazeFlash * 0.75;
    this.grazeAura.scale.setScalar(1 + this.grazeFlash * 0.22);

    // L'ARMEMENT DÉPEND DE LA COQUE. ORION garde le flux de projectiles et ses
    // missiles ; HÉLIOS et VULCAIN ont leur propre arme, qui vit dans son fichier et
    // s'occupe de tout — y compris de ses dégâts. Le vaisseau, lui, ne sait rien
    // d'elles : il annonce seulement qu'il veut tirer.
    const coque = bord.coque || 'orion';
    // Le tir direct de VULCAIN est volontairement faible : c'est le prix de ses
    // charges. Celui d'HÉLIOS n'existe pas — son rayon EST son tir.
    //
    // 0,45 était trop dur, et la mesure a dit pourquoi. La forge n'a de charge en
    // réserve qu'un tiers du temps : les deux autres tiers, la coque se bat au seul
    // canon. À 45 % elle était donc punie deux fois pour le même choix, et mettait
    // 16 s à nettoyer une vague qu'ORION plie en 12. À 0,6 le canon comble l'attente
    // sans jamais rivaliser — c'est toujours le souffle qui fait le travail.
    const cadenceCoque = coque === 'vulcain' ? 0.6 : 1;

    this.fireCooldown -= dt;
    if (coque !== 'helios' && cmd.tir && this.fireCooldown <= 0) {
      const rate = stats.fireRate * cadenceCoque * (bord.odTimer > 0 ? OVERDRIVE.odFireMul : 1);
      this.fireCooldown = 1 / rate;
      this._shoot(stats, bullets, audio, fx);
    }

    // Missiles auto — la signature d'ORION. Sur les deux autres coques, le module
    // `missiles` sert à tout autre chose (satellites, rayon d'explosion).
    if (coque === 'orion' && stats.missileCount > 0) {
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

  // Projette la position du doigt (NDC) sur le PLAN de jeu (y = 0) et renvoie le
  // point visé en x ET en z. L'ancienne version ne rendait que x : la profondeur
  // était jetée à la frontière de l'entrée tactile.
  // Point du plan de jeu visé par un doigt. Public : la pirouette tactile a besoin
  // de savoir de quel côté du vaisseau on vient d'appuyer.
  aimPoint(ndc, camera) {
    this._tmp.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position);
    const t = -camera.position.y / this._tmp.y; // intersection avec le plan y = 0
    this._aim.set(
      camera.position.x + this._tmp.x * t,
      0,
      THREE.MathUtils.clamp(camera.position.z + this._tmp.z * t, ARENA.playerZMin, ARENA.playerZMax)
    );
    return this._aim;
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
  takeHit(game, bord = game) {
    if (this.invulnTimer > 0 || !this.alive) return 'invuln';
    if (this.shieldUp) {
      this.shieldUp = false;
      this.shieldMesh.visible = false;
      this.shieldRechargeTimer = bord.stats.shieldRecharge;
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
