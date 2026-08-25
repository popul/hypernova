// Point d'entrée : renderer, caméra, lumières, post-processing (bloom), boucle de rendu.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input, isTouchDevice } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Starfield } from './game/starfield.js';
import { Fx } from './game/fx.js';
import { Game } from './game/game.js';
import './style.css';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040f);
scene.fog = new THREE.FogExp2(0x05040f, 0.0075);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 300);
const CAMERA_HOME = new THREE.Vector3(0, 21, 27);
const CAMERA_TARGET = new THREE.Vector3(0, 0, -3);
const CAMERA_BASE = CAMERA_HOME.clone();

// En portrait (mobile), l'aire de jeu (±14.5 en x) sortirait du champ : on élargit le FOV
// et on recule la caméra le long de son axe pour garder toute la formation visible.
function fitCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  const squeeze = Math.max(1, Math.pow(1.78 / aspect, 0.55));
  camera.fov = Math.min(72, 56 * Math.pow(squeeze, 0.4));
  const pullback = Math.min(1.85, squeeze);
  CAMERA_BASE.copy(CAMERA_HOME).sub(CAMERA_TARGET).multiplyScalar(pullback).add(CAMERA_TARGET);
  camera.position.copy(CAMERA_BASE);
  camera.lookAt(CAMERA_TARGET);
  camera.updateProjectionMatrix();
}
fitCamera();

const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x1a0b2e, 1.1);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(6, 14, 8);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x4ff2ff, 0.7);
rimLight.position.set(-8, 6, -10);
scene.add(rimLight);
// Lumière de la gueule du cuirassé, pré-créée éteinte : l'ajouter à chaud
// recompilerait tous les matériaux de la scène, avec un à-coup garanti pile
// sur le plan le plus dramatique.
const mawLight = new THREE.PointLight(0xffd0a0, 0, 220, 1.4);
mawLight.position.set(0, 0, -100);
scene.add(mawLight);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Bloom en demi-résolution : invisible à ces rayons, et c'est le poste le plus
// coûteux du budget mobile (le goulot est le fill rate, pas les triangles).
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
  0.95, // intensité
  0.55, // rayon
  0.55 // seuil
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const MAX_DPR = 2;
const CINE_DPR = 1.5; // ~40 % du coût fragment récupéré pendant la cinématique
export function setCinematicQuality(on) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, on ? CINE_DPR : MAX_DPR));
  composer.setSize(window.innerWidth, window.innerHeight);
}

const input = new Input();
const audio = new AudioEngine();
const starfield = new Starfield(scene);
const fx = new Fx(scene);

const game = new Game({
  scene,
  camera,
  renderer,
  input,
  audio,
  fx,
  // La cinématique met en scène la lumière autant que la caméra : sans accès au
  // bloom, à l'exposition et aux lampes, elle ne peut pas raconter une extinction.
  stage: {
    composer,
    bloom,
    lights: { hemi, keyLight, rimLight, mawLight },
    setQuality: setCinematicQuality,
    fitCamera,
    cameraHome: CAMERA_BASE,
    cameraTarget: CAMERA_TARGET,
  },
  hudRoot: document.getElementById('hud'),
  overlayRoot: document.getElementById('overlay'),
});

if (isTouchDevice()) document.body.classList.add('touch');

// L'AudioContext ne peut démarrer que sur un geste utilisateur.
const unlock = () => audio.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('mousedown', unlock);
window.addEventListener('touchstart', unlock);

window.addEventListener('resize', () => {
  if (!game.cameraOverride) fitCamera(); // la ciné pilote son propre cadrage
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth / 2, window.innerHeight / 2);
});

// PWA : service worker (cache hors-ligne + alertes de nouvelle campagne).
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Pause automatique quand l'onglet passe en arrière-plan.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing' && !game.paused) game.togglePause();
});

// Accès debug en dev uniquement (tests pilotés, réglages en console).
if (import.meta.env.DEV) {
  window.__NOVA = { game, scene, camera, renderer };
}

let lastTime = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const realDt = Math.min((now - lastTime) / 1000, 0.05); // évite les sauts après un gel d'onglet
  lastTime = now;
  const dt = fx.tick(realDt); // hit-stop : dt gameplay éventuellement ralenti

  starfield.update(realDt, game.state === 'playing' ? 1 : 0.35);
  game.characters.update(realDt); // les visages vivent même quand le jeu est en pause
  game.update(dt);

  // Caméra : pilotée par la cinématique quand elle joue, sinon léger suivi du
  // joueur + screenshake pour ancrer la 3D.
  if (game.cameraOverride) {
    const cam = game.cameraOverride;
    camera.position.copy(cam.pos).add(fx.shakeOffset);
    camera.up.set(Math.sin(cam.roll || 0), Math.cos(cam.roll || 0), 0); // roulis de plan
    camera.lookAt(cam.look);
    if (cam.fov && Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
  } else {
    if (camera.up.x !== 0) camera.up.set(0, 1, 0);
    const followX = game.player ? game.player.position.x * 0.22 : 0;
    camera.position.set(
      CAMERA_BASE.x + followX + fx.shakeOffset.x,
      CAMERA_BASE.y + fx.shakeOffset.y,
      CAMERA_BASE.z + fx.shakeOffset.z
    );
    camera.lookAt(CAMERA_TARGET.x + followX * 0.5, CAMERA_TARGET.y, CAMERA_TARGET.z);
  }

  composer.render();
}

frame();
