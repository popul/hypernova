// LA DÉMONSTRATION D'ARME, pour l'écran de choix de coque.
//
// Une fiche qui décrit une arme ne dit rien de ce qu'elle fait. « Rayon continu
// sur toute la colonne » et « charges lentes qui explosent en sphère » sont deux
// phrases ; ce sont surtout deux façons de jouer qu'on ne comprend qu'en les
// voyant tirer. Choisir sa coque sur trois lignes de texte, c'est choisir au
// hasard la première fois — et la première fois est celle qui compte, puisque
// c'est là qu'on décide si le jeu est pour soi.
//
// Ce module pose donc quelques cibles devant le vaisseau et laisse L'ARME VRAIE
// travailler dessus — pas une animation qui l'imite, l'arme du jeu, avec ses
// dégâts, ses effets, sa montée en puissance et sa surchauffe. Si le rayon
// d'HÉLIOS lâche au bout de six secondes, il lâche aussi ici, et c'est une bonne
// nouvelle : on ne découvrira pas la contrainte en pleine vague.
//
// CE QUE ÇA COÛTE, ET COMMENT ON LE PAIE.
//
// Faire tirer une arme du jeu hors d'une partie demande de lui donner tout ce
// qu'elle attend : une liste d'ennemis, de quoi les blesser, une commande de
// frame, des niveaux d'amélioration. Le réflexe serait de brancher la
// démonstration sur les VRAIS objets du jeu — et ce serait une faute : le
// premier ennemi tué gonflerait le combo, marquerait des points, lâcherait des
// pièces, remplirait la jauge de furie. On entrerait en partie avec un score.
//
// La démonstration se substitue donc à tout ce qu'elle touche, et repose
// exactement ce qu'elle a emprunté en partant. Elle est un bac à sable, pas une
// partie qui ne dirait pas son nom.

import * as THREE from 'three';
import { createEnemyShip } from './ships.js';
import { commandeVide } from './rejeu/commandes.js';
import { ARENA, ENEMY_TYPES, PLAYER } from './constants.js';

// Trois rangs, serrés et PRÈS. Entre le vaisseau et une formation à trente
// unités il n'y a que du vide à regarder — or c'est là que l'arme travaille.
const RANGS = [
  { type: 'drone', z: -17, n: 7 },
  { type: 'wasp', z: -13.5, n: 6 },
  { type: 'brute', z: -10, n: 4 },
];

// L'ÉQUIPEMENT DE DÉMONSTRATION. Une arme au niveau zéro est honnête et terne :
// un seul canon, pas de missiles, pas de satellites. On montre donc une coque
// telle qu'elle sera au bout de deux ou trois hangars — ce qui est aussi une
// promesse, et la bonne, puisque c'est là que la partie se joue.
const EQUIPEMENT = { firerate: 3, cannons: 1, missiles: 2, engine: 0, magnet: 0 };

// Le balayage horizontal. C'est lui qui fait exister le rayon d'HÉLIOS — on voit
// la colonne suivre le vaisseau — et qui montre que le placement est tout le jeu
// de VULCAIN, dont la forge ne tire que sous un ciel occupé.
const BALAYAGE = 5.4;
const PERIODE = 0.42;

export class DemoArme {
  constructor(scene) {
    this.scene = scene;
    this.cibles = [];
    this.actif = false;
    this.horloge = 0;
    this.tirTimer = 0;
    this.missileTimer = 0;
    this.centreX = 0;
    this.amplitude = BALAYAGE;
    this._sauvegarde = null;

    for (const r of RANGS) {
      for (let i = 0; i < r.n; i++) {
        const def = ENEMY_TYPES[r.type] || ENEMY_TYPES.drone;
        const groupe = new THREE.Group();
        groupe.add(createEnemyShip(r.type));
        groupe.position.set((i - (r.n - 1) / 2) * 2.35, 0, r.z);
        groupe.visible = false;
        scene.add(groupe);
        this.cibles.push({
          group: groupe,
          alive: false,
          hp: def.hp,
          maxHp: def.hp,
          def,
          type: r.type,
          state: 'formation',
          flashTime: 0,
          base: groupe.position.clone(),
          baseX: groupe.position.x,
          phase: i * 0.7,
          mort: 0,
          // Les armes appellent `dispose()` en tuant : nos cibles ressuscitent,
          // elles n'ont rien à libérer.
          dispose() {},
        });
      }
    }
  }

  // OÙ SE JOUE LA DÉMONSTRATION.
  //
  // L'écran de choix ne place pas toujours le vaisseau au milieu : sur un
  // téléphone tenu à l'horizontale, le panneau prend la moitié droite et la
  // vitrine se décale à gauche. La démonstration doit suivre — sinon le vaisseau
  // tirerait vers une formation restée au centre, hors de son axe, et le
  // balayage l'emmènerait hors de l'arène puis hors de l'écran.
  //
  // Tout se recale donc sur cette abscisse : les cibles et l'amplitude du va-et-
  // vient, qui se réduit d'elle-même quand il ne reste plus de place sur le côté.
  place(x) {
    // On borne le CENTRE, pas le vaisseau : borner le vaisseau reviendrait à lui
    // laisser une amplitude nulle une fois collé au bord, et une démonstration
    // dont le vaisseau ne bouge plus ne montre plus rien — ni la colonne du
    // rayon d'HÉLIOS, ni le placement de VULCAIN.
    const max = ARENA.playerXMax - 1 - BALAYAGE;
    this.centreX = Math.max(-max, Math.min(max, x));
    this.amplitude = BALAYAGE;
    // Les rangs suivent, sans jamais déborder de l'arène : un drone posé derrière
    // le mur de l'arène est visible et faux, et c'est le genre de détail qu'on
    // remarque sans savoir le nommer.
    const bord = ARENA.playerXMax - 1;
    for (const c of this.cibles) {
      c.base.x = Math.max(-bord, Math.min(bord, c.baseX + this.centreX));
    }
  }

  // LE BAC À SABLE. On remplace tout ce que l'arme va toucher, et rien de plus.
  // Chaque ligne ci-dessous répare une fuite précise vers la vraie partie :
  // `enemies` pour qu'elle ait quelque chose à viser, `_onEnemyKilled` pour que
  // le score et le combo ne bougent pas, `_addEnergy` pour que la jauge de furie
  // reste vide, `levels` pour l'équipement de vitrine.
  demarre(game) {
    if (this.actif) return;
    this.actif = true;
    this.horloge = 0;
    this._sauvegarde = {
      enemies: game.enemies,
      levels: game.levels,
      stats: game.stats,
      cmd: game.cmd,
      odTimer: game.odTimer,
      // Ces deux-là vivent sur le prototype : les remplacer crée une propriété
      // d'instance qui l'ombre. Rendre ne consiste donc pas à réassigner mais à
      // EFFACER, sans quoi on laisserait derrière soi une copie qui a l'air
      // identique et qui ne le resterait pas si le jeu changeait de méthode.
      onKill: Object.prototype.hasOwnProperty.call(game, '_onEnemyKilled')
        ? game._onEnemyKilled
        : null,
      addEnergy: Object.prototype.hasOwnProperty.call(game, '_addEnergy') ? game._addEnergy : null,
    };
    game.enemies = {
      list: this.cibles,
      boss: null,
      damage: (e, degats) => this._blesse(game, e, degats),
    };
    game.levels = { ...(game.levels || {}), ...EQUIPEMENT };
    game.cmd = { ...commandeVide(), tir: true };
    game.odTimer = 0;
    game._onEnemyKilled = () => {};
    game._addEnergy = () => {};
    for (const c of this.cibles) this._ressuscite(c);
  }

  arrete(game) {
    if (!this.actif) return;
    this.actif = false;
    const s = this._sauvegarde;
    if (s) {
      game.enemies = s.enemies;
      game.levels = s.levels;
      game.stats = s.stats;
      game.cmd = s.cmd;
      game.odTimer = s.odTimer;
      if (s.onKill) game._onEnemyKilled = s.onKill;
      else delete game._onEnemyKilled;
      if (s.addEnergy) game._addEnergy = s.addEnergy;
      else delete game._addEnergy;
    }
    this._sauvegarde = null;
    for (const c of this.cibles) {
      c.alive = false;
      c.group.visible = false;
    }
    for (const a of Object.values(game.armes || {})) a.clear();
    game.bullets?.clear();
    game.missiles?.clear();
  }

  // La blessure, en version courte : les vrais ennemis préviennent le HUD,
  // comptent les demi-vies de boss et déclenchent des répliques. Ici il n'y a que
  // des points de vie et une étincelle.
  _blesse(game, e, degats) {
    if (!e.alive) return false;
    e.hp -= degats;
    e.flashTime = 0.14;
    if (e.hp > 0) {
      game.fx?.burst(e.group.position, 0xffffff, { count: 4, speed: 5, life: 0.25 });
      return false;
    }
    e.alive = false;
    e.mort = 0;
    e.group.visible = false;
    game.fx?.explosionSmall?.(e.group.position, 0xff7bd5);
    game.audio?.explosionSmall?.();
    return true;
  }

  _ressuscite(c) {
    c.alive = true;
    c.hp = c.maxHp;
    c.mort = 0;
    c.group.visible = true;
    c.group.position.copy(c.base).setZ(c.base.z - 12);
    c.group.scale.setScalar(0.01);
  }

  update(dt, game) {
    if (!this.actif) return;
    this.horloge += dt;

    const p = game.player.position;
    p.x = this.centreX + Math.sin(this.horloge * PERIODE) * this.amplitude;
    game.player.group.rotation.z = -Math.cos(this.horloge * PERIODE) * 0.16;

    for (const c of this.cibles) {
      if (!c.alive) {
        c.mort += dt;
        if (c.mort > 1.4) this._ressuscite(c);
        continue;
      }
      if (c.flashTime > 0) c.flashTime -= dt;
      c.group.position.z += dt * 1.1;
      c.group.position.x = c.base.x + Math.sin(this.horloge * 0.8 + c.phase) * 1.1;
      if (c.group.scale.x < 1) c.group.scale.setScalar(Math.min(1, c.group.scale.x + dt * 2));
      // Repassée derrière le vaisseau, elle repart du fond : la démonstration ne
      // doit jamais s'arrêter faute de quoi tirer.
      if (c.group.position.z > 3) c.group.position.copy(c.base).setZ(c.base.z - 9);
      c.group.rotation.y += dt * 0.4;
    }

    const arme = game.armes?.[game.coque];
    if (arme) arme.update(dt, game);
    else this._tireOrion(dt, game);

    game.bullets?.update(dt);
    game.missiles?.update(dt);
    this._collisions(game);
  }

  // ORION n'a pas de module d'arme : son tir vit dans le vaisseau, qui ne vole pas
  // sur cet écran. On refait donc ici le strict nécessaire — les flux et les
  // missiles — avec les vrais projectiles du jeu et sa vraie cadence.
  _tireOrion(dt, game) {
    const p = game.player.position;
    this.tirTimer -= dt;
    if (this.tirTimer <= 0) {
      this.tirTimer = 1 / (PLAYER.baseFireRate * 1.4);
      for (const dx of [-0.55, 0.55])
        game.bullets?.spawn(
          new THREE.Vector3(p.x + dx, 0, p.z - 1.2),
          new THREE.Vector3(0, 0, -PLAYER.bulletSpeed)
        );
      game.fx?.burst(new THREE.Vector3(p.x, 0, p.z - 1.6), 0x8ffbff, {
        count: 2,
        speed: 3,
        life: 0.15,
      });
      game.audio?.shoot?.();
    }
    this.missileTimer -= dt;
    if (this.missileTimer <= 0) {
      this.missileTimer = 1.3;
      const vivantes = this.cibles.filter((c) => c.alive);
      if (vivantes.length) {
        game.missiles?.launch(p, vivantes[((this.horloge * 7) % vivantes.length) | 0]);
        game.audio?.missile?.();
      }
    }
  }

  // Les projectiles d'ORION n'ont pas de collision à eux : le jeu la fait de son
  // côté, dans du code qui suppose une vraie vague. On la refait, en plus court.
  _collisions(game) {
    game.bullets?.forEachActive?.((b) => {
      for (const c of this.cibles) {
        if (!c.alive) continue;
        if (b.mesh.position.distanceTo(c.group.position) < c.def.radius + 0.4) {
          this._blesse(game, c, 1);
          game.bullets.kill(b);
          break;
        }
      }
    });
    game.missiles?.forEachActive?.((m) => {
      for (const c of this.cibles) {
        if (!c.alive) continue;
        if (m.mesh.position.distanceTo(c.group.position) < c.def.radius + 0.5) {
          this._blesse(game, c, 2);
          game.fx?.burst(m.mesh.position, 0xffc857, { count: 8, speed: 7, life: 0.3 });
          game.missiles.kill(m);
          break;
        }
      }
    });
  }
}
