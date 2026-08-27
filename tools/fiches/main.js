// LES TROIS COQUES, EN VRAI.
//
// Une fiche qui décrit une arme ne dit rien de ce qu'elle fait. « Rayon continu
// sur toute la colonne » et « charges lentes qui explosent en sphère » sont deux
// phrases ; ce sont surtout deux façons de jouer qu'on ne comprend qu'en les
// voyant tirer.
//
// Cette page fait donc tourner le VRAI code du jeu : les mêmes vaisseaux, les
// mêmes armes, les mêmes effets. Ce n'est pas une vidéo ni une reconstitution —
// c'est le moteur, avec juste assez de jeu autour pour que les armes aient
// quelque chose à viser.

import * as THREE from 'three';
import { createPlayerShip, createEnemyShip } from '../../src/game/ships.js';
import { Fx } from '../../src/game/fx.js';
import { PlayerBullets, Missiles } from '../../src/game/bullets.js';
import { ArmeHelios } from '../../src/game/armes/helios.js';
import { ArmeVulcain } from '../../src/game/armes/vulcain.js';
import { COQUES, ENEMY_TYPES, PLAYER } from '../../src/game/constants.js';
import { semer } from '../../src/core/rng.js';

semer(20260826);

// Ce que la fiche du jeu ne dit pas : ce qu'on a mesuré, et ce qu'il faut
// regarder pendant que ça tire.
const DOSSIER = {
  orion: {
    regarde:
      'Le flux part droit et les missiles cherchent tout seuls. Rien à apprendre : c’est la coque avec laquelle on découvre le jeu.',
    jauge: 'FRÔLEMENT',
    jaugeQuoi:
      'Passer au plus près d’une balle sans la toucher remplit la jauge. Elle pousse vers le danger au lieu de le fuir.',
    chiffres: [
      ['Vague 3', '11,9 s'],
      ['Vague 7', '18,4 s'],
      ['Boss', '20,6 s'],
      ['À l’arrêt', '17,6 s'],
    ],
  },
  helios: {
    regarde:
      'Le rayon traverse toute la colonne et ne rate jamais. Regarde la largeur enfler quand il tient sa cible — puis l’émetteur décroche : c’est la surchauffe.',
    jauge: 'CHAUFFE',
    jaugeQuoi:
      'Tant que le rayon touche quelque chose, la chauffe monte, de plus en plus vite. Brasser le vide trois dixièmes de seconde et tout retombe.',
    chiffres: [
      ['Vague 3', '8,1 s'],
      ['Vague 7', '14,2 s'],
      ['Boss', '10,8 s'],
      ['À l’arrêt', '18,0 s'],
    ],
  },
  vulcain: {
    regarde:
      'Les charges montent lentement et n’explosent qu’arrivées à hauteur. Le souffle a le rayon exact de la sphère dessinée — ce qui est dedans meurt, ce qui est dehors ne sent rien.',
    jauge: 'SALVE',
    jaugeQuoi:
      'Un seul ennemi pris dans le souffle ne rapporte rien. Deux en rapportent, cinq beaucoup. Elle enseigne à ne pas tirer tout de suite.',
    chiffres: [
      ['Vague 3', '15,1 s'],
      ['Vague 7', '17,8 s'],
      ['Boss', '18,1 s'],
      ['À l’arrêt', '17,7 s'],
    ],
  },
};

// ---- La scène -------------------------------------------------------------

const hote = document.getElementById('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040f);
scene.fog = new THREE.FogExp2(0x05040f, 0.0075);

const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 900);
const CIBLE_CAM = new THREE.Vector3(0, 0, -3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
hote.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x11203a, 1.3));
const soleil = new THREE.DirectionalLight(0xfff0d8, 1.1);
soleil.position.set(-6, 12, 4);
scene.add(soleil);

// Un fond d'étoiles, pour que le vide ne soit pas un aplat noir.
{
  const n = 500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 260;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 120 - 10;
    pos[i * 3 + 2] = -Math.random() * 220 - 20;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xcfe4ff,
        size: 0.55,
        sizeAttenuation: true,
        opacity: 0.62,
        transparent: true,
      })
    )
  );
}

function cadre() {
  const l = hote.clientWidth || 1;
  const h = hote.clientHeight || 1;
  const aspect = l / h;
  camera.aspect = aspect;
  const serre = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  camera.fov = Math.min(72, 56 * Math.pow(serre, 0.4));
  const recul = Math.min(1.85, serre) * (aspect < 0.8 ? 0.78 : 1);
  // Plus près que dans le jeu, et volontairement : une partie a besoin de voir
  // arriver les ennemis, une vitrine a besoin qu'on VOIE l'arme. À la distance de
  // jeu, le vaisseau fait quarante pixels de haut et le rayon d'HÉLIOS un trait.
  camera.position.set(0, 15.5, 19).sub(CIBLE_CAM).multiplyScalar(recul).add(CIBLE_CAM);
  camera.lookAt(CIBLE_CAM);
  camera.updateProjectionMatrix();
  renderer.setSize(l, h, false);
}

// ---- Les cibles -----------------------------------------------------------
//
// Les armes ont besoin d'ennemis pour exister : un laser qui ne touche rien ne
// se voit pas, et une charge de VULCAIN ne part même pas sous un ciel vide.
// Trois rangs qui descendent doucement et se reforment en haut, sans jamais
// tirer : ici on regarde une arme, on ne se défend pas.

const cibles = [];
// Serrés, et près : entre le vaisseau et une formation à trente unités, il n'y a
// que du vide à regarder — or c'est précisément là que l'arme travaille.
const RANGS = [
  { type: 'drone', z: -19, n: 7 },
  { type: 'wasp', z: -15, n: 6 },
  { type: 'brute', z: -11, n: 4 },
];

function poseCibles() {
  for (const r of RANGS) {
    for (let i = 0; i < r.n; i++) {
      const mesh = createEnemyShip(r.type);
      const def = ENEMY_TYPES[r.type] || ENEMY_TYPES.drone;
      const groupe = new THREE.Group();
      groupe.add(mesh);
      groupe.position.set((i - (r.n - 1) / 2) * 2.35, 0, r.z);
      scene.add(groupe);
      cibles.push({
        group: groupe,
        alive: true,
        hp: def.hp,
        hpMax: def.hp,
        def,
        type: r.type,
        base: groupe.position.clone(),
        phase: i * 0.7,
      });
    }
  }
}
poseCibles();

// Une cible abattue revient : la démonstration ne doit jamais s'arrêter faute de
// quoi tirer. Elle repart du fond, en fondu, pour qu'on ne la voie pas surgir.
function ressuscite(c) {
  c.alive = true;
  c.hp = c.hpMax;
  c.group.visible = true;
  c.group.position.copy(c.base).setZ(c.base.z - 14);
  c.group.scale.setScalar(0.01);
}

// ---- Le faux jeu ----------------------------------------------------------
//
// Les armes attendent un `game`. Elles n'en utilisent qu'une poignée de membres,
// et les voici — c'est la seule pièce écrite pour cette page, tout le reste est
// le code du jeu tel quel.

const fx = new Fx(scene);
const balles = new PlayerBullets(scene);
const missiles = new Missiles(scene, fx);

const vaisseau = { position: new THREE.Vector3(0, 0, 8) };

const faux = {
  player: vaisseau,
  fx,
  levels: { cannons: 1, firerate: 1, engine: 0, missiles: 1 },
  stats: { fireRate: PLAYER.baseFireRate, streams: 2 },
  cmd: { tir: true },
  audio: null,
  hud: null,
  enemies: {
    list: cibles,
    damage(e, degats) {
      e.hp -= degats;
      if (e.hp > 0) return false;
      e.alive = false;
      e.group.visible = false;
      e.mort = 0;
      return true;
    },
  },
  _onEnemyKilled(e) {
    fx.burst(e.group.position, 0xff7bd5, { count: 12, speed: 9, life: 0.45 });
  },
  _addEnergy() {},
};

const armes = { helios: new ArmeHelios(scene), vulcain: new ArmeVulcain(scene) };

// ---- La coque affichée ----------------------------------------------------

let coque = 'orion';
let modele = null;
let horloge = 0;
let tirTimer = 0;
let missileTimer = 0;

function montre(id) {
  coque = id;
  if (modele) scene.remove(modele);
  const c = COQUES.find((x) => x.id === id) || COQUES[0];
  modele = createPlayerShip({ carene: c.carene, livree: 'nova', tier: 1, levels: faux.levels });
  modele.position.copy(vaisseau.position);
  scene.add(modele);
  // On repart propre : une charge de VULCAIN encore en vol pendant qu'on regarde
  // HÉLIOS n'aurait aucun sens.
  for (const a of Object.values(armes)) a.clear();
  balles.clear?.();
  missiles.clear?.();
  for (const c2 of cibles) if (!c2.alive) ressuscite(c2);
  peins();
}

// ---- La boucle ------------------------------------------------------------

let dernier = performance.now();

function boucle(maintenant) {
  requestAnimationFrame(boucle);
  const dt = Math.min(0.05, (maintenant - dernier) / 1000);
  dernier = maintenant;
  horloge += dt;

  // Le vaisseau balaie lentement : c'est ce mouvement qui fait exister le rayon
  // d'HÉLIOS, qui suit sa colonne, et qui montre le placement de VULCAIN.
  vaisseau.position.x = Math.sin(horloge * 0.42) * 6.5;
  if (modele) {
    modele.position.copy(vaisseau.position);
    modele.rotation.z = -Math.cos(horloge * 0.42) * 0.16;
  }

  for (const c of cibles) {
    if (!c.alive) {
      c.mort = (c.mort ?? 0) + dt;
      if (c.mort > 1.6) ressuscite(c);
      continue;
    }
    // Elles descendent, oscillent, et repartent du fond une fois passées.
    c.group.position.z += dt * 1.1;
    c.group.position.x = c.base.x + Math.sin(horloge * 0.8 + c.phase) * 1.1;
    if (c.group.scale.x < 1) c.group.scale.setScalar(Math.min(1, c.group.scale.x + dt * 2));
    if (c.group.position.z > 3) c.group.position.copy(c.base).setZ(c.base.z - 9);
    c.group.rotation.y += dt * 0.4;
  }

  if (coque === 'orion') {
    tirTimer -= dt;
    if (tirTimer <= 0) {
      tirTimer = 1 / (faux.stats.fireRate * 1.15);
      const p = vaisseau.position;
      for (const dx of [-0.5, 0.5])
        balles.spawn(
          new THREE.Vector3(p.x + dx, 0, p.z - 1.2),
          new THREE.Vector3(0, 0, -PLAYER.bulletSpeed)
        );
      fx.burst(new THREE.Vector3(p.x, 0, p.z - 1.6), 0x8ffbff, { count: 2, speed: 3, life: 0.15 });
    }
    missileTimer -= dt;
    if (missileTimer <= 0) {
      missileTimer = 1.4;
      const vise = cibles.filter((c) => c.alive);
      if (vise.length) missiles.launch(vaisseau.position, vise[(Math.random() * vise.length) | 0]);
    }
  } else {
    armes[coque].update(dt, faux);
  }

  balles.update(dt);
  missiles.update(dt);
  // Les balles n'ont pas de collision ici : on les teste à la main, comme le jeu
  // le fait de son côté.
  balles.forEachActive?.((b) => {
    for (const c of cibles) {
      if (!c.alive) continue;
      if (b.mesh.position.distanceTo(c.group.position) < c.def.radius + 0.4) {
        if (faux.enemies.damage(c, 1)) faux._onEnemyKilled(c);
        else fx.burst(b.mesh.position, 0x8ffbff, { count: 4, speed: 5, life: 0.2 });
        balles.kill(b);
        break;
      }
    }
  });
  missiles.forEachActive?.((m) => {
    for (const c of cibles) {
      if (!c.alive) continue;
      if (m.mesh.position.distanceTo(c.group.position) < c.def.radius + 0.5) {
        if (faux.enemies.damage(c, 2)) faux._onEnemyKilled(c);
        fx.burst(m.mesh.position, 0xffc857, { count: 8, speed: 7, life: 0.3 });
        missiles.kill(m);
        break;
      }
    }
  });

  // Fx compte en temps RÉEL : c'est lui qui pilote le ralenti, il ne peut donc
  // pas recevoir un temps déjà ralenti.
  fx.tick(dt);
  renderer.render(scene, camera);
}

// ---- L'interface ----------------------------------------------------------

const el = (t, cls, txt) => {
  const n = document.createElement(t);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

function peins() {
  const c = COQUES.find((x) => x.id === coque) || COQUES[0];
  const d = DOSSIER[c.id] || {};
  const i = COQUES.indexOf(c);

  document.querySelectorAll('.onglet').forEach((b, k) => b.classList.toggle('actif', k === i));

  const nom = document.getElementById('nom');
  nom.textContent = c.nom;
  nom.classList.remove('entre');
  void nom.offsetWidth;
  nom.classList.add('entre');

  document.getElementById('titre').textContent = c.titre;
  document.getElementById('phrase').textContent = c.phrase;
  document.getElementById('arme').textContent = c.arme;
  document.getElementById('regarde').textContent = d.regarde || '';
  document.getElementById('jauge-nom').textContent = d.jauge || '';
  document.getElementById('jauge-quoi').textContent = d.jaugeQuoi || '';

  const ch = document.getElementById('chiffres');
  ch.innerHTML = '';
  for (const [k, v] of d.chiffres || []) {
    const bloc = el('div', 'chiffre');
    bloc.append(el('dt', null, k), el('dd', null, v));
    ch.appendChild(bloc);
  }
}

function construisOnglets() {
  const barre = document.getElementById('onglets');
  COQUES.forEach((c, i) => {
    const b = el('button', 'onglet');
    b.append(el('span', 'onglet-num', String(i + 1)), el('span', 'onglet-nom', c.nom));
    b.addEventListener('click', () => montre(c.id));
    barre.appendChild(b);
  });
}

construisOnglets();
cadre();
montre('orion');
requestAnimationFrame(boucle);

window.addEventListener('resize', cadre);
window.addEventListener('keydown', (e) => {
  const i = '123'.indexOf(e.key);
  if (i >= 0 && COQUES[i]) return montre(COQUES[i].id);
  const j = COQUES.findIndex((c) => c.id === coque);
  if (e.key === 'ArrowRight') montre(COQUES[(j + 1) % COQUES.length].id);
  else if (e.key === 'ArrowLeft') montre(COQUES[(j + COQUES.length - 1) % COQUES.length].id);
});

// Le glissé, pour le téléphone.
let x0 = null;
hote.addEventListener('pointerdown', (e) => (x0 = e.clientX));
hote.addEventListener('pointerup', (e) => {
  if (x0 === null) return;
  const d = e.clientX - x0;
  x0 = null;
  if (Math.abs(d) < 40) return;
  const j = COQUES.findIndex((c) => c.id === coque);
  montre(COQUES[(j + (d < 0 ? 1 : COQUES.length - 1)) % COQUES.length].id);
});
