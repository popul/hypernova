// LE SOUTIEN AÉRIEN — les deux coques qu'on n'a PAS choisies viennent bombarder.
//
// La jauge pleine ne donne plus une explosion, elle donne un APPEL. Et l'idée
// tient en une phrase : le joueur choisit ORION, HÉLIOS ou VULCAIN au décollage,
// donc à tout instant il existe deux coques qu'il ne pilote pas. Ce sont elles
// qui arrivent. Rien à inventer, rien à modéliser : la fiction du choix de coque
// était déjà là, on ne fait que la retourner.
//
// Chacune bombarde à SA manière, et c'est le seul endroit du jeu où l'on peut
// voir les trois verbes côte à côte : la rafale serrée d'ORION, le trait large et
// net d'HÉLIOS, la charge lente et énorme de VULCAIN. Un joueur qui hésite
// entre deux coques au menu voit ici ce qu'il rate.
//
// TROIS CONTRAINTES ONT ÉCRIT CE FICHIER.
//
// 1. AUCUN DÉGÂT ICI. La séquence appelle `onImpact(position, rayon)` et c'est
//    l'appelant qui frappe. La simulation reste à un seul endroit — sans quoi le
//    rejeu vérifiable, qui est la promesse du classement, tomberait.
//
// 2. AUCUN TIRAGE DE SIMULATION. Le tapis a l'air irrégulier, mais il ne consomme
//    pas une seule fois `alea()` : le semis est calculé au constructeur avec sa
//    propre graine fixe. C'est indispensable, et pas par élégance — le rejeu
//    compare le NOMBRE de tirages consommés (`tirages()`), donc une séquence qui
//    puiserait dans le flux commun ferait diverger toutes les parties où le joueur
//    a appuyé sur le bouton. Le hasard décoratif (étincelles, choix de réplique)
//    reste sur Math.random, comme partout ailleurs.
//
// 3. LE VAISSEAU EST RENDU INTACT. On n'anime QUE `position.y`, parce que c'est le
//    seul axe que `Player.update` n'écrit jamais : il pose x, z et les trois
//    rotations à chaque frame. Toucher au reste, ce serait se battre contre lui à
//    60 Hz et perdre. La hauteur de départ est relevée au démarrage et reposée
//    telle quelle à la fin comme à l'annulation — c'est une seule valeur à
//    restaurer, donc une restauration qu'on peut prouver.
//
// BUDGET. Quatre appels de dessin pour les deux ailiers (une coque fusionnée + une
// lueur fusionnée chacun), plus deux instanciés pendant le tapis — l'ordnance et
// les anneaux d'impact. Six au pic, quatre pendant l'appel, zéro le reste du temps.
// Mesuré : 640 triangles pour les deux ailiers, 600 de plus réserves pleines, soit
// 1 240 au maximum. Les ailiers sont FUSIONNÉS : `createPlayerShip` rend une
// quinzaine de meshes, et deux vaisseaux posés tels quels coûtaient trente appels
// de dessin pour trois secondes d'écran, sur téléphone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng.js';
import { COQUES } from './constants.js';
import { createPlayerShip } from './ships.js';

// ---------------------------------------------------------------- La partition
//
// Tout est en secondes depuis `start()`. Les bornes sont des instants absolus et
// non des durées enchaînées : une séquence dont on lit les étapes dans une seule
// colonne se relit et se retouche, une cascade de `duree1 + duree2 + …` se corrige
// toujours au mauvais endroit.

const T_MONTEE = 0.75; // le vaisseau a fini de s'élever
const T_ENTREE = 0.35; // les ailiers s'ébranlent (pendant la réplique)
const T_FORMATION = 1.45; // ils sont en place, le premier largage part
const T_LARGAGE = 2.05; // largeur de la fenêtre de largage
const T_RUPTURE = T_FORMATION + T_LARGAGE; // 3,50 — dernier largage, ils cassent
const D_SORTIE = 0.8; // temps qu'ils mettent à quitter le cadre
// Le vaisseau ne redescend qu'APRÈS le dernier impact (mesuré : 3,960 s, la
// charge la plus lente de VULCAIN étant encore en l'air quand l'escadrille rompt).
// Le faire revenir pendant que ça tombe encore casserait la seule chose que la
// surélévation avait à dire : tant qu'il est là-haut, il est hors de tout.
const T_DESCENTE = 4;
const D_DESCENTE = 0.6;
const T_MOT_FIN = 4.35;
const T_TOTAL = 4.9;

// La réplique d'ouverture n'est PAS dite à l'instant zéro. `Game.update` appelle
// `characters.setCalme()` à chaque frame, et un `setCalme(true)` vide la réplique
// mise en attente sur petit écran : si l'on parlait avant ce vidage, la phrase en
// attente écraserait la nôtre une frame plus tard. Deux centièmes suffisent à
// passer après lui.
const T_APPEL = 0.1;

// L'accélération du tapis. Le k-ième largage part à `u^EXPO` de la fenêtre, avec
// u linéaire : un exposant sous 1 resserre les intervalles à mesure qu'on avance.
// À 0,8, ORION passe de 355 ms entre deux bombes à 184 ms — assez pour qu'on
// ENTENDE le rythme monter, pas assez pour que ça devienne un bourdonnement. Ce
// sont les intervalles AVANT écartement (voir SEPARATION), qui en bouscule
// quelques-uns pour que les trois coques ne se marchent pas dessus.
const EXPO = 0.8;

// ---------------------------------------------------------------- La zone
//
// Le mot demandé est « tapisser ». Il oblige à une garantie, pas à une intention :
// aucun point de l'aire de jeu ne doit pouvoir échapper au tapis. On l'obtient par
// CONSTRUCTION — trois bandes contiguës et fixes, un semis régulier dans chacune,
// et un rayon d'explosion plus grand que la pire distance possible à l'impact le
// plus proche (voir MANIERES). Vérifier après coup un semis aléatoire, c'est
// s'assurer qu'un jour une partie aura un couloir intact sans que personne ne
// comprenne pourquoi.
//
// LES BANDES NE SUIVENT PAS LE JOUEUR, et ça s'est payé pour être appris : une
// première version les accrochait à la formation, qui dérivait vers lui. Joueur
// collé au bord droit, tout glissait de deux unités, et le bord gauche de l'arène
// sortait des bandes — il restait un couloir vivant, en (-14,5 ; -4,5), dans une
// séquence qui promet d'avoir tout rasé. Les bandes sont donc arrimées à l'ARÈNE,
// et seuls les vaisseaux dérivent. C'est aussi la seule version dont on puisse
// démontrer la couverture sur un tableau, sans jouer.

const BANDE = 10; // trois bandes = 30 unités, soit les ±14,5 jouables avec la marge
const ZONE_Z0 = -23; // au-delà de la formation la plus haute (z ≈ -17) et du boss
const ZONE_PROF = 29; // jusqu'à z = +6, soit juste devant le vaisseau
const JITTER_X = 0.55;
const JITTER_Z = 0.75;

// Le vol. Les ailiers tiennent le centre de leur bande, à ±10 — c'est-à-dire SUR
// leur zone de largage et non sur l'aile du joueur. Ils dérivent quand même un peu
// vers lui pour qu'on lise une escadrille et pas trois tourelles, mais la dérive
// s'arrête aux vaisseaux : le tapis, lui, ne bouge pas d'un pouce (voir ci-dessus).
// Un peu plus d'une unité de battement, c'est assez pour que la formation ait l'air
// vivante et trop peu pour qu'on remarque qu'un ailier n'est pas exactement au-dessus
// de ce qu'il bombarde.
const ALTITUDE = 5.6;
const SUIVI = 0.35;
const SUIVI_MAX = 3;

// Écart minimal entre deux impacts, toutes coques confondues. Trois cadences
// indépendantes finissent forcément par se croiser : la première mesure donnait
// deux détonations à une milliseconde l'une de l'autre, ce qui ne fait ni deux
// coups ni un gros — juste un temps perdu et un son doublé. On écarte donc le
// semis fusionné après coup, ce qui coûte au plus quelques centièmes sur la queue
// de la séquence et rend chaque impact audible.
const SEPARATION = 0.05;

// ---------------------------------------------------------------- Les manières
//
// `rayon` est le rayon de dégâts annoncé à l'appelant, et la garantie de couverture
// se lit ici. Le point le plus mal loti d'une bande est un COIN de maille : il est
// au pire à BANDE/(2·cols) + JITTER_X en travers et ZONE_PROF/(2·rangs) + JITTER_Z
// en profondeur de l'impact le plus proche, et ces deux écarts se composent —
// c'est une hypoténuse, pas une somme, et confondre les deux est exactement
// l'erreur qui laisse un couloir vivant dans un coin.
//
//   ORION   : √(3,05² + 3,65²) = 4,76  <  5,2
//   HÉLIOS  : √(3,05² + 5,58²) = 6,36  <  7,4
//   VULCAIN : idem                     <  8,8
//
// Marge la plus fine : ORION, quatre dixièmes d'unité. Toucher à `rangs`, à
// ZONE_PROF ou aux jitters oblige à refaire ces trois lignes.
//
// `chute` est le temps de vol de l'ordnance. Il n'est pas décoratif : c'est lui
// qui donne à la surélévation sa raison d'être — on est monté pour bombarder de
// haut, donc ça tombe, donc ça met du temps.
const MANIERES = {
  // ORION tire droit et vite. Sa bande reçoit DIX petites charges au lieu de six :
  // le tapis y est plus fin et plus rapide, exactement comme son canon.
  orion: {
    cols: 2,
    rangs: 5,
    rayon: 5.2,
    chute: 0.26,
    retard: 0,
    teinte: 0x4ff2ff,
    livree: 'flotte',
    libre: true,
  },
  // HÉLIOS ne lâche pas une bombe, il POUSSE une charge. Elle descend à vitesse
  // constante (`libre: false`) là où les deux autres tombent en accélérant : c'est
  // un trait qui traverse, pas un objet qui tombe. Ajouté à la chute la plus courte
  // du lot, on reconnaît son rayon avant d'avoir lu la couleur.
  helios: {
    cols: 2,
    rangs: 3,
    rayon: 7.4,
    chute: 0.2,
    retard: 0.13,
    teinte: 0xffc857,
    livree: 'or',
    libre: false,
  },
  // VULCAIN lance lourd et lent, et ça explose en sphère. La chute la plus longue
  // du lot : ses charges sont encore en l'air quand l'escadrille rompt.
  vulcain: {
    cols: 2,
    rangs: 3,
    rayon: 8.8,
    chute: 0.46,
    retard: 0.26,
    teinte: 0xff9a3c,
    livree: 'braise',
    libre: true,
  },
};

// Réserves. Dimensionnées sur le pire chevauchement réel et non au jugé : au plus
// serré, ORION a deux charges en l'air, VULCAIN deux, HÉLIOS une — cinq. Les
// anneaux vivent 0,42 s pour une cadence de pointe de 11,4 impacts par seconde,
// soit cinq simultanés. On double, une fois pour toutes.
const POOL_ORDNANCE = 10;
const POOL_ANNEAUX = 10;
const VIE_ANNEAU = 0.42;

// ---------------------------------------------------------------- Les répliques
//
// NOVA parle, et il n'y a personne d'autre pour le faire : la fenêtre de comm ne
// connaît que deux visages, et fabriquer un troisième interlocuteur pour deux
// phrases coûterait plus qu'il ne rapporte. Elle est de toute façon la mieux
// placée — c'est elle qui tient la table de vol, et l'escadron s'appelait NOVA.
// Elle NOMME les deux coques : c'est la seule ligne du jeu qui apprenne au joueur
// que les autres existent vraiment.
//
// Trente-cinq à quarante-cinq signes, pas plus. La fenêtre reste affichée
// 1 400 ms + 75 ms par caractère : au-delà de quarante-cinq signes, la phrase
// d'ouverture est encore à l'écran quand celle de clôture arrive.
const APPELS = [
  'Soutien aérien. {A}, {B} : sur zone.',
  'J’appelle {A} et {B}. Monte, et ne bouge plus.',
  '{A}, {B} — sur ma position. Prends de l’altitude.',
];

// « Bombardement terminé », dans son registre : elle constate, elle ne félicite
// pas, et elle remet le joueur au travail dans la même phrase.
const CLOTURES = [
  'Bombardement terminé. Ils rentrent.',
  'Tapis posé. Zone retournée. Redescends.',
  'Terminé. Ils repartent, tu reprends l’axe.',
];

function tire(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

// ---------------------------------------------------------------- Outillage

function easeOut(x) {
  const k = 1 - x;
  return 1 - k * k * k;
}

function easeIn(x) {
  return x * x * x;
}

function easeInOut(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// mergeGeometries rend `null` au moindre désaccord d'attributs, et un mesh bâti
// sur null plante au rendu très loin de la cause. Même parade que dans cine/props.
function fusionne(parts, etiquette) {
  const geo = mergeGeometries(parts, false);
  if (!geo) throw new Error(`Fusion de géométrie impossible : ${etiquette}`);
  for (const p of parts) p.dispose();
  return geo;
}

// APLATIR UNE COQUE EN DEUX MESHES.
//
// `createPlayerShip` rend une quinzaine de meshes répartis sur trois matières
// (coque, sombre, accent). On les refond en deux : ce qui est ÉCLAIRÉ et ce qui
// BRILLE. Les teintes partent dans un attribut de sommet, ce qui permet de garder
// une seule matière par mesh — et donc un seul appel de dessin.
//
// Les deux repères de collision du joueur (`hitcore`, `hitring`) sont laissés de
// côté : ils disent « c'est ICI qu'on te touche », et sur un ailier ce serait
// faux — on ne peut ni le toucher ni le perdre.
function coqueFusionnee(fiche) {
  const source = createPlayerShip(fiche);
  source.updateMatrixWorld(true);

  const eclairees = [];
  const brillantes = [];
  source.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'hitcore' || o.name === 'hitring') return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const n = geo.attributes.position.count;
    const teintes = new Float32Array(n * 3);
    const c = o.material.color;
    for (let i = 0; i < n; i++) {
      teintes[i * 3] = c.r;
      teintes[i * 3 + 1] = c.g;
      teintes[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(teintes, 3));
    (o.material.isMeshBasicMaterial ? brillantes : eclairees).push(geo);
  });

  // La coque témoin ne sert qu'à cette récolte : elle n'entre jamais dans la scène.
  source.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    o.material.dispose();
  });

  const groupe = new THREE.Group();
  // flatShading conservé : les normales fusionnées sont ignorées de toute façon,
  // et c'est ce facettage qui fait que le vaisseau du joueur et l'ailier sont
  // manifestement sortis de la même chaîne.
  groupe.add(
    new THREE.Mesh(
      fusionne(eclairees, 'ailier — coque'),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        metalness: 0.72,
        roughness: 0.33,
      })
    )
  );
  // toneMapped:false, comme les accents du joueur : c'est ce qui les fait passer
  // au-dessus du seuil du bloom et donner un halo.
  groupe.add(
    new THREE.Mesh(
      fusionne(brillantes, 'ailier — lueur'),
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    )
  );
  groupe.visible = false;
  return groupe;
}

// Attribut de couleur plein de un, uniquement pour autoriser `vertexColors` : sans
// lui three.js déclare bien l'attribut dans la nuance sans le remplir, et les
// instances sortent NOIRES. C'est `instanceColor` qu'on veut, il passe par là.
function autoriseTeinte(geo) {
  const blanc = new Float32Array(geo.attributes.position.count * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(blanc, 3));
  return geo;
}

function instancie(geo, nb) {
  const mesh = new THREE.InstancedMesh(
    autoriseTeinte(geo),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    nb
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nb * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  // Une boule englobante n'a aucun sens pour un nuage d'instances qui couvre
  // l'arène entière : ou bien elle est toujours visible, ou bien elle escamote la
  // moitié des impacts. On coupe l'écrêtage plutôt que de le laisser deviner.
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  return mesh;
}

export class SoutienAerien {
  constructor(scene) {
    this.scene = scene;

    // Une seule graine, fixe, pour tout le semis. Deux parties, deux machines, deux
    // relectures : le même tapis. Voir l'en-tête, point 2.
    const graine = mulberry32(0x50757a1e);

    // Les trois coques sont bâties d'avance, y compris celle que le joueur pilote —
    // on ne sait pas encore laquelle il aura prise, et fabriquer un vaisseau en
    // pleine partie est exactement ce que la règle des réserves interdit. Deux
    // seront montrées, la troisième restera invisible : 320 triangles dormants.
    this.coques = {};
    for (const c of COQUES) {
      const m = MANIERES[c.id];
      const groupe = coqueFusionnee({ carene: c.carene, livree: m.livree, tier: 0, levels: {} });
      scene.add(groupe);
      this.coques[c.id] = {
        id: c.id,
        nom: c.nom,
        maniere: m,
        groupe,
        semis: this._semis(m, graine),
        // Réécrits à chaque `start()` : rien n'est alloué en cours de séquence.
        entree: new THREE.Vector3(),
        station: new THREE.Vector3(),
        sortie: new THREE.Vector3(),
        rupture: new THREE.Vector3(),
        precedent: new THREE.Vector3(),
        bandeX: 0,
        cote: 0,
        curseur: 0,
        trainee: 0,
      };
    }
    this._espace();

    // L'ordnance : un fuseau qui pointe le long de sa vitesse. Huit triangles.
    this.ordnance = instancie(
      new THREE.OctahedronGeometry(1).scale(0.22, 0.22, 0.8),
      POOL_ORDNANCE
    );
    scene.add(this.ordnance);

    // L'anneau d'impact, posé à plat. Son échelle finale vaut EXACTEMENT le rayon
    // transmis à `onImpact` : le joueur voit donc la portée réelle du tapis, et
    // non une approximation flatteuse. C'est aussi la seule façon de régler les
    // rayons à l'œil sans instrumenter le jeu.
    this.anneaux = instancie(
      new THREE.RingGeometry(0.86, 1, 26).rotateX(-Math.PI / 2),
      POOL_ANNEAUX
    );
    scene.add(this.anneaux);

    // Réserves d'ordnance et d'anneaux, allouées une fois pour toutes.
    this.bombes = [];
    for (let i = 0; i < POOL_ORDNANCE; i++) {
      this.bombes.push({
        vif: false,
        depart: new THREE.Vector3(),
        cible: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        t: 0,
        duree: 1,
        rayon: 0,
        libre: true,
        coque: '',
        teinte: new THREE.Color(),
        trainee: 0,
      });
    }
    this.impacts = [];
    for (let i = 0; i < POOL_ANNEAUX; i++) {
      this.impacts.push({
        vif: false,
        pos: new THREE.Vector3(),
        vie: 0,
        rayon: 0,
        teinte: new THREE.Color(),
      });
    }

    this._pion = new THREE.Object3D();
    this._v = new THREE.Vector3();
    this._teinte = new THREE.Color();

    this._temps = 0;
    this._enCours = false;
    this._game = null;
    this._onImpact = null;
    this._onDone = null;
    // `_ailiers` sont les deux coques montrées, `_bombardiers` les trois qui
    // larguent (le joueur compris). Deux listes remplies au démarrage et jamais
    // recréées : construire `[centre, ...ailiers]` à chaque frame, c'est trois
    // tableaux par seconde de jeu, précisément ce que la règle des réserves
    // interdit — et le genre de détail qui ne se voit que sur un vieux téléphone.
    this._ailiers = [];
    this._bombardiers = [];
    this._centre = null;
    this._yInitial = 0;
    this._appelDit = false;
    this._clotureDite = false;
    this._restants = 0;
  }

  // LE SEMIS D'UNE COQUE, en coordonnées de bande (x relatif au centre de bande).
  //
  // Les rangs sont parcourus du plus LOIN au plus près, et les colonnes en
  // alternance d'un rang à l'autre. Ce n'est pas de la coquetterie : un tapis qui
  // descend rang par rang en zigzag se lit comme une PASSE, un semis dans le
  // désordre se lit comme du bruit. Et descendre vers le joueur donne le sens de
  // lecture — ça vient de la formation ennemie, ça avance vers lui.
  _semis(m, graine) {
    const points = [];
    const pasX = BANDE / m.cols;
    const pasZ = ZONE_PROF / m.rangs;
    for (let r = 0; r < m.rangs; r++) {
      for (let c = 0; c < m.cols; c++) {
        const col = r % 2 === 0 ? c : m.cols - 1 - c;
        points.push({
          x: -BANDE / 2 + (col + 0.5) * pasX + (graine() - 0.5) * 2 * JITTER_X,
          z: ZONE_Z0 + (r + 0.5) * pasZ + (graine() - 0.5) * 2 * JITTER_Z,
          largage: 0,
        });
      }
    }
    const n = points.length;
    for (let k = 0; k < n; k++) {
      const u = n > 1 ? k / (n - 1) : 0;
      points[k].largage = T_FORMATION + m.retard + (T_LARGAGE - m.retard) * Math.pow(u, EXPO);
    }
    return points;
  }

  // ÉCARTEMENT DU SEMIS FUSIONNÉ. Les trois cadences sont calculées séparément —
  // il le faut, chaque coque a la sienne — mais l'oreille, elle, n'en entend
  // qu'une. On repasse donc une fois sur les vingt-deux impacts dans l'ordre et on
  // repousse ceux qui tombent à moins de SEPARATION du précédent.
  //
  // Repousser plutôt que réordonner : chaque coque garde ainsi ses largages dans
  // l'ordre croissant, ce qui est la condition pour que le curseur de `_largue`
  // marche. Le décalage se propage vers la queue et n'y ajoute que quelques
  // centièmes — mesuré, et T_DESCENTE en tient compte.
  _espace() {
    const tous = [];
    for (const id of Object.keys(this.coques)) {
      const c = this.coques[id];
      for (const p of c.semis) tous.push({ p, chute: c.maniere.chute });
    }
    tous.sort((a, b) => a.p.largage + a.chute - (b.p.largage + b.chute));
    let precedent = -Infinity;
    for (const e of tous) {
      const impact = Math.max(e.p.largage + e.chute, precedent + SEPARATION);
      e.p.largage = impact - e.chute;
      precedent = impact;
    }
  }

  get actif() {
    return this._enCours;
  }

  // Rend false si la séquence ne peut pas démarrer. Un seul motif de refus qui
  // vaille : elle est déjà en cours. Refuser silencieusement serait pire que tout —
  // l'appelant a déjà prélevé la jauge quand il arrive ici.
  start({ game, coqueJoueur, onImpact, onDone } = {}) {
    if (this._enCours) return false;
    if (!game?.player?.group) return false;

    this._game = game;
    this._onImpact = onImpact || null;
    this._onDone = onDone || null;
    this._temps = 0;
    this._enCours = true;
    this._appelDit = false;
    this._clotureDite = false;

    // LA SEULE VALEUR À RESTAURER. Relevée avant toute écriture, reposée à la fin
    // et à l'annulation. Voir l'en-tête, point 3.
    this._yInitial = game.player.group.position.y;

    const centre = COQUES.find((c) => c.id === coqueJoueur)?.id || COQUES[0].id;
    const autres = COQUES.filter((c) => c.id !== centre);

    // Gauche puis droite dans l'ordre de COQUES : deux parties identiques doivent
    // montrer la même escadrille au même endroit, sinon le rejeu ment à l'image.
    this._ailiers.length = 0;
    for (let i = 0; i < autres.length; i++) {
      const a = this.coques[autres[i].id];
      a.cote = i === 0 ? -1 : 1;
      a.bandeX = a.cote * BANDE;
      a.curseur = 0;
      a.trainee = 0;
      a.groupe.visible = true;
      this._ailiers.push(a);
    }
    // Le joueur prend la bande centrale, mais son groupe reste invisible : c'est le
    // VRAI vaisseau qui lâche ses bombes, pas une doublure posée par-dessus.
    const moi = this.coques[centre];
    moi.bandeX = 0;
    moi.curseur = 0;
    moi.groupe.visible = false;
    this._centre = moi;

    this._bombardiers.length = 0;
    this._bombardiers.push(moi, ...this._ailiers);
    this._restants = this._bombardiers.reduce((n, c) => n + c.semis.length, 0);

    // Position initiale des ailiers, calculée une fois : ils entrent des deux coins
    // arrière-bas et remontent en formation. Entrer par-derrière, c'est entrer par
    // où le joueur est entré — on les reconnaît comme des vaisseaux amis avant même
    // de distinguer leur silhouette.
    const px = game.player.group.position.x;
    const pz = game.player.group.position.z;
    const cx = THREE.MathUtils.clamp(px, -SUIVI_MAX, SUIVI_MAX) * SUIVI;
    for (const a of this._ailiers) {
      a.entree.set(cx + a.cote * 24, -1.5, pz + 18);
      a.groupe.position.copy(a.entree);
      a.precedent.copy(a.entree);
      a.groupe.rotation.set(0, 0, 0);
    }

    game.audio?.jumpGo?.();
    game.fx?.shockwave?.(game.player.group.position, 0x8ffbff, 5);
    game.hud?.announce?.('SOUTIEN AÉRIEN', autres.map((c) => c.nom).join(' · '), 1400);
    return true;
  }

  update(dt, game) {
    if (!this._enCours) return;
    const jeu = game || this._game;
    const avant = this._temps;
    this._temps += dt;
    const t = this._temps;

    // Sur petit écran, une réplique lancée en plein combat est mise de côté et dite
    // « au prochain moment calme ». Ici le moment CALME, c'est maintenant : le
    // vaisseau est hors d'atteinte, il n'y a aucune esquive à ne pas gêner. On
    // emprunte donc le répit du jeu — le même levier qu'il utilise après une vague
    // nettoyée — plutôt que de forcer un drapeau qu'il réécrit à chaque frame.
    if (jeu && t < T_TOTAL) jeu.repit = Math.max(jeu.repit || 0, T_TOTAL - t + 0.3);

    this._parle(jeu, avant, t);
    this._eleve(jeu, t);
    this._vole(jeu, dt, t);
    this._largue(jeu, t);
    this._chute(jeu, dt);
    this._anneaux(dt);

    if (t >= T_TOTAL) this._termine();
  }

  // Arrêt net : on repose le vaisseau et on appelle quand même `onDone`.
  //
  // Ce n'est pas une négligence, c'est le choix le moins coûteux en cas de panne.
  // `onDone` est ce qui REND le joueur mortel. Une annulation qui l'escamoterait
  // laisserait un vaisseau invincible jusqu'à la fin de la partie, et ce score-là
  // irait au classement. Entre « le joueur perd une demi-seconde d'invincibilité »
  // et « le panthéon est faux », le choix n'a pas à être discuté.
  annule() {
    if (!this._enCours) return;
    this._range();
    this._acheve();
  }

  // ---- Étapes ----

  _parle(jeu, avant, t) {
    const perso = jeu?.characters;
    if (!perso) return;
    if (!this._appelDit && t >= T_APPEL) {
      this._appelDit = true;
      const [a, b] = this._ailiers;
      perso.sayText(
        tire(APPELS)
          .replace('{A}', a?.nom || 'HÉLIOS')
          .replace('{B}', b?.nom || 'VULCAIN'),
        { priority: true, emotion: 'determine' }
      );
    }
    if (!this._clotureDite && avant < T_MOT_FIN && t >= T_MOT_FIN) {
      this._clotureDite = true;
      perso.sayText(tire(CLOTURES), { priority: true, emotion: 'neutre' });
    }
  }

  // LA SURÉLÉVATION. C'est elle qui doit faire comprendre l'invincibilité, sans
  // un mot d'interface : un vaisseau qui monte de cinq unités et demie sort du plan
  // où volent les balles, et le sol de l'arène passe visiblement sous lui. On monte
  // en easeOut (un décollage est brutal puis se pose) et on redescend en easeInOut
  // (un retour en formation se négocie des deux côtés).
  _eleve(jeu, t) {
    const groupe = jeu?.player?.group;
    if (!groupe) return;
    let y = this._yInitial;
    if (t < T_MONTEE) {
      y += ALTITUDE * easeOut(t / T_MONTEE);
    } else if (t < T_DESCENTE) {
      // Une respiration d'un dixième d'unité : sans elle le vaisseau a l'air
      // POSÉ sur une étagère invisible, et l'apesanteur ne se lit plus.
      y += ALTITUDE + Math.sin((t - T_MONTEE) * 3.1) * 0.12;
    } else if (t < T_DESCENTE + D_DESCENTE) {
      y += ALTITUDE * (1 - easeInOut((t - T_DESCENTE) / D_DESCENTE));
    }
    groupe.position.y = y;
  }

  _vole(jeu, dt, t) {
    const p = jeu?.player?.group?.position;
    if (!p) return;
    // La dérive ne touche QUE les vaisseaux. `bandeX` est posé une fois pour toutes
    // au démarrage et n'est pas relu ici : c'est ce qui sépare une escadrille qui
    // respire d'un tapis qui glisse hors de l'arène.
    const cx = THREE.MathUtils.clamp(p.x, -SUIVI_MAX, SUIVI_MAX) * SUIVI;

    for (const a of this._ailiers) {
      // La station est recalculée à chaque frame parce que le joueur, lui, bouge :
      // une formation figée sur la position de départ se transformerait en trois
      // vaisseaux qui s'ignorent au bout d'une seconde.
      a.station.set(a.bandeX + cx, ALTITUDE - 0.5, p.z + 1.2);
      a.precedent.copy(a.groupe.position);

      if (t < T_RUPTURE) {
        const u = THREE.MathUtils.clamp((t - T_ENTREE) / (T_FORMATION - T_ENTREE), 0, 1);
        if (u < 1) {
          a.groupe.position.lerpVectors(a.entree, a.station, easeOut(u));
        } else {
          // En formation, l'ailier POURSUIT sa station au lieu de s'y coller : le
          // décalage d'un demi-battement est tout ce qui sépare une escadrille de
          // trois objets rigidement liés.
          a.groupe.position.lerp(a.station, Math.min(1, 5 * dt));
        }
        a.rupture.copy(a.groupe.position);
        // La cible de sortie est tenue à jour tant qu'on est en formation, et GELÉE
        // à la rupture. Un ailier qui a mis les gaz ne recalcule pas son cap sur un
        // vaisseau qu'il vient de quitter : la première version relisait la position
        // du joueur à chaque frame, et un joueur qui reculait pendant la sortie
        // repoussait la cible plus vite que l'ailier ne l'atteignait — il partait à
        // l'infini au lieu de sortir du cadre.
        a.sortie.set(a.bandeX + cx + a.cote * 4, ALTITUDE + 6, p.z - 52);
      } else {
        // Sortie plein gaz vers le haut du cadre : ils repartent par où arrivent
        // les ennemis, ce qui les remet à leur place — ce sont des chasseurs, pas
        // des renforts qui font demi-tour.
        const u = THREE.MathUtils.clamp((t - T_RUPTURE) / D_SORTIE, 0, 1);
        a.groupe.position.lerpVectors(a.rupture, a.sortie, easeIn(u));
      }

      // ORIENTATION DÉDUITE DU DÉPLACEMENT, jamais posée à la main. Le nez des
      // coques du jeu pointe vers -Z, d'où l'atan2 sur les composantes inversées.
      //
      // Mais un ailier en formation ne se déplace presque plus, et prendre le cap
      // de sa vitesse le laissait FIGÉ à quarante degrés — celui de son virage
      // d'arrivée — pendant les deux secondes du bombardement. Sous une vitesse
      // plancher, le cap voulu redevient donc « nez vers l'avant », comme celui du
      // joueur : la formation se remet dans l'axe au lieu de rester en crabe.
      this._v.subVectors(a.groupe.position, a.precedent);
      const vitesse = this._v.length() / Math.max(dt, 1e-4);
      const capVoulu = vitesse > 1.5 ? Math.atan2(-this._v.x, -this._v.z) : 0;
      let ecart = capVoulu - a.groupe.rotation.y;
      // Ramené dans ]-π, π] : sans ça, un cap qui franchit ±π fait faire un tour
      // complet au vaisseau pour rejoindre une orientation voisine.
      ecart -= Math.PI * 2 * Math.round(ecart / (Math.PI * 2));
      const suivi = Math.min(1, 6 * dt);
      a.groupe.rotation.y += ecart * suivi;

      // Inclinaison proportionnelle à la vitesse LATÉRALE : un ailier qui rentre
      // par le côté à quinze unités par seconde se met sur la tranche, puis se
      // remet à plat en formation. Lissée comme le cap, pour la même raison — une
      // aile qui se remet à plat en une frame se lit comme un bug d'affichage.
      const derive = this._v.x / Math.max(dt, 1e-4);
      const gite = THREE.MathUtils.clamp(-derive * 0.055, -1, 1);
      a.groupe.rotation.z += (gite - a.groupe.rotation.z) * suivi;

      // Traînée : une particule tous les quarante millièmes tant qu'il file. Rien
      // à dessiner en plus, c'est le nuage de fx qui la porte.
      a.trainee -= dt;
      if (vitesse > 7 && a.trainee <= 0) {
        a.trainee = 0.04;
        jeu?.fx?.trail?.(a.groupe.position, a.maniere.teinte);
      }
    }
  }

  // Largages franchis pendant cette frame. Le curseur avance dans un tableau trié
  // par instant de largage : chaque point est donc consommé une fois et une seule,
  // sans avoir à mémoriser lesquels ont déjà servi ni à comparer à la frame d'avant.
  _largue(jeu, t) {
    for (const coque of this._bombardiers) {
      const semis = coque.semis;
      while (coque.curseur < semis.length && semis[coque.curseur].largage <= t) {
        this._lache(jeu, coque, semis[coque.curseur]);
        coque.curseur++;
      }
    }
  }

  _lache(jeu, coque, point) {
    const slot = this.bombes.find((b) => !b.vif);
    if (!slot) return;
    const m = coque.maniere;
    const source = coque === this._centre ? jeu?.player?.group?.position : coque.groupe.position;
    if (!source) return;

    slot.vif = true;
    slot.depart.copy(source);
    slot.cible.set(coque.bandeX + point.x, 0, point.z);
    slot.pos.copy(slot.depart);
    slot.t = 0;
    slot.duree = m.chute;
    slot.rayon = m.rayon;
    slot.libre = m.libre;
    slot.coque = coque.id;
    slot.teinte.setHex(m.teinte);
    slot.trainee = 0;
    jeu?.audio?.chargePosee?.(slot.depart.x);
  }

  _chute(jeu, dt) {
    let n = 0;
    for (const b of this.bombes) {
      if (!b.vif) continue;
      b.t += dt;
      if (b.t >= b.duree) {
        b.vif = false;
        this._impact(jeu, b);
        continue;
      }
      const u = b.t / b.duree;
      // Horizontale linéaire, verticale en CHUTE LIBRE (u²) : c'est la parabole
      // d'un objet lâché, et l'œil la reconnaît immédiatement comme une bombe
      // plutôt que comme un projectile guidé. HÉLIOS fait exception et descend en
      // u — sa charge est poussée, pas lâchée.
      b.pos.set(
        THREE.MathUtils.lerp(b.depart.x, b.cible.x, u),
        THREE.MathUtils.lerp(b.depart.y, b.cible.y, b.libre ? u * u : u),
        THREE.MathUtils.lerp(b.depart.z, b.cible.z, u)
      );
      this._pion.position.copy(b.pos);
      this._pion.lookAt(b.cible);
      this._pion.scale.set(1, 1, 1);
      this._pion.updateMatrix();
      this.ordnance.setMatrixAt(n, this._pion.matrix);
      this.ordnance.setColorAt(n, b.teinte);
      n++;

      b.trainee -= dt;
      if (b.trainee <= 0) {
        b.trainee = 0.035;
        jeu?.fx?.trail?.(b.pos, b.teinte.getHex());
      }
    }
    this.ordnance.count = n;
    this.ordnance.visible = n > 0;
    if (n > 0) {
      this.ordnance.instanceMatrix.needsUpdate = true;
      if (this.ordnance.instanceColor) this.ordnance.instanceColor.needsUpdate = true;
    }
  }

  _impact(jeu, b) {
    // LE SEUL POINT DE CONTACT AVEC LA SIMULATION. On annonce un centre et un
    // rayon, et on s'arrête là.
    //
    // Le centre transmis est la CIBLE et non la dernière position interpolée : à
    // 30 images par seconde le vecteur de vol est une demi-unité en amont, et
    // l'appelant frapperait à côté de l'anneau que le joueur voit. Deux nombres
    // différents pour le même impact, c'est un bug de calibrage garanti le jour où
    // quelqu'un règlera les rayons à l'œil.
    b.pos.copy(b.cible);
    this._onImpact?.(b.pos, b.rayon);
    this._restants--;

    const anneau = this.impacts.find((a) => !a.vif);
    if (anneau) {
      anneau.vif = true;
      anneau.pos.set(b.cible.x, 0.06, b.cible.z);
      anneau.vie = VIE_ANNEAU;
      anneau.rayon = b.rayon;
      anneau.teinte.copy(b.teinte);
    }

    const fx = jeu?.fx;
    const teinte = b.teinte.getHex();
    if (fx) {
      fx.burst(b.cible, teinte, {
        count: Math.round(8 + b.rayon * 0.8),
        speed: 5 + b.rayon,
        life: 0.5,
        spread: b.rayon * 0.3,
      });
      fx.burst(b.cible, 0xffe6a0, { count: 5, speed: 4, life: 0.32, spread: b.rayon * 0.18 });
      // Secousse volontairement modeste. Vingt-deux impacts à 0,55 comme une
      // explosion normale collaient le trauma à 1 pendant deux secondes, et la
      // séquence devenait illisible — on ne voyait plus ce qu'on avait détruit.
      // À ce dosage, le trauma s'établit vers 0,7 au plus fort du tapis : la
      // caméra tremble en continu et l'on distingue encore les silhouettes.
      fx.addShake(0.06 + b.rayon * 0.018);
    }

    // Chaque coque explose avec SON son, et c'est là que le tapis cesse d'être une
    // bouillie : trois timbres qui alternent se comptent à l'oreille, vingt-deux
    // `explosionSmall` identiques ne se comptent pas. VULCAIN a déjà le sien —
    // celui de ses charges — et l'entendre ici dit qui vient de tirer sans regarder.
    const audio = jeu?.audio;
    if (b.coque === 'vulcain') audio?.detonation?.(3, b.cible.x);
    else if (b.coque === 'helios') audio?.laserSature?.();
    else audio?.explosionSmall?.();

    // Un seul hit-stop pour toute la séquence, sur le TOUT dernier impact : c'est
    // la ponctuation. Vingt-deux hit-stops auraient transformé le tapis en
    // diaporama, et le hit-stop est justement ce qui dit « celui-là comptait ».
    if (this._restants <= 0) {
      fx?.hitStop?.(0.1);
      fx?.shockwave?.(b.cible, 0xffe6a0, 14);
      audio?.explosionBig?.();
    }
  }

  _anneaux(dt) {
    let n = 0;
    for (const a of this.impacts) {
      if (!a.vif) continue;
      a.vie -= dt;
      if (a.vie <= 0) {
        a.vif = false;
        continue;
      }
      const s = 1 - a.vie / VIE_ANNEAU;
      // L'anneau s'ouvre vite puis tient : il atteint le rayon annoncé aux deux
      // tiers de sa vie et s'éteint dessus. Un anneau qui grandit encore quand il
      // disparaît laisse croire que la zone était plus grande qu'elle ne l'était.
      const rayon = a.rayon * (0.3 + 0.7 * easeOut(Math.min(1, s * 1.5)));
      this._pion.position.copy(a.pos);
      this._pion.rotation.set(0, 0, 0);
      this._pion.scale.set(rayon, 1, rayon);
      this._pion.updateMatrix();
      this.anneaux.setMatrixAt(n, this._pion.matrix);
      // Fondu par la COULEUR et non par l'opacité : en mélange additif une matière
      // est partagée par toutes les instances, donc son opacité l'est aussi. Une
      // teinte qui tombe vers le noir s'efface exactement pareil, instance par
      // instance, et c'est le seul levier per-instance dont on dispose.
      this._teinte.copy(a.teinte).multiplyScalar(1 - s);
      this.anneaux.setColorAt(n, this._teinte);
      n++;
    }
    this.anneaux.count = n;
    this.anneaux.visible = n > 0;
    if (n > 0) {
      this.anneaux.instanceMatrix.needsUpdate = true;
      if (this.anneaux.instanceColor) this.anneaux.instanceColor.needsUpdate = true;
    }
  }

  // ---- Fin ----

  _termine() {
    this._range();
    this._acheve();
  }

  // Tout redevient exactement ce qu'il était : la hauteur du vaisseau d'abord, le
  // reste ensuite. Cette méthode est appelée par les DEUX sorties (fin normale et
  // annulation) — deux chemins de remise en état, c'est un chemin de trop.
  _range() {
    const groupe = this._game?.player?.group;
    if (groupe) groupe.position.y = this._yInitial;
    for (const a of this._ailiers) a.groupe.visible = false;
    this._ailiers.length = 0;
    this._bombardiers.length = 0;
    for (const b of this.bombes) b.vif = false;
    for (const a of this.impacts) a.vif = false;
    this.ordnance.count = 0;
    this.ordnance.visible = false;
    this.anneaux.count = 0;
    this.anneaux.visible = false;
    this._enCours = false;
    this._temps = 0;
  }

  // `onDone` est vidé AVANT d'être appelé : il rend le joueur mortel, et une
  // double invocation depuis une frame en retard le ferait deux fois.
  _acheve() {
    const fin = this._onDone;
    this._onDone = null;
    this._onImpact = null;
    this._game = null;
    fin?.();
  }
}
