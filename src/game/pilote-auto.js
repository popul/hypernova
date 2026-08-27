// LE PILOTE FANTÔME. Il joue pendant que personne ne regarde.
//
// L'écran d'accueil montrait un vaisseau immobile posé dans le vide. C'est le
// premier écran du jeu, celui qu'on regarde le plus longtemps, et il ne disait
// rien de ce qu'on allait faire. Les bornes d'arcade avaient réglé la question il
// y a quarante ans : quand personne ne joue, la machine joue toute seule.
//
// COMMENT IL DÉCIDE, ET POURQUOI PAS AUTREMENT.
//
// Première version : il repérait la balle la plus proche dans un couloir fixe
// devant lui et s'écartait du côté opposé. Mesuré, il encaissait un coup au bout
// de CINQ SECONDES ET NEUF DIXIÈMES, trois fois sur trois. Deux raisons, et les
// deux sont de fond :
//
//   — il regardait OÙ SONT les balles, pas où elles VONT. Une balle qui file en
//     diagonale sort de son couloir, ne compte pas, et le cueille deux dixièmes
//     plus tard ;
//   — il fuyait une balle sans regarder ce qu'il y avait de l'autre côté. Éviter
//     la première en se plaçant sous la deuxième est le grand classique du pilote
//     automatique naïf, et ça se paie immédiatement.
//
// Il évalue donc maintenant une VINGTAINE DE POSITIONS le long de l'arène, et
// pour chacune il calcule ce qui viendra la traverser dans la seconde et demie
// qui suit — en projetant chaque balle sur sa trajectoire, pas sur sa position.
// Puis il va vers la meilleure. C'est le même raisonnement qu'un joueur qui
// regarde le motif arriver et choisit son trou, et ça se voit à l'écran : il
// traverse l'écran pour se placer AVANT que ça n'arrive.

import { ARENA, OVERDRIVE, PLAYER } from './constants.js';

// Combien de positions il examine. Vingt et une donnent un pas de 1,45 unité sur
// une arène de vingt-neuf — plus fin que sa propre coque, ce qui est la seule
// finesse utile : deux positions séparées de moins que ça sont le même abri.
const CANDIDATS = 21;
// Jusqu'où il regarde devant. Une seconde et demie, c'est le temps qu'il faut à
// une balle pour traverser la moitié de l'arène : au-delà il anticiperait des
// choses qui auront changé, en deçà il déciderait trop tard.
const HORIZON = 1.5;
// La largeur qu'il considère comme touchée. Sa coque plus une marge : jouer au
// millimètre le ferait passer entre deux balles à chaque fois, ce qui est
// impressionnant une seconde et illisible ensuite.
const GARDE = PLAYER.radius + 0.55;
// Ce que coûte un déplacement, dans la note finale. Sans ce prix, il change
// d'avis à chaque image entre deux abris équivalents et vibre sur place.
const PRIX_TRAJET = 0.045;

export class PiloteAuto {
  constructor() {
    this.horloge = 0;
    this.prochainCaprice = 3;
    this.cible = null;
    this.but = 0;
  }

  reinitialise() {
    this.horloge = 0;
    this.prochainCaprice = 3;
    this.cible = null;
    this.but = 0;
  }

  update(dt, game) {
    if (!game?.player?.alive) return;
    this.horloge += dt;
    const held = game.input.held;
    held.clear();

    const p = game.player.position;
    const menaces = this._menaces(game, p);
    this.but = this._meilleurePlace(game, p, menaces);

    const ecart = this.but - p.x;
    // Le palier d'immobilité : sans lui, il corrige à chaque image et le vaisseau
    // tremble au lieu de viser.
    if (ecart > 0.3) held.add('ArrowRight');
    else if (ecart < -0.3) held.add('ArrowLeft');

    // IL RECULE. Le vaisseau peut se déplacer en profondeur, et le pilote ne s'en
    // servait pas du tout — il jouait sur une seule dimension quand le jeu en
    // offre deux. Or reculer devant un plongeur n'est pas seulement une fuite :
    // ça ACHÈTE DU TEMPS, et le temps est exactement ce qui manque quand un
    // vaisseau qui vous suit arrive à trois unités. Il avance à nouveau dès que
    // le ciel est dégagé, parce que tirer de près tue plus vite.
    const talonne = menaces.some((m) => m.t < 0.5 && Math.abs(m.x - p.x) < GARDE + 2);
    if (talonne) held.add('ArrowDown');
    else if (!menaces.some((m) => m.t < 1)) held.add('ArrowUp');

    this._figures(game, menaces, p);
  }

  // Tout ce qui peut le toucher, réduit à ce qui compte : où ce sera, et quand.
  // Les balles sont projetées sur leur trajectoire ; les ennemis qui plongent
  // valent une menace immobile, puisqu'ils fondent sur lui sans dévier.
  _menaces(game, p) {
    const out = [];
    game.enemyBullets.forEachActive((b) => {
      const pos = b.mesh.position;
      const vz = b.vel.z;
      if (vz <= 0) return; // elle s'éloigne : rien à en craindre
      const t = (p.z - pos.z) / vz;
      if (t < 0 || t > HORIZON) return;
      out.push({ x: pos.x + b.vel.x * t, t, poids: 1 });
    });
    // TOUS LES ENNEMIS, PAS SEULEMENT LES PLONGEURS.
    //
    // Je ne comptais que ceux en piqué, ce qui paraissait suffisant — la
    // formation reste haute. Mesuré, c'était la cause de presque tous les coups
    // encaissés : au moment de l'impact il n'y avait NI balle NI ennemi vivant à
    // moins de trois unités, parce qu'une collision de plein fouet tue l'ennemi
    // dans le même appel et qu'il avait déjà disparu de la liste. Le pilote se
    // jetait donc sur des vaisseaux qu'il ne regardait pas, en traversant l'écran
    // pour aller viser quelqu'un d'autre.
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const q = e.group.position;
      const dz = p.z - q.z;
      if (dz < -3 || dz > 26) continue;
      const plonge = e.state === 'diving';
      // Un plongeur arrive vite et fait mal : il pèse plus, et son abri est plus
      // large. Un ennemi de formation ne descend presque pas, mais il suffit de
      // lui rentrer dedans.
      // UN PLONGEUR SUIT SA PROIE. Le compter à sa position actuelle revient à
      // croire qu'il continuera tout droit, alors qu'il corrige vers le vaisseau
      // pendant toute sa descente : on s'écarte, il s'écarte aussi. On le place
      // donc à mi-chemin entre où il est et où l'on est — ce qui, en pratique,
      // dit « ce côté-ci est condamné » et pousse à passer de l'autre.
      const t = plonge ? Math.max(0, dz / 22) : Math.max(0, dz / 6);
      out.push({
        x: plonge ? q.x + (p.x - q.x) * 0.45 : q.x,
        t,
        poids: plonge ? 4 : 2.2,
        large: e.def.radius + (plonge ? 1.1 : 0.3),
      });
    }
    return out;
  }

  // La meilleure place, tout considéré : ce qui va la traverser, ce qu'il en
  // coûte d'y aller, et ce qu'on y gagne — un ennemi dans l'axe.
  _meilleurePlace(game, p, menaces) {
    const max = ARENA.playerXMax - 0.6;
    let meilleur = p.x;
    let meilleureNote = -Infinity;

    if (!this.cible?.alive) this.cible = this._choisitCible(game, p);
    const viseur = this.cible?.alive ? this.cible.group.position.x : null;

    for (let i = 0; i < CANDIDATS; i++) {
      const x = -max + (i / (CANDIDATS - 1)) * max * 2;
      let note = 0;

      for (const m of menaces) {
        const garde = GARDE + (m.large || 0);
        const d = Math.abs(m.x - x);
        const urgence = 1 - m.t / HORIZON;

        // LE TRAJET COMPTE AUTANT QUE LA DESTINATION.
        //
        // C'était le vrai défaut, et il ne se voyait pas dans les chiffres : le
        // pilote choisissait une place parfaitement sûre à l'autre bout de
        // l'arène, et se faisait cueillir EN CHEMIN par ce qu'il traversait pour
        // y aller. Au moment de l'impact il visait −9,7 depuis 0,5, et le
        // plongeur était à une unité sur sa droite. La destination était bonne ;
        // la route ne l'était pas.
        //
        // Une menace SITUÉE ENTRE la position actuelle et la place visée coûte
        // donc, elle aussi — d'autant plus qu'elle est imminente, puisqu'on ne
        // passera pas avant.
        const entre = (m.x - p.x) * (x - p.x) > 0 && Math.abs(m.x - p.x) < Math.abs(x - p.x);
        if (entre && Math.abs(m.x - p.x) > garde * 0.5) {
          note -= m.poids * (0.4 + urgence * 1.6) * 7;
        }

        if (d > garde * 2.2) continue;
        // Plus c'est imminent, plus ça compte : une menace à une seconde et demie
        // laisse le temps de bouger encore, celle à deux dixièmes non.
        const proximite = Math.max(0, 1 - d / (garde * 2.2));
        note -= m.poids * proximite * proximite * (0.35 + urgence * 1.65) * 10;
      }

      // Le tir compte, mais après la survie : viser rapporte des points, se faire
      // toucher coûte une vie. Le facteur dit exactement ça.
      if (viseur !== null) note += Math.max(0, 1 - Math.abs(viseur - x) / 5) * 1.6;
      note -= Math.abs(x - p.x) * PRIX_TRAJET;

      if (note > meilleureNote) {
        meilleureNote = note;
        meilleur = x;
      }
    }
    this._noteBut = meilleureNote;
    return meilleur;
  }

  // Le plus bas d'abord, pas le plus proche : c'est celui qui va tirer, et c'est
  // aussi celui qu'un humain regarde.
  _choisitCible(game, p) {
    let choix = null;
    let plusBas = -Infinity;
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const q = e.group.position;
      if (q.z > p.z - 2) continue;
      if (q.z > plusBas) {
        plusBas = q.z;
        choix = e;
      }
    }
    return choix;
  }

  // LES FIGURES. C'est une vitrine : il faut qu'on voie ce que le jeu sait faire.
  // Mais elles passent après la survie — un pilote qui lâche une bombe pendant
  // qu'une balle lui arrive dessus a l'air bête, pas brave.
  _figures(game, menaces, p) {
    // La pirouette d'abord, et pour une VRAIE raison : quand une menace est
    // imminente et qu'aucune place n'est vraiment sûre, le tonneau est la seule
    // sortie — il traverse les tirs et les renvoie. C'est aussi le geste le plus
    // spectaculaire du jeu, ce qui tombe bien.
    const imminente = menaces.some(
      (m) => m.t < 0.28 && Math.abs(m.x - p.x) < GARDE + (m.large || 0)
    );
    if (imminente && !game.player.rolling) {
      game.player.startRoll?.(p.x > 0 ? -1 : 1);
      return;
    }

    if (this.horloge < this.prochainCaprice) return;
    // Il ne se fait plaisir que lorsque le ciel est dégagé devant lui.
    if (menaces.some((m) => m.t < 0.8)) return;
    this.prochainCaprice = this.horloge + 6 + ((this.horloge * 7) % 4);
    if (game.energy >= OVERDRIVE.odCost) game._tryOverdrive?.();
    else if (game.energy >= OVERDRIVE.bombCost && game.bombCooldown <= 0) game._tryBomb?.();
    else game.player.startRoll?.(p.x > 0 ? -1 : 1);
  }
}
