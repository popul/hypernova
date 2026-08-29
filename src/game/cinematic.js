// Le lecteur de cinématiques : il exécute des PARTITIONS (cine/sequences.js),
// il n'en connaît aucune. Plans, répliques et temps forts sont des données ;
// ici ne vivent que les capacités — caméra, lumière, voiles, gestes.
//
// La règle qui a coûté le plus cher à apprendre : AUCUN instant absolu dans ce
// fichier. L'ancienne intro durait 52 s et ses horloges (vaisseau visible à
// t ≥ 37,5, envol à 46, couture scellée à 18,4, mondes de 19,5 à 30) avaient
// survécu à son remontage : l'intro de 18 s filmait un vaisseau invisible et le
// scellement de « fuite » n'avait aucun effet visible. Chaque geste est donc
// daté du moment où son beat le déclenche, jamais d'une seconde en dur.
//
// Choix de fond : les décors viennent de space/landmarks.js, ceux du JEU. ANDEL de
// la cinématique est le KORN que le joueur affrontera, l'épave est celle qu'il
// remontera. Un prologue qui présente des formes qu'on ne reverra jamais ne
// présente rien.

import * as THREE from 'three';
import { evaluateShot, Veils } from './cine/stagecraft.js';
import { ARENA } from './constants.js';
import { createKorn, createHulk, createPlanet, createSun } from './space/landmarks.js';
import {
  createDyingStar,
  createRiver,
  createFleeingFleet,
  createTornWorlds,
} from './cine/elide.js';
import { INTRO, souvenirPourPalier } from './cine/sequences.js';

const ANDEL_POS = new THREE.Vector3(0, -4, -150);
const STAR_POS = new THREE.Vector3(-120, 30, -260);
// L'ÉCHELLE DE LA TERRE, ET POURQUOI ELLE EST SI GRANDE.
//
// L'épave fait QUATRE-VINGT-NEUF UNITÉS de long. Avec une Terre de rayon 40, elle
// était donc plus longue que la planète n'est large : une station de la taille
// d'un continent, et l'œil le voit immédiatement même sans savoir le nommer.
//
// On ne peut pas rétrécir l'épave : les plans sont écrits autour d'elle, en
// coordonnées du monde, et une épave deux fois plus petite laisserait la caméra
// cadrer du vide. C'est donc la planète qui grandit — et qui s'éloigne d'autant,
// pour que la caméra reste dehors.
//
// Ce qui change à l'image n'est pas sa taille mais sa COURBURE. À 40 unités de
// rayon vue de 145, on voyait un disque entier : la lecture est « une bille au
// loin », et tout ce qui passe devant est énorme. À 420 vue de 440, son bord
// traverse le cadre en arc doux — la lecture devient « on est en orbite basse »,
// et l'épave redevient un objet posé devant. Le rapport passe de 1,1 à 0,11.
//
// LA BORNE HAUTE, TROUVÉE EN LA DÉPASSANT. À 420 de rayon posée à −430, la
// surface remonte jusqu'à z = −10 et la caméra, qui descend jusqu'à −6, entrait
// DEDANS : plus d'épave, plus d'espace, un mur bleu. La contrainte s'écrit en
// une ligne — la surface doit rester derrière l'épave, donc `pos.z + rayon` doit
// rester bien en deçà de −130.
const EARTH_RADIUS = 110;
const EARTH_POS = new THREE.Vector3(0, -40, -240);

// La lumière raconte autant que la caméra. Elle est indexée sur l'AVANCEMENT de la
// séquence (0 à 1), pas sur des secondes absolues : un souvenir de dix secondes et
// une introduction de dix-huit partagent ainsi la même courbe.
const LIGHT_TRACK = [
  {
    t: 0,
    hemi: 0.5,
    sky: 0x9fc4ff,
    ground: 0x11203a,
    exposure: 1.15,
    bloom: 0.9,
    fog: 0.005,
    seam: 60,
  },
  {
    t: 0.5,
    hemi: 0.6,
    sky: 0x8fb8ff,
    ground: 0x101c30,
    exposure: 1.18,
    bloom: 1.0,
    fog: 0.006,
    seam: 120,
  },
  {
    t: 1,
    hemi: 0.9,
    sky: 0x8fd4ff,
    ground: 0x142038,
    exposure: 1.22,
    bloom: 0.95,
    fog: 0.005,
    seam: 40,
  },
];

// Interpole une piste de valeurs clés (lumière, exposition, bloom) à l'instant t.
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

  // Joue une séquence : l'introduction, ou l'un des souvenirs des paliers.
  play(onEnd, { handoff = false, pilotName = 'VEILLE-3', sequence = INTRO } = {}) {
    this.stop();
    this.active = true;
    this.onEnd = onEnd;
    this.handoff = handoff;
    this.pilot = pilotName;
    this.time = 0;
    this.shotIdx = 0;
    this.seq = sequence;
    this.duration = sequence.duration;

    // Tout le décor vit dans un seul groupe : le nettoyage est alors trivial.
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this._buildStage();
    this._buildDom();
    this._buildTimeline();

    const v = this.seq.show || {};
    this.player.group.visible = !!v.ship;
    this.player.group.position.set(2.0, 0.4, 6.0);
    this.player.group.rotation.set(0, Math.PI, 0);
  }
  _buildStage() {
    const add = (o) => {
      this.root.add(o.group);
      return o;
    };

    // ANDEL. C'est littéralement le KORN du jeu : même objet, même couture scellée.
    this.andel = add(createKorn());
    this.andel.group.position.copy(ANDEL_POS);
    this.andel.group.rotation.set(0, 0.1, 0);
    this.andel.group.scale.setScalar(0.9);

    this.star = add(createDyingStar());
    this.star.group.position.copy(STAR_POS);

    this.river = add(createRiver(900));
    this.river.group.position.set(-24, -2, -148);

    this.fleet = add(createFleeingFleet(14));
    this.fleet.group.position.set(16, 4, -104);

    this.worlds = add(createTornWorlds(7));
    this.worlds.setProgress(0);
    this.worlds.group.visible = false;

    // Le décor de l'acte III vient du jeu, sans exception.
    // Le Soleil était posé à −150 : dans le volume de la nouvelle Terre, donc
    // devant elle. Il part loin derrière, avec un diamètre agrandi d'autant pour
    // garder exactement le même disque à l'écran.
    this.sun = add(createSun());
    this.sun.setSize(23);
    this.sun.group.position.set(0, 170, -880);
    this.sun.group.visible = false;

    // Quatre fois la résolution habituelle : à ce rayon-là, les lumières de ville
    // d'une texture standard font deux unités de côté et se lisent comme des
    // débris. C'est le seul endroit du jeu où l'on voit une planète d'aussi près.
    this.earth = add(
      createPlanet({
        kind: 'earth',
        radius: EARTH_RADIUS,
        pos: EARTH_POS.toArray(),
        detail: 4,
      })
    );
    this.earth.group.visible = false;

    this.wreck = add(createHulk({ variant: 'torn', pos: [-14, -14, -84], scale: 1.5 }));
    this.wreck.group.visible = false;

    this.relay = add(createHulk({ variant: 'relay', pos: [22, -6, -60], scale: 0.5 }));
    this.relay.group.visible = false;

    this.starfield = this._buildStars();
    this.root.add(this.starfield);

    // Une séquence déclare ce qu'elle montre. Tout le reste est masqué : c'est
    // ce qui permet de rejouer le même décor sous des angles différents sans
    // reconstruire une scène par souvenir.
    const v = this.seq.show || {};
    this.andel.group.visible = !!v.andel;
    this.star.group.visible = !!v.star;
    this.river.group.visible = !!v.river;
    this.fleet.group.visible = !!v.fleet;
    this.worlds.group.visible = !!v.worlds;
    this.sun.group.visible = !!v.sun;
    this.earth.group.visible = !!v.earth;
    this.wreck.group.visible = !!v.wreck;
    this.relay.group.visible = !!v.relay;
  }

  // LES ÉTOILES SONT DERRIÈRE LA TERRE, PAS DEDANS.
  //
  // Elles vivaient sur une coquille de 200 à 360 unités, ce qui allait tant que
  // la planète tenait dans 40 de rayon à 130. Une Terre de 110 posée à −240
  // occupe l'espace de −130 à −350 : la moitié des étoiles se retrouvait DEVANT
  // elle, en pastilles crème sur les continents. On repousse la coquille
  // au-delà, et la taille des points suit la distance pour qu'elles gardent le
  // même calibre à l'écran.
  _buildStars() {
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 620 + Math.random() * 380;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r * 0.5;
      pos[i * 3 + 2] = Math.cos(ph) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 2.7,
        color: 0xcfe0ff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    pts.frustumCulled = false;
    return pts;
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
    // La balise des partitions est {PILOTE}, comme partout dans characters.js —
    // l'ancien remplacement ne connaissait que {PSEUDO}, et la réplique du
    // fleuve affichait littéralement « {PILOTE} » à l'écran.
    this.characters?.sayText(line.replace('{PILOTE}', this.pilot), { speaker, priority: true });
  }
  // La timeline se DÉDUIT de la séquence : répliques et temps forts déclarés en
  // données, jamais en code. C'est ce qui permet d'ajouter un souvenir sans
  // toucher au lecteur. Chaque geste reçoit son beat entier : un carton porte
  // son texte et sa tenue en données, pas en dur ici.
  _buildTimeline() {
    const A = this.audio;
    const gestes = {
      padDark: () => A.cinePad('dark', 7),
      padHope: () => A.cinePad('hope', 7),
      padTension: () => A.cinePad('tension', 7),
      riser: () => A.cineRiser(2.4),
      impact: () => {
        A.cineImpact();
        this.fx.addShake(0.8);
      },
      punch: () => this.veils.punch(0.25),
      starDie: () => A.cineStarDie(),
      hero: () => A.cineHero(),
      title: () => this._titleCard(),
      seal: () => this._seal(),
      carton: (b) => this._carton(b),
      // L'envol du vaisseau : un instant de la séquence, plus une horloge du
      // lecteur (il était câblé à t ≥ 46 s, vestige de l'intro de 52 s).
      depart: () => {
        this.departAt = this.time;
      },
      fleetGo: () => this.fleet.launch(),
      // Le fleuve se tarit sur ~1 s : la dernière lumière entre, la fente
      // reste seule. L'image ponctue la phrase qui vient d'être dite.
      fleuveTarit: () => {
        this.riverDryAt = this.time;
      },
    };
    this.events = [
      ...(this.seq.lines || []).map((l) => ({ t: l.t, fn: () => this._say(l.who, l.text) })),
      ...(this.seq.beats || []).map((b) => ({ t: b.t, fn: () => (gestes[b.do] || (() => {}))(b) })),
    ].sort((a, b) => a.t - b.t);
    this.eventIdx = 0;
  }

  // Joue le souvenir attaché à un palier, s'il en existe un. Renvoie false sinon,
  // pour que l'appelant enchaîne sans attendre.
  playSouvenir(palier, onEnd) {
    const seq = souvenirPourPalier(palier);
    if (!seq) return false;
    this.play(onEnd, { handoff: true, sequence: seq });
    return true;
  }

  // ------------------------------------------------------------ Gestes

  // La couture se ferme. C'est LE geste du récit : à partir de là, il ne peut plus
  // s'ouvrir. On le marque d'un choc et d'un éclair bref — surtout pas d'une
  // explosion, il ne se passe rien de spectaculaire, c'est bien le problème.
  _seal() {
    // On date le geste : l'animation de la couture et du fleuve se réfère à
    // CET instant, pas à un « t − 18,4 » figé sur l'ancien montage — sinon un
    // seal joué à 9,6 s n'avait aucun effet visible pendant neuf secondes.
    this.sealedAt = this.time;
    this.audio.cineImpact();
    this.fx.addShake(0.7);
    this.veils.punch(0.35);
  }

  // Le carton factuel : les chiffres se LISENT au lieu d'être prononcés.
  // « 39 partis. 0 revenu. » tenu 4,8 s fait 4,2 caractères par seconde, trois
  // fois sous le plafond de lecture — aucune voix ne va aussi lentement.
  // Texte et tenue viennent du beat : le lecteur n'écrit rien en dur.
  _carton({ text = '', hold = 4.8 } = {}) {
    const el = document.createElement('div');
    el.className = 'cine-carton';
    el.textContent = text;
    this.dom.appendChild(el);
    // Reflux forcé, sinon la transition d'opacité ne part pas (même astuce que
    // l'allumage du panneau de comm dans characters.js).
    void el.offsetWidth;
    el.classList.add('visible');
    // LA TENUE SE COMPTE EN TEMPS DE SÉQUENCE, PAS EN TEMPS D'HORLOGE.
    //
    // Un setTimeout la comptait en secondes murales, alors que toute la
    // cinématique — plans, répliques, lumière — avance sur `this.time`. Les deux
    // dérivent dès que l'appareil ralentit : sur un téléphone qui tombe à trente
    // images par seconde, le carton s'effaçait pendant que la séquence, elle,
    // n'avait pas fini son plan. C'est la même famille de défauts que les
    // horloges absolues qu'on vient de sortir du lecteur — celle-ci était née
    // dans le correctif.
    this._cartons ||= [];
    this._cartons.push({ el, fin: this.time + hold });
  }

  // La carte de titre porte la phrase du récit, pas un slogan.
  _titleCard() {
    const card = this.dom.querySelector('#cine-card');
    if (card) card.classList.add('visible');
    const tag = this.dom.querySelector('#cine-card-tag');
    if (tag) tag.textContent = 'Remonte la traînée. Rapporte la clé.';
    this.audio.cineHero();
  }

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
    // Les cartons expirent sur l'horloge de la séquence, comme tout le reste.
    if (this._cartons) {
      for (const c of this._cartons) if (this.time >= c.fin) c.el.classList.remove('visible');
      this._cartons = this._cartons.filter((c) => this.time < c.fin);
    }

    if (this.time >= this.duration) {
      this._finish();
      return null;
    }
    return this._updateCamera(camera);
  }
  _updateActors(dt) {
    const t = this.time;

    // L'étoile gonfle sur l'AVANCEMENT de la séquence, pas sur des secondes
    // absolues : c'est le compte à rebours, et il doit aller au bout aussi bien
    // dans un souvenir de douze secondes que dans une intro de trente.
    const swell = 1 + THREE.MathUtils.clamp(t / Math.max(1, this.duration), 0, 1) * 0.75;
    this.star.setSwell(swell);
    this.star.update(dt);

    // Le fleuve coule, puis se tarit : d'un coup au scellement de la couture,
    // ou en ~1 s sur le beat fleuveTarit — dans les deux cas daté du GESTE,
    // jamais d'une seconde absolue de l'ancien montage.
    let flow = 1;
    if (this.sealedAt != null) flow = Math.max(0, 1 - (t - this.sealedAt) * 3);
    else if (this.riverDryAt != null) flow = Math.max(0, 1 - (t - this.riverDryAt));
    this.river.setFlow(flow);
    this.river.update(dt);
    this.fleet.update(dt);

    // ANDEL respire, et sa couture se referme sur le geste central du film.
    this.andel.update(dt);
    if (this.sealedAt != null) {
      const k = THREE.MathUtils.clamp((t - this.sealedAt) / 1.1, 0, 1);
      this.andel.group.traverse((o) => {
        if (o.material && o.material.color && o.material.blending === THREE.AdditiveBlending) {
          o.material.opacity = Math.max(0.06, (o.material.opacity ?? 1) * (1 - k * 0.06));
        }
      });
    }

    // Les mondes déchirés n'existent que si la séquence les déclare : la plage
    // 19,5–30 s venait de l'ancienne intro de 52 s, et toute séquence plus
    // longue que 19,5 s voyait surgir des planètes à cœur orange dans ses plans.
    if (this.seq.show?.worlds) {
      this.worlds.group.visible = true;
      this.worlds.setProgress(THREE.MathUtils.clamp(t / Math.max(1, this.duration), 0, 1));
    }

    // ACTE III — le décor du jeu.
    if (this.sun.group.visible) {
      this.sun.update(dt);
      this.earth.update(dt);
      this.wreck.update(dt);
      this.relay.update(dt);
    }

    // KORN entre par le fond et grandit : on ne le fait jamais bouger vite, c'est
    // sa lenteur qui donne sa masse.
    if (this.kornHere) {
      const k = THREE.MathUtils.clamp((t - 42) / 4, 0, 1);
      this.andel.group.position.set(0, -4 - k * 8, -150 + k * 52);
      this.andel.group.scale.setScalar(0.9 + k * 0.35);
    }

    // Le vaisseau du joueur suit show.ship, et part sur le beat depart. Les
    // anciens seuils (visible à t ≥ 37,5, envol à t ≥ 46) dataient de l'intro
    // de 52 s : toute intro plus courte filmait un vaisseau INVISIBLE.
    const p = this.player.group;
    if (this.departAt == null) {
      p.visible = !!this.seq.show?.ship;
      p.position.set(2.0, 0.4, 6.0);
      p.rotation.set(0, Math.PI, 0);
    } else {
      const k = THREE.MathUtils.clamp((t - this.departAt) / 2.5, 0, 1);
      p.visible = true;
      p.rotation.set(-0.2 * k, Math.PI, 0);
      p.position.set(2.0, 0.4 + k * 3, 6.0 - k * 40);
    }

    this.starfield.rotation.y += dt * 0.004;
  }

  _updateLights() {
    const st = this.stage;
    if (!st) return;
    const t = this.duration ? this.time / this.duration : 0;
    if (st.lights?.hemi) st.lights.hemi.intensity = trackValue(LIGHT_TRACK, t, 'hemi');
    // La lampe ponctuelle suit la COUTURE d'ANDEL : c'est la seule source chaude
    // du récit, et elle doit éclairer ce qui l'entoure pour qu'on sente qu'il y a
    // quelque chose de vivant à l'intérieur.
    if (st.lights?.mawLight) {
      st.lights.mawLight.intensity = trackValue(LIGHT_TRACK, t, 'seam');
      const a = this.andel.group;
      st.lights.mawLight.position.set(a.position.x, a.position.y + 30 * a.scale.x, a.position.z);
    }
    if (st.bloom) st.bloom.strength = trackValue(LIGHT_TRACK, t, 'bloom');
    if (this.scene.fog) this.scene.fog.density = trackValue(LIGHT_TRACK, t, 'fog');
    // L'exposition passe par le renderer, qui n'est pas exposé : on la lit du composer.
    const renderer = st.composer?.renderer;
    if (renderer) renderer.toneMappingExposure = trackValue(LIGHT_TRACK, t, 'exposure');
  }

  _updateCamera(camera) {
    const shots = this.seq.shots;
    while (this.shotIdx < shots.length - 1 && this.time >= shots[this.shotIdx].t1) this.shotIdx++;
    const shot = shots[this.shotIdx];
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
    const raccord = this.duration - 2.4;
    if (this.handoff && this.time > raccord) {
      const k = THREE.MathUtils.clamp((this.time - raccord) / 2.4, 0, 1);
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
    this._cartons = [];
    this.turning = null;
    this.sealedAt = null;
    this.departAt = null;
    this.riverDryAt = null;
    this.kornHere = false;

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
