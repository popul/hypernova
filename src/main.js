// Point d'entrée : renderer, caméra, lumières, post-processing (bloom), boucle de rendu.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input, isTouchDevice } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Space } from './game/space/index.js';
import { ArenaEdges, ajusteCadrage } from './game/arena.js';
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
// Nécessaire au bouclage d'arène : le vaisseau qui franchit un bord est TRANCHÉ par
// un demi-plan, et son complément est dessiné à l'autre bord. Sans découpe locale,
// il faudrait afficher deux coques entières — ce qui se lit comme deux vaisseaux.
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040f);
scene.fog = new THREE.FogExp2(0x05040f, 0.0075);

// Déclarés avant fitCamera : celui-ci les recale, et il tourne une première fois
// dès l'initialisation, avant que la scène ne soit peuplée.
let arenaEdges = null;
let space = null;

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 900);
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
  // SERRAGE EN PORTRAIT. Le recul qui fait tenir l'arène sur un écran étroit en
  // faisait beaucoup trop : mesuré sur un téléphone en portrait, quarante-huit
  // unités de large étaient visibles pour une arène qui en fait vingt-neuf — soit
  // quatre dixièmes de l'écran occupés par du vide latéral, pendant que le
  // vaisseau et les ennemis se réduisaient d'autant.
  //
  // On resserre donc là, et seulement là. La largeur visible retombe autour de
  // trente-six unités : l'arène tient toujours, avec trois unités et demie de
  // marge de chaque côté — de quoi voir arriver un ennemi de bord.
  // Poser la caméra à un serrage donné. C'est la seule chose que `ajusteCadrage`
  // a besoin de savoir faire faire : lui vérifie, nous plaçons.
  const pose = (serrage) => {
    const pullback = Math.min(1.85, squeeze) * serrage;
    CAMERA_BASE.copy(CAMERA_HOME).sub(CAMERA_TARGET).multiplyScalar(pullback).add(CAMERA_TARGET);
    camera.position.copy(CAMERA_BASE);
    camera.lookAt(CAMERA_TARGET);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true); // fitPlayZone déprojette : la matrice doit être à jour
  };
  // La limite arrière du joueur se déduit du cadrage, jamais l'inverse : sinon le
  // vaisseau sort du champ par le bas sur les écrans larges. Elle s'arrête aussi
  // là où les bords de l'arène cessent d'être visibles — et c'est cette borne-là
  // qui, en portrait, oblige à relâcher le serrage. Voir ajusteCadrage.
  ajusteCadrage(camera, pose, aspect < 0.8 ? 0.75 : 1);
  arenaEdges?.setZone();
  // Le décor lointain se recalibre sur le champ HORIZONTAL réel : c'est lui, et
  // pas le champ vertical, qui décide de la taille apparente d'une planète.
  const tanHalfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
  space?.setFraming(tanHalfH);
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
space = new Space(scene, { lights: { hemi, keyLight, rimLight, mawLight }, renderer });
arenaEdges = new ArenaEdges(scene);
fitCamera(); // second passage : la couture existe enfin et peut être calée
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
    space, // le ciel : le jeu lui demande de changer de secteur à chaque saut
    fitCamera,
    cameraHome: CAMERA_BASE,
    cameraTarget: CAMERA_TARGET,
  },
  hudRoot: document.getElementById('hud'),
  overlayRoot: document.getElementById('overlay'),
});
game.arenaEdges = arenaEdges; // le vaisseau allume la couture qu'il franchit
// EN DÉVELOPPEMENT SEULEMENT : de quoi inspecter la partie depuis la console.
// `import.meta.env.DEV` est remplacé par `false` à la construction, donc ces deux
// lignes disparaissent du bundle livré — le jeu publié n'expose rien.
if (import.meta.env.DEV) window.jeu = game;

if (isTouchDevice()) document.body.classList.add('touch');

// L'AudioContext ne peut démarrer que sur un geste utilisateur.
const unlock = () => audio.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('mousedown', unlock);
window.addEventListener('touchstart', unlock);

// Redimensionnement. Le rapport d'image de la caméra doit TOUJOURS suivre celui du
// canevas — y compris pendant une cinématique, qui ne pilote que la position et le
// champ, jamais le rapport. L'ancienne version sautait entièrement fitCamera quand
// la ciné avait la main : le rendu était alors redimensionné avec une matrice de
// projection périmée, et l'image sortait écrasée ou étirée. Faire pivoter son
// téléphone pendant l'introduction suffisait à déclencher le défaut.
function relayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w / 2, h / 2);
  if (game.cameraOverride) {
    // La ciné garde la main sur le reste, mais le rapport lui échappe.
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  } else {
    fitCamera();
  }
}

window.addEventListener('resize', relayout);

// Changement d'orientation : sur mobile, l'événement « resize » arrive souvent
// AVANT que innerWidth et innerHeight ne reflètent la nouvelle orientation. On
// recadre donc une seconde fois, une fois la mise en page stabilisée.
window.addEventListener('orientationchange', () => {
  relayout();
  requestAnimationFrame(relayout);
  setTimeout(relayout, 250);
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
  window.__NOVA = { game, scene, camera, renderer, space, arenaEdges };
}

let lastTime = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const realDt = Math.min((now - lastTime) / 1000, 0.05); // évite les sauts après un gel d'onglet
  lastTime = now;
  const dt = fx.tick(realDt); // hit-stop : dt gameplay éventuellement ralenti

  space.update(realDt, game.state === 'playing' || game.state === 'jump' ? 1 : 0.35);
  arenaEdges.update(realDt, game.player ? game.player.position.x : 0);
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
