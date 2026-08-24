// Gestion des ennemis : entrée en formation sur courbes de Bézier, balancement de la
// formation, plongées kamikazes vers le joueur, tirs, boss. IA volontairement lisible :
// machine à états par ennemi (entering → settling → formation ⇄ diving/returning).

import * as THREE from 'three';
import { createEnemyShip } from './ships.js';
import { ENEMY_TYPES, ENEMY, BOSS, WAVES, DIVES } from './constants.js';
import { slotBasePosition, difficulty, pickDiveStyle } from './waves.js';

const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

let nextEnemyId = 1; // identifiant unique : les balles perforantes ne frappent pas deux fois

const EXPLOSION_COLORS = { drone: 0xff5db1, wasp: 0xff3df0, brute: 0xff9f43, boss: 0xff4757 };

class Enemy {
  constructor(scene, spawn, waveNumber, hpMul = 1) {
    this.id = nextEnemyId++;
    this.type = spawn.type;
    this.def = ENEMY_TYPES[spawn.type];
    if (this.type === 'boss') {
      this.hp = this.def.hp + waveNumber * BOSS.hpPerWave;
    } else {
      const scaledWaves = Math.max(0, waveNumber - ENEMY.hpScaleStartWave);
      const every = this.type === 'brute' ? ENEMY.hpEveryWavesBrute : ENEMY.hpEveryWavesSmall;
      this.hp = this.def.hp + Math.floor(scaledWaves / every);
    }
    // Le boss scale déjà par vague : le mod de mission ne s'applique qu'aux autres types,
    // sinon les boss de fin de campagne deviennent des sacs à PV interminables.
    if (this.type !== 'boss') this.hp = Math.max(1, Math.round(this.hp * hpMul));
    this.maxHp = this.hp;
    this.alive = true;
    this.state = 'entering';
    this.row = spawn.row;
    this.col = spawn.col;
    this.cols = spawn.cols;
    this.curve = spawn.curve;
    this.t = 0;
    this.fireTimer = 0.5 + Math.random() * 1.5;
    this.diveShots = 0;
    this.flashTime = 0;
    this.time = Math.random() * 10;

    this.group = createEnemyShip(this.type);
    this.group.position.copy(this.curve.getPoint(0));
    scene.add(this.group);
    this._scene = scene;
  }

  dispose() {
    this._scene.remove(this.group);
  }
}

export class Enemies {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.pending = []; // spawns pas encore entrés en scène
    this.waveClock = 0;
    this.formationTime = 0;
    this.waveNumber = 1;
    this.mods = { hp: 1, fire: 1, dive: 1, credits: 1 };
    this.diff = difficulty(1);
    this.diveTimer = 2.5;
    this.fireTimer = 2;
    this.boss = null;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  startWave(waveDef, waveNumber, mods = { hp: 1, fire: 1, dive: 1, credits: 1 }) {
    this.clear();
    this.mods = mods;
    this.waveNumber = waveNumber;
    this.diff = difficulty(waveNumber, mods);
    this.pending = [...waveDef.spawns];
    this.waveClock = 0;
    this.diveTimer = this.diff.diveInterval + 2; // répit le temps de l'entrée
    this.fireTimer = 2;
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list = [];
    this.pending = [];
    this.boss = null;
  }

  aliveCount() {
    return this.list.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  }

  waveCleared() {
    return this.pending.length === 0 && this.aliveCount() === 0;
  }

  hasTargets() {
    return this.list.some((e) => e.alive);
  }

  pickTargets(n) {
    const alive = this.list.filter((e) => e.alive);
    // Priorité aux plongeurs (menace immédiate), puis au boss, puis aléatoire.
    alive.sort((a, b) => {
      const rank = (e) => (e.state === 'diving' ? 0 : e.type === 'boss' ? 1 : 2);
      return rank(a) - rank(b) + (Math.random() - 0.5) * 0.5;
    });
    return alive.slice(0, n);
  }

  divingCount() {
    return this.list.reduce((n, e) => n + (e.state === 'diving' ? 1 : 0), 0);
  }

  slotPosition(enemy, out) {
    slotBasePosition(enemy.row, enemy.col, enemy.cols, out);
    const breath = 1 + Math.sin(this.formationTime * WAVES.breathSpeed) * WAVES.breathAmp;
    out.x = out.x * breath + Math.sin(this.formationTime * WAVES.swaySpeed) * WAVES.swayAmpX;
    return out;
  }

  update(dt, game) {
    this.waveClock += dt;
    this.formationTime += dt;

    // Fait entrer les vaisseaux dont l'heure est venue.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].delay <= this.waveClock) {
        const enemy = new Enemy(this.scene, this.pending[i], this.waveNumber, this.mods?.hp ?? 1);
        if (enemy.type === 'boss') {
          this.boss = enemy;
          game.audio.bossAlarm();
          game.audio.setMode('boss'); // la musique martèle tant que l'amiral est en vie
          game.hud.showBossBar();
          game.characters?.onBossIntro();
        }
        this.list.push(enemy);
        this.pending.splice(i, 1);
      }
    }

    // Déclenche des plongées depuis la formation.
    this.diveTimer -= dt;
    if (this.diveTimer <= 0) {
      this.diveTimer = this.diff.diveInterval;
      const want = this.diff.simultaneousDivers - this.divingCount();
      for (let n = 0; n < want; n++) this._launchDive(game);
    }

    // Tirs depuis la formation : plusieurs tireurs par volée, choisis par roulette
    // pondérée sur fireChance — une grosse formation menace enfin proportionnellement.
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = this.diff.formationFireInterval;
      const shooters = this.list.filter((e) => e.alive && e.state === 'formation');
      const n = Math.min(
        ENEMY.shootersMax,
        1 + Math.floor(shooters.length / ENEMY.shootersPerVolley)
      );
      for (let k = 0; k < n; k++) {
        const shooter = this._pickShooter(shooters);
        if (shooter) this._fireAimed(shooter, game, 0.12);
      }
    }

    for (const e of this.list) {
      if (!e.alive) continue;
      e.time += dt;
      this._updateEnemy(e, dt, game);
      if (e.flashTime > 0) {
        e.flashTime -= dt;
        const s = 1 + Math.max(0, e.flashTime) * 2.2;
        e.group.scale.setScalar(s);
      }
    }

    // Purge les morts de la liste (les meshes sont déjà retirés).
    if (this.list.some((e) => !e.alive)) this.list = this.list.filter((e) => e.alive);
  }

  _updateEnemy(e, dt, game) {
    switch (e.state) {
      case 'entering': {
        e.t += dt / ENEMY.entryDuration;
        const t = Math.min(1, e.t);
        const eased = 1 - Math.pow(1 - t, 2); // décélère à l'arrivée
        const pos = e.curve.getPoint(eased);
        this._faceTravel(e, pos);
        e.group.position.copy(pos);
        if (t >= 1) e.state = e.type === 'boss' ? 'bossing' : 'settling';
        break;
      }
      case 'settling': {
        this.slotPosition(e, this._tmp);
        const d = this._tmp.distanceTo(e.group.position);
        if (d < 0.25) {
          e.state = 'formation';
        } else {
          this._faceTravel(e, this._tmp);
          e.group.position.lerp(this._tmp, Math.min(1, 6 * dt));
        }
        break;
      }
      case 'formation': {
        this.slotPosition(e, this._tmp);
        e.group.position.copy(this._tmp);
        e.group.position.y = Math.sin(e.time * 2.2) * 0.15;
        // Face au joueur, avec une petite oscillation vivante.
        e.group.rotation.set(0, Math.sin(e.time * 1.7) * 0.12, Math.sin(e.time * 2.6) * 0.08);
        break;
      }
      case 'diving': {
        e.t += dt * this.diff.diveSpeed * (e.diveSpeedMul || 1);
        const pos = e.curve.getPoint(Math.min(1, e.t));
        this._faceTravel(e, pos);
        e.group.position.copy(pos);
        // Plan de tir tiré au sort à chaque plongée : plus d'esquive apprise par cœur.
        while (e.divePlan && e.diveShots < e.divePlan.length && e.t > e.divePlan[e.diveShots].t) {
          this._fireAimed(e, game, e.divePlan[e.diveShots].spread);
          e.diveShots++;
        }
        if (e.t >= 1) {
          // Sorti par le bas : réapparaît au fond et regagne sa place (à la Galaga).
          this.slotPosition(e, this._tmp);
          e.group.position.set(this._tmp.x, 0, WAVES.formationZTop - 7);
          e.state = 'returning';
        }
        break;
      }
      case 'returning': {
        this.slotPosition(e, this._tmp);
        const delta = this._tmp2.copy(this._tmp).sub(e.group.position);
        const dist = delta.length();
        if (dist < 0.3) {
          e.state = 'formation';
        } else {
          e.group.position.addScaledVector(
            delta.normalize(),
            Math.min(dist, ENEMY.returnSpeed * dt)
          );
          this._faceTravel(e, this._tmp);
        }
        break;
      }
      case 'bossing': {
        // Phase 2 sous 60 % de PV : il bouge plus vite et double ses éventails.
        const enraged = e.hp <= e.maxHp * 0.6;
        const moveMul = enraged ? 1.4 : 1;
        e.group.position.x = Math.sin(e.time * 0.55 * moveMul) * 8.5;
        e.group.position.z = -13 + Math.sin(e.time * 0.31 * moveMul) * 2.2;
        e.group.position.y = Math.sin(e.time * 1.2) * 0.4;
        e.group.rotation.y = Math.sin(e.time * 0.4) * 0.2;

        const fanInterval = Math.max(1.4, BOSS.fanInterval - this.waveNumber * 0.02) / moveMul;
        e.fanTimer = (e.fanTimer ?? fanInterval) - dt;
        if (e.fanTimer <= 0) {
          e.fanTimer = fanInterval;
          this._fireFan(e, game);
          if (enraged) this._fireFan(e, game, BOSS.fanSpread * 0.5); // salve décalée
        }
        const burstInterval = Math.max(2.2, BOSS.aimedBurstInterval - this.waveNumber * 0.03);
        e.burstTimer = (e.burstTimer ?? burstInterval) - dt;
        if (e.burstTimer <= 0) {
          e.burstTimer = burstInterval;
          for (let i = 0; i < 3; i++) {
            // Rafale visée, légèrement étalée dans le temps via la position projetée.
            this._fireAimed(e, game, 0.15);
          }
        }
        break;
      }
    }
  }

  // Roulette pondérée par la propension au tir du type (fireChance) : la guêpe
  // harcèle deux fois plus que le drone, le blindé tire posément.
  _pickShooter(shooters) {
    if (shooters.length === 0) return null;
    let total = 0;
    for (const e of shooters) total += e.def.fireChance || 0.01;
    let acc = Math.random() * total;
    for (const e of shooters) {
      acc -= e.def.fireChance || 0.01;
      if (acc <= 0) return e;
    }
    return shooters[shooters.length - 1];
  }

  _faceTravel(e, nextPos) {
    if (nextPos.distanceToSquared(e.group.position) > 0.0004) {
      this._tmp2.copy(nextPos);
      e.group.lookAt(this._tmp2);
    }
  }

  _launchDive(game) {
    const candidates = this.list.filter(
      (e) => e.alive && e.state === 'formation' && e.type !== 'boss'
    );
    if (candidates.length === 0) return;
    // Les guêpes plongent plus volontiers.
    candidates.sort((a, b) => {
      const w = (x) => (x.type === 'wasp' ? 0 : 1) + Math.random();
      return w(a) - w(b);
    });
    const lead = candidates[0];
    game.characters?.onDive(); // NOVA alerte (anti-spam géré côté personnage)

    const style = pickDiveStyle(this.diff.diveWeights || { sweep: 1 });
    if (style === 'squad') {
      // Escadron : le meneur emmène ses voisins de rangée, en formation serrée.
      const wing = candidates
        .filter((e) => e !== lead && e.row === lead.row && Math.abs(e.col - lead.col) <= 2)
        .slice(0, DIVES.squad.count - 1);
      [lead, ...wing].forEach((e, i) =>
        this._startDive(e, game, 'squad', DIVES.squad.offsets[i] || 0)
      );
    } else {
      this._startDive(lead, game, style, 0);
    }
  }

  // Prépare la courbe et le plan de tir d'une plongée selon son style.
  _startDive(e, game, style, offsetX) {
    const def = DIVES[style] || DIVES.sweep;
    const start = e.group.position.clone();
    const px = game.player.position.x + offsetX;

    if (style === 'strafe') {
      // Rasante latérale : traverse l'écran devant le joueur en tirant droit devant.
      const dir = start.x >= 0 ? 1 : -1;
      e.curve = new THREE.CubicBezierCurve3(
        start,
        new THREE.Vector3(dir * 20, 0, start.z + 9),
        new THREE.Vector3(-dir * 20, 0, 7),
        new THREE.Vector3(-dir * 24, 0, 12)
      );
    } else {
      e.curve = new THREE.CubicBezierCurve3(
        start,
        new THREE.Vector3(start.x + (Math.random() - 0.5) * 10, 0, start.z + 7),
        new THREE.Vector3(px + (Math.random() - 0.5) * 8, 0, 6),
        new THREE.Vector3(px + (Math.random() - 0.5) * 10, 0, 24)
      );
    }

    // Instants de tir tirés dans leurs plages : deux plongées ne se ressemblent jamais.
    const plan = [];
    for (const key of ['t1', 't2', 't3']) {
      if (plan.length >= def.shots || !def[key]) break;
      plan.push({ t: between(def[key]), spread: def.spread });
    }
    e.divePlan = plan;
    e.diveSpeedMul = def.speedMul;
    e.diveStyle = style;
    e.t = 0;
    e.diveShots = 0;
    e.state = 'diving';
  }

  _fireAimed(e, game, spread) {
    const from = this._tmp.copy(e.group.position);
    from.z += 0.8;
    const dir = this._tmp2.copy(game.player.position).sub(from);
    dir.y = 0;
    dir.normalize();
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.normalize().multiplyScalar(this.diff.bulletSpeed);
    game.enemyBullets.spawn(from, dir);
    game.audio.enemyShoot();
  }

  _fireFan(e, game, angleOffset = 0) {
    const from = this._tmp.copy(e.group.position);
    from.z += 1.2;
    const base = this._tmp2.copy(game.player.position).sub(from);
    base.y = 0;
    const baseAngle = Math.atan2(base.x, base.z) + angleOffset;
    // L'éventail gagne une branche toutes les 8 vagues : le boss de la vague 40
    // n'est plus celui de la vague 4 en plus long.
    const count = Math.min(
      BOSS.fanCountMax,
      BOSS.fanCount + Math.floor(this.waveNumber / BOSS.fanCountPerWaves)
    );
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i - (count - 1) / 2) * BOSS.fanSpread;
      const vel = new THREE.Vector3(
        Math.sin(angle) * this.diff.bulletSpeed,
        0,
        Math.cos(angle) * this.diff.bulletSpeed
      );
      game.enemyBullets.spawn(from, vel);
    }
    game.audio.enemyShoot();
  }

  // Inflige des dégâts ; renvoie true si l'ennemi meurt.
  damage(e, amount, game) {
    if (!e.alive) return false;
    e.hp -= amount;
    e.flashTime = 0.14;
    if (e.type === 'boss') {
      game.hud.setBossHp(e.hp / e.maxHp);
      if (!e.halfTaunted && e.hp > 0 && e.hp <= e.maxHp / 2) {
        e.halfTaunted = true;
        game.characters?.onBossHalf();
      }
    }
    if (e.hp > 0) {
      game.fx.burst(e.group.position, 0xffffff, { count: 4, speed: 5, life: 0.25 });
      return false;
    }
    e.alive = false;
    e.dispose();
    if (e.type === 'boss') {
      this.boss = null;
      game.hud.hideBossBar();
      game.fx.explosionBig(e.group.position, EXPLOSION_COLORS.boss);
      game.audio.explosionBig();
      game.audio.setMode('play');
      game.characters?.onBossDown();
    } else if (e.type === 'brute') {
      game.fx.explosionBig(e.group.position, EXPLOSION_COLORS.brute);
      game.audio.explosionBig();
    } else {
      game.fx.explosionSmall(e.group.position, EXPLOSION_COLORS[e.type]);
      game.audio.explosionSmall();
    }
    return true;
  }
}
