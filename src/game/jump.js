// Le saut lumière : l'entre-deux-vagues.
//
// Il n'y avait rien entre la dernière explosion et l'ouverture de la boutique — un
// écran de menu tombait sur une arène vide. Or c'est exactement là que se place le
// souffle d'un jeu : le moment où on a gagné et où on ne joue pas encore.
//
// Trois temps, deux secondes et demie :
//   1. CABRAGE   le vaisseau se redresse, les moteurs montent, l'écran tremble
//   2. SAUT      il part vers le fond, les étoiles s'étirent, tout blanchit
//   3. ARRIVÉE   le flash retombe sur le secteur SUIVANT — déjà changé, à couvert
//
// C'est le point 3 qui justifie toute la séquence : le décor change pendant le
// flash, donc sans aucun raccord visible. Sans saut, il faudrait soit un fondu au
// noir (mou), soit un changement à vue (un bug pour l'œil).

import * as THREE from 'three';
import { ARENA } from './constants.js';
import { Veils } from './cine/stagecraft.js';

const CHARGE = 1.15; // cabrage et montée en régime
const LAUNCH = 0.55; // l'accélération elle-même
const ARRIVE = 0.8; // décélération dans le nouveau secteur
const TOTAL = CHARGE + LAUNCH + ARRIVE;

const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class Jump {
  constructor({ scene, audio, fx, space, player, characters, overlayRoot }) {
    this.scene = scene;
    this.audio = audio;
    this.fx = fx;
    this.space = space;
    this.player = player;
    this.characters = characters;
    this.overlayRoot = overlayRoot;
    this.veils = null;
    this.active = false;
    this.t = 0;
    this._home = new THREE.Vector3();
  }

  // onSwap est appelé À L'INSTANT du flash : c'est là, et seulement là, que le jeu
  // a le droit de changer le décor sous les pieds du joueur.
  start({ onSwap, onDone, dialogue }) {
    if (this.active) return;
    this.active = true;
    this.t = 0;
    this.swapped = false;
    this.onSwap = onSwap;
    this.onDone = onDone;
    this._home.copy(this.player.position);
    if (!this.veils) this.veils = new Veils(this.overlayRoot);
    this.veils.setBlack(0);

    // Le vaisseau ne tire plus et n'est plus touchable : la séquence est un acquis,
    // pas une prolongation du combat.
    this.player.showHitMarkers(false);

    this.audio.jumpCharge();
    if (dialogue) this.characters.playExchange(dialogue);
  }

  skip() {
    if (!this.active) return;
    // On saute au flash plutôt qu'à la fin : le changement de secteur doit avoir
    // lieu, sinon on relance la vague dans le décor de la précédente.
    this.t = Math.max(this.t, CHARGE + LAUNCH * 0.5);
  }

  // Renvoie true tant que la séquence tourne. Avancée avec le temps RÉEL : le
  // ralenti d'esquive ne doit pas étirer une transition d'interface.
  update(realDt) {
    if (!this.active) return false;
    this.t += realDt;
    const t = this.t;
    const p = this.player.group;

    if (t < CHARGE) {
      // Cabrage. Le nez monte, le vaisseau recule imperceptiblement — l'élan avant
      // le départ. Sans ce contre-mouvement, le saut a l'air d'une téléportation.
      const k = t / CHARGE;
      p.rotation.x = -0.55 * easeOut(k);
      p.position.z = this._home.z + 1.6 * easeOut(k);
      p.position.y = this._home.y + 0.5 * easeOut(k);
      this.space.setWarp(k * k * 0.28);
      this.fx.addShake(0.035 * k);
      if (k > 0.55 && !this._flared) {
        this._flared = true;
        this.fx.burst(p.position, 0x8ffbff, { count: 26, speed: 7, life: 0.5, spread: 1.4 });
      }
    } else if (t < CHARGE + LAUNCH) {
      const k = (t - CHARGE) / LAUNCH;
      if (!this._launched) {
        this._launched = true;
        this.audio.jumpGo();
        this.fx.addShake(0.9);
      }
      // Le départ : le vaisseau part vers le fond ET vers le haut, et l'étirement
      // des étoiles suit le cube du temps — c'est cette courbe très en retard qui
      // donne le coup de reins, une rampe linéaire n'accélère jamais vraiment.
      const e = easeIn(k);
      p.position.z = this._home.z + 1.6 - 190 * e;
      p.position.y = this._home.y + 0.5 + 26 * e;
      p.rotation.x = -0.55 - 0.35 * e;
      this.space.setWarp(0.28 + 0.72 * e);

      if (k > 0.72 && !this.swapped) {
        this.swapped = true;
        this.veils.punch(0.5); // le flash SOUS lequel le monde change
        this.onSwap?.();
      }
    } else if (t < TOTAL) {
      const k = (t - (CHARGE + LAUNCH)) / ARRIVE;
      const e = easeOut(k);
      // Arrivée : le vaisseau réapparaît du fond et se repose. La décélération est
      // lente exprès — c'est elle qui laisse le temps de regarder le nouveau ciel.
      p.position.z = THREE.MathUtils.lerp(-150, this._home.z, e);
      p.position.y = THREE.MathUtils.lerp(20, 0, e);
      p.rotation.x = THREE.MathUtils.lerp(-0.9, 0, e);
      this.space.setWarp(Math.max(0, 1 - e * 1.35));
    } else {
      this._finish();
      return false;
    }

    this.veils.update(realDt);
    return true;
  }

  _finish() {
    this.active = false;
    this._flared = false;
    this._launched = false;
    this.space.setWarp(0);
    const p = this.player.group;
    p.position.set(this._home.x, 0, ARENA.playerZ);
    p.rotation.set(0, 0, 0);
    this.player.vz = 0;
    this.player.showHitMarkers(true);
    this.veils.setBlack(0);
    this.veils.flash.style.opacity = '0';
    this.onDone?.();
  }

  dispose() {
    this.veils?.dispose();
    this.veils = null;
  }
}
