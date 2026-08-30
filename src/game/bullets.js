// Pools de projectiles : traçantes joueur, tirs ennemis, missiles à tête chercheuse.
// Les meshes sont créés une fois puis recyclés (visible on/off), jamais alloués en jeu.

import * as THREE from 'three';
import { ARENA, ENEMY } from './constants.js';
import { ecart } from '../core/rng.js';

// Halo doux réutilisé par les projectiles ennemis (lisibilité sur fond étoilé).
function makeGlowTexture(tint = 'rgba(255,61,240,0.55)') {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, tint);
  grad.addColorStop(1, tint.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function outOfBounds(p) {
  return (
    p.z < ARENA.bulletCullZMin || p.z > ARENA.bulletCullZMax || Math.abs(p.x) > ARENA.bulletCullXMax
  );
}

class Pool {
  constructor(scene, size, makeMesh, radius) {
    this.radius = radius;
    this.entries = [];
    for (let i = 0; i < size; i++) {
      const mesh = makeMesh();
      mesh.visible = false;
      scene.add(mesh);
      this.entries.push({ mesh, active: false, vel: new THREE.Vector3(), age: 0 });
    }
  }

  // `proprio` : le NUMÉRO du poste qui a tiré. Sans lui, une balle n'appartient
  // à personne — et l'on ne peut ni la faire frapper avec la fureur de son
  // tireur, ni rendre la récompense du kill à celui qui l'a mérité. Chaque
  // machine calculait donc les dégâts avec SA propre furie, quel que soit
  // l'auteur du tir : les ennemis n'avaient pas les mêmes points de vie d'un
  // écran à l'autre. En solo, tout le monde est le numéro zéro.
  spawn(pos, vel, proprio = 0) {
    const entry = this.entries.find((e) => !e.active);
    if (!entry) return null;
    entry.active = true;
    entry.proprio = proprio;
    entry.age = 0;
    entry.mesh.position.copy(pos);
    entry.vel.copy(vel);
    entry.mesh.visible = true;
    // Suivi du frôlement (balles ennemies) et de la perforation (balles joueur).
    // LE FRÔLEMENT SE MESURE POUR CHAQUE PILOTE. Une balle ne passe pas près de
    // « le joueur » : elle passe près de CHACUN, à des distances différentes, et
    // chacun mérite sa récompense. Un seul couple minimum/déjà-compté pour toute
    // la table faisait qu'un frôlement en effaçait un autre — et comme le
    // frôlement remplit la jauge, la jauge divergeait.
    // Réutilisé en place : une allocation par balle, à plusieurs centaines de
    // balles par vague, se paie en hoquets de ramasse-miettes.
    if (entry.minDistSq) entry.minDistSq.fill(Infinity);
    else entry.minDistSq = [Infinity, Infinity, Infinity];
    entry.grazePar = 0; // un bit par numéro de poste
    entry.pierce = 0;
    if (entry.hitIds) entry.hitIds.length = 0;
    else entry.hitIds = [];
    return entry;
  }

  kill(entry) {
    entry.active = false;
    entry.mesh.visible = false;
  }

  clear() {
    for (const e of this.entries) this.kill(e);
  }

  forEachActive(fn) {
    for (const e of this.entries) {
      if (e.active) fn(e);
    }
  }

  activeCount() {
    let n = 0;
    for (const e of this.entries) if (e.active) n++;
    return n;
  }
}

export class PlayerBullets extends Pool {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(0.13, 0.13, 1.1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8ffbff, toneMapped: false });
    super(scene, 70, () => new THREE.Mesh(geo, mat), 0.35);
    this.mat = mat;
    this._froid = new THREE.Color(0x8ffbff);
    this._teinte = new THREE.Color(0x8ffbff);
    this._echelle = 1;
  }

  // L'ALLURE DU TIR SUIT LA FUREUR. Toutes les balles partagent une matière et une
  // géométrie — c'est ce qui les rend gratuites — donc on ne peut pas en habiller
  // une seule. Ça tombe bien : la fureur s'applique à toutes en même temps, et un
  // flux qui change de couleur d'un bloc est justement ce qui se lit le mieux.
  //
  // L'échelle est posée sur les meshes actives et sur celles qui naissent, jamais
  // sur la géométrie : la redimensionner reviendrait à la reconstruire soixante
  // fois par seconde.
  habille(teinte, echelle) {
    this._teinte.set(teinte);
    this.mat.color.copy(this._teinte);
    if (echelle === this._echelle) return;
    this._echelle = echelle;
    for (const e of this.entries) e.mesh.scale.setScalar(echelle);
  }

  // ON FAIT SUIVRE LE PROPRIÉTAIRE. Cette redéfinition ne voulait qu'ajuster
  // l'échelle du mesh, et laissait tomber le troisième argument au passage :
  // toutes les balles du jeu repartaient au numéro zéro, donc toutes frappaient
  // avec la furie de l'hôte. Un oubli d'un seul mot, invisible à la lecture.
  spawn(pos, vel, proprio = 0) {
    const e = super.spawn(pos, vel, proprio);
    if (e) e.mesh.scale.setScalar(this._echelle);
    return e;
  }

  update(dt) {
    this.forEachActive((e) => {
      e.mesh.position.addScaledVector(e.vel, dt);
      if (outOfBounds(e.mesh.position)) this.kill(e);
    });
  }
}

export class EnemyBullets extends Pool {
  constructor(scene) {
    // Noyau blanc chaud + coque colorée + halo : impossible à confondre avec une étoile.
    // DEUX COULEURS, c'est la grammaire du jeu : rose = balle VISÉE (elle est calculée
    // sur ta trajectoire, elle « te suit ») ; ambre = balle DROITE (mur, tir croisé,
    // éventail du boss — il faut trouver le trou). Le cyan reste au joueur.
    const coreGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff3fb, toneMapped: false });
    const shellGeo = new THREE.SphereGeometry(0.27, 10, 10);
    const makeShell = (color) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, toneMapped: false });
    const shellMats = {
      aimed: makeShell(ENEMY.bulletColorAimed),
      straight: makeShell(ENEMY.bulletColorStraight),
    };
    const haloTex = {
      aimed: makeGlowTexture('rgba(255,61,240,0.55)'),
      straight: makeGlowTexture('rgba(255,162,61,0.55)'),
    };
    const makeMesh = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(coreGeo, coreMat));
      const shell = new THREE.Mesh(shellGeo, shellMats.aimed);
      shell.name = 'shell';
      g.add(shell);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTex.aimed,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      halo.name = 'halo';
      halo.scale.setScalar(1.7);
      g.add(halo);
      return g;
    };
    super(scene, 140, makeMesh, 0.38);
    this._shellMats = shellMats;
    this._haloTex = haloTex;
  }

  // kind : 'aimed' (rose, visée prédictive) ou 'straight' (ambre, trajectoire fixe).
  spawn(pos, vel, kind = 'aimed') {
    const entry = super.spawn(pos, vel);
    if (!entry) return null;
    entry.kind = kind;
    const shell = entry.mesh.getObjectByName('shell');
    const halo = entry.mesh.getObjectByName('halo');
    if (shell) shell.material = this._shellMats[kind] || this._shellMats.aimed;
    if (halo) halo.material.map = this._haloTex[kind] || this._haloTex.aimed;
    return entry;
  }

  // slow < 1 ralentit les balles ennemies (effet Overdrive).
  update(dt, slow = 1) {
    this.forEachActive((e) => {
      e.mesh.position.addScaledVector(e.vel, dt * slow);
      // Légère pulsation pour la lisibilité des tirs ennemis.
      const s = 1 + Math.sin(e.age * 20) * 0.15;
      e.age += dt;
      e.mesh.scale.setScalar(s);
      if (outOfBounds(e.mesh.position)) this.kill(e);
    });
  }
}

const MISSILE_SPEED = 24;
const MISSILE_TURN = 6; // vitesse de rotation du vecteur vitesse (rad/s équivalent)
const MISSILE_LIFETIME = 3.2;

export class Missiles extends Pool {
  constructor(scene, fx) {
    const makeMesh = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffc857, toneMapped: false })
      );
      // lookAt oriente le +Z local vers la cible : le nez du cône doit pointer +Z.
      body.rotation.x = Math.PI / 2;
      g.add(body);
      return g;
    };
    super(scene, 10, makeMesh, 0.5);
    this.fx = fx;
    this._tmp = new THREE.Vector3();
  }

  // Même règle que pour les balles : un missile sait qui l'a lancé.
  launch(pos, target, proprio = 0) {
    const entry = this.spawn(pos, this._tmp.set(ecart(3), 0, -MISSILE_SPEED * 0.5), proprio);
    if (entry) entry.target = target;
    return entry;
  }

  update(dt) {
    this.forEachActive((e) => {
      e.age += dt;
      if (e.age > MISSILE_LIFETIME) {
        this.kill(e);
        return;
      }
      const target = e.target && e.target.alive ? e.target : null;
      if (target) {
        this._tmp
          .copy(target.group.position)
          .sub(e.mesh.position)
          .normalize()
          .multiplyScalar(MISSILE_SPEED);
        e.vel.lerp(this._tmp, Math.min(1, MISSILE_TURN * dt));
      }
      e.vel.setLength(MISSILE_SPEED);
      e.mesh.position.addScaledVector(e.vel, dt);
      e.mesh.lookAt(this._tmp.copy(e.mesh.position).add(e.vel));
      this.fx.trail(e.mesh.position, 0xffc857);
      if (outOfBounds(e.mesh.position)) this.kill(e);
    });
  }
}
