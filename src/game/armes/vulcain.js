// VULCAIN — la forge sous le volcan. Elle ne tire pas : elle POSE.
//
// Le vaisseau lâche des charges qui montent lentement et explosent en sphère. Tout
// le sel de la coque tient dans le délai : entre le moment où l'on décide et le
// moment où ça éclate, il se passe trois secondes, et pendant ces trois secondes
// la formation a bougé. On ne vise donc pas ce qu'on voit, on vise ce qui SERA là.
//
// Trois décisions structurent le fichier, et aucune n'est un détail :
//
//  1. LA RÉSERVE. La forge produit une charge toutes les deux secondes, mais le
//     lanceur ne la sort que s'il y a quelque chose à atteindre au-dessus. Se
//     mettre à l'écart REMPLIT le ventre (jusqu'à cinq), passer sous la nuée le
//     VIDE d'un coup. C'est ce qui met le pilotage au centre : les mains ne font
//     plus « esquiver et tirer », elles font « charger, puis se placer ».
//
//  2. LE SOUFFLE SE LIT AU RAYON. L'explosion est une sphère au rayon exact des
//     dégâts, et ce rayon est ANNONCÉ pendant les six derniers dixièmes de la
//     mèche par un cercle posé à plat. Une arme de zone dont on ne voit pas la
//     zone n'est pas jouable — elle est subie, y compris quand elle réussit.
//
//  3. LA SALVE, et elle seule, remplit la jauge. Un ennemi pris ne donne RIEN.
//     C'est la seule règle qui force à attendre que la formation se resserre au
//     lieu de pilonner, et attendre est précisément le verbe de la coque.
//
// Les charges ne blessent jamais le joueur : décision tranchée à la conception.
// Ce serait réaliste, et détestable.

import * as THREE from 'three';
import { ARENA } from '../constants.js';
import { ecart } from '../../core/rng.js';

// ---- La montée ----
//
// Une balle du joueur file à 34 u/s, une balle ennemie à 11,5, une gemme qui tombe
// à 4,5. À 6,5 la charge est l'objet le plus lent du ciel, et c'est exactement ce
// qu'on veut : le temps qu'elle met à monter est le temps qu'on a pour se tromper
// de cible. Sur les trois secondes de mèche elle couvre 19,5 unités — depuis le
// fond de l'arène, elle atteint le bas de la formation et pas ses rangs hauts.
const MONTEE = 6.5;
// `engine` sur cette coque. Au niveau 4 la charge monte à 10,2 u/s et couvre 30
// unités : la formation entière passe à portée. Le module ne change donc pas la
// puissance, il change la PROFONDEUR de tir — et comme la charge arrive plus tôt,
// il faut moins anticiper. C'est la lecture juste de « frappe plus près ».
const MONTEE_PAR_MOTEUR = 1.12;

// ---- La mèche ----
const FUSEE = 3.0;
// Ce qui se voit et s'entend avant l'éclatement. En dessous de la demi-seconde
// l'annonce arrive trop tard pour qu'on puisse encore reculer : elle ne servirait
// alors qu'à décorer une mort qu'on ne peut plus éviter.
const AMORCE = 0.6;

// ---- Le souffle ----
//
// La formation est maillée à 2,35 en largeur et 2,3 en profondeur. À 3,2 le souffle
// prend la case centrale et ses quatre voisines directes, et LAISSE les diagonales
// (à 3,29). Cinq ennemis d'un coup, soit exactement le sommet de la courbe de la
// SALVE, et seulement si la charge est posée au centre d'un bloc plein. Un rayon
// choisi sur la maille, donc, et pas sur une impression.
const RAYON = 3.2;
const RAYON_PAR_MISSILE = 1.35; // `missiles` : +35 % par niveau, comme prévu

// ---- Le rythme ----
// Deux secondes laissaient la réserve vide plus des deux tiers du temps : la coque
// passait l'essentiel de la vague à attendre sa forge, et « attends qu'ils se
// resserrent » devenait « attends, tout court ». À 1,7 la charge revient assez vite
// pour qu'on ait un choix à faire à chaque passage, ce qui est tout l'objet.
const INTERVALLE = 1.7;
// `firerate`. À six niveaux, l'intervalle tombe à 0,96 s : la forge double son
// débit sans jamais changer la nature de l'arme.
const INTERVALLE_PAR_CADENCE = 1 / 1.13;
const RESERVE_MAX = 5;
// Le débit du lanceur quand la réserve se vide. Cinq salves en neuf dixièmes de
// seconde : assez serré pour que ça se lise comme un TAPIS et non comme cinq tirs.
const DELAI_SALVE = 0.22;
// L'écart entre deux charges d'une même salve (`cannons`). À 3, deux souffles de
// rayon 3,2 se recouvrent d'un cheveu : la bande est continue, sans qu'aucune des
// deux ne gaspille son rayon dans celui de l'autre.
const ECART_SALVE = 3.0;
// Au-delà de quelle distance latérale la forge considère qu'il n'y a rien à
// atteindre. C'est ce chiffre qui décide si l'on charge ou si l'on décharge.
const VEILLE_LARGE = 4.0;

// ---- Ce que ça coûte à l'ennemi ----
//
// Trois points : de quoi vider un rang de drones et de guêpes, de quoi tuer une
// brute de base d'un seul souffle. Sept sur l'amiral, parce qu'une salve entière
// lui arrive dessus d'un coup (il fait 5,2 de rayon, aucune charge ne le rate) et
// que c'est la seule façon d'honorer « irrégulier, énorme si bien placé ».
const DEGATS = 3;
const DEGATS_BOSS = 7;
// L'amiral compte pour trois dans la SALVE. Sans ça, un combat de boss ne
// remplirait jamais la jauge — un seul ennemi à l'écran, donc zéro énergie, donc
// ni bombe ni Overdrive pendant le seul moment du jeu où l'on en a besoin. Il
// occupe un tiers de l'arène : le compter pour un pan de formation n'est pas une
// faveur, c'est une mesure.
const POIDS_BOSS = 3;

// ---- LA SALVE ----
//
// « Une explosion qui ne prend qu'un ennemi ne donne rien. Deux donnent un peu.
// Cinq remplissent un quart de la jauge. »
//
// D'où la forme : gain = 25 × ((n − 1) / 4) ^ 1,85. Elle vaut zéro à un ennemi par
// construction, vingt-cinq à cinq par construction, et l'exposant fait le reste.
// Mesuré : 0 — 1,9 — 6,9 — 14,5 — 25,0. De deux à cinq ennemis, la récompense est
// multipliée par treize alors que la prise ne l'est que par deux et demi : c'est
// ce rapport-là, et lui seul, qui rend l'attente plus payante que le pilonnage.
//
// Le plafond existe pour une raison précise : à sept ennemis la formule donne 54,
// et une seule charge financerait les trois quarts d'une bombe. On garde le
// vertige, on retire le raccourci.
const SALVE_CINQ = 25;
const SALVE_COURBE = 1.85;
const SALVE_MAX = 45;

// Rayon du corps de la charge, pour le contact.
const CONTACT = 0.45;

// Vingt en vol : cinq salves de trois lâchées en moins d'une seconde, plus la
// production courante. Le pool n'a jamais à refuser.
const NB_CHARGES = 20;
const NB_SOUFFLES = 16;

// Tant qu'elle monte, la charge est CYANE — la couleur du joueur, celle de ce qui
// est inerte et à soi. Elle ne devient incandescente qu'à l'amorçage. Ce virage de
// couleur est le télégraphe : il n'a besoin d'aucune légende, et il interdit de
// confondre une charge en route avec une charge sur le point d'éclater.
const INERTE = 0x8ffbff;
const CHAUDE = 0xff7b2e;
const SOUFFLE = 0xffb347;
const COEUR = 0xfff3d0;

// Interpolées à chaque frame sur les matériaux existants : deux couleurs figées
// ici, aucune allocation en vol.
const C_INERTE = new THREE.Color(INERTE);
const C_CHAUDE = new THREE.Color(CHAUDE);

export class ArmeVulcain {
  constructor(scene) {
    this.scene = scene;
    this._tmp = new THREE.Vector3();
    // Réutilisé à chaque détonation. Une explosion qui alloue son tableau de
    // victimes en alloue quinze en une seconde quand la réserve se vide.
    this._pris = [];

    this.reserve = 0;
    this.tProduction = INTERVALLE;
    this.tSalve = 0;

    // Géométries partagées par tout le pool : c'est la règle de la maison, et elle
    // vaut ici plus qu'ailleurs puisqu'un souffle peut naître quinze fois de suite.
    const geoNoyau = new THREE.SphereGeometry(0.34, 10, 8);
    const geoEnveloppe = new THREE.SphereGeometry(0.62, 12, 8);
    const geoSphere = new THREE.SphereGeometry(1, 18, 12);
    const geoAnneau = new THREE.RingGeometry(0.95, 1.0, 48);

    this.charges = [];
    for (let i = 0; i < NB_CHARGES; i++) {
      this.charges.push(this._faitCharge(geoNoyau, geoEnveloppe, geoAnneau));
    }
    this.souffles = [];
    for (let i = 0; i < NB_SOUFFLES; i++) {
      this.souffles.push(this._faitSouffle(geoSphere, geoAnneau));
    }
    this.ventre = this._faitVentre();
  }

  // Une charge : un noyau, son halo, et le cercle qui annonce le souffle. Les
  // matériaux sont propres à chaque exemplaire — soixante en tout, créés une fois —
  // parce que la couleur et l'opacité sont animées séparément sur chacun. Les
  // partager obligerait à faire l'amorçage par sauts d'échelle, et le virage de
  // couleur est justement ce qui rend l'amorçage lisible.
  _faitCharge(geoNoyau, geoEnveloppe, geoAnneau) {
    const groupe = new THREE.Group();
    const noyau = new THREE.Mesh(
      geoNoyau,
      new THREE.MeshBasicMaterial({ color: INERTE, toneMapped: false })
    );
    const enveloppe = new THREE.Mesh(
      geoEnveloppe,
      new THREE.MeshBasicMaterial({
        color: INERTE,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    // L'aperçu. Un cercle À PLAT, au rayon exact du souffle à venir — la caméra
    // regarde le plan de jeu d'en haut, une empreinte au sol s'y lit d'un coup
    // d'œil là où une sphère demanderait une seconde d'interprétation. Il ne bouge
    // jamais d'échelle pendant qu'il apparaît : un aperçu qui se rétracte
    // mentirait sur la seule chose qu'il est là pour dire.
    const apercu = new THREE.Mesh(
      geoAnneau,
      new THREE.MeshBasicMaterial({
        color: CHAUDE,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    apercu.rotation.x = -Math.PI / 2;
    groupe.add(noyau, enveloppe, apercu);
    groupe.visible = false;
    this.scene.add(groupe);
    return {
      groupe,
      noyau,
      enveloppe,
      apercu,
      active: false,
      x: 0,
      z: 0,
      v: 0,
      fusee: 0,
      rayon: 0,
      trace: 0,
    };
  }

  // Le souffle : une sphère en fil de fer au rayon des dégâts, un cœur plein qui
  // flashe, et l'empreinte au sol. Le fil de fer n'est pas une coquetterie — une
  // sphère pleine de sept unités bouche l'écran une demi-seconde, et une arme qui
  // cache la vague qu'elle vient de frapper se paie en morts qu'on n'a pas vues.
  _faitSouffle(geoSphere, geoAnneau) {
    const groupe = new THREE.Group();
    const sphere = new THREE.Mesh(
      geoSphere,
      new THREE.MeshBasicMaterial({
        color: SOUFFLE,
        transparent: true,
        opacity: 0,
        wireframe: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const coeur = new THREE.Mesh(
      geoSphere,
      new THREE.MeshBasicMaterial({
        color: COEUR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const anneau = new THREE.Mesh(
      geoAnneau,
      new THREE.MeshBasicMaterial({
        color: COEUR,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    anneau.rotation.x = -Math.PI / 2;
    groupe.add(sphere, coeur, anneau);
    groupe.visible = false;
    this.scene.add(groupe);
    return { groupe, sphere, coeur, anneau, vie: 0, duree: 0.55, rayon: 0 };
  }

  // Le ventre plein. Cinq braises sous la coque, une par charge en réserve, et
  // celle du milieu se remplit à mesure que la forge travaille : on voit donc
  // arriver la prochaine charge avant qu'elle ne sorte. Sans cet indicateur, la
  // mécanique centrale de la coque — se mettre à l'écart pour charger — n'est
  // visible nulle part, et personne ne la trouve.
  _faitVentre() {
    const groupe = new THREE.Group();
    const geo = new THREE.OctahedronGeometry(0.17);
    this.braises = [];
    for (let i = 0; i < RESERVE_MAX; i++) {
      const braise = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: CHAUDE,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      braise.position.x = (i - (RESERVE_MAX - 1) / 2) * 0.42;
      groupe.add(braise);
      this.braises.push(braise);
    }
    groupe.visible = false;
    this.scene.add(groupe);
    return groupe;
  }

  // ---- Les modules, tels qu'ils agissent SUR CETTE COQUE ----

  _montee(game) {
    return MONTEE * Math.pow(MONTEE_PAR_MOTEUR, game.levels?.engine || 0);
  }

  _rayon(game) {
    return RAYON * Math.pow(RAYON_PAR_MISSILE, game.levels?.missiles || 0);
  }

  _intervalle(game) {
    return INTERVALLE * Math.pow(INTERVALLE_PAR_CADENCE, game.levels?.firerate || 0);
  }

  update(dt, game) {
    this._produit(dt, game);
    this._lance(dt, game);
    this._avanceCharges(dt, game);
    this._avanceSouffles(dt);
    this._montreReserve(game);
  }

  // La forge tourne toute seule, à son rythme, et se tait quand le ventre est
  // plein. La minuterie reste alors armée sur un intervalle COMPLET : sans ça, la
  // première charge dépensée serait remplacée dans la frame suivante et la réserve
  // n'aurait plus de fond — on ne pourrait plus jamais la vider.
  _produit(dt, game) {
    const intervalle = this._intervalle(game);
    if (this.reserve >= RESERVE_MAX) {
      this.tProduction = intervalle;
      return;
    }
    this.tProduction -= dt;
    if (this.tProduction > 0) return;
    this.tProduction += intervalle;
    this.reserve++;
  }

  _lance(dt, game) {
    if (this.tSalve > 0) this.tSalve -= dt;
    if (this.reserve <= 0 || this.tSalve > 0) return;
    if (!this._quelqueChoseAuDessus(game)) return;
    this.reserve--;
    this.tSalve = DELAI_SALVE;
    this._pose(game);
  }

  // VULCAIN ne pose pas une charge sous un ciel vide : « j'y ai déjà mis ce qu'il
  // faut » suppose qu'il y ait un « là ». C'est ce test, et rien d'autre, qui fait
  // exister la réserve — et il transforme la position du vaisseau en levier :
  // s'écarter charge, se replacer décharge.
  //
  // Pas de bouclage de l'arène dans le calcul, alors que le vaisseau, lui, boucle.
  // C'est volontaire : le souffle ne boucle pas non plus, et une veille qui verrait
  // plus loin que l'explosion promettrait des salves qui n'atteindraient rien.
  _quelqueChoseAuDessus(game) {
    const p = game.player.position;
    const portee = this._montee(game) * FUSEE;
    const large = this._rayon(game) + VEILLE_LARGE;
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const q = e.group.position;
      const profondeur = p.z - q.z;
      // Derrière le vaisseau : la charge monte, elle ne fait pas demi-tour.
      if (profondeur < 0 || profondeur > portee + e.def.radius) continue;
      if (Math.abs(q.x - p.x) > large + e.def.radius) continue;
      return true;
    }
    return false;
  }

  _pose(game) {
    const p = game.player.position;
    const nb = 1 + (game.levels?.cannons || 0);
    const montee = this._montee(game);
    const rayon = this._rayon(game);
    for (let i = 0; i < nb; i++) {
      const c = this.charges.find((x) => !x.active);
      if (!c) break;
      c.active = true;
      c.x = p.x + (i - (nb - 1) / 2) * ECART_SALVE;
      c.z = p.z - 1.4; // devant les bras de lancement, jamais dans la coque
      c.v = montee;
      // Les mèches ne brûlent pas toutes à la même vitesse. Neuf centièmes d'écart
      // suffisent : la salve part groupée mais éclate en chaîne, ce qui se lit
      // comme un roulement au lieu d'un seul coup — et laisse à chaque souffle sa
      // propre prise à compter dans la SALVE.
      //
      // `ecart` et pas Math.random : la mèche décide de l'instant où l'explosion
      // tombe, donc de qui elle prend, donc de l'issue de la partie. Un tirage hors
      // du générateur semé et le replay diverge.
      c.fusee = FUSEE + ecart(0.09);
      c.rayon = rayon;
      c.trace = 0;
      c.groupe.position.set(c.x, 0, c.z);
      c.groupe.visible = true;
      c.apercu.scale.setScalar(rayon);
      c.apercu.material.opacity = 0;
      c.noyau.material.color.copy(C_INERTE);
      c.enveloppe.material.color.copy(C_INERTE);
    }
    game.audio?.chargePosee?.(p.x);
    game.fx.burst(this._tmp.set(p.x, 0, p.z - 0.9), INERTE, {
      count: 5,
      speed: 4,
      life: 0.28,
      spread: 0.7,
    });
  }

  _avanceCharges(dt, game) {
    for (const c of this.charges) {
      if (!c.active) continue;
      c.z -= c.v * dt;
      c.fusee -= dt;
      c.groupe.position.set(c.x, 0, c.z);

      // La traînée. C'est elle qui fait qu'on VOIT la charge monter : un point qui
      // se déplace lentement sur un ciel étoilé passe inaperçu, un sillage non.
      // Une étincelle tous les neuf centièmes et pas une par frame — à quinze
      // charges en vol, la seconde formule à elle seule viderait le pool de
      // particules du jeu entier.
      c.trace -= dt;
      if (c.trace <= 0) {
        c.trace = 0.09;
        game.fx.trail(c.groupe.position, c.fusee <= AMORCE ? CHAUDE : INERTE);
      }

      if (c.fusee <= AMORCE) {
        // L'amorçage. La forge s'ouvre : le noyau vire du cyan à l'incandescent, il
        // bat de plus en plus vite, et le cercle du souffle apparaît au sol. Trois
        // signaux pour une seule information, parce qu'à ce moment-là le joueur
        // regarde ailleurs.
        const k = 1 - Math.max(0, c.fusee) / AMORCE;
        const bat = 0.5 + 0.5 * Math.sin((AMORCE - c.fusee) * (16 + 70 * k));
        c.noyau.material.color.lerpColors(C_INERTE, C_CHAUDE, k);
        c.enveloppe.material.color.lerpColors(C_INERTE, C_CHAUDE, k);
        c.noyau.scale.setScalar(1 + k * (0.4 + 0.6 * bat));
        c.enveloppe.scale.setScalar(1 + k * (0.8 + 1.2 * bat));
        c.enveloppe.material.opacity = 0.3 + 0.45 * k;
        c.apercu.material.opacity = 0.1 * k + 0.3 * k * bat;
      } else {
        // En vol, elle ne fait que respirer. Ce calme n'est pas de l'économie : il
        // est le contraste sans lequel l'amorçage ne se remarquerait pas.
        // La phase vient de l'altitude et non d'une horloge — deux charges posées à
        // la suite battent donc en décalé, et l'état à sérialiser reste le même.
        const respire = 1 + Math.sin(c.z * 1.6) * 0.09;
        c.noyau.scale.setScalar(respire);
        c.enveloppe.scale.setScalar(respire);
        c.enveloppe.material.opacity = 0.3;
        c.apercu.material.opacity = 0;
      }

      // La mèche brûlée, ou le plafond de l'arène : dans les deux cas ça éclate.
      // Une charge qui sortirait du monde sans exploser serait la seule chose du
      // jeu à promettre quelque chose sans le tenir.
      if (c.fusee <= 0 || c.z <= ARENA.bulletCullZMin) {
        this._detonne(c, game);
        continue;
      }

      for (const e of game.enemies.list) {
        if (!e.alive) continue;
        const rr = e.def.radius + CONTACT;
        if (e.group.position.distanceToSquared(c.groupe.position) < rr * rr) {
          this._detonne(c, game);
          break;
        }
      }
    }
  }

  // Le protocole du jeu, à la lettre : `damage` renvoie true quand l'ennemi meurt,
  // et c'est alors à l'appelant d'appeler `_onEnemyKilled`. La cause s'appelle
  // 'charge' et pas 'cannon' — délibérément : la prime au plongeur abattu au canon
  // ne doit pas s'ajouter à la SALVE, sinon la coque toucherait deux fois pour le
  // même geste et son économie ne serait plus la sienne.
  _detonne(c, game) {
    c.active = false;
    c.groupe.visible = false;
    const pos = c.groupe.position;
    const r2 = c.rayon * c.rayon;

    this._pris.length = 0;
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      // Le CENTRE dans la sphère, un point. Ajouter le rayon de l'ennemi rendrait
      // la portée réelle plus grande que la sphère qu'on dessine — et c'est
      // précisément cette égalité qui rend l'arme jouable.
      if (e.group.position.distanceToSquared(pos) > r2) continue;
      this._pris.push(e);
    }

    let poids = 0;
    for (const e of this._pris) poids += e.type === 'boss' ? POIDS_BOSS : 1;
    for (const e of this._pris) {
      const degats = e.type === 'boss' ? DEGATS_BOSS : DEGATS;
      if (game.enemies.damage(e, degats, game)) game._onEnemyKilled(e, 'charge');
    }
    this._pris.length = 0;

    // LA SALVE. Un seul ennemi ne paie rien, et ce zéro est le cœur de la coque.
    if (poids >= 2) {
      const gain = SALVE_CINQ * Math.pow((poids - 1) / 4, SALVE_COURBE);
      game._addEnergy(Math.min(SALVE_MAX, gain));
    }

    this._allumeSouffle(pos, c.rayon, poids);
    game.audio?.detonation?.(poids, pos.x);
    game.fx.burst(pos, SOUFFLE, {
      count: 14 + poids * 4,
      speed: c.rayon * 2.4,
      life: 0.4,
      spread: c.rayon * 0.35,
    });
    game.fx.burst(pos, COEUR, { count: 8, speed: c.rayon * 1.2, life: 0.3 });
    game.fx.addShake(Math.min(0.7, 0.16 + poids * 0.09));
    // L'onde du jeu par-dessus la nôtre, mais seulement quand le coup a porté : le
    // pool d'anneaux n'a que six places et une salve ratée n'a rien à annoncer.
    if (poids >= 2) game.fx.shockwave(pos, SOUFFLE, c.rayon);
  }

  _allumeSouffle(pos, rayon, poids) {
    const s = this.souffles.find((x) => x.vie <= 0);
    if (!s) return;
    // Un gros coup reste à l'écran plus longtemps. C'est la seule récompense
    // visuelle de la SALVE, et elle arrive avant que le chiffre ne bouge au HUD.
    s.duree = 0.5 + Math.min(0.35, poids * 0.06);
    s.vie = s.duree;
    s.rayon = rayon;
    s.groupe.position.copy(pos);
    s.groupe.visible = true;
  }

  _avanceSouffles(dt) {
    for (const s of this.souffles) {
      if (s.vie <= 0) continue;
      s.vie -= dt;
      if (s.vie <= 0) {
        s.groupe.visible = false;
        continue;
      }
      const t = 1 - s.vie / s.duree;
      // Le souffle atteint SON rayon en seize centièmes, puis il ne bouge plus et
      // ne fait que s'éteindre. Cette immobilité est le geste entier : un anneau
      // qui continue de grandir en s'effaçant — la convention du jeu ailleurs — ne
      // dit à aucun moment jusqu'où l'explosion a porté.
      const ouvert = Math.min(1, t / 0.16);
      const taille = Math.max(0.001, s.rayon * (1 - Math.pow(1 - ouvert, 3)));
      s.sphere.scale.setScalar(taille);
      s.sphere.material.opacity = 0.75 * Math.pow(1 - t, 0.8);
      s.anneau.scale.setScalar(taille);
      s.anneau.material.opacity = 0.95 * (1 - t);
      // Le cœur : une boule pleine qui éclaire au premier tiers puis disparaît.
      // C'est lui qui donne le COUP ; la sphère, elle, donne la mesure.
      const coeur = Math.max(0, 1 - t / 0.35);
      s.coeur.scale.setScalar(Math.max(0.001, s.rayon * 0.5 * coeur));
      s.coeur.material.opacity = 0.85 * coeur;
    }
  }

  _montreReserve(game) {
    const p = game.player.position;
    this.ventre.visible = true;
    // Sous la coque et un peu en arrière : de face on ne verrait rien, et la
    // caméra regarde le plan de jeu à trente-huit degrés au-dessus de l'horizon.
    this.ventre.position.set(p.x, -0.2, p.z + 1.2);
    const intervalle = this._intervalle(game);
    for (let i = 0; i < this.braises.length; i++) {
      let force = 0;
      if (i < this.reserve) force = 1;
      // Celle qui est en train d'être forgée se remplit sous les yeux : la
      // prochaine charge s'annonce, elle ne surgit pas.
      else if (i === this.reserve) force = 1 - Math.max(0, this.tProduction) / intervalle;
      const braise = this.braises[i];
      braise.material.opacity = 0.05 + 0.6 * force;
      braise.scale.setScalar(0.45 + 0.55 * force);
    }
  }

  clear() {
    for (const c of this.charges) {
      c.active = false;
      c.groupe.visible = false;
    }
    for (const s of this.souffles) {
      s.vie = 0;
      s.groupe.visible = false;
    }
    this.reserve = 0;
    this.tProduction = INTERVALLE;
    this.tSalve = 0;
    this.ventre.visible = false;
  }

  // L'état de la forge, en nombres. Les charges en vol EN FONT PARTIE : une vague
  // peut commencer alors que trois mèches brûlent encore, et un replay qui
  // repartirait d'un ciel vide raconterait déjà une autre partie. Chacune emporte
  // sa position, sa vitesse, sa minuterie et son rayon — ce dernier parce qu'il est
  // figé à la pose : une charge lâchée avant un module `missiles` garde le souffle
  // pour lequel elle a été forgée.
  //
  // Format : [réserve, minuterie de forge, délai de salve, nombre de charges] puis
  // cinq nombres par charge.
  instantane() {
    const etat = [this.reserve, this.tProduction, this.tSalve, 0];
    let n = 0;
    for (const c of this.charges) {
      if (!c.active) continue;
      etat.push(c.x, c.z, c.v, c.fusee, c.rayon);
      n++;
    }
    etat[3] = n;
    return etat;
  }

  restaure(etat) {
    this.clear();
    if (!etat || etat.length < 4) return;
    this.reserve = etat[0];
    this.tProduction = etat[1];
    this.tSalve = etat[2];
    const n = etat[3];
    for (let i = 0; i < n; i++) {
      const c = this.charges[i];
      if (!c) break;
      const k = 4 + i * 5;
      c.active = true;
      c.x = etat[k];
      c.z = etat[k + 1];
      c.v = etat[k + 2];
      c.fusee = etat[k + 3];
      c.rayon = etat[k + 4];
      c.trace = 0;
      c.groupe.position.set(c.x, 0, c.z);
      c.groupe.visible = true;
      c.apercu.scale.setScalar(c.rayon);
      c.apercu.material.opacity = 0;
      c.noyau.material.color.copy(C_INERTE);
      c.enveloppe.material.color.copy(C_INERTE);
    }
  }
}
