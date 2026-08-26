// HÉLIOS — le rayon qui traverse, et les satellites qui couvrent le reste.
//
// Cette coque n'a qu'un verbe : TENIR. Tout ce qui suit en découle. Le rayon est
// allumé en permanence — ce n'est donc pas « quand tirer » qui se décide, c'est OÙ
// l'on se tient. Sa puissance ne s'achète pas : elle se gagne à ne pas bouger et
// se perd à la première dérive.
//
// La récompense est double, et c'est délibéré (docs/classes.md, « HÉLIOS → LA
// CHAUFFE ») : le même contact tenu fait monter les dégâts ET remplit la jauge de
// furie. Le joueur n'a pas deux objectifs à tenir, il en a un seul, très exigeant.
//
// Deux contraintes ont dicté l'écriture du fichier :
//  · aucune allocation par frame — meshes, géométries et matières sont fabriqués
//    au constructeur puis recyclés ; rien n'est créé une fois la partie lancée ;
//  · aucun hasard dans la simulation. L'arme n'en a en fait besoin d'aucun : un
//    rayon continu et des satellites à cadence fixe sont entièrement déterministes,
//    ce qui rend le replay gratuit. Seules les étincelles décoratives, confiées à
//    fx, puisent encore dans Math.random — et elles n'ont aucun effet sur l'issue.

import * as THREE from 'three';
import { ARENA, PLAYER } from '../constants.js';

// ---- Le rayon ----

// Jusqu'où il porte. La formation la plus haute vit vers z = −22 ; on va au-delà
// pour que le trait SORTE du cadre au lieu de s'arrêter dans le vide, ce qui se
// lirait comme une portée limitée alors qu'il n'y en a pas.
const PORTEE_Z = -30;
// Le nez, d'où part le trait : la même avance que les traçantes d'ORION, sinon le
// rayon a l'air de naître à l'intérieur de la coque.
const NEZ_Z = -1.2;

// Demi-largeur par niveau de `cannons`. C'est tout ce que ce module achète ici :
// trois canons ne font pas trois rayons, ils font UN rayon large.
const DEMI_LARGEUR = [0.2, 0.85, 1.5];

// Le temps qu'il faut pour atteindre la puissance maximale, par niveau de
// `cannons`. Un rayon large monte plus lentement — sans ce prix-là, élargir
// n'aurait aucun inconvénient et le choix disparaîtrait.
const MONTEE_DUREE = [2.0, 2.6, 3.2];
// La montée ne récompense que les contacts LONGS, donc surtout les boss : c'est
// par elle qu'on règle l'écart entre les deux situations sans toucher au reste. À
// 3,5 la coque pliait un boss en 5,9 s quand ORION en met 20,6 — le rayon ne ratant
// jamais, une arme continue est structurellement avantagée sur une cible unique, et
// il faut le payer quelque part. Ce qui fait vraiment le sel de la tenue reste la
// CHAUFFE, qui remplit la jauge et ouvre l'Overdrive.
const MONTEE_MAX = 1.8; // ×1 au contact, ×1,8 une fois chargé

// LA SURCHAUFFE. Une arme dont la jauge s'appelle « chauffe » doit pouvoir trop
// chauffer, sans quoi le mot ne veut rien dire — et la mesure a montré qu'il ne
// voulait rien dire : sur une cible qui ne se dérobe pas, le rayon tenait 10,8
// dégâts par seconde indéfiniment et pliait un boss en 9 s là où ORION en met 20.
// La coque était la meilleure partout, ce qui est la seule chose qu'on ne voulait
// pas.
//
// Cinq secondes et demie de contact, une seconde de repos. Le réglage vise le boss
// et lui seul : la piétaille meurt en moins d'une seconde et l'on change de colonne
// bien avant d'y arriver, donc en vague la surchauffe ne se déclenche presque
// jamais. C'est le combat long — et uniquement lui — qui impose de lâcher la
// détente et de se replacer.
// Le seuil suit la DURÉE DE MONTÉE, il n'est pas un nombre de secondes en dur : à
// canons améliorés il faut 3,2 s pour saturer, et une surchauffe fixée à 2,8 aurait
// rendu la saturation inatteignable à celui qui a payé pour l'atteindre. Le piège
// aurait été parfaitement invisible.
//
// À 1,4, on garde toujours quatre dixièmes de pleine puissance avant de décrocher :
// assez pour que ça se sente, trop peu pour tenir un boss sans jamais lâcher.
const SURCHAUFFE_MUL = 1.4;
const REPOS = 1.0;

// Dégâts de base, en points par seconde, à cadence de tir nue. Calé sur ORION :
// 3,4 balles à 1 point la seconde. À charge pleine le rayon vaut donc trois fois
// et demie un flux droit, et c'est exactement ce qu'on paie en immobilité.
// Combien on peut dériver sans perdre sa montée. La demi-largeur du rayon s'y
// ajoute : un rayon large tient une ligne large, ce qui est le seul avantage
// consolant de sa montée plus lente.
// Le temps qu'on peut passer SANS toucher personne avant que la montée ne retombe.
// Sans elle, le trou d'un dixième de seconde entre deux rangs suffirait à tout
// perdre, et la coque serait injouable pour la raison la plus bête qui soit.
const GRACE = 0.3;

const DPS_BASE = 2.2;

// LA CHAUFFE. Le débit de jauge suit le temps de contact : un dixième de jauge par
// seconde après une seconde, un tiers après trois. L'exposant 1,1 fait passer la
// courbe par ces deux points-là précisément. Le plafond à trois secondes existe
// parce qu'au-delà la cible est morte ou c'est un boss : dans les deux cas il n'y
// a plus rien à récompenser davantage.
const CHAUFFE_PAR_SEC = 10; // jauge/s à une seconde de contact (la jauge va à 100)
const CHAUFFE_EXP = 1.1;
const CHAUFFE_PLAFOND = 3;

// ---- Les satellites ----

// Combien d'orbes, par niveau de `missiles`. Deux d'origine, quatre au bout — la
// fiche dit « jusqu'à quatre », et le dernier niveau doit rester un palier.
const SATELLITES = [2, 3, 3, 4];
const ORBITE_RAYON = 2.05;
const ORBITE_VITESSE = 1.35; // rad/s
const CADENCE_SAT = 1.05; // éclats/s et par satellite, à cadence de tir nue
const ECLAT_VITESSE = 30;
const ECLAT_PORTEE = 1.4; // secondes
const ECLAT_DEGATS = 1; // franc et ponctuel, exactement comme une balle
const ECLAT_RAYON = 0.32;

// L'arc dans lequel un satellite crache. On rabat le cercle de l'orbite sur
// l'avant : un orbe passé derrière tirerait sinon dans le vide une fois sur deux.
// La borne basse évite l'axe du rayon — qui laboure déjà cette colonne — et la
// borne haute reste en deçà du travers, pour que l'éclat croise quelque chose.
const ARC_MIN = 0.34; // ~20°
const ARC_MAX = 1.32; // ~76°

// ---- Rendu ----

const ANNEAUX = 5; // ondes qui remontent le rayon : elles lui donnent son SENS
const IMPACTS = 6; // points de contact affichés simultanément
const ECLATS_POOL = 40;

// Froid au contact, blanc-or à saturation. HÉLIOS était une récolteuse de lumière
// stellaire : quand elle chauffe, elle vire à la couleur de ce qu'elle regardait.
const FROID = 0x6fe8ff;
const CHAUD = 0xffe6a0;

export class ArmeHelios {
  constructor(scene) {
    this.scene = scene;

    // Une matière par COUCHE, partagée par toutes les pièces de cette couche : la
    // couleur monte avec la charge, et il faut qu'elle monte partout ensemble.
    const additif = (color, opacity) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });

    this.matCoeur = additif(0xffffff, 0.95);
    this.matHalo = additif(FROID, 0.34);
    this.matAura = additif(FROID, 0.11);
    this.matAnneau = additif(0xffffff, 0.5);
    this.matNez = additif(0xffffff, 0.9);
    this.matImpact = additif(0xffffff, 0.8);
    this.matOrbe = additif(FROID, 0.95);
    this.matOrbeHalo = additif(FROID, 0.25);
    this.matEclat = additif(CHAUD, 0.95);

    // Trois tubes emboîtés, et non trois boîtes. Une boîte additive montre ses
    // arêtes : le halo se lisait comme une dalle posée devant la caméra au lieu
    // d'un rayon. Un cylindre ouvert n'a ni couvercle ni arête franche, et les
    // trois opacités décroissantes font le dégradé qu'une texture aurait fait.
    // L'unité est en Y pour un cylindre : chaque tube est couché sur Z une fois
    // pour toutes, et c'est l'échelle qui donne rayon et longueur.
    const tube = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    const coucher = (m) => {
      m.rotation.x = Math.PI / 2;
      return m;
    };
    const traitNu = () => {
      const g = new THREE.Group();
      const aura = coucher(new THREE.Mesh(tube, this.matAura));
      const halo = coucher(new THREE.Mesh(tube, this.matHalo));
      const coeur = coucher(new THREE.Mesh(tube, this.matCoeur));
      g.add(aura, halo, coeur);
      g.visible = false;
      // Le rayon dépasse très largement du champ : laissé au test de frustum, il
      // disparaissait dès que son centre sortait du cadre.
      g.traverse((o) => (o.frustumCulled = false));
      scene.add(g);
      return { groupe: g, aura, halo, coeur };
    };

    this.trait = traitNu();
    // Le prolongement de l'autre côté de la couture. L'arène boucle et le vaisseau
    // s'y dessine déjà en deux morceaux ; son rayon doit suivre, sinon on tire
    // depuis une coque qu'on ne voit plus.
    this.couture = traitNu();

    // Les ondes qui remontent le trait. Le tore repose dans le plan XY, donc son
    // axe est déjà Z : aucune rotation à poser, il regarde la cible d'emblée.
    const geoAnneau = new THREE.TorusGeometry(1, 0.075, 6, 18);
    this.anneaux = [];
    for (let i = 0; i < ANNEAUX; i++) {
      const m = new THREE.Mesh(geoAnneau, this.matAnneau);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.anneaux.push(m);
    }

    // La bouche de l'émetteur : un noyau facetté et une couronne qui s'ouvre avec
    // la charge. C'est le seul endroit où la montée en puissance se lit sans avoir
    // à regarder ce qu'on est en train de tuer.
    this.nez = new THREE.Group();
    this.nezNoyau = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), this.matNez);
    this.nezCouronne = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 20), this.matAnneau);
    this.nez.add(this.nezNoyau, this.nezCouronne);
    this.nez.visible = false;
    scene.add(this.nez);

    // Les points de contact. Sans eux le rayon traverse la formation sans qu'on
    // sache ce qu'il mord : un dégât qu'on ne voit pas atterrir n'existe pas.
    const geoImpactCoeur = new THREE.SphereGeometry(0.34, 10, 10);
    const geoImpactAnneau = new THREE.TorusGeometry(0.62, 0.06, 6, 18);
    this.impacts = [];
    for (let i = 0; i < IMPACTS; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geoImpactCoeur, this.matImpact));
      g.add(new THREE.Mesh(geoImpactAnneau, this.matAnneau));
      g.visible = false;
      g.traverse((o) => (o.frustumCulled = false));
      scene.add(g);
      this.impacts.push(g);
    }

    // Les orbes. Les quatre existent toujours ; seuls les premiers se montrent,
    // selon le niveau de `missiles` — un pool qui grandit en jeu est une allocation.
    const geoOrbe = new THREE.IcosahedronGeometry(0.26, 0);
    const geoOrbeHalo = new THREE.SphereGeometry(0.5, 10, 10);
    this.satellites = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geoOrbe, this.matOrbe));
      g.add(new THREE.Mesh(geoOrbeHalo, this.matOrbeHalo));
      g.visible = false;
      scene.add(g);
      this.satellites.push(g);
    }

    // Les éclats. Un octaèdre orienté sur sa vitesse : une diagonale doit se lire
    // comme une diagonale, ce qu'une boîte alignée sur Z ne sait pas faire.
    const geoEclat = new THREE.OctahedronGeometry(0.17, 0);
    this.eclats = [];
    for (let i = 0; i < ECLATS_POOL; i++) {
      const m = new THREE.Mesh(geoEclat, this.matEclat);
      m.visible = false;
      scene.add(m);
      this.eclats.push({ mesh: m, actif: false, vel: new THREE.Vector3(), age: 0 });
    }

    // ---- L'état de simulation : tout ce qui part dans l'instantané ----

    // Secondes de contact ININTERROMPU sur la même cible. C'est la seule variable
    // qui compte vraiment : elle pilote les dégâts ET la jauge.
    this.tenu = 0;
    this.grace = 0;
    this.phase = 0; // angle d'orbite des satellites
    this.tirTimer = 0;
    this.prochain = 0; // quel orbe crache le prochain éclat
    this.sature = false;
    // Secondes de repos forcé restantes. Tant qu'il court, le rayon ne sort pas.
    this.repos = 0;
    this.horloge = 0; // temps de vie de l'arme, pour les pulsations

    // Dégâts fractionnaires en attente, par ennemi. On ne dépense qu'au POINT
    // ENTIER : appeler enemies.damage() soixante fois par seconde et par cible
    // noierait le pool de particules sous les étincelles de touche, et le rayon
    // deviendrait illisible là précisément où il touche le plus.
    this.enAttente = new Map();

    this.grainTimer = 0; // cadence des étincelles décoratives
    this.audioTimer = 0; // cadence des envois vers l'oscillateur entretenu
    this._contacts = 0;
    this._cible = null;

    this._couleur = new THREE.Color();
    this._froid = new THREE.Color(FROID);
    this._chaud = new THREE.Color(CHAUD);
    this._tmp = new THREE.Vector3();
    // clear() n'a pas de `game` sous la main, et c'est très bien : c'est un
    // extincteur, pas une frame. On retient donc l'audio de la dernière frame.
    this._audio = null;
  }

  update(dt, game) {
    this._audio = game.audio;
    this.horloge += dt;

    const levels = game.levels || {};
    const stats = game.stats || {};
    const niveauCanons = Math.max(0, Math.min(DEMI_LARGEUR.length - 1, levels.cannons | 0));
    const demi = DEMI_LARGEUR[niveauCanons];
    const duree = MONTEE_DUREE[niveauCanons];

    // Le rayon suit la commande de tir — automatique par défaut, donc allumé en
    // permanence comme la fiche l'exige. Celui qui coupe l'auto-tir garde malgré
    // tout le droit d'éteindre son émetteur : c'est sa seule façon de se taire.
    // Le repos court même détente relâchée : on ne triche pas avec la surchauffe en
    // coupant l'émetteur une frame. Il se décompte AVANT `actif`, qui en dépend.
    if (this.repos > 0) this.repos = Math.max(0, this.repos - dt);
    const actif = (game.cmd ? game.cmd.tir !== false : true) && this.repos <= 0;

    const p = game.player.position;
    const nezZ = p.z + NEZ_Z;

    // --- Ce que la colonne laboure, et qui l'on tient ---
    let cible = null;
    if (actif) {
      const dps = DPS_BASE * this._ratioCadence(stats) * this._montee(duree);
      this._brule(dt, game, p.x, nezZ, demi, dps);
      // La cible tenue est celle qui est la PLUS PROCHE du vaisseau : celle qu'on
      // va tuer, donc celle dont la mort remettra tout à zéro. Le piège de la
      // coque est là, et il doit être exactement là.
      cible = this._cible;
    } else {
      this._contacts = 0;
      this._cible = null;
    }

    // CE QU'ON TIENT, C'EST LE CONTACT.
    //
    // Deux définitions ont échoué avant celle-ci, et il faut dire pourquoi.
    //
    // La première liait la montée à l'IDENTITÉ de la cible : elle repartait de zéro
    // dès qu'un ennemi mourait. La piétaille a un à trois points de vie et tombe en
    // moins d'une seconde, contre deux pour saturer — HÉLIOS n'atteignait donc
    // jamais sa puissance, et valait ORION sans ses missiles.
    //
    // La seconde ancrait la montée à une COLONNE, c'est-à-dire à la position du
    // vaisseau. Mesurée, elle était pire : le contact le plus long de tout un
    // combat de boss durait SOIXANTE-SIX CENTIÈMES de seconde. Pour suivre une
    // cible il faut bouger, et bouger de plus d'une unité effaçait tout. La montée
    // en puissance de la coque n'existait pas — la fiche la promettait, le jeu ne
    // l'a jamais donnée une seule fois.
    //
    // Ce qui compte est donc plus simple, et c'est le verbe même de la coque : NE
    // PAS LÂCHER. Tant que le rayon touche quelque chose, la chauffe monte ; qu'il
    // brasse le vide plus de trois dixièmes de seconde, et tout retombe. Suivre sa
    // proie devient la bonne façon de jouer au lieu d'être punie, et c'est la
    // SURCHAUFFE — pas l'immobilité — qui empêche de tenir un boss indéfiniment.
    if (cible) {
      this.tenu += dt;
      this.grace = GRACE;
    } else if (this.grace > 0) {
      this.grace -= dt;
    } else if (this.tenu > 0) {
      // Le contact est bel et bien rompu : le débit retombe, la jauge acquise reste.
      // On oublie les dégâts en attente — perdre le contact efface la montée, il
      // serait incohérent qu'il en garde la monnaie.
      this.tenu = 0;
      this.sature = false;
      if (this.enAttente.size) this.enAttente.clear();
    }

    // --- LA CHAUFFE ---
    if (this.tenu > 0) {
      const t = Math.min(CHAUFFE_PLAFOND, this.tenu);
      game._addEnergy(CHAUFFE_PAR_SEC * Math.pow(t, CHAUFFE_EXP) * dt);
    }

    // La saturation s'annonce UNE fois. C'est le seul instant où le joueur apprend
    // que tenir plus longtemps ne rapportera plus rien de plus.
    if (!this.sature && this.tenu >= duree) {
      this.sature = true;
      game.audio?.laserSature?.();
      game.fx.shockwave(this._tmp.set(p.x, 0, nezZ), CHAUD, 3.4);
    }

    // Trop, c'est trop : l'émetteur décroche et se tait le temps de redescendre.
    // La montée repart de zéro — c'est bien la perte du contact qui coûte, pas une
    // pénalité de plus posée par-dessus.
    if (this.tenu >= duree * SURCHAUFFE_MUL) {
      this.repos = REPOS;
      this.tenu = 0;
      this.grace = 0;
      this.sature = false;
      this.enAttente.clear();
      game.audio?.laserCoupe?.();
      game.fx.shockwave(this._tmp.set(p.x, 0, nezZ), CHAUD, 5.2);
      // Court et sans sous-titre : c'est une information de combat, pas une leçon.
      game.hud?.announce?.('SURCHAUFFE', '', 900);
    }

    this._satellites(dt, game, p, levels, stats);
    this._eclats(dt, game);
    this._rendu(dt, game, p, nezZ, demi, duree, actif);
    this._son(dt, game, p, actif, duree);
  }

  // Le rapport à la cadence nue. Le Surcadenceur nourrit aussi le rayon : sur une
  // arme continue, « cadence » ne veut rien dire d'autre que « débit ».
  _ratioCadence(stats) {
    return (stats.fireRate || PLAYER.baseFireRate) / PLAYER.baseFireRate;
  }

  // Le multiplicateur de dégâts courant, de 1 à 3,5.
  _montee(duree) {
    return 1 + (MONTEE_MAX - 1) * Math.min(1, this.tenu / duree);
  }

  // Écart en x tenant compte du bouclage de l'arène : sortir par la gauche fait
  // rentrer par la droite, et le rayon n'a aucune raison d'être la seule chose du
  // jeu qui l'ignore.
  _ecartX(ex, bx) {
    let dx = ex - bx;
    if (!ARENA.wrap) return dx;
    const span = ARENA.playerXMax * 2;
    if (dx > span / 2) dx -= span;
    else if (dx < -span / 2) dx += span;
    return dx;
  }

  // Applique les dégâts à tout ce qui traverse la colonne, et retient au passage
  // la cible la plus avancée — celle dont dépend la montée en puissance.
  _brule(dt, game, bx, nezZ, demi, dps) {
    const enemies = game.enemies.list;
    let n = 0;
    let meilleure = null;
    let meilleureZ = -Infinity;

    for (const e of enemies) {
      if (!e.alive) continue;
      const pos = e.group.position;
      if (pos.z > nezZ || pos.z < PORTEE_Z) continue;
      const r = e.def.radius;
      if (Math.abs(this._ecartX(pos.x, bx)) > demi + r) continue;
      // Les ennemis flottent à quelques dixièmes du plan : la tranche est large
      // pour que ce test n'écarte jamais personne par accident. Mais il existe —
      // le jour où quelque chose volera plus haut, le rayon le laissera passer.
      if (Math.abs(pos.y) > 1.4 + r) continue;

      n++;
      if (pos.z > meilleureZ) {
        meilleureZ = pos.z;
        meilleure = e;
      }

      const du = (this.enAttente.get(e.id) || 0) + dps * dt;
      const entier = Math.floor(du);
      if (entier >= 1) {
        this.enAttente.set(e.id, du - entier);
        if (game.enemies.damage(e, entier, game)) {
          this.enAttente.delete(e.id);
          // Même protocole que _collisions() dans game.js : c'est lui qui compte
          // le combo, le score et les drops, et lui seul.
          game._onEnemyKilled(e, 'cannon');
        }
      } else {
        this.enAttente.set(e.id, du);
      }
    }

    this._cible = meilleure;
    this._contacts = n;
  }

  // --- Les satellites ---

  _satellites(dt, game, p, levels, stats) {
    const niveau = Math.max(0, Math.min(SATELLITES.length - 1, levels.missiles | 0));
    const combien = SATELLITES[niveau];
    this.phase += ORBITE_VITESSE * dt;
    if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;

    for (let i = 0; i < this.satellites.length; i++) {
      const g = this.satellites[i];
      if (i >= combien) {
        g.visible = false;
        continue;
      }
      const a = this.phase + (i * Math.PI * 2) / combien;
      g.visible = true;
      g.position.set(
        p.x + Math.sin(a) * ORBITE_RAYON,
        // Une orbite parfaitement plate est vue par la tranche : un léger
        // décalage vertical suffit à la lire comme une orbite et non un cercle.
        Math.cos(a * 2) * 0.22,
        p.z + Math.cos(a) * ORBITE_RAYON * 0.7
      );
      g.rotation.y = a * 1.7;
      g.rotation.x = this.horloge * 1.3;
    }

    // Un seul minuteur, et les orbes crachent chacun leur tour : la cadence totale
    // reste régulière quand leur nombre change, là où un minuteur par satellite
    // ferait tirer quatre orbes ensemble puis plus rien.
    const parSeconde = CADENCE_SAT * combien * this._ratioCadence(stats);
    const intervalle = 1 / Math.max(0.2, parSeconde);
    this.tirTimer -= dt;
    // Une boucle et non un `if` : à cadence maximale et sur une frame longue il
    // peut y avoir plus d'un éclat à sortir, et l'avaler serait une perte de débit
    // qui ne se verrait qu'en dessous de trente images par seconde.
    let secours = 8;
    while (this.tirTimer <= 0 && secours-- > 0) {
      this.tirTimer += intervalle;
      const i = this.prochain % combien;
      this.prochain = (this.prochain + 1) % combien;
      this._crache(game, this.satellites[i].position, this.phase + (i * Math.PI * 2) / combien);
    }
  }

  _crache(game, depuis, angle) {
    const e = this.eclats.find((x) => !x.actif);
    if (!e) return;
    // On rabat l'angle d'orbite sur l'arc avant : un orbe passé derrière crache
    // quand même vers l'avant, du côté où il se trouve.
    const a = Math.atan2(Math.sin(angle), Math.cos(angle));
    const cote = a >= 0 ? 1 : -1;
    const ouverture = ARC_MIN + (Math.abs(a) / Math.PI) * (ARC_MAX - ARC_MIN);
    e.actif = true;
    e.age = 0;
    e.mesh.position.copy(depuis);
    e.mesh.visible = true;
    e.vel.set(Math.sin(ouverture) * cote, 0, -Math.cos(ouverture)).multiplyScalar(ECLAT_VITESSE);
    e.mesh.lookAt(this._tmp.copy(e.mesh.position).add(e.vel));
    game.audio?.eclatSatellite?.();
  }

  _eclats(dt, game) {
    const enemies = game.enemies.list;
    for (const e of this.eclats) {
      if (!e.actif) continue;
      e.age += dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      // lookAt a mis le +Z local sur la vitesse : tourner autour de z fait rouler
      // l'éclat sur son axe de vol, ce qui l'anime sans le désorienter.
      e.mesh.rotation.z += dt * 9;
      const pos = e.mesh.position;
      if (
        e.age > ECLAT_PORTEE ||
        pos.z < ARENA.bulletCullZMin ||
        pos.z > ARENA.bulletCullZMax ||
        Math.abs(pos.x) > ARENA.bulletCullXMax
      ) {
        e.actif = false;
        e.mesh.visible = false;
        continue;
      }
      for (const cible of enemies) {
        if (!cible.alive) continue;
        const rr = cible.def.radius + ECLAT_RAYON;
        if (pos.distanceToSquared(cible.group.position) >= rr * rr) continue;
        e.actif = false;
        e.mesh.visible = false;
        game.fx.burst(pos, CHAUD, { count: 4, speed: 6, life: 0.25 });
        if (game.enemies.damage(cible, ECLAT_DEGATS, game)) {
          game._onEnemyKilled(cible, 'cannon');
        }
        break;
      }
    }
  }

  // --- Rendu ---

  _rendu(dt, game, p, nezZ, demi, duree, actif) {
    if (!actif) {
      this.trait.groupe.visible = false;
      this.couture.groupe.visible = false;
      this.nez.visible = false;
      for (const a of this.anneaux) a.visible = false;
      for (const i of this.impacts) i.visible = false;
      return;
    }

    const charge = Math.min(1, this.tenu / duree);

    // Toute l'arme change de couleur ensemble, du bleu froid au blanc-or : c'est
    // le signal le plus fort de la montée, et il se lit du coin de l'œil.
    this._couleur.copy(this._froid).lerp(this._chaud, charge);
    this.matHalo.color.copy(this._couleur);
    this.matAura.color.copy(this._couleur);
    this.matOrbe.color.copy(this._couleur);
    this.matOrbeHalo.color.copy(this._couleur);
    this.matCoeur.color.setRGB(1, 1 - charge * 0.06, 1 - charge * 0.18);

    // La pulsation s'accélère avec la charge : c'est un cœur qui bat plus vite, et
    // l'œil le comprend sans qu'aucun chiffre soit affiché.
    const bat = Math.sin(this.horloge * (26 + charge * 34));
    const largeur = demi * 2 * (1 + charge * 0.35);
    const longueur = nezZ - PORTEE_Z;
    const milieu = (nezZ + PORTEE_Z) / 2;

    this._poseTrait(this.trait, p.x, milieu, largeur, longueur, charge, bat);
    this.trait.groupe.visible = true;

    // La couture : le trait prolongé de l'autre côté de l'arène, aux mêmes
    // conditions que la coque du vaisseau.
    if (ARENA.wrap && ARENA.playerXMax - Math.abs(p.x) < ARENA.wrapGhostZone) {
      const span = ARENA.playerXMax * 2;
      const x = p.x > 0 ? p.x - span : p.x + span;
      this._poseTrait(this.couture, x, milieu, largeur, longueur, charge, bat);
      this.couture.groupe.visible = true;
    } else {
      this.couture.groupe.visible = false;
    }

    // Les ondes qui remontent le trait. Réparties à intervalle égal et remises en
    // tête par modulo : aucune n'est créée ni détruite, elles tournent en rond.
    // Elles s'ÉLARGISSENT en s'éloignant, faute de quoi le rayon a l'air fait de
    // perles régulières au lieu d'être un flux qui s'échappe.
    const vitesse = 26 + charge * 34;
    const pas = longueur / ANNEAUX;
    const rayon = demi * 0.85 + 0.35 + charge * 0.35;
    for (let i = 0; i < ANNEAUX; i++) {
      const m = this.anneaux[i];
      const parcours = (this.horloge * vitesse + i * pas) % longueur;
      const k = 1 + (parcours / longueur) * 0.5;
      m.visible = true;
      m.position.set(p.x, 0, nezZ - parcours);
      m.scale.set(rayon * k, rayon * k, k);
    }
    this.matAnneau.opacity = 0.18 + charge * 0.26 + bat * 0.05;

    // La bouche de l'émetteur.
    this.nez.visible = true;
    this.nez.position.set(p.x, 0, nezZ + 0.25);
    this.nez.rotation.y = this.horloge * 2.4;
    this.nez.rotation.x = this.horloge * 1.6;
    const ouvre = (0.6 + charge * 0.7) * (1 + bat * 0.09) * (0.7 + demi * 0.5);
    this.nezNoyau.scale.setScalar(ouvre);
    this.nezCouronne.scale.set(ouvre * (1.2 + charge * 0.5), ouvre * (1.2 + charge * 0.5), ouvre);
    this.matNez.opacity = 0.6 + charge * 0.3;

    this._impacts(dt, game, p.x, nezZ, demi, charge);

    // Un tremblement continu, proportionnel à la charge. Il ne doit jamais gêner
    // la lecture : c'est un ronronnement, pas un impact.
    if (this._contacts > 0) game.fx.addShake(0.28 * charge * dt);
  }

  // Les tubes sont couchés : leur Y local est la LONGUEUR, leur X et leur Z les
  // deux demi-axes de la section. Elle est volontairement aplatie — le jeu se voit
  // de haut, un rayon rond y perdrait toute sa largeur.
  _poseTrait(trait, x, milieu, largeur, longueur, charge, bat) {
    trait.groupe.position.set(x, 0, milieu);
    const k = largeur / 2;
    trait.coeur.scale.set(k * 0.3 * (1 + bat * 0.12), longueur, 0.18 + charge * 0.1);
    trait.halo.scale.set(k * 0.85 * (1 + bat * 0.05), longueur, 0.4 + charge * 0.25);
    // Le voile extérieur déborde d'une MARGE CONSTANTE, pas d'un multiple. En
    // proportion, le rayon large à saturation couvrait un tiers de l'arène : on ne
    // voyait plus ce qu'on brûlait, ce qui est le contraire du but recherché.
    trait.aura.scale.set(k + 0.85, longueur * 0.999, 0.9 + charge * 0.5);
    this.matHalo.opacity = 0.18 + charge * 0.2 + bat * 0.03;
    this.matAura.opacity = 0.05 + charge * 0.07;
    this.matCoeur.opacity = 0.75 + charge * 0.25;
  }

  _impacts(dt, game, bx, nezZ, demi, charge) {
    const enemies = game.enemies.list;
    let n = 0;
    for (const e of enemies) {
      if (n >= IMPACTS) break;
      if (!e.alive) continue;
      const pos = e.group.position;
      if (pos.z > nezZ || pos.z < PORTEE_Z) continue;
      const r = e.def.radius;
      if (Math.abs(this._ecartX(pos.x, bx)) > demi + r) continue;
      if (Math.abs(pos.y) > 1.4 + r) continue;
      const g = this.impacts[n++];
      g.visible = true;
      g.position.copy(pos);
      g.scale.setScalar((0.8 + charge * 0.9) * (1 + Math.sin(this.horloge * 30 + pos.z) * 0.14));
      g.rotation.z = this.horloge * 3.1;
    }
    for (let i = n; i < IMPACTS; i++) this.impacts[i].visible = false;
    this.matImpact.opacity = 0.45 + charge * 0.35;

    // Le grain de brûlure. Décoratif, donc autorisé à puiser dans Math.random via
    // fx — mais cadencé, sinon il avale à lui seul tout le pool de particules.
    this.grainTimer -= dt;
    if (n > 0 && this.grainTimer <= 0) {
      this.grainTimer = 0.07;
      game.fx.burst(this.impacts[0].position, charge > 0.6 ? CHAUD : 0x8ffbff, {
        count: 2 + Math.round(charge * 3),
        speed: 5 + charge * 6,
        life: 0.3,
        spread: 0.5,
      });
    }
  }

  // --- Son ---

  // Un rayon continu ne peut pas rejouer un son par frame : l'audio entretient un
  // oscillateur et on lui envoie une intensité. On la lui envoie à vingt hertz et
  // non soixante — chaque appel pose une automation dans le graphe WebAudio, et il
  // n'y a rien à gagner à en poser trois fois plus que l'oreille n'en distingue.
  _son(dt, game, p, actif, duree) {
    this.audioTimer -= dt;
    if (this.audioTimer > 0) return;
    this.audioTimer = 0.05;
    if (!actif) {
      game.audio?.laserCoupe?.();
      return;
    }
    const charge = Math.min(1, this.tenu / duree);
    // Le son dit deux choses distinctes : que le rayon est allumé, et qu'il MORD.
    // Un laser qui gronde autant dans le vide que dans la chair n'apprend rien.
    const intensite = (this._contacts > 0 ? 0.45 : 0.16) + charge * 0.55;
    game.audio?.laserBoucle?.(Math.min(1, intensite), p.x);
  }

  // --- Cycle de vie ---

  // L'écart latéral entre deux positions, sur une arène qui boucle : franchir la
  // couture ne doit pas compter pour vingt-neuf unités de dérive.

  clear() {
    this.tenu = 0;
    this.grace = 0;
    this.tirTimer = 0;
    this.prochain = 0;
    this.sature = false;
    this.repos = 0;
    this._cible = null;
    this._contacts = 0;
    this.enAttente.clear();
    this.trait.groupe.visible = false;
    this.couture.groupe.visible = false;
    this.nez.visible = false;
    for (const a of this.anneaux) a.visible = false;
    for (const i of this.impacts) i.visible = false;
    for (const s of this.satellites) s.visible = false;
    for (const e of this.eclats) {
      e.actif = false;
      e.mesh.visible = false;
    }
    this._audio?.laserCoupe?.();
  }

  // L'état sérialisable. Les éclats en vol n'en font PAS partie, et c'est un choix :
  // l'instantané est pris au début d'une vague, quand le ciel vient d'être vidé.
  // Les dégâts fractionnaires en attente non plus, pour la même raison — à cet
  // instant il n'y a personne dans la colonne, donc rien à retenir.
  instantane() {
    return [
      this.tenu,
      this.grace,
      this.phase,
      this.tirTimer,
      this.prochain,
      this.sature ? 1 : 0,
      this.repos,
    ];
  }

  restaure(etat) {
    this.clear();
    if (!etat) return;
    this.tenu = etat[0] || 0;
    this.grace = etat[1] || 0;
    this.phase = etat[2] || 0;
    this.tirTimer = etat[3] || 0;
    this.prochain = etat[4] || 0;
    this.sature = !!etat[5];
    this.repos = etat[6] || 0;
  }
}
