// HYPERNOVA — Prologue : LE DERNIER EN VOL (~42 s, 12 plans).
//
// Principes de mise en scène, issus de la critique de la version précédente :
// — on ouvre EN PLEIN COMBAT, sans texte ni logo, et un ennemi explose à 1,5 s ;
// — le joueur possède trois choses avant qu'on les lui prenne : son indicatif
//   (prononcé par ORSO), un ailier qui lui sauve la mise, et une Terre reconnaissable ;
// — le récit est porté par les personnages, jamais par des sous-titres qui légendent
//   l'image (l'ancienne version commentait ce qu'on voyait déjà) ;
// — chaque plan commence par une COUPE FRANCHE : c'est ce qui distingue un film d'un
//   économiseur d'écran ;
// — le dernier mouvement va VERS l'ennemi, pas en arrière.

import * as THREE from 'three';
import { ARENA } from './constants.js';
import { evaluateShot, Veils } from './cine/stagecraft.js';
import {
  createEarth,
  createEclipse,
  createSwarm,
  createShuttles,
  createDebris,
} from './cine/props.js';
import { createPlayerShip } from './ships.js';

const EARTH_R = 26;
const EARTH_POS = new THREE.Vector3(0, -6, -126);
const ECLIPSE_HOME = new THREE.Vector3(6, 22, -104);
const END_TIME = 42.0;

// ------------------------------------------------------------------ Découpage

// hfov = champ HORIZONTAL voulu ; le rig le convertit en champ vertical réel selon
// le format de l'écran, sans quoi la moitié des plans sortirait du cadre en portrait.
const SHOTS = [
  {
    id: 'S1', // Déjà la bataille. Le kill tient lieu de réplique.
    t0: 0,
    t1: 3,
    pos: [2.6, 1.5, 12.4],
    posTo: [1.6, 1.2, 9.0],
    lookTarget: (ctx) => ctx.player.position,
    roll: -0.32,
    rollTo: -0.08,
    hfov: 62,
    ease: 'linear',
  },
  {
    id: 'S2', // L'escadron. ORSO nomme le pilote et le sauve.
    t0: 3,
    t1: 6,
    pos: [-9.0, -3.4, -2.0],
    posTo: [-8.4, -3.0, -3.2],
    look: [1.0, 1.2, -14.0],
    roll: 0.1,
    hfov: 70,
    ease: 'linear',
  },
  {
    id: 'S3', // Le palier lumineux : la Terre, le convoi. Ce qu'on va perdre.
    t0: 6,
    t1: 10,
    pos: [14.0, 2.0, -46.0],
    posTo: [22.0, 16.0, -30.0],
    look: [0, -6, -126],
    lookTo: [2, -2, -96],
    roll: 0,
    rollTo: -0.06,
    hfov: 66,
    ease: 'inOutSine',
  },
  {
    id: 'S4', // Elle n'arrête pas d'entrer. Plan fixe : l'immobilité fait peur.
    t0: 10,
    t1: 14,
    pos: [0, -7, -26],
    look: [2, 12, -104],
    roll: 0,
    rollTo: 0.04,
    hfov: 74,
    ease: 'linear',
  },
  {
    id: 'S5', // La quille au téléobjectif. Ça ne finit pas.
    t0: 14,
    t1: 17,
    pos: [46, 24, -78],
    posTo: [-56, 24, -78],
    lookFn: (e, ctx) => ctx.tmp.set(46 - 102 * e, 21, -104),
    roll: 0,
    rollTo: 0.18,
    hfov: 34,
    ease: 'linear',
  },
  {
    id: 'S6', // Le premier coup : le convoi fauché, l'essaim qui sort.
    t0: 17,
    t1: 20,
    pos: [-34, 10, -60],
    posTo: [-20, 6, -52],
    look: [-58, 16, -100],
    lookTo: [6, -8, -112],
    roll: 0.06,
    rollTo: 0.26,
    hfov: 68,
    ease: 'outCubic',
  },
  {
    id: 'S7', // Il prend le coup. Caméra à l'épaule.
    t0: 20,
    t1: 23,
    pos: [5.0, 2.4, -8.0],
    posTo: [0.5, 1.6, -18.0],
    lookTarget: (ctx) => ctx.player.position,
    roll: 0,
    hfov: 56,
    ease: 'linear',
    handheld: 0.12,
  },
  {
    id: 'S8', // La perte. La caméra ne bouge plus du tout.
    t0: 23,
    t1: 26,
    pos: [-3.0, 1.0, -14.0],
    look: [2.0, 0.0, -26.0],
    roll: 0,
    hfov: 50,
    ease: 'linear',
  },
  {
    id: 'S9', // Le point de non-retour, joué et non dit : le demi-tour.
    t0: 26,
    t1: 28,
    pos: [1.2, 0.9, -21.0],
    posTo: [1.0, 1.0, -20.2],
    lookTarget: (ctx) => ctx.player.position,
    roll: 0,
    hfov: 42,
    ease: 'linear',
  },
  {
    id: 'S10', // La charge, dans l'épave du convoi.
    t0: 28,
    t1: 32,
    posFn: (e, ctx) => ctx.tmp.copy(ctx.player.position).add(ctx.tmp2.set(0, 1.1, 3.2)),
    lookFn: (e, ctx) => ctx.tmp.copy(ctx.player.position).add(ctx.tmp2.set(0, 0.4, -8)),
    roll: 0,
    hfov: 64,
    ease: 'linear',
  },
  {
    id: 'S11', // Il perd la face. On ne le tue pas : on le rase.
    t0: 32,
    t1: 36,
    pos: [-14, 8, -66],
    posTo: [-40, 15, -88],
    lookFn: (e, ctx) => ctx.eyeWorld,
    roll: 0.1,
    rollTo: -0.14,
    hfov: 60,
    ease: 'inOutSine',
  },
  {
    id: 'S12', // Le titre en plein vol, puis la partie.
    t0: 36,
    t1: END_TIME,
    posFn: (e, ctx) => ctx.tmp.copy(ctx.player.position).add(ctx.tmp2.set(0, 2.2, 7.0)),
    lookFn: (e, ctx) => ctx.tmp.copy(ctx.player.position).add(ctx.tmp2.set(0, 0.6, -12)),
    roll: 0,
    rollTo: -0.1,
    hfov: 58,
    ease: 'linear',
  },
];

// ------------------------------------------------------------------- Lumière

// La lumière raconte l'extinction : c'est aussi scénarisé que la caméra.
const LIGHT_TRACK = [
  { t: 0, hemi: 1.1, exposure: 1.15, bloom: 0.95, fog: 0.0075, maw: 0 },
  { t: 9.5, hemi: 1.0, exposure: 1.18, bloom: 0.95, fog: 0.003, maw: 0 },
  { t: 13.5, hemi: 0.3, exposure: 0.86, bloom: 1.1, fog: 0.0016, maw: 0 },
  { t: 16.6, hemi: 0.3, exposure: 0.9, bloom: 1.3, fog: 0.0016, maw: 26 },
  { t: 19.0, hemi: 0.28, exposure: 0.95, bloom: 1.2, fog: 0.0016, maw: 8 },
  { t: 25.0, hemi: 0.22, exposure: 0.8, bloom: 1.0, fog: 0.0016, maw: 4 },
  { t: 28.0, hemi: 0.5, exposure: 1.05, bloom: 1.15, fog: 0.002, maw: 4 },
  { t: 34.0, hemi: 0.95, exposure: 1.2, bloom: 1.5, fog: 0.0026, maw: 12 },
  { t: 42.0, hemi: 1.1, exposure: 1.15, bloom: 0.95, fog: 0.0075, maw: 0 },
];

function trackValue(track, t, key) {
  let a = track[0];
  let b = track[track.length - 1];
  for (let i = 0; i < track.length - 1; i++) {
    if (t >= track[i].t && t <= track[i + 1].t) {
      a = track[i];
      b = track[i + 1];
      break;
    }
  }
  const span = Math.max(1e-3, b.t - a.t);
  const k = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
  return THREE.MathUtils.lerp(a[key], b[key], k);
}

export class Cinematic {
  constructor({ scene, audio, fx, overlayRoot, player, characters = null, stage = null }) {
    this.scene = scene;
    this.audio = audio;
    this.fx = fx;
    this.overlayRoot = overlayRoot;
    this.player = player;
    this.characters = characters;
    this.stage = stage;
    this.active = false;

    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this.eyeWorld = new THREE.Vector3();
  }

  // ------------------------------------------------------------------ Montage

  play(onEnd, { handoff = false, pilotName = 'VEILLE-3' } = {}) {
    this.stop();
    this.active = true;
    this.onEnd = onEnd;
    this.handoff = handoff;
    this.pilot = pilotName;
    this.time = 0;
    this.shotIdx = 0;

    // Tout le décor vit dans un seul groupe : le nettoyage est alors trivial.
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this._buildStage();
    this._buildDom();
    this._buildTimeline();

    this.player.group.visible = true;
    this.player.group.position.set(2.0, 0.4, 6.0);
    this.player.group.rotation.set(0, Math.PI, 0);
  }

  _buildStage() {
    this.earth = createEarth(EARTH_R);
    this.earth.position.copy(EARTH_POS);
    this.earth.rotation.z = 0.35;
    this.root.add(this.earth);

    this.eclipse = createEclipse();
    this.eclipse.position.copy(ECLIPSE_HOME).setY(140); // hors cadre, entre par le haut
    this.eclipse.rotation.y = 0.22;
    this.root.add(this.eclipse);

    this.swarm = createSwarm(320);
    this.root.add(this.swarm);
    this.swarmState = [];
    for (let i = 0; i < 320; i++) {
      this.swarmState.push({
        base: new THREE.Vector3(
          -30 + Math.random() * 60,
          -14 + Math.random() * 28,
          -108 + Math.random() * 26
        ),
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.9,
      });
    }

    this.shuttles = createShuttles(140);
    this.root.add(this.shuttles);
    this.shuttleState = [];
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2;
      this.shuttleState.push({
        a,
        r: EARTH_R + 1 + Math.random() * 6,
        rise: Math.random() * 60,
        speed: 7 + Math.random() * 9,
        alive: true,
      });
    }

    this.debris = createDebris(90);
    this.debris.visible = false;
    this.root.add(this.debris);
    this.debrisState = [];
    for (let i = 0; i < 90; i++) {
      this.debrisState.push({
        p: new THREE.Vector3(
          (Math.random() - 0.5) * 46,
          (Math.random() - 0.5) * 18,
          -34 - Math.random() * 40
        ),
        rot: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        spin: (Math.random() - 0.5) * 1.2,
        scale: 0.5 + Math.random() * 1.8,
      });
    }

    // ORSO — l'ailier. Orange, un peu plus gros : on le distingue au premier coup d'œil.
    this.orso = createPlayerShip();
    this.orso.traverse((o) => {
      if (o.name === 'hitcore' || o.name === 'hitring') o.visible = false;
      if (o.isMesh && o.material && o.material.color && o.name !== 'exhaust') {
        o.material = o.material.clone();
        o.material.color.setHex(0xff9f43).multiplyScalar(0.85);
        if (o.material.emissive) o.material.emissive.setHex(0x3a1d05);
      }
    });
    this.orso.scale.setScalar(1.12);
    this.orso.position.set(-3.4, 1.2, 8.0);
    this.orso.rotation.y = Math.PI;
    this.root.add(this.orso);
    this.orsoAlive = true;

    this.player.showHitMarkers(false);
  }

  _buildDom() {
    this.dom = document.createElement('div');
    this.dom.className = 'cine';
    this.dom.innerHTML = `
      <div class="cine-card" id="cine-card">
        <div class="cine-card-logo">HYPER<span>NOVA</span></div>
        <div class="cine-card-tag" id="cine-card-tag"></div>
      </div>
      <button class="cine-skip" id="cine-skip">Passer ▸</button>
    `;
    this.overlayRoot.appendChild(this.dom);
    this.dom.querySelector('#cine-skip').addEventListener('click', () => this.skip());
    this.veils = new Veils(this.dom);
  }

  _say(speaker, line) {
    this.characters?.sayText(line.replace('{PSEUDO}', this.pilot), { speaker, priority: true });
  }

  _buildTimeline() {
    const A = this.audio;
    this.events = [
      { t: 0.0, fn: () => A.cinePulse() },
      { t: 1.25, fn: () => A.shoot() },
      { t: 1.5, fn: () => this._killDrone(0) },
      { t: 3.4, fn: () => this._say('nova', 'ORSO : « Colle à mon aile, {PSEUDO}. »') },
      { t: 5.0, fn: () => this._orsoSaves() },
      { t: 6.2, fn: () => A.cinePad('hope', 5.5) },
      {
        t: 8.0,
        fn: () => this._say('nova', 'ORSO : « Deux minutes et ils sont sortis. Tiens bon. »'),
      },
      { t: 10.2, fn: () => A.cinePad('dark', 6) },
      { t: 10.4, fn: () => this._eclipseEnters() },
      { t: 12.5, fn: () => this._say('vorax', 'Oh… de la lumière. J’adore ça.') },
      { t: 14.0, fn: () => A.cineRiser(2.6) },
      { t: 16.6, fn: () => this._openMaw() },
      { t: 17.2, fn: () => this._firstStrike() },
      { t: 18.4, fn: () => this._say('nova', 'Ils tirent sur le convoi !') },
      { t: 20.6, fn: () => A.cinePad('tension', 4) },
      { t: 22.2, fn: () => this._orsoTakesTheHit() },
      { t: 23.4, fn: () => this._say('nova', 'ORSO : « Le convoi, {PSEUDO}. Pas moi. »') },
      { t: 24.4, fn: () => this._orsoDies() },
      { t: 26.05, fn: () => this._say('nova', 'Ordre de repli.') },
      { t: 26.9, fn: () => this._say('nova', '…Tu ne rentres pas, hein ?') },
      { t: 27.0, fn: () => this._turnAround() },
      { t: 28.0, fn: () => A.cineHero() },
      { t: 28.6, fn: () => this._say('nova', 'Canons chauds. Vise l’œil !') },
      { t: 29.5, fn: () => this._chargeShot() },
      { t: 30.5, fn: () => this._chargeShot() },
      { t: 31.2, fn: () => this._chargeShot() },
      { t: 33.2, fn: () => this._grazeVorax() },
      { t: 33.6, fn: () => this._say('vorax', 'Un seul ? … UN SEUL ?!') },
      { t: 35.0, fn: () => this._say('vorax', 'Il m’a… ÉRAFLÉ.') },
      { t: 36.0, fn: () => this._titleCard() },
      { t: 40.4, fn: () => this._say('nova', 'NOVA, ta copilote. À toi de jouer.') },
    ].sort((a, b) => a.t - b.t);
    this.eventIdx = 0;
  }

  // ------------------------------------------------------------ Événements

  _killDrone(i) {
    const s = this.swarmState[i];
    if (!s) return;
    this.tmp.set(1.5, 0.6, -10);
    this.fx.explosionBig(this.tmp, 0xff5db1);
    this.audio.explosionSmall();
    s.dead = true;
    this.veils.punch(0.08);
  }

  _orsoSaves() {
    this.audio.shoot();
    this.tmp.copy(this.player.group.position).add(this.tmp2.set(0.6, 0, 4.2));
    this.fx.explosionSmall(this.tmp, 0xff9f43);
    this.audio.explosionSmall();
  }

  _eclipseEnters() {
    this.eclipseEntering = true;
  }

  _openMaw() {
    this.mawOpen = true;
    this.audio.bossAlarm();
  }

  _firstStrike() {
    this.strikeT = 0;
    this.veils.punch(0.14);
    this.fx.addShake(0.9);
    this.fx.hitStop(0.12);
    this.audio.explosionBig();
    // Le convoi est fauché en vague le long de sa trajectoire.
    for (const s of this.shuttleState) {
      s.doomedAt = 0.15 + Math.random() * 1.1;
    }
    this.swarmOut = true;
  }

  _orsoTakesTheHit() {
    this.orsoHit = true;
    this.audio.playerHit();
    this.tmp.copy(this.orso.position);
    this.fx.explosionSmall(this.tmp, 0xff9f43);
    this.fx.addShake(0.5);
  }

  _orsoDies() {
    this.orsoDying = true;
  }

  _turnAround() {
    this.turning = 0;
    this.audio.comboUp(3);
  }

  _chargeShot() {
    this.audio.shoot();
    this.tmp.copy(this.player.group.position).add(this.tmp2.set(0, 0, -14));
    this.fx.explosionSmall(this.tmp, 0xff5db1);
    this.fx.hitStop(0.045);
  }

  _grazeVorax() {
    this.veils.punch(0.18);
    this.fx.addShake(1.0);
    this.fx.explosionBig(this.eyeWorld, 0xfff0c0);
    this.fx.shockwave(this.eyeWorld, 0x8ffbff, 22, { faceCamera: true, camera: this.camera });
    this.audio.explosionBig();
    this.eyeHitAt = this.time;
    this.swarmTurn = true; // les 320 pivotent d'un bloc vers le joueur
  }

  _titleCard() {
    const card = this.dom.querySelector('#cine-card');
    const tag = this.dom.querySelector('#cine-card-tag');
    tag.textContent = `${this.pilot} · VEILLE-3 · DERNIER EN VOL`;
    card.classList.add('visible');
    this.audio.waveStart();
  }

  // -------------------------------------------------------------- Simulation

  update(dt, camera) {
    if (!this.active) return null;
    this.camera = camera;
    this.time += dt;
    this.veils.update(dt);

    while (this.eventIdx < this.events.length && this.events[this.eventIdx].t <= this.time) {
      this.events[this.eventIdx].fn();
      this.eventIdx++;
    }

    this._updateActors(dt);
    this._updateLights();

    if (this.time >= END_TIME) {
      this._finish();
      return null;
    }
    return this._updateCamera(camera);
  }

  _updateActors(dt) {
    const t = this.time;

    // --- La Terre tourne, ses nuages plus vite ---
    this.earth.userData.surface.rotation.y += 0.012 * dt;
    this.earth.userData.clouds.rotation.y += 0.0162 * dt;

    // --- Le cuirassé entre par le haut et n'arrête pas d'entrer ---
    if (this.eclipseEntering) {
      const k = THREE.MathUtils.clamp((t - 10.4) / 3.2, 0, 1);
      const eased = 1 - Math.pow(1 - k, 2.2);
      this.eclipse.position.y = THREE.MathUtils.lerp(140, ECLIPSE_HOME.y, eased);
      this.eclipse.position.x = ECLIPSE_HOME.x;
      this.eclipse.position.z = ECLIPSE_HOME.z;
    }
    // Respiration des crevasses incandescentes.
    const pulse = 0.7 + Math.sin(t * 1.6) * 0.3;
    this.eclipse.userData.bands.material.color.setRGB(0.69 * pulse, 0.3 * pulse, 1.0 * pulse);

    // --- La gueule s'ouvre en corolle ---
    if (this.mawOpen) {
      const k = THREE.MathUtils.clamp((t - 16.6) / 0.6, 0, 1);
      for (const hinge of this.eclipse.userData.maw.children) {
        if (hinge.isGroup) hinge.rotation.z = -k * 0.5;
      }
      this.eclipse.userData.furnace.scale.setScalar(0.01 + k * 1.4);
    }

    // --- Position de l'œil en repère monde (visée du plan S11) ---
    this.eclipse.userData.eye.getWorldPosition(this.eyeWorld);

    // --- Les navettes montent du terminateur ---
    this._updateShuttles(dt);

    // --- L'essaim ---
    this._updateSwarm(dt);

    // --- Le champ de débris (après la frappe) ---
    if (t > 17.2) {
      this.debris.visible = true;
      this._updateDebris(dt);
    }

    // --- ORSO ---
    this._updateOrso(dt);

    // --- Le joueur ---
    this._updatePlayerShip(dt);

    // --- Commotion : désaturation + vignette après la mort d'ORSO ---
    if (t >= 23.6 && t < 25.8) {
      const k = t < 25.0 ? 1 : 1 - (t - 25.0) / 0.8;
      this.veils.setShock(k * 0.85);
    } else {
      this.veils.setShock(0);
    }
  }

  _updateShuttles(dt) {
    const t = this.time;
    for (let i = 0; i < this.shuttleState.length; i++) {
      const s = this.shuttleState[i];
      if (s.doomedAt != null && t > 17.2 + s.doomedAt && s.alive) {
        s.alive = false;
        if (i % 9 === 0) {
          this.tmp.set(
            EARTH_POS.x + Math.cos(s.a) * s.r,
            EARTH_POS.y + s.rise * 0.5,
            EARTH_POS.z + Math.sin(s.a) * s.r + 24
          );
          this.fx.burst(this.tmp, 0xffc857, { count: 4, speed: 6, life: 0.5 });
        }
      }
      if (!s.alive) {
        this._m.makeScale(0, 0, 0);
        this.shuttles.setMatrixAt(i, this._m);
        continue;
      }
      s.rise += s.speed * dt;
      const x = EARTH_POS.x + Math.cos(s.a) * s.r;
      const y = EARTH_POS.y + Math.sin(s.a) * s.r * 0.6 + s.rise * 0.55;
      const z = EARTH_POS.z + Math.sin(s.a) * s.r + s.rise * 0.9;
      this.tmp.set(x, y, z);
      this._q.setFromAxisAngle(this.tmp2.set(0, 1, 0), s.a);
      this._m.compose(this.tmp, this._q, this._s);
      this.shuttles.setMatrixAt(i, this._m);
    }
    this.shuttles.instanceMatrix.needsUpdate = true;
  }

  _updateSwarm(_dt) {
    const t = this.time;
    const out = this.swarmOut ? THREE.MathUtils.clamp((t - 17.2) / 2.4, 0, 1) : 0;
    const turn = this.swarmTurn ? THREE.MathUtils.clamp((t - 33.2) / 0.8, 0, 1) : 0;
    const bodies = this.swarm.userData.bodies;
    const eyes = this.swarm.userData.eyes;
    for (let i = 0; i < this.swarmState.length; i++) {
      const s = this.swarmState[i];
      if (s.dead) {
        this._m.makeScale(0, 0, 0);
        bodies.setMatrixAt(i, this._m);
        eyes.setMatrixAt(i, this._m);
        continue;
      }
      // Avant la sortie : au flanc du cuirassé. Après : un mur qui vient vers nous.
      const drift = Math.sin(t * s.speed + s.phase) * 1.6;
      this.tmp.set(
        s.base.x + drift,
        s.base.y + Math.cos(t * s.speed * 0.7 + s.phase) * 1.2,
        s.base.z + out * (58 + (i % 7) * 3.5)
      );
      // Le pivot d'un bloc : l'image la plus menaçante du film.
      const yaw = THREE.MathUtils.lerp(Math.PI / 2, Math.PI, turn) + drift * 0.05;
      this._q.setFromAxisAngle(this.tmp2.set(0, 1, 0), yaw);
      this._m.compose(this.tmp, this._q, this._s);
      bodies.setMatrixAt(i, this._m);
      eyes.setMatrixAt(i, this._m);
    }
    bodies.instanceMatrix.needsUpdate = true;
    eyes.instanceMatrix.needsUpdate = true;
  }

  _updateDebris(_dt) {
    for (let i = 0; i < this.debrisState.length; i++) {
      const d = this.debrisState[i];
      d.rot.x += d.spin * _dt;
      d.rot.y += d.spin * 0.7 * _dt;
      d.p.z += 5 * _dt;
      this._q.setFromEuler(new THREE.Euler(d.rot.x, d.rot.y, d.rot.z));
      this._m.compose(d.p, this._q, this.tmp2.setScalar(d.scale));
      this.debris.setMatrixAt(i, this._m);
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }

  _updateOrso(dt) {
    const t = this.time;
    if (!this.orsoAlive) return;
    if (t < 6) {
      // En formation, il mène : il déchire le cadre bas-gauche → haut-droite.
      const k = THREE.MathUtils.clamp((t - 3) / 1.1, 0, 1);
      this.orso.position.set(-14 + k * 20, -6 + k * 9, 6 - k * 12);
      this.orso.rotation.set(0, Math.PI + 0.2, -0.5 + k * 0.3);
    } else if (t < 22.2) {
      // Il escorte, légèrement en avant du joueur.
      this.orso.position.lerp(
        this.tmp.copy(this.player.group.position).add(this.tmp2.set(-3.6, 0.6, -3.0)),
        Math.min(1, 2.2 * dt)
      );
      this.orso.rotation.set(0, Math.PI, Math.sin(t * 1.4) * 0.12);
    } else if (this.orsoDying) {
      // Vrille à plat, en traînant du feu.
      this.orso.position.x += 3.6 * dt;
      this.orso.position.z -= 7 * dt;
      this.orso.rotation.z += 4.2 * dt;
      this.orso.rotation.y += 1.2 * dt;
      this.fx.trail(this.orso.position, 0xff9f43);
      if (t > 25.0 && this.orsoAlive) {
        this.orsoAlive = false;
        this.orso.visible = false;
        this.fx.explosionBig(this.orso.position, 0xff9f43);
        this.audio.explosionBig();
        this.veils.punch(0.3);
      }
    } else if (this.orsoHit) {
      // Il coupe la trajectoire du tir destiné au joueur.
      this.orso.position.lerp(
        this.tmp.copy(this.player.group.position).add(this.tmp2.set(0, 0, -2.2)),
        Math.min(1, 6 * dt)
      );
      this.orso.rotation.z += 2.4 * dt;
      this.fx.trail(this.orso.position, 0xff9f43);
    }
  }

  _updatePlayerShip(dt) {
    const t = this.time;
    const g = this.player.group;
    if (t < 10) {
      // Vol de croisière, avec du roulis vivant.
      g.position.x = 2.0 + Math.sin(t * 0.9) * 1.6;
      g.position.y = 0.4 + Math.sin(t * 1.3) * 0.4;
      g.position.z = 6.0 - t * 1.2;
      g.rotation.set(0, Math.PI, Math.sin(t * 0.9) * -0.25);
    } else if (t < 27) {
      // Il suit ORSO, puis dérive après la perte.
      g.position.x += Math.sin(t * 0.7) * 0.6 * dt;
      g.position.z -= (t < 23 ? 3.4 : 0.6) * dt;
      g.rotation.z = Math.sin(t * 0.8) * 0.18;
    } else if (this.turning != null && this.turning < 1) {
      // Le demi-tour : la réponse à l'ordre de repli est une manette poussée à fond.
      this.turning = Math.min(1, this.turning + dt / 0.55);
      g.rotation.y = Math.PI + this.turning * Math.PI;
      g.rotation.z = Math.sin(this.turning * Math.PI) * 0.9;
      for (const e of this.player.exhausts) e.scale.setScalar(1 + this.turning * 2.4);
    } else if (t < 36) {
      // La charge : il slalome dans l'épave, vers le cuirassé.
      g.position.x += Math.sin(t * 2.1) * 5.5 * dt;
      g.position.y += Math.sin(t * 1.7) * 1.6 * dt;
      g.position.z -= 26 * dt;
      g.rotation.set(0, 0, Math.sin(t * 2.1) * -0.55);
      this.fx.trail(g.position, 0x4ff2ff);
    } else {
      // Vers l'avant, toujours : le dernier mouvement du film va vers l'ennemi.
      g.position.z -= 18 * dt;
      g.rotation.z *= 0.94;
      this.fx.trail(g.position, 0x4ff2ff);
    }
  }

  _updateLights() {
    const st = this.stage;
    if (!st) return;
    const t = this.time;
    if (st.lights?.hemi) st.lights.hemi.intensity = trackValue(LIGHT_TRACK, t, 'hemi');
    if (st.lights?.mawLight) {
      st.lights.mawLight.intensity = trackValue(LIGHT_TRACK, t, 'maw');
      this.eclipse.userData.maw.getWorldPosition(st.lights.mawLight.position);
    }
    if (st.bloom) st.bloom.strength = trackValue(LIGHT_TRACK, t, 'bloom');
    if (this.scene.fog) this.scene.fog.density = trackValue(LIGHT_TRACK, t, 'fog');
    // L'exposition passe par le renderer, qui n'est pas exposé : on la lit du composer.
    const renderer = st.composer?.renderer;
    if (renderer) renderer.toneMappingExposure = trackValue(LIGHT_TRACK, t, 'exposure');
  }

  _updateCamera(camera) {
    while (this.shotIdx < SHOTS.length - 1 && this.time >= SHOTS[this.shotIdx].t1) this.shotIdx++;
    const shot = SHOTS[this.shotIdx];
    const ctx = {
      aspect: camera.aspect,
      player: { position: this.player.group.position },
      tmp: this.tmp,
      tmp2: this.tmp2,
      eyeWorld: this.eyeWorld,
    };
    const r = evaluateShot(shot, this.time, ctx);
    this._pos.copy(r.pos);
    this._look.copy(r.look);

    // Caméra à l'épaule : petite dérive irrégulière, on est dans le cockpit d'à côté.
    if (shot.handheld) {
      const t = this.time;
      this._pos.x += Math.sin(t * 11.3) * shot.handheld;
      this._pos.y += Math.sin(t * 7.7 + 1.3) * shot.handheld * 0.8;
    }

    // Raccord final : on plie sur la pose de jeu, vitesse nulle à l'arrivée.
    if (this.handoff && this.time > 40) {
      const k = THREE.MathUtils.clamp((this.time - 40) / 2, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const home = this.stage?.cameraHome;
      const target = this.stage?.cameraTarget;
      if (home && target) {
        this._pos.lerp(home, e);
        this._look.lerp(target, e);
      }
    }

    return { pos: this._pos, look: this._look, roll: r.roll, fov: r.fov };
  }

  // ------------------------------------------------------------------ Sortie

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
    this.turning = null;
    this.eclipseEntering = false;
    this.mawOpen = false;
    this.swarmOut = false;
    this.swarmTurn = false;
    this.orsoHit = false;
    this.orsoDying = false;

    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh) {
          o.geometry?.dispose?.();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
          else m?.dispose?.();
        }
      });
      this.root = null;
    }
    if (this.veils) {
      this.veils.dispose();
      this.veils = null;
    }
    if (this.dom) {
      this.dom.remove();
      this.dom = null;
    }
    this.characters?.hide();

    // Remise en état du décor de jeu.
    const st = this.stage;
    if (st) {
      if (st.lights?.hemi) st.lights.hemi.intensity = 1.1;
      if (st.lights?.mawLight) st.lights.mawLight.intensity = 0;
      if (st.bloom) st.bloom.strength = 0.95;
      if (st.composer?.renderer) st.composer.renderer.toneMappingExposure = 1.15;
      st.fitCamera?.();
    }
    if (this.scene.fog) this.scene.fog.density = 0.0075;

    if (this.player) {
      this.player.showHitMarkers(true);
      this.player.group.visible = true;
      this.player.group.rotation.set(0, 0, 0);
      this.player.group.position.set(0, 0, ARENA.playerZ);
      for (const e of this.player.exhausts) e.scale.setScalar(1);
    }
  }
}
