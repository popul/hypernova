// LE PILOTE FANTÔME. Il joue pendant que personne ne regarde.
//
// L'écran d'accueil montrait un vaisseau qui ne faisait rien, posé au milieu du
// vide. C'est le premier écran du jeu, celui qu'on voit le plus longtemps, et il
// ne disait rien de ce qu'on allait faire. Les bornes d'arcade avaient réglé la
// question depuis quarante ans : quand personne ne joue, la machine joue toute
// seule, et c'est ce qui donne envie de mettre une pièce.
//
// Ce pilote n'a pas besoin d'être bon. Il a besoin d'avoir L'AIR bon — de viser,
// d'esquiver au dernier moment, de lâcher une furie de temps en temps — et de
// tenir assez longtemps pour qu'on ne le voie pas mourir toutes les dix secondes.
// Le reste est du théâtre, et c'est assumé.
//
// Il pousse des touches dans l'entrée du jeu au lieu de fabriquer des commandes :
// il passe donc exactement par où passe un joueur humain, et tout ce qui marche
// pour l'un marche pour l'autre — la pirouette, la bombe, le tir automatique.

import { ARENA, OVERDRIVE, PLAYER } from './constants.js';

// À quelle distance devant lui une balle devient une menace. Trop court, il
// esquive quand c'est déjà trop tard ; trop long, il fuit des balles qui ne
// l'auraient jamais touché et il a l'air de trembler.
const MENACE_Z = 13;
// La largeur du couloir qu'il considère comme dangereux. Un peu plus que sa
// propre coque : il ne joue pas au millimètre, ça se verrait.
const MENACE_X = 1.7;
// En dessous de cet écart, il se considère aligné et arrête de corriger. Sans ce
// palier, il oscille autour de sa cible à chaque image — mesuré, et ça donne un
// vaisseau qui vibre au lieu de viser.
const MORT_X = 0.35;

export class PiloteAuto {
  constructor() {
    this.horloge = 0;
    this.prochainCaprice = 3;
    this.cible = null;
  }

  reinitialise() {
    this.horloge = 0;
    this.prochainCaprice = 3;
    this.cible = null;
  }

  update(dt, game) {
    if (!game?.player?.alive) return;
    this.horloge += dt;
    const held = game.input.held;
    held.clear();

    const p = game.player.position;
    const menace = this._menaceLaPlusProche(game, p);

    if (menace) {
      // ESQUIVER PASSE AVANT TOUT. Il s'écarte du côté où il a le plus de place —
      // fuir vers le bord pour s'y retrouver coincé est l'erreur que fait tout
      // pilote automatique naïf, et ça se voit tout de suite.
      const versDroite = menace.x < p.x ? 1 : -1;
      const placeDroite = ARENA.playerXMax - p.x;
      const placeGauche = p.x + ARENA.playerXMax;
      const sens = placeDroite < 3 ? -1 : placeGauche < 3 ? 1 : versDroite;
      held.add(sens > 0 ? 'ArrowRight' : 'ArrowLeft');
      return;
    }

    // Sinon, il vise. Il garde sa cible tant qu'elle vit : en reprenant la plus
    // proche à chaque image, il change d'avis dès que deux ennemis se croisent et
    // ne tue jamais personne.
    if (!this.cible?.alive) this.cible = this._choisitCible(game, p);
    if (this.cible?.alive) {
      const dx = this.cible.group.position.x - p.x;
      if (dx > MORT_X) held.add('ArrowRight');
      else if (dx < -MORT_X) held.add('ArrowLeft');
    }

    // ET LES FIGURES. C'est une vitrine : il faut qu'on voie ce que le jeu sait
    // faire, sinon autant montrer une image fixe. Par ordre de beauté — la furie
    // et son aura d'abord, le bombardement en escadrille ensuite, la pirouette
    // pour meubler entre les deux.
    if (this.horloge > this.prochainCaprice) {
      this.prochainCaprice = this.horloge + 5 + ((this.horloge * 7) % 4);
      if (game.energy >= OVERDRIVE.odCost) game._tryOverdrive?.();
      else if (game.energy >= OVERDRIVE.bombCost && game.bombCooldown <= 0) game._tryBomb?.();
      else this._pirouette(game);
    }
  }

  // Un tonneau, du côté où il y a de la place. Depuis qu'il renvoie les tirs,
  // c'est le geste le plus spectaculaire du jeu et il ne coûte presque rien —
  // exactement ce qu'on veut montrer à quelqu'un qui hésite à appuyer sur
  // « Partie rapide ».
  _pirouette(game) {
    const p = game.player.position;
    const sens = p.x > 0 ? -1 : 1;
    game.player.startRoll?.(sens, game);
  }

  // La balle qui arrive sur lui, s'il y en a une. On ne regarde que celles qui
  // DESCENDENT vers lui et qui sont dans son couloir : le reste est du décor.
  _menaceLaPlusProche(game, p) {
    let plus = null;
    let meilleure = Infinity;
    game.enemyBullets.forEachActive((b) => {
      const pos = b.mesh.position;
      const dz = p.z - pos.z;
      if (dz < 0 || dz > MENACE_Z) return;
      if (Math.abs(pos.x - p.x) > MENACE_X + PLAYER.radius) return;
      if (dz < meilleure) {
        meilleure = dz;
        plus = pos;
      }
    });
    return plus;
  }

  // Le plus bas d'abord, pas le plus proche : c'est celui qui va tirer, et c'est
  // aussi celui qu'un humain regarde.
  _choisitCible(game, p) {
    let choix = null;
    let plusBas = -Infinity;
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const q = e.group.position;
      if (q.z > p.z - 2) continue; // déjà passé derrière : plus rien à en tirer
      if (q.z > plusBas) {
        plusBas = q.z;
        choix = e;
      }
    }
    return choix;
  }
}
