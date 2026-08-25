// Outillage de mise en scène : rig de plans à coupes franches, cadrage anamorphique
// (indispensable en portrait), et voiles DOM pour le flash / le noir / la commotion.
//
// Pourquoi un rig et pas une courbe : une trajectoire continue interpolée rend la
// COUPE impossible par construction, et c'est ce qui donnait à l'ancienne intro son
// air d'économiseur d'écran. Ici chaque plan est autonome et commence net.

import * as THREE from 'three';

export const ease = {
  linear: (t) => t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
};

const DEG = Math.PI / 180;

// camera.fov est VERTICAL. En portrait (aspect ≈ 0,46), un cadrage pensé en
// horizontal enverrait la moitié du plan hors champ. On convertit donc un champ
// horizontal voulu en champ vertical réel, et on recule si le vertical sature.
export function framing(hfovDeg, aspect, { minV = 32, maxV = 78 } = {}) {
  const hfov = hfovDeg * DEG;
  const wantedV = 2 * Math.atan(Math.tan(hfov / 2) / Math.max(0.2, aspect));
  const vfov = THREE.MathUtils.clamp(wantedV, minV * DEG, maxV * DEG);
  const reachedH = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  // Si le champ horizontal obtenu est plus étroit que voulu, on recule d'autant.
  const pull = THREE.MathUtils.clamp(
    Math.tan(hfov / 2) / Math.max(1e-4, Math.tan(reachedH / 2)),
    1,
    1.7
  );
  return { fov: vfov / DEG, pull };
}

// Cadre un sujet compact (planète, œil) pour qu'il occupe `fill` du côté court.
export function fitSubject(radius, fill, vfovDeg) {
  const vfov = vfovDeg * DEG;
  return radius / Math.max(0.05, fill * Math.tan(vfov / 2));
}

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Évalue le plan actif à l'instant t et renvoie { pos, look, roll, fov }.
export function evaluateShot(shot, t, ctx) {
  const span = Math.max(1e-3, shot.t1 - shot.t0);
  const k = THREE.MathUtils.clamp((t - shot.t0) / span, 0, 1);
  const e = (ease[shot.ease] || ease.linear)(k);

  const aspect = ctx.aspect;
  const { fov, pull } = framing(shot.hfov ?? 60, aspect);

  // Position : soit deux points interpolés, soit une position calculée (suivi).
  if (shot.posFn) {
    _pos.copy(shot.posFn(e, ctx));
  } else {
    _pos.fromArray(shot.pos);
    if (shot.posTo) _pos.lerp(_dir.fromArray(shot.posTo), e);
  }

  // Point visé : cible fixe, interpolée, ou objet suivi.
  if (shot.lookFn) {
    _look.copy(shot.lookFn(e, ctx));
  } else if (shot.lookTarget) {
    _look.copy(shot.lookTarget(ctx));
  } else {
    _look.fromArray(shot.look);
    if (shot.lookTo) _look.lerp(_dir.fromArray(shot.lookTo), e);
  }

  // Recul de cadrage : on s'éloigne le long de l'axe de visée, jamais latéralement.
  if (pull > 1.001) {
    _dir.copy(_pos).sub(_look);
    _pos.copy(_look).addScaledVector(_dir, pull);
  }

  const roll = THREE.MathUtils.lerp(shot.roll ?? 0, shot.rollTo ?? shot.roll ?? 0, e);
  return { pos: _pos, look: _look, roll, fov, k: e };
}

// Voiles plein écran en DOM : coût GPU nul, là où une passe de post-traitement
// supplémentaire est le poste le plus cher du budget mobile.
export class Veils {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'cine-veils';
    this.el.innerHTML = `
      <div class="veil veil-flash" id="veil-flash"></div>
      <div class="veil veil-black" id="veil-black"></div>
      <div class="veil veil-shock" id="veil-shock"></div>
    `;
    root.appendChild(this.el);
    this.flash = this.el.querySelector('#veil-flash');
    this.black = this.el.querySelector('#veil-black');
    this.shock = this.el.querySelector('#veil-shock');
    this._flashT = 0;
    this._flashDur = 0.12;
  }

  // Éclair blanc bref (impact, détonation).
  punch(duration = 0.12) {
    this._flashDur = duration;
    this._flashT = duration;
  }

  setBlack(a) {
    this.black.style.opacity = String(THREE.MathUtils.clamp(a, 0, 1));
  }

  // Commotion : désaturation + vignette resserrée, pour le passage à vide.
  setShock(a) {
    const v = THREE.MathUtils.clamp(a, 0, 1);
    this.shock.style.opacity = String(v);
  }

  update(dt) {
    if (this._flashT > 0) {
      this._flashT -= dt;
      const a = Math.max(0, this._flashT / this._flashDur);
      this.flash.style.opacity = String(a * a);
    }
  }

  dispose() {
    this.el.remove();
  }
}
