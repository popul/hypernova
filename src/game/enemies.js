// Gestion des ennemis : entrée en formation sur courbes de Bézier, balancement de la
// formation, plongées kamikazes vers le joueur, tirs, boss. IA volontairement lisible :
// machine à états par ennemi (entering → settling → formation ⇄ diving/returning).

import * as THREE from 'three';
import { createEnemyShip } from './ships.js';
import { ENEMY_TYPES, ENEMY, BOSS, WAVES, DIVES, ARENA } from './constants.js';
import { slotBasePosition, difficulty, pickDiveStyle, pickWeighted } from './waves.js';
import { alea, entre, ecart } from '../core/rng.js';

// États depuis lesquels un ennemi peut tirer ou plonger. Se limiter à 'formation'
// éteignait toute la menace : la formation ne se remplit jamais assez vite.
const ARMED_STATES = ['formation', 'settling', 'returning'];

const between = ([lo, hi]) => entre(lo, hi);

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
    this.fireTimer = entre(0.5, 2);
    this.diveShots = 0;
    this.flashTime = 0;
    this.time = alea() * 10;

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

  startWave(waveDef, waveNumber, mods = { hp: 1, fire: 1, dive: 1, credits: 1 }, heat = 0) {
    this.clear();
    this.mods = mods;
    this.waveNumber = waveNumber;
    this.heat = heat;
    this.diff = difficulty(waveNumber, mods, heat);
    this.pending = [...waveDef.spawns];
    this.waveClock = 0;
    // Le balancement de la formation repartait du temps écoulé depuis le CHARGEMENT
    // de la page : deux vagues identiques ne se balançaient donc jamais pareil, et
    // une partie n'était pas rejouable — c'était le dernier état caché du combat.
    // Remis à zéro, la formation démarre toujours au centre de son oscillation.
    this.formationTime = 0;
    this.diveTimer = this.diff.diveInterval + 2; // répit le temps de l'entrée
    this.fireTimer = 2;
    this.bossDefeatedThisWave = false;
  }

  // Recalcule la difficulté en cours de vague quand le directeur monte d'un cran.
  setHeat(heat) {
    this.heat = heat;
    this.diff = difficulty(this.waveNumber, this.mods, heat);
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
      return rank(a) - rank(b) + ecart(0.25);
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

    // Volée de formation : un MOTIF spatial (balles visées, mur, tir croisé) plutôt
    // qu'un paquet de balles au même endroit.
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = this.diff.formationFireInterval;
      this._fireVolley(game);
    }

    for (const e of this.list) {
      if (!e.alive) continue;
      e.time += dt;
      this._updateEnemy(e, dt, game);

      // Télégraphe : le tireur se signale avant de tirer, pour que la mort soit comprise.
      if (e.telegraph > 0) {
        e.telegraph -= dt;
        if (e.telegraph <= 0) this._releaseShot(e, game);
      }
      // Second coup différé de la guêpe.
      if (e.burstQueue) {
        e.burstQueue.timer -= dt;
        if (e.burstQueue.timer <= 0) {
          const q = e.burstQueue;
          const from = this._tmp.copy(e.group.position);
          from.z += 0.8;
          this._shootToward(from, q.aimX, game, q.shot.speedMul, q.shot.spread, 'aimed');
          q.left--;
          if (q.left > 0) q.timer = q.shot.gap;
          else e.burstQueue = null;
        }
      }

      if (e.flashTime > 0) {
        e.flashTime -= dt;
        const s = 1 + Math.max(0, e.flashTime) * 2.2;
        e.group.scale.setScalar(s);
      } else if (e.telegraph > 0) {
        // Pulsation d'avertissement pendant le télégraphe.
        e.group.scale.setScalar(1 + Math.sin(e.telegraph * 40) * 0.16);
      } else if (e.group.scale.x !== 1) {
        e.group.scale.setScalar(1);
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
        // Guidage terminal borné : le plongeur corrige sa course vers le joueur, mais
        // toujours moins vite que celui-ci ne se déplace — il pousse, il ne colle pas.
        // Au-delà de trackUntil la correction est figée : pas de « snap » injuste.
        if (e.diveStyle !== 'strafe' && e.t >= DIVES.trackFrom) {
          if (e.t <= DIVES.trackUntil) {
            const want = game.player.position.x - (pos.x + (e.homeX || 0));
            const step = this.diff.diveTrackMax * dt * (1 - e.t);
            e.homeX = (e.homeX || 0) + THREE.MathUtils.clamp(want, -step, step);
          }
          pos.x += e.homeX || 0;
        }
        this._faceTravel(e, pos);
        e.group.position.copy(pos);
        // Plan de tir tiré au sort à chaque plongée : plus d'esquive apprise par cœur.
        while (e.divePlan && e.diveShots < e.divePlan.length && e.t > e.divePlan[e.diveShots].t) {
          this._fireAimed(e, game, ENEMY.diveRole);
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
          // Une salve sur deux décale la maille d'un demi-pas : deux salves
          // consécutives n'offrent jamais le même couloir de fuite.
          e.fanPhase = ((e.fanPhase || 0) + 1) % 2;
          this._fireFan(e, game, e.fanPhase ? BOSS.fanSpacingU * 0.5 : 0);
          if (enraged && this.waveNumber >= BOSS.enragedFromWave) {
            e.fanFollowup = BOSS.fanSecondDelay;
          }
        }
        // Nappe enragée : différée dans le TEMPS, décalée d'un demi-pas dans l'espace.
        if (e.fanFollowup > 0) {
          e.fanFollowup -= dt;
          if (e.fanFollowup <= 0) {
            this._fireFan(e, game, e.fanPhase ? 0 : BOSS.fanSpacingU * 0.5);
            e.fanFollowup = 0;
          }
        }
        const burstInterval = Math.max(2.2, BOSS.aimedBurstInterval - this.waveNumber * 0.03);
        e.burstTimer = (e.burstTimer ?? burstInterval) - dt;
        if (e.burstTimer <= 0) {
          e.burstTimer = burstInterval;
          // Rafale visée : chaque balle avec une anticipation différente.
          for (const role of BOSS.burstRoles) this._fireAimed(e, game, role);
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
    let acc = alea() * total;
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
      (e) => e.alive && ARMED_STATES.includes(e.state) && e.type !== 'boss'
    );
    if (candidates.length === 0) return;
    // Les guêpes plongent plus volontiers.
    candidates.sort((a, b) => {
      const w = (x) => (x.type === 'wasp' ? 0 : 1) + alea();
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
    // Anticipation dès le lancement : la plongée dure 1,5 à 2,4 s, viser la position
    // actuelle revenait à viser le vide.
    const px = game.player.position.x + game.player.vx * ENEMY.diveLead + offsetX;
    e.homeX = 0;

    if (style === 'strafe') {
      // Rasante latérale : arrive toujours du côté opposé au joueur, pour le traverser.
      const dir = start.x >= game.player.position.x ? 1 : -1;
      e.curve = new THREE.CubicBezierCurve3(
        start,
        new THREE.Vector3(dir * 20, 0, start.z + 9),
        new THREE.Vector3(-dir * 20, 0, 7),
        new THREE.Vector3(-dir * 24, 0, 12)
      );
    } else {
      e.curve = new THREE.CubicBezierCurve3(
        start,
        new THREE.Vector3(start.x + ecart(5), 0, start.z + 7),
        new THREE.Vector3(px + ecart(2), 0, 6),
        new THREE.Vector3(px + ecart(1.5), 0, 24)
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

  // ---- Tirs ----

  // Point visé : là où le joueur SERA quand la balle arrivera, pas où il est.
  // roleMul répartit l'anticipation entre les tireurs d'une même volée : 1.0 vise
  // loin devant, 0 vise sur place (et cueille celui qui freine).
  _predictPoint(fromZ, game, roleMul) {
    // Temps de vol mesuré jusqu'à la position RÉELLE du joueur : depuis qu'il peut
    // avancer et reculer, viser le plan de départ manquerait systématiquement.
    const tof = Math.abs(game.player.position.z - fromZ) / this.diff.bulletSpeed;
    const lead = this.diff.lead ?? ENEMY.leadBase;
    const jitter = ecart(ENEMY.leadJitter);
    const x = game.player.position.x + game.player.vx * tof * lead * roleMul + jitter;
    return THREE.MathUtils.clamp(x, -ARENA.playerXMax, ARENA.playerXMax);
  }

  // Point de passage OBLIGÉ de tout projectile ennemi : c'est ici, et nulle part
  // ailleurs, qu'on garantit au joueur un temps de réaction. Un tir dont la balle
  // arriverait en moins de minReactionTime n'est pas une difficulté, c'est une
  // perte de vie annoncée — on ne le tire pas.
  _spawnShot(from, dir, kind, game) {
    // DANS LE DOS, JAMAIS. Un ennemi qui a dépassé le vaisseau tire vers l'avant :
    // sa balle arrive par en dessous, hors du regard, sur un joueur qui surveille
    // le haut de l'écran. Ce n'est pas une difficulté, c'est une embuscade — et
    // l'esquive n'y sert à rien puisqu'on ne voit rien venir.
    if (from.z > game.player.position.z - ENEMY.noFireBehind) return false;
    // NI À PLAT. Un ennemi très à l'écart mais à peine plus haut envoie une balle
    // qui traverse l'écran presque à l'horizontale : elle arrive par le côté, dans
    // la direction où l'on esquive justement, et le seul mouvement qui y échappe
    // est celui qu'on ne fait jamais — reculer. On exige donc que la balle descende
    // au moins six dixièmes de ce qu'elle dérive : au-dessus de trente degrés, elle
    // se lit comme un tir venu d'en haut.
    if (Math.abs(dir.z) < Math.abs(dir.x) * ENEMY.minShotSlope) return false;
    const speed = dir.length();
    if (speed > 1e-3) {
      const dist = from.distanceTo(game.player.position);
      if (dist / speed < ENEMY.minReactionTime) return false;
    }
    game.enemyBullets.spawn(from, dir, kind);
    return true;
  }

  // Tire une balle depuis `from` vers le point x cible (au plan du joueur).
  _shootToward(from, aimX, game, speedMul = 1, spread = 0, kind = 'aimed') {
    const dir = this._tmp2.set(aimX - from.x, 0, game.player.position.z - from.z);
    dir.normalize();
    if (spread) {
      dir.x += ecart(spread);
      dir.normalize();
    }
    dir.multiplyScalar(this.diff.bulletSpeed * speedMul);
    return this._spawnShot(from, dir, kind, game);
  }

  // Tir visé d'un ennemi, avec la signature de son type (drone/guêpe/brute).
  _fireAimed(e, game, roleMul = 1) {
    const from = this._tmp.copy(e.group.position);
    from.z += 0.8;
    const shot = e.def.shot || { shots: 1, spread: ENEMY.aimSpread, speedMul: 1 };
    const aimX = this._predictPoint(from.z, game, roleMul);
    this._shootToward(from, aimX, game, shot.speedMul, shot.spread, 'aimed');
    // Second coup de la guêpe : différé, pour refermer le couloir d'esquive.
    if (shot.shots > 1 && shot.gap) {
      e.burstQueue = { left: shot.shots - 1, timer: shot.gap, aimX, shot };
    } else if (shot.shots > 1) {
      // Nappe de la brute : plusieurs balles d'un coup, réparties latéralement.
      for (let i = 1; i < shot.shots; i++) {
        const off = (i - (shot.shots - 1) / 2) * shot.spread * 26;
        this._shootToward(from, aimX + off, game, shot.speedMul, 0, 'aimed');
      }
    }
    game.audio.enemyShoot();
  }

  // Une volée = un motif spatial. Le budget de balles garantit que l'arène ne
  // peut jamais être fermée : au-delà, les tireurs de formation cèdent le pas.
  _fireVolley(game) {
    const armed = this.list.filter((e) => e.alive && ARMED_STATES.includes(e.state));
    if (armed.length === 0) return;
    if (game.enemyBullets.activeCount() >= this.diff.bulletBudget) return;

    const style = pickWeighted(this.diff.volleyWeights || { aimed: 1 });
    if (style === 'wall') this._fireWall(armed);
    else if (style === 'cross') this._fireCross(armed);
    else this._fireAimedVolley(armed);
  }

  _fireAimedVolley(armed) {
    const pool = [...armed];
    const n = Math.min(3, this.diff.shootersMax, pool.length);
    for (let k = 0; k < n; k++) {
      const shooter = this._pickShooter(pool);
      if (!shooter) break;
      pool.splice(pool.indexOf(shooter), 1);
      shooter.telegraph = ENEMY.telegraphTime;
      shooter.pendingShot = {
        kind: 'aimed',
        role: ENEMY.volleyRoles[k % ENEMY.volleyRoles.length],
      };
    }
  }

  // Mur : des tireurs répartis sur toute la largeur tirent droit devant.
  // Il reste toujours un couloir, mais il faut le viser.
  _fireWall(armed) {
    const sorted = [...armed].sort((a, b) => a.group.position.x - b.group.position.x);
    const count = Math.min(this.diff.wallCount, sorted.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i * (sorted.length - 1)) / Math.max(1, count - 1));
      const e = sorted[idx];
      if (!e || e.pendingShot) continue;
      e.telegraph = ENEMY.telegraphTime;
      e.pendingShot = { kind: 'straight' };
    }
  }

  // Tir croisé : les deux extrémités de la formation ferment les côtés.
  _fireCross(armed) {
    const sorted = [...armed].sort((a, b) => a.group.position.x - b.group.position.x);
    const ends = [sorted[0], sorted[sorted.length - 1]];
    ends.forEach((e, side) => {
      if (!e || e.pendingShot) return;
      e.telegraph = ENEMY.telegraphTime;
      e.pendingShot = { kind: 'cross', side };
    });
  }

  // Exécute le tir annoncé à la fin du télégraphe.
  _releaseShot(e, game) {
    const p = e.pendingShot;
    e.pendingShot = null;
    if (!p) return;
    const from = this._tmp.copy(e.group.position);
    from.z += 0.8;
    if (p.kind === 'straight') {
      this._shootToward(from, from.x, game, 1, 0, 'straight');
      game.audio.enemyShoot();
    } else if (p.kind === 'cross') {
      for (const a of ENEMY.crossAngles) {
        const angle = p.side === 0 ? a : -a;
        const dir = new THREE.Vector3(
          Math.sin(angle) * this.diff.bulletSpeed,
          0,
          Math.cos(angle) * this.diff.bulletSpeed
        );
        this._spawnShot(from, dir, 'straight', game);
      }
      game.audio.enemyShoot();
    } else {
      this._fireAimed(e, game, p.role ?? 1);
    }
  }

  // Éventail du boss : l'écart entre branches est mesuré EN UNITÉS au plan du
  // joueur. En radians, toutes les branches sauf une sortaient de l'écran.
  _fireFan(e, game, offsetU = 0) {
    const from = this._tmp.copy(e.group.position);
    from.z += 1.2;
    const dz = Math.max(1, game.player.position.z - from.z);
    const span = Math.min(
      BOSS.fanSpanMax,
      BOSS.fanSpanBase + BOSS.fanSpanPerWave * this.waveNumber
    );
    const count = Math.min(BOSS.fanCountMax, 1 + Math.round(span / BOSS.fanSpacingU));
    const centerX = this._predictPoint(from.z, game, 0.5);
    for (let i = 0; i < count; i++) {
      const aimX = centerX + (i - (count - 1) / 2) * BOSS.fanSpacingU + offsetU;
      const dir = new THREE.Vector3(aimX - from.x, 0, dz).normalize();
      dir.multiplyScalar(this.diff.bulletSpeed);
      this._spawnShot(from, dir, 'straight', game);
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
      this.bossDefeatedThisWave = true; // le saut suivant a droit à sa réplique
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
