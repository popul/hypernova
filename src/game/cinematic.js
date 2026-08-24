// Cinématique d'introduction, jouée dans le moteur du jeu. On MONTRE l'histoire :
// des étoiles proches s'éteignent une à une, la nuée de l'essaim déferle et encercle
// la Terre qui s'assombrit sous les impacts, puis le vaisseau NOVA jaillit en gros plan,
// riposte, et NOVA se présente. ~27 s, skippable à tout moment, rejouable depuis le titre.

import * as THREE from 'three';
import { createEnemyShip } from './ships.js';
import { ARENA } from './constants.js';

const smoothstep = (t) => t * t * (3 - 2 * t);
const END_TIME = 27.2;
const EARTH_POS = new THREE.Vector3(8, 0, -35);

const SUBTITLES = [
  { t: 0.9, dur: 4.5, text: 'An 2087. Les étoiles s’éteignent une à une.' },
  { t: 6.4, dur: 4.5, text: 'Un essaim venu du cœur de la galaxie dévore la lumière.' },
  { t: 12.3, dur: 4.3, text: 'Les colonies sont tombées. La Terre est la dernière lueur.' },
  { t: 18.9, dur: 4.0, text: 'Vous êtes le dernier pilote de l’escadron NOVA.' },
];

// Caméra : segments interpolés ; look 'hero' = suivre le vaisseau du joueur.
const CAMERA_PATH = [
  { t0: 0, t1: 6, from: [0, 2, 7], to: [0, 1.5, 3], lookFrom: [2, 2, -30], lookTo: [2, 2, -30] },
  {
    t0: 6,
    t1: 11.5,
    from: [0, 1.5, 3],
    to: [-6, 3, 1],
    lookFrom: [2, 2, -30],
    lookTo: [12, 1, -30],
  },
  {
    t0: 11.5,
    t1: 17.2,
    from: [-6, 3, 1],
    to: [-2, 2, -1],
    lookFrom: [12, 1, -30],
    lookTo: [8, 0, -35],
  },
  { t0: 17.2, t1: 21.6, from: [-2, 2, -1], to: [2, 5, 4], look: 'hero' },
  {
    t0: 21.6,
    t1: END_TIME,
    from: [2, 5, 4],
    to: [0, 21, 27],
    lookFrom: 'snapshot',
    lookTo: [0, 0, -3],
  },
];

function makeGlowTexture(inner, outer) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Petite Terre stylisée : océans dégradés + continents + calotte, peinte sur canvas.
function makeEarthTexture() {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#2b66d9');
  sea.addColorStop(0.5, '#1c4fc0');
  sea.addColorStop(1, '#2b66d9');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3d9c5a';
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * w,
      h * 0.2 + Math.random() * h * 0.6,
      6 + Math.random() * 22,
      4 + Math.random() * 12,
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 0, w, 7);
  ctx.fillRect(0, h - 7, w, 7);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Cinematic {
  constructor({ scene, audio, fx, overlayRoot, player, characters = null }) {
    this.scene = scene;
    this.audio = audio;
    this.fx = fx;
    this.overlayRoot = overlayRoot;
    this.player = player;
    this.characters = characters;
    this.active = false;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._snapshot = new THREE.Vector3();

    // Ressources partagées entre les rejouages (jamais recréées).
    this.starTex = makeGlowTexture('rgba(255,255,255,1)', 'rgba(160,220,255,0)');
    this.atmoTex = makeGlowTexture('rgba(90,170,255,0.55)', 'rgba(90,170,255,0)');
    this.earthTex = makeEarthTexture();
    this.earthGeo = new THREE.SphereGeometry(6, 24, 18);
  }

  play(onEnd) {
    this.stop();
    this.active = true;
    this.onEnd = onEnd;
    this.time = 0;
    this.swarm = [];
    this.shots = [];
    this.heroPhase = null;
    this._snapshotTaken = false;

    this.player.group.visible = false;

    // --- Décor : étoiles proches (qui vont mourir) + la Terre ---
    this.stars = [];
    for (let i = 0; i < 14; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.starTex,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      // Couloir face caméra, en évitant la zone de la Terre (x>2 && z<-28).
      let x;
      let z;
      do {
        x = -26 + Math.random() * 52;
        z = -55 + Math.random() * 36;
      } while (x > 0 && z < -26);
      sprite.position.set(x, -6 + Math.random() * 18, z);
      const s = 1.4 + Math.random() * 1.8;
      sprite.scale.setScalar(s);
      sprite.userData.baseScale = s;
      this.scene.add(sprite);
      this.stars.push({ sprite, dieAt: -1 });
    }

    this.earth = new THREE.Mesh(
      this.earthGeo,
      new THREE.MeshStandardMaterial({
        map: this.earthTex,
        roughness: 0.75,
        metalness: 0,
        emissive: 0x0a1e3c,
        emissiveIntensity: 0.7,
      })
    );
    this.earth.position.copy(EARTH_POS);
    this.scene.add(this.earth);
    this.atmo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.atmoTex,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.atmo.scale.setScalar(17);
    this.atmo.position.copy(EARTH_POS);
    this.scene.add(this.atmo);

    // --- DOM : barres cinéma, sous-titres, carte-titre, bouton passer ---
    this.dom = document.createElement('div');
    this.dom.className = 'cine';
    this.dom.innerHTML = `
      <div class="cine-bar top"></div>
      <div class="cine-bar bottom"></div>
      <div class="cine-sub" id="cine-sub"></div>
      <div class="cine-card" id="cine-card">
        <div class="cine-card-logo">NOVA<span>SWARM</span></div>
        <div class="cine-card-tag">Faites décoller la légende.</div>
      </div>
      <button class="cine-skip" id="cine-skip">Passer ▸</button>
    `;
    this.overlayRoot.appendChild(this.dom);
    this.dom.querySelector('#cine-skip').addEventListener('click', () => this.skip());
    this.subEl = this.dom.querySelector('#cine-sub');

    // --- Timeline d'événements ponctuels ---
    const starDeaths = [1.4, 2.1, 2.9, 3.6, 4.3, 5.0, 5.6, 7.4, 8.2, 9.0, 9.8, 10.6].map(
      (t, i) => ({ t, fn: () => this._killStar(i) })
    );
    this.events = [
      { t: 0.0, fn: () => this.audio.cinePad('dark', 7.5) },
      { t: 2.5, fn: () => this.audio.cinePulse() },
      { t: 5.0, fn: () => this.audio.cinePulse() },
      ...starDeaths,
      {
        t: 6.2,
        fn: () => {
          this.audio.cinePad('tension', 6.5);
          this._spawnSwarm();
        },
      },
      { t: 11.5, fn: () => this._swarmToOrbit() },
      { t: 12.2, fn: () => this.audio.cinePad('dark', 5.5) },
      {
        t: 12.7,
        fn: () =>
          this.characters?.sayText('Cette petite planète bleue ? À MOI.', {
            speaker: 'krrk',
            priority: true,
          }),
      },
      {
        t: 18.2,
        fn: () =>
          this.characters?.sayText('Signature inconnue… c’est TOI, pilote ! Fonce !', {
            priority: true,
          }),
      },
      { t: 12.4, fn: () => this._earthImpact(1.0) },
      { t: 13.3, fn: () => this._earthImpact(0.7) },
      { t: 14.2, fn: () => this._earthImpact(1.2) },
      { t: 15.1, fn: () => this._earthImpact(0.6) },
      { t: 16.6, fn: () => this.audio.cineRiser(2.7) },
      { t: 17.2, fn: () => this._launchHero() },
      { t: 20.2, fn: () => this._heroShot() },
      { t: 20.9, fn: () => this._heroShot() },
      { t: 21.6, fn: () => this.audio.cineHero() },
      {
        t: 22.6,
        fn: () => {
          this.dom.querySelector('#cine-card').classList.add('visible');
          this.fx.burst(this._tmp.set(0, 2, 6), 0x4ff2ff, { count: 34, speed: 9, life: 0.9 });
        },
      },
      { t: 23.6, fn: () => this.characters?.onNovaIntro() },
    ].sort((a, b) => a.t - b.t);
    this.eventIdx = 0;
    this.subIdx = 0;
    this.subHideAt = -1;
  }

  _killStar(i) {
    const star = this.stars[i];
    if (star && star.dieAt < 0) {
      star.dieAt = this.time;
      this.audio.cineStarDie();
    }
  }

  _spawnSwarm() {
    for (let i = 0; i < 26; i++) {
      const group = createEnemyShip(i % 3 === 0 ? 'wasp' : 'drone');
      group.position.set(
        34 + i * 2.6 + Math.random() * 3,
        -4 + Math.random() * 11,
        -24 - Math.random() * 18
      );
      group.rotation.y = Math.PI / 2; // file vers la gauche
      this.scene.add(group);
      this.swarm.push({
        group,
        mode: 'sweep',
        vx: -(24 + Math.random() * 6),
        swayPhase: Math.random() * 6,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitRadius: 7.5 + Math.random() * 3,
        orbitSpeed: 0.7 + Math.random() * 0.7,
        alive: true,
      });
    }
  }

  _swarmToOrbit() {
    // Les dix premiers encore en scène encerclent la Terre ; les autres poursuivent.
    let taken = 0;
    for (const s of this.swarm) {
      if (!s.alive || taken >= 10) continue;
      s.mode = 'orbit';
      taken++;
    }
  }

  _earthImpact(intensity) {
    const theta = Math.random() * Math.PI * 2;
    const p = this._tmp
      .set(Math.cos(theta) * 5.4, (Math.random() - 0.5) * 4, Math.sin(theta) * 3 + 4)
      .add(EARTH_POS);
    if (intensity > 0.9) {
      this.fx.explosionBig(p, 0xff9f43);
      this.audio.cineImpact();
      this.fx.shockwave(p, 0xff5db1, 5);
    } else {
      this.fx.explosionSmall(p, 0xffc857);
      this.audio.cinePulse();
    }
    this.fx.addShake(0.25 * intensity);
  }

  _launchHero() {
    const g = this.player.group;
    g.visible = true;
    g.position.set(-10, -3, 10);
    this.heroPhase = 'attack';
    this.heroT = 0;
    this.heroCurveA = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-10, -3, 10),
      new THREE.Vector3(-2, 0, -2),
      new THREE.Vector3(2, 2, -16),
      new THREE.Vector3(5, 1, -27)
    );
    this.heroCurveB = new THREE.CubicBezierCurve3(
      new THREE.Vector3(5, 1, -27),
      new THREE.Vector3(18, 4, -10),
      new THREE.Vector3(10, 2, 10),
      new THREE.Vector3(0, 0, ARENA.playerZ)
    );
  }

  _heroShot() {
    const target = this.swarm.find((s) => s.alive && s.mode === 'orbit');
    if (!target) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 1.4),
      new THREE.MeshBasicMaterial({ color: 0x8ffbff, toneMapped: false })
    );
    mesh.position.copy(this.player.group.position);
    this.scene.add(mesh);
    this.shots.push({ mesh, target, t: 0, from: this.player.group.position.clone() });
    this.audio.shoot();
  }

  update(dt) {
    if (!this.active) return null;
    this.time += dt;

    while (this.eventIdx < this.events.length && this.events[this.eventIdx].t <= this.time) {
      this.events[this.eventIdx].fn();
      this.eventIdx++;
    }

    // Sous-titres.
    if (this.subIdx < SUBTITLES.length && SUBTITLES[this.subIdx].t <= this.time) {
      const sub = SUBTITLES[this.subIdx];
      this.subEl.textContent = sub.text;
      this.subEl.classList.add('visible');
      this.subHideAt = sub.t + sub.dur;
      this.subIdx++;
    }
    if (this.subHideAt > 0 && this.time >= this.subHideAt) {
      this.subEl.classList.remove('visible');
      this.subHideAt = -1;
    }

    // Étoiles mourantes : flash bref puis extinction.
    for (const star of this.stars) {
      if (star.dieAt < 0) continue;
      const age = this.time - star.dieAt;
      const base = star.sprite.userData.baseScale;
      if (age < 0.15) {
        star.sprite.scale.setScalar(base * (1 + age * 6));
      } else if (age < 0.65) {
        const k = (age - 0.15) / 0.5;
        star.sprite.scale.setScalar(base * (1.9 - 1.7 * k));
        star.sprite.material.opacity = 0.95 * (1 - k);
      } else {
        star.sprite.visible = false;
      }
    }

    // La nuée.
    for (const s of this.swarm) {
      if (!s.alive) continue;
      if (s.mode === 'sweep') {
        s.group.position.x += s.vx * dt;
        s.group.position.y += Math.sin(this.time * 2 + s.swayPhase) * 0.8 * dt;
        if (s.group.position.x < -60) {
          s.alive = false;
          this.scene.remove(s.group);
          continue;
        }
      } else {
        s.orbitAngle += s.orbitSpeed * dt;
        s.group.position.set(
          EARTH_POS.x + Math.cos(s.orbitAngle) * s.orbitRadius,
          EARTH_POS.y + Math.sin(s.orbitAngle * 0.6) * 2.5,
          EARTH_POS.z + Math.sin(s.orbitAngle) * s.orbitRadius
        );
        s.group.rotation.y = -s.orbitAngle;
      }
      // Traînée magenta, une frame sur trois pour épargner le pool de particules.
      if (((this.time * 60) | 0) % 3 === 0) this.fx.trail(s.group.position, 0xff3df0);
    }

    // La Terre : rotation lente ; s'assombrit sous le siège (12.2 → 16.2).
    if (this.earth) {
      this.earth.rotation.y += 0.05 * dt;
      const k = smoothstep(Math.min(1, Math.max(0, (this.time - 12.2) / 4)));
      this.earth.material.emissiveIntensity = 0.7 * (1 - k * 0.85);
      this.earth.material.color.setScalar(1 - k * 0.55);
      this.atmo.material.opacity = 0.6 * (1 - k * 0.8);
    }

    // Le héros.
    if (this.heroPhase) {
      const g = this.player.group;
      if (this.heroPhase === 'attack') {
        this.heroT = Math.min(1, this.heroT + dt / 2.8);
        const e = smoothstep(this.heroT);
        this.heroCurveA.getPoint(e, g.position);
        this.heroCurveA.getPoint(Math.min(1, e + 0.02), this._tmp);
        g.lookAt(this._tmp);
        g.rotateZ(Math.PI * 4 * Math.max(0, 1 - this.heroT * 1.7)); // tonneaux à l'entrée
        this.fx.trail(this._tmp.copy(g.position), 0x4ff2ff);
        if (this.heroT >= 1 && this.time >= 21.6) {
          this.heroPhase = 'return';
          this.heroT = 0;
        }
      } else if (this.heroPhase === 'return') {
        this.heroT = Math.min(1, this.heroT + dt / 3.2);
        const e = smoothstep(this.heroT);
        this.heroCurveB.getPoint(e, g.position);
        if (e < 0.96) {
          this.heroCurveB.getPoint(Math.min(1, e + 0.02), this._tmp);
          g.lookAt(this._tmp);
        } else {
          g.rotation.set(0, 0, 0);
        }
        if (((this.time * 60) | 0) % 2 === 0) this.fx.trail(g.position, 0x4ff2ff);
        if (this.heroT >= 1) this.heroPhase = 'done';
      }
    }

    // Tirs du héros vers les drones en orbite.
    for (const shot of this.shots) {
      if (!shot.mesh.visible) continue;
      shot.t += dt / 0.35;
      if (shot.t >= 1 || !shot.target.alive) {
        shot.mesh.visible = false;
        this.scene.remove(shot.mesh);
        if (shot.target.alive) {
          shot.target.alive = false;
          this.scene.remove(shot.target.group);
          this.fx.explosionSmall(shot.target.group.position, 0xff5db1);
          this.audio.explosionSmall();
        }
        continue;
      }
      shot.mesh.position.lerpVectors(shot.from, shot.target.group.position, shot.t);
      shot.mesh.lookAt(shot.target.group.position);
    }

    if (this.time >= END_TIME) {
      this._finish();
      return null;
    }

    // Caméra.
    const seg =
      CAMERA_PATH.find((s) => this.time >= s.t0 && this.time < s.t1) ||
      CAMERA_PATH[CAMERA_PATH.length - 1];
    const k = smoothstep(Math.min(1, Math.max(0, (this.time - seg.t0) / (seg.t1 - seg.t0))));
    this._pos.fromArray(seg.from).lerp(this._tmp.fromArray(seg.to), k);
    if (seg.look === 'hero') {
      this._look.lerp(this.player.group.position, Math.min(1, 6 * dt));
      this._snapshot.copy(this._look);
      this._snapshotTaken = true;
    } else if (seg.lookFrom === 'snapshot') {
      const from = this._snapshotTaken ? this._snapshot : this._tmp.fromArray(seg.lookTo);
      this._look.copy(from).lerp(this._tmp.fromArray(seg.lookTo), k);
    } else {
      this._look.fromArray(seg.lookFrom).lerp(this._tmp.fromArray(seg.lookTo), k);
    }
    return { pos: this._pos, look: this._look };
  }

  skip() {
    if (!this.active) return;
    this._finish();
  }

  _finish() {
    const done = this.onEnd;
    this.stop();
    if (done) done();
  }

  stop() {
    this.active = false;
    this.heroPhase = null;
    for (const s of this.swarm || []) if (s.alive) this.scene.remove(s.group);
    this.swarm = [];
    for (const shot of this.shots || []) this.scene.remove(shot.mesh);
    this.shots = [];
    for (const star of this.stars || []) {
      this.scene.remove(star.sprite);
      star.sprite.material.dispose();
    }
    this.stars = [];
    if (this.earth) {
      this.scene.remove(this.earth);
      this.earth.material.dispose();
      this.earth = null;
    }
    if (this.atmo) {
      this.scene.remove(this.atmo);
      this.atmo.material.dispose();
      this.atmo = null;
    }
    if (this.dom) {
      this.dom.remove();
      this.dom = null;
    }
    this.characters?.hide(); // pas de bulle orpheline après un skip
    if (this.player) {
      this.player.group.visible = true;
      this.player.group.rotation.set(0, 0, 0);
      this.player.group.position.set(0, 0, ARENA.playerZ);
    }
  }
}
