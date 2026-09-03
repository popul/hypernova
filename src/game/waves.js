// Composition des vagues : qui entre, où, quand, par quelle trajectoire.
// La difficulté monte via le nombre, les PV, la fréquence des plongées et la vitesse des tirs.

import * as THREE from 'three';
import { ARENA, WAVES, ENEMY, DIRECTOR, SURVIE, PENTE_ARCADE } from './constants.js';
import { alea, mulberry32 } from '../core/rng.js';

// Position de base d'un slot de formation (sans le balancement, appliqué en continu ailleurs).
export function slotBasePosition(row, col, cols, out) {
  out.set(
    (col - (cols - 1) / 2) * WAVES.colSpacing,
    0,
    WAVES.formationZTop + row * WAVES.rowSpacing
  );
  return out;
}

function makeEntryCurve(variant, end) {
  const e = end.clone();
  switch (variant) {
    case 'left':
      return new THREE.CubicBezierCurve3(
        new THREE.Vector3(-28, 0, -2),
        new THREE.Vector3(-16, 0, 16),
        new THREE.Vector3(12, 0, 10),
        e
      );
    case 'right':
      return new THREE.CubicBezierCurve3(
        new THREE.Vector3(28, 0, -2),
        new THREE.Vector3(16, 0, 16),
        new THREE.Vector3(-12, 0, 10),
        e
      );
    case 'back':
      // PAR-DERRIÈRE. L'escadron surgit DANS LE DOS du vaisseau — sous le bord
      // bas de l'écran — remonte en traversant la zone de pilotage, et va se
      // poser en formation. C'est l'entrée la plus agressive du jeu, et elle
      // n'est honnête qu'à deux conditions : elle est ANNONCÉE deux secondes
      // avant par une flèche au sol (voir annoncesPourVague), et elle ne se
      // débloque qu'avec le niveau (voir VARIANTS_POUR). Sans l'annonce, se
      // faire traverser par ce qu'on ne peut pas voir n'est pas une difficulté,
      // c'est une injustice.
      return new THREE.CubicBezierCurve3(
        new THREE.Vector3(e.x * 0.4, 0, 30),
        new THREE.Vector3(e.x * 0.8 + 10, 0, 14),
        new THREE.Vector3(e.x * 0.5 - 8, 0, -4),
        e
      );
    default:
      // Plongée en S depuis le fond.
      return new THREE.CubicBezierCurve3(
        new THREE.Vector3(e.x * 0.3, 0, -34),
        new THREE.Vector3(-14, 0, -12),
        new THREE.Vector3(14, 0, 2),
        e
      );
  }
}

const VARIANTS = ['left', 'right', 'top'];

// L'entrée par-derrière ne se débloque qu'avec le niveau : les premières vagues
// apprennent au joueur que le danger vient d'en face, et cette leçon doit être
// bien assise avant qu'on la contredise. À partir de là, elle entre dans le
// tirage comme les autres — une rangée sur quatre environ — et c'est le MÊME
// tirage semé que le reste de la vague : deux machines, un rejeu ou un duo
// tirent exactement les mêmes entrées.
//
// LE SEUIL EST EN UNITÉS DE DIFFICULTÉ, pas en numéro de vague : makeWave reçoit
// la difficulté APLATIE par la pente (voir paramsVague). Difficulté 9, c'est la
// vague 12 environ en arcade, la vague 20 en survie — et c'est voulu : la survie
// monte plus doucement, sa leçon met plus longtemps à s'asseoir.
export const ARRIERE_DEPUIS = 9;

// COMBIEN D'ENNEMIS AU PLUS PEUVENT ARRIVER DANS LE DOS EN MÊME TEMPS.
//
// Signalement du joueur, après que le préavis eut été réparé : « à partir de la
// vague 19, les ennemis arrivent de l'arrière mais SUR TOUT L'AXE DES ABSCISSES,
// et ça rend très difficile de les éviter ». Mesuré, et il avait raison — plus
// gravement que ce que la phrase laisse entendre.
//
// Une rangée entière entrait par le dos. Au moment où elle croise le plan du
// vaisseau, ses voisins sont espacés de 1,5 unité ; or il en faut 3,2 pour se
// glisser entre deux drones et 3,9 entre deux brutes. Autrement dit : ce n'était
// pas une formation, c'était un MUR SANS PORTE, large de 13,3 unités sur une
// arène qui en fait 29, et il y en avait 1,8 par vague. Mesuré sur 150 graines,
// 100 % des vagues depuis la douzième — pas 78 %, pas la plupart : toutes.
//
// La flèche livrée hier disait donc au joueur d'où venait quelque chose qu'il ne
// pouvait de toute façon pas traverser. Un préavis sans échappatoire n'est pas un
// préavis, c'est un compte à rebours.
//
// Cinq, parce que c'est ce qui tient dans le quart de l'arène : un escadron de
// cinq occupe environ 7,6 unités avec les rayons, il en reste vingt et une pour
// aller ailleurs — et le vaisseau, à 16 u/s, traverse ça en une seconde et
// quart, bien moins que les deux secondes que la flèche lui donne. Le danger
// reste entier, il redevient CONTOURNABLE.
//
// Les colonnes qui ne rentrent pas dans l'escadron ne disparaissent pas : elles
// arrivent par le fond, la seule entrée qui se voie venir toute seule. La vague
// garde exactement les mêmes ennemis aux mêmes places.
export const DOS_LARGEUR_MAX = 5;

export function variantsPour(diff) {
  return diff >= ARRIERE_DEPUIS ? [...VARIANTS, 'back'] : VARIANTS;
}

// ------------------------------------------------------------- LES ANNONCES
//
// « Une flèche préventive, deux secondes avant, qui montre exactement où ils
// vont débouler » — la demande de Paul, au mot près. Une entrée par le côté ou
// par l'arrière surgit d'un bord que l'écran ne montre pas ; sans annonce, la
// seule défense est d'avoir déjà mangé le coup une fois. La flèche transforme
// le réflexe en LECTURE : on voit, on se décale.
//
// Une annonce par ESCADRON, pas par ennemi : une rangée entre d'un bloc par la
// même trajectoire, et huit flèches au même endroit ne diraient rien de plus
// qu'une seule. Les entrées par le fond n'annoncent rien — elles se voient
// arriver de loin, c'est leur nature.
export const ANNONCE_AVANCE = 2; // secondes de préavis
export const ANNONCE_REMANENCE = 0.4; // la flèche survit un peu à l'entrée

// UNE SEULE DÉFINITION DE « HORS CHAMP », lue par les deux bouts de la promesse :
// `annoncesPourVague` s'en sert pour poser la flèche, `makeWave` pour garantir
// qu'il reste du temps avant l'arrivée. Tant qu'elles la partagent, elles ne
// peuvent pas se contredire — et c'est exactement la panne qu'on répare ici.
export function horsChamp(depart, { xMax = ARENA.playerXMax, zMax = ARENA.playerZMax } = {}) {
  return Math.abs(depart.x) > xMax || depart.z > zMax;
}

export function annoncesPourVague(
  spawns,
  { xMax = ARENA.playerXMax, zMax = ARENA.playerZMax } = {}
) {
  const parRangee = new Map();
  for (const s of spawns) {
    if (s.type === 'boss' || !s.curve) continue;
    const depart = s.curve.getPoint(0);
    if (!horsChamp(depart, { xMax, zMax })) continue; // par le fond : ça se voit venir tout seul
    const dos = depart.z > zMax;
    const cle = `${s.row}|${dos ? 'dos' : depart.x > 0 ? 'droite' : 'gauche'}`;
    const e = parRangee.get(cle);
    if (!e || s.delay < e.delay) {
      // La flèche se pose SUR LE BORD FRANCHI, à hauteur du point d'entrée : au
      // ras du bord gauche ou droit pour un débordement de côté, au ras du bas
      // pour un surgissement dans le dos. C'est « exactement où ils déboulent »,
      // ramené à ce que l'écran peut montrer.
      const dir = s.curve.getTangent(0.02);
      parRangee.set(cle, {
        x: dos
          ? Math.max(-xMax + 1, Math.min(xMax - 1, depart.x))
          : (depart.x > 0 ? 1 : -1) * (xMax - 0.9),
        z: dos ? zMax - 0.9 : Math.max(-2, Math.min(zMax - 1, depart.z)),
        angle: Math.atan2(dir.x, dir.z),
        delay: s.delay,
      });
    }
  }
  return [...parRangee.values()];
}

// Le générateur vit dans core/rng.js — le même que celui de la simulation, pour
// qu'il n'y ait qu'une seule définition du hasard dans le projet. Une même graine
// produit exactement les mêmes vagues : c'est ce qui rend le « défi du jour »
// comparable entre copains.
export { mulberry32 };

// Graine du jour : tous les joueurs affrontent les mêmes vagues le même jour.
export function dailySeed(date = new Date()) {
  const key = date.toISOString().slice(0, 10); // AAAA-MM-JJ
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Renvoie { spawns: [{type, row, col, cols, curve, delay}], boss: bool }
// opts.forceBoss / opts.noBoss : contrôle du boss par les missions de campagne
// (en arcade, le boss revient toutes les WAVES.bossEvery vagues).
// opts.seed : graine de la partie ; la vague n en dérive la sienne.
// CE QU'ON DEMANDE À makeWave POUR LA VAGUE NUMÉRO n.
//
// Deux lignes, sorties du jeu pour qu'une épreuve puisse les tenir. Elles ont
// une propriété qui ne se lit sur aucune des deux prise seule : deux vagues
// voisines ne doivent JAMAIS produire la même chose. La difficulté seule ne le
// garantit pas — la pente l'étale, donc l'arrondi la répète — et la graine seule
// non plus. C'est leur couple qui distingue, et c'est le couple qu'on éprouve.
export function paramsVague(n, { survie = false, seed = 0 } = {}) {
  return {
    diff: Math.max(1, Math.round(survie ? n * SURVIE.pente : 1 + (n - 1) * PENTE_ARCADE)),
    seed: seed + n * 977,
  };
}

export function makeWave(n, opts = {}) {
  const isBossWave = opts.forceBoss || (!opts.noBoss && n % WAVES.bossEvery === 0);
  const cols = Math.min(WAVES.colsBase + Math.floor(n / 3), WAVES.colsMax);
  const rng = mulberry32((opts.seed ?? 1) * 7919 + n * 104729);
  const spawns = [];
  const tmp = new THREE.Vector3();

  const rows = [];
  if (isBossWave) {
    rows.push({ type: 'wasp', count: cols }, { type: 'wasp', count: cols - 2 });
  } else {
    if (n >= 2) rows.push({ type: 'brute', count: Math.min(cols - 2, 2 + Math.floor(n / 2)) });
    // LES DEUX NOUVEAUX MÉTIERS ARRIVENT TARD, ET EN PETIT NOMBRE.
    //
    // Ils ne remplacent pas la piétaille, ils la compliquent : deux lanciers
    // suffisent à interdire deux couloirs, et deux poseurs à encombrer le bas de
    // l'arène. En mettre une rangée entière transformerait la vague en casse-tête
    // statique — or ce qu'on veut, c'est que le joueur DÉPLACE le problème.
    //
    // Le lancier ouvre le bal à la vague 5, une fois que le joueur a pris
    // l'habitude de se poser quelque part ; le poseur suit à la 8, quand il a
    // appris à choisir sa cible et qu'on peut lui demander de choisir mieux.
    if (n >= WAVES.lancierDepuis) {
      rows.push({
        type: 'lancier',
        count: Math.min(3, 1 + Math.floor((n - WAVES.lancierDepuis) / 6)),
      });
    }
    if (n >= WAVES.poseurDepuis) {
      rows.push({
        type: 'poseur',
        count: Math.min(3, 1 + Math.floor((n - WAVES.poseurDepuis) / 7)),
      });
    }
    rows.push({ type: 'wasp', count: cols });
    if (n >= 4) rows.push({ type: 'wasp', count: cols });
    rows.push({ type: 'drone', count: cols });
    rows.push({ type: 'drone', count: cols });
  }

  // Chorégraphie tirée au sort : plus jamais gauche → droite → fond dans cet ordre.
  const variants = shuffled(variantsPour(n), rng);
  // À partir de la vague 3, la vague déferle en DEUX ASSAUTS : les trois premières
  // rangées arrivent ensemble (par trois trajectoires différentes), puis le reste.
  // Le compte-gouttes d'avant livrait moins d'ennemis que le joueur n'en tuait :
  // la formation ne se constituait jamais et la menace restait théorique.
  const twoAssaults = n >= WAVES.twoAssaultsFromWave && !isBossWave;
  let squadIndex = 0;
  let clock = 0;
  rows.forEach((rowDef, rowIdx) => {
    const start = Math.floor((cols - rowDef.count) / 2);
    // Une rangée = un escadron qui entre d'un bloc, par une trajectoire tirée.
    const variant = variants[squadIndex % variants.length];
    // Voir DOS_LARGEUR_MAX : le dos entre par escadron, jamais par rangée pleine.
    // Le tirage de la position est semé comme tout le reste — deux machines
    // placent le même escadron au même endroit, et un rejeu le retrouve.
    const dosLarge = variant === 'back' ? Math.min(rowDef.count, DOS_LARGEUR_MAX) : rowDef.count;
    const dosDebut =
      variant === 'back' && rowDef.count > dosLarge
        ? Math.floor(rng() * (rowDef.count - dosLarge + 1))
        : 0;
    const courbes = [];
    for (let i = 0; i < rowDef.count; i++) {
      const col = start + i;
      const parLeDos = variant !== 'back' || (i >= dosDebut && i < dosDebut + dosLarge);
      courbes.push(
        makeEntryCurve(parLeDos ? variant : 'top', slotBasePosition(rowIdx, col, cols, tmp).clone())
      );
    }

    // LE PRÉAVIS EST DÛ AVANT LE DÉPART, PAS APRÈS.
    //
    // L'entrée par le dos porte, plus haut dans ce fichier, une promesse écrite :
    // « elle est ANNONCÉE deux secondes avant par une flèche au sol […] sans
    // l'annonce, se faire traverser par ce qu'on ne peut pas voir n'est pas une
    // difficulté, c'est une injustice ». Cette promesse n'était pas tenue.
    //
    // La flèche s'affiche de `delay − ANNONCE_AVANCE` à `delay`. Or depuis la
    // vague 5 la vague déferle en DEUX ASSAUTS, et les trois rangées de l'assaut A
    // partent toutes à `clock = 0` : pour elles, la flèche et l'escadron
    // naissaient à la même image. Préavis réel : ZÉRO. Mesuré sur cinq cents
    // graines par vague, cela concernait 78 % des vagues 19 — et 100 % des vagues
    // depuis la douzième contiennent un escadron dorsal.
    //
    // Ce que ça donnait à jouer : l'escadron part de z = 30, le bord bas de
    // l'écran est à 16,3 et le vaisseau à 13. Il devenait donc visible 0,26 s
    // après son départ et touchait à 0,34 s — SOIXANTE-DIX MILLISECONDES de
    // fenêtre, là où le jeu s'interdit par ailleurs de tirer une balle qui
    // arriverait en moins de 0,42 s (ENEMY.minReactionTime). On appliquait aux
    // balles une règle d'honnêteté qu'on refusait aux coques.
    //
    // La réparation ne retire rien : ni un ennemi, ni une trajectoire, ni une
    // agressivité. Elle repousse le DÉPART des seuls escadrons hors champ au
    // moment où leur flèche aura fini de battre. L'assaut A garde ses entrées par
    // le fond à l'image zéro ; ce qui vient des bords arrive deux secondes plus
    // tard, annoncé. L'assaut B n'était déjà pas concerné : sa respiration vaut
    // 2,8 s, plus que le préavis.
    //
    // ON REPOUSSE L'HORLOGE, PAS LE SEUL ESCADRON. Deux épreuves l'ont exigé, et
    // elles avaient raison : décaler la rangée toute seule la faisait déborder
    // sur l'assaut suivant (0,1 s de respiration au lieu de 2,8), et dans les
    // quatre premières vagues elle doublait la rangée précédente, qui est
    // pourtant la seule montée en douceur du jeu. En repoussant l'horloge, tout
    // ce qui suit suit — l'ordre des rangées et la respiration entre assauts
    // sont préservés par construction.
    if (courbes.some((c) => horsChamp(c.getPoint(0))) && clock < ANNONCE_AVANCE) {
      clock = ANNONCE_AVANCE;
    }
    const depart = clock;
    for (let i = 0; i < rowDef.count; i++) {
      spawns.push({
        type: rowDef.type,
        row: rowIdx,
        col: start + i,
        cols,
        curve: courbes[i],
        delay: depart + i * WAVES.entryStagger,
      });
    }
    if (twoAssaults) {
      // Assaut A = rangées 0-2 simultanées ; assaut B = le reste, après une respiration.
      if (rowIdx === 2) clock += WAVES.assaultGap + rng() * 0.6;
    } else {
      clock += 1.2 + rng() * 0.6; // vagues 1-2 : arrivée séquentielle, pour apprendre
    }
    squadIndex++;
  });

  if (isBossWave) {
    spawns.push({
      type: 'boss',
      // QUI ARRIVE. L'appelant le sait — lui seul connaît le secteur traversé et
      // donc si c'est la fin du voyage. À défaut, KORN, ce qui garde le
      // comportement d'avant pour tout ce qui appelle makeWave sans le dire.
      boss: opts.boss || 'korn',
      row: -1,
      col: 0,
      cols,
      curve: makeEntryCurve('top', new THREE.Vector3(0, 0, -13)),
      delay: clock + 1.2,
    });
  }

  return { spawns, boss: isBossWave };
}

// Paramètres de difficulté dérivés du numéro de vague, modulés par les modificateurs
// de mission (campagne) et par la « chaleur » du directeur : fire = densité de tir,
// dive = agressivité. Chaque levier reste borné pour que le jeu demeure jouable.
export function difficulty(n, mods = { fire: 1, dive: 1 }, heat = 0) {
  const fireHeat = 1 + DIRECTOR.fireBoost * heat;
  const diveHeat = 1 + DIRECTOR.diveBoost * heat;
  return {
    diveInterval: Math.max(
      DIRECTOR.diveFloor,
      Math.max(ENEMY.diveIntervalMin / mods.dive, (ENEMY.diveIntervalBase - n * 0.18) / mods.dive) /
        diveHeat
    ),
    diveSpeed: (ENEMY.diveSpeedBase + n * ENEMY.diveSpeedPerWave) * Math.sqrt(mods.dive),
    formationFireInterval: Math.max(
      DIRECTOR.fireFloor,
      Math.max(
        ENEMY.formationFireIntervalMin / mods.fire,
        (ENEMY.formationFireIntervalBase - n * 0.14) / mods.fire
      ) / fireHeat
    ),
    bulletSpeed: Math.min(
      DIRECTOR.bulletCeil,
      Math.min(ENEMY.bulletSpeedMax, ENEMY.bulletSpeedBase + n * ENEMY.bulletSpeedPerWave) *
        (1 + DIRECTOR.bulletBoost * heat)
    ),
    // Rampe dégelée jusqu'à la vague 22 : l'ancien plafond de 4 à la vague 12
    // faisait cesser toute montée en tension. La bombe est la soupape.
    simultaneousDivers:
      (n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : n < 15 ? 4 : n < 22 ? 5 : 6) +
      Math.min(DIRECTOR.diversMax, Math.floor(heat / DIRECTOR.diversPerHeat)),
    // Anticipation de la visée : monte avec la vague, puis avec la chaleur.
    lead:
      Math.min(ENEMY.leadMax, ENEMY.leadBase + ENEMY.leadPerWave * n) +
      Math.min(DIRECTOR.leadBoostMax, DIRECTOR.leadBoost * heat),
    shootersMax: Math.min(ENEMY.shootersMaxCap, ENEMY.shootersMaxBase + Math.floor(n / 6)),
    bulletBudget: Math.min(
      ENEMY.bulletBudgetMax,
      Math.round(ENEMY.bulletBudgetBase + ENEMY.bulletBudgetPerWave * n)
    ),
    volleyWeights: volleyWeights(n),
    wallCount: n < 10 ? ENEMY.wallCountEarly : n < 18 ? ENEMY.wallCountMid : ENEMY.wallCountLate,
    diveWeights: diveWeights(n),
    diveTrackMax: Math.min(ENEMY.diveTrackMax, ENEMY.diveTrackBase + ENEMY.diveTrackPerWave * n),
  };
}

// Motifs de volée disponibles selon la vague : d'abord des balles visées à esquiver,
// puis des murs à franchir, puis des tirs croisés qui ferment les côtés.
function volleyWeights(n) {
  if (n < 6) return { aimed: 1 };
  if (n < 9) return { aimed: 0.7, wall: 0.3 };
  if (n < 12) return { aimed: 0.6, wall: 0.4 };
  return { aimed: 0.45, wall: 0.35, cross: 0.2 };
}

export function pickWeighted(weights, rand = alea()) {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let acc = rand * total;
  for (const [key, w] of Object.entries(weights)) {
    acc -= w;
    if (acc <= 0) return key;
  }
  return Object.keys(weights)[0];
}

// Répartition des styles de plongée selon l'avancement : le vocabulaire de menace
// s'enrichit au lieu de se répéter.
function diveWeights(n) {
  if (n < 5) return { sweep: 1 };
  if (n < 10) return { sweep: 0.6, strafe: 0.4 };
  return { sweep: 0.45, strafe: 0.3, squad: 0.25 };
}

// Tire un style de plongée selon les poids de la vague.
export function pickDiveStyle(weights, rand = alea()) {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let acc = rand * total;
  for (const [style, w] of Object.entries(weights)) {
    acc -= w;
    if (acc <= 0) return style;
  }
  return 'sweep';
}
