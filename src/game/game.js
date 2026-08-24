// Chef d'orchestre : machine à états (titre → jeu → boutique → game over),
// collisions, score, combo, économie, persistance du record.

import * as THREE from 'three';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { PlayerBullets, EnemyBullets, Missiles } from './bullets.js';
import { Pickups } from './pickups.js';
import { Hud } from './hud.js';
import { Shop } from './shop.js';
import { makeWave } from './waves.js';
import { UPGRADES, priceOf, emptyLevels, computeStats } from './upgrades.js';
import { COMBO, PLAYER, STORAGE_KEYS } from './constants.js';

export class Game {
  constructor({ scene, camera, renderer, input, audio, fx, hudRoot, overlayRoot }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.fx = fx;

    this.player = new Player(scene);
    this.enemies = new Enemies(scene);
    this.bullets = new PlayerBullets(scene);
    this.enemyBullets = new EnemyBullets(scene);
    this.missiles = new Missiles(scene, fx);
    this.pickups = new Pickups(scene);
    this.hud = new Hud(hudRoot);
    this.overlayRoot = overlayRoot;
    this.shop = new Shop(overlayRoot, {
      onBuy: (id) => this.buy(id),
      onLaunch: () => this.launchNextWave(),
    });

    this.state = 'title';
    this.paused = false;
    this.hiscore = Number(localStorage.getItem(STORAGE_KEYS.hiscore)) || 0;
    this.bestWave = Number(localStorage.getItem(STORAGE_KEYS.bestWave)) || 0;
    this._tmp = new THREE.Vector3();

    input.on('Space', () => {
      if (this.state === 'title') this.startRun();
      else if (this.state === 'gameover') this.startRun();
    });
    input.on('KeyP', () => this.togglePause());
    input.on('Escape', () => this.togglePause());
    input.on('KeyM', () => {
      const muted = this.audio.toggleMute();
      this.hud.announce(muted ? 'Son coupé' : 'Son activé', '', 900);
    });

    this.showTitle();
  }

  // ---- Écrans ----

  _screen(html) {
    this.overlayRoot.innerHTML = '';
    const div = document.createElement('div');
    div.innerHTML = html;
    const el = div.firstElementChild;
    this.overlayRoot.appendChild(el);
    return el;
  }

  showTitle() {
    this.state = 'title';
    this.audio.setMode('title');
    this.hud.root.classList.add('hidden');
    const el = this._screen(`
      <div class="screen title">
        <div class="title-logo">NOVA<span>SWARM</span></div>
        <div class="title-tag">— un hommage 3D à Galaga —</div>
        <div class="title-press">Espace pour décoller</div>
        <div class="title-controls">
          <span>← → ou Q / D&nbsp;&nbsp;bouger</span>
          <span>Espace&nbsp;&nbsp;tirer</span>
          <span>M&nbsp;&nbsp;son</span>
        </div>
        ${
          this.hiscore > 0
            ? `<div class="title-hiscore">Record&nbsp;<b class="gold">${this.hiscore}</b>&nbsp;·&nbsp;Meilleure vague&nbsp;<b>${this.bestWave}</b></div>`
            : ''
        }
      </div>
    `);
    el.addEventListener('click', () => this.startRun());
  }

  showGameOver() {
    this.state = 'gameover';
    this.audio.setMode('title');
    this.audio.gameOver();
    const newRecord = this.score > 0 && this.score >= this.hiscore;
    if (this.score > this.hiscore) {
      this.hiscore = this.score;
      localStorage.setItem(STORAGE_KEYS.hiscore, String(this.hiscore));
    }
    if (this.wave > this.bestWave) {
      this.bestWave = this.wave;
      localStorage.setItem(STORAGE_KEYS.bestWave, String(this.bestWave));
    }
    this.hud.root.classList.add('hidden');
    const el = this._screen(`
      <div class="screen gameover">
        <div class="go-title">Partie terminée</div>
        ${newRecord ? '<div class="go-record">★ Nouveau record ★</div>' : ''}
        <div class="go-stats">
          <div><span class="hud-label">Score</span><b>${this.score}</b></div>
          <div><span class="hud-label">Vague</span><b>${this.wave}</b></div>
          <div><span class="hud-label">Record</span><b class="gold">${this.hiscore}</b></div>
        </div>
        <div class="title-press">Espace pour rejouer</div>
      </div>
    `);
    el.addEventListener('click', () => this.startRun());
  }

  // ---- Cycle de vie d'une partie ----

  startRun() {
    this.overlayRoot.innerHTML = '';
    this.shop.close();
    this.hud.root.classList.remove('hidden');

    this.score = 0;
    this.credits = 0;
    this.wave = 0;
    this.lives = PLAYER.baseLives;
    this.levels = emptyLevels();
    this.stats = computeStats(this.levels);
    this.combo = { chain: 0, mult: 1, timer: 0 };
    this.respawnTimer = 0;
    this.gameOverTimer = 0;
    this.waveEndTimer = 0;
    this.waveBonusGiven = false;

    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.pickups.clear();
    this.enemies.clear();
    this.player.shieldUp = false;
    this.player.reset();
    this.player.invulnTimer = 0;

    this.hud.setScore(0);
    this.hud.setHiscore(this.hiscore);
    this.hud.setCredits(0);
    this.hud.setLives(this.lives);
    this.hud.hideBossBar();

    this.startWave(1);
  }

  startWave(n) {
    this.wave = n;
    this.state = 'playing';
    this.audio.setMode('play');
    this.waveEndTimer = 0;
    this.waveBonusGiven = false;
    this.hud.setWave(n);
    const def = makeWave(n);
    this.enemies.startWave(def, n);
    if (def.boss) {
      this.hud.announce(`Vague ${n}`, '⚠ Vaisseau-amiral détecté ⚠');
    } else {
      this.hud.announce(`Vague ${n}`);
      this.audio.waveStart();
    }
  }

  launchNextWave() {
    if (this.state !== 'shop') return;
    this.shop.close();
    this.startWave(this.wave + 1);
  }

  openShop() {
    this.state = 'shop';
    this.audio.setMode('shop');
    // Purge les projectiles en vol : sinon ils restent gelés pendant la boutique
    // et frappent le joueur dès le lancement de la vague suivante.
    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.combo = { chain: 0, mult: 1, timer: 0 };
    this.hud.setCombo(1, 0);
    this.shop.open(this._shopState());
  }

  _shopState() {
    return { credits: this.credits, levels: this.levels, wave: this.wave + 1, lives: this.lives };
  }

  buy(id) {
    const upgrade = UPGRADES.find((u) => u.id === id);
    if (!upgrade || this.state !== 'shop') return;
    const level = this.levels[id];
    const maxedHull = id === 'hull' && this.lives >= PLAYER.maxLives;
    const price = priceOf(upgrade, level);
    if (level >= upgrade.maxLevel || maxedHull || this.credits < price) {
      this.audio.deny();
      return;
    }
    this.credits -= price;
    this.levels[id]++;
    if (id === 'hull') {
      this.lives++;
      this.hud.setLives(this.lives);
    }
    this.stats = computeStats(this.levels);
    this.hud.setCredits(this.credits);
    this.audio.buy();
    this.shop.refresh(this._shopState());
  }

  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    this.audio.setMode(this.paused ? 'off' : 'play');
    if (this.paused) {
      this._screen(
        '<div class="screen pause"><div class="go-title">Pause</div><div class="title-press">P pour reprendre</div></div>'
      );
    } else {
      this.overlayRoot.innerHTML = '';
    }
  }

  // ---- Boucle ----

  update(dt) {
    if (this.paused) return;

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'shop') {
      // La boutique reste vivante : les gemmes restantes finissent d'arriver.
      this.pickups.update(dt, this.player.position, 999, (v, p) => this._collectCredit(v, p), true);
    }
  }

  _updatePlaying(dt) {
    this.player.update(dt, this);
    this.enemies.update(dt, this);
    this.bullets.update(dt);
    this.enemyBullets.update(dt);
    this.missiles.update(dt);

    const vacuum = this.enemies.waveCleared();
    this.pickups.update(
      dt,
      this.player.position,
      this.stats.magnetRadius,
      (v, p) => this._collectCredit(v, p),
      vacuum
    );

    // Combo.
    if (this.combo.chain > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) {
        this.combo.chain = 0;
        this.combo.mult = 1;
      }
    }
    this.hud.setCombo(this.combo.mult, this.combo.timer / COMBO.window);

    this._collisions();

    // Respawn / game over différés.
    if (!this.player.alive) {
      if (this.lives > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.player.reset();
      } else {
        this.gameOverTimer -= dt;
        if (this.gameOverTimer <= 0) this.showGameOver();
      }
    }

    // Fin de vague → bonus puis boutique une fois les gemmes ramassées.
    if (vacuum && this.player.alive) {
      if (!this.waveBonusGiven) {
        this.waveBonusGiven = true;
        const bonus = 25 + this.wave * 10;
        this.credits += bonus;
        this.hud.setCredits(this.credits);
        this.hud.announce('Vague nettoyée', `+${bonus} cr de prime`, 1800);
      }
      this.waveEndTimer += dt;
      if (this.waveEndTimer > 1.7 && this.pickups.activeCount() === 0) {
        this.openShop();
      }
    }
  }

  _collisions() {
    const enemies = this.enemies.list;

    // Tirs du joueur → ennemis.
    this.bullets.forEachActive((b) => {
      for (const e of enemies) {
        if (!e.alive) continue;
        const rr = e.def.radius + this.bullets.radius;
        if (b.mesh.position.distanceToSquared(e.group.position) < rr * rr) {
          this.bullets.kill(b);
          if (this.enemies.damage(e, 1, this)) this._onEnemyKilled(e);
          break;
        }
      }
    });

    // Missiles → ennemis (dégâts lourds).
    this.missiles.forEachActive((m) => {
      for (const e of enemies) {
        if (!e.alive) continue;
        const rr = e.def.radius + this.missiles.radius;
        if (m.mesh.position.distanceToSquared(e.group.position) < rr * rr) {
          this.missiles.kill(m);
          this.fx.explosionSmall(m.mesh.position, 0xffc857);
          if (this.enemies.damage(e, 3, this)) this._onEnemyKilled(e);
          break;
        }
      }
    });

    if (!this.player.alive) return;
    const pPos = this.player.position;

    // Tirs ennemis → joueur.
    this.enemyBullets.forEachActive((b) => {
      const rr = PLAYER.radius + this.enemyBullets.radius;
      if (b.mesh.position.distanceToSquared(pPos) < rr * rr) {
        this.enemyBullets.kill(b);
        this._playerHit();
      }
    });

    // Collision de plein fouet avec un ennemi (plongée).
    for (const e of enemies) {
      if (!e.alive) continue;
      const rr = PLAYER.radius + e.def.radius;
      if (e.group.position.distanceToSquared(pPos) < rr * rr) {
        if (e.type !== 'boss') {
          if (this.enemies.damage(e, 99, this)) this._onEnemyKilled(e);
        }
        this._playerHit();
        break;
      }
    }
  }

  _playerHit() {
    const result = this.player.takeHit(this);
    if (result !== 'hit') return;
    this.lives--;
    this.hud.setLives(this.lives);
    this.combo = { chain: 0, mult: 1, timer: 0 };
    this.player.die(this);
    if (this.lives > 0) {
      this.respawnTimer = 1.3;
    } else {
      this.gameOverTimer = 1.8;
    }
  }

  _onEnemyKilled(e) {
    // Combo.
    this.combo.chain++;
    this.combo.timer = COMBO.window;
    const newMult = Math.min(
      1 + Math.floor(this.combo.chain / COMBO.killsPerTier),
      COMBO.maxMultiplier
    );
    if (newMult > this.combo.mult) {
      this.combo.mult = newMult;
      this.audio.comboUp(newMult);
      this.hud.pulseCombo();
      this.hud.announce(`Combo ×${newMult}`, '', 800);
    }

    // Score.
    this.score += e.def.score * this.combo.mult;
    this.hud.setScore(this.score);
    if (this.score > this.hiscore) this.hud.setHiscore(this.score);

    // Crédits (multiplicateur appliqué à la collecte).
    this.pickups.dropFrom(e.group.position, e.def.credits, e.def.gemCount);
  }

  _collectCredit(value, pos3d) {
    const gain = value * this.combo.mult;
    this.credits += gain;
    this.hud.setCredits(this.credits);
    this.audio.pickup(this.combo.mult);
    this.fx.burst(pos3d, 0xffc857, { count: 3, speed: 3, life: 0.3 });

    // Projection 3D → écran pour le petit "+N".
    this._tmp.copy(pos3d).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.hud.creditPop(
      (this._tmp.x * 0.5 + 0.5) * rect.width,
      (-this._tmp.y * 0.5 + 0.5) * rect.height,
      `+${gain}`
    );
  }
}
