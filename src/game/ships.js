// Géométries des vaisseaux, générées en code : aucun modèle externe.
// Style low-poly flat-shaded ; les accents émissifs sont amplifiés par le bloom.

import * as THREE from 'three';
import { PLAYER, GRAZE } from './constants.js';

function mat(
  color,
  { emissive = 0x000000, emissiveIntensity = 1, metalness = 0.6, roughness = 0.35 } = {}
) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    metalness,
    roughness,
    flatShading: true,
  });
}

// toneMapped:false + couleur saturée → dépasse le seuil du bloom, halo garanti.
function glow(color) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

// Livrées : la coque du joueur est peinte, pas texturée. Une teinte de coque, une
// teinte d'accent pour tout ce qui brille, et c'est suffisant pour que deux pilotes
// se reconnaissent d'un coup d'œil dans un classement.
export const LIVREES = [
  { id: 'flotte', nom: 'Flotte', hull: 0xc8d6e8, dark: 0x2a3550, accent: 0x4ff2ff },
  { id: 'braise', nom: 'Braise', hull: 0xe8d0b8, dark: 0x4a2418, accent: 0xff9a3c },
  { id: 'menthe', nom: 'Menthe', hull: 0xd6f0e0, dark: 0x1c4038, accent: 0x5cffc0 },
  { id: 'orage', nom: 'Orage', hull: 0x9aa8c8, dark: 0x1e2238, accent: 0xb46cff },
  { id: 'or', nom: 'Or blanc', hull: 0xf0e6c8, dark: 0x3a3020, accent: 0xffc857 },
  { id: 'sang', nom: 'Corsaire', hull: 0xd8c0c0, dark: 0x40161c, accent: 0xff4d6d },
];

// Trois carènes. Elles ne changent pas les statistiques — c'est la classe qui le
// fera plus tard — mais elles changent la silhouette, et c'est ce qu'on voit.
export const CARENES = [
  { id: 'dague', nom: 'Dague', nez: [0.42, 3.0], aile: [1.7, 1.1], angle: -0.42 },
  { id: 'faucon', nom: 'Faucon', nez: [0.55, 2.4], aile: [2.1, 0.9], angle: -0.62 },
  { id: 'enclume', nom: 'Enclume', nez: [0.62, 2.2], aile: [1.5, 1.5], angle: -0.2 },
];

export function livree(id) {
  return LIVREES.find((l) => l.id === id) || LIVREES[0];
}

export function carene(id) {
  return CARENES.find((c) => c.id === id) || CARENES[0];
}

// Construit le vaisseau à partir d'une FICHE, et non plus en dur.
//
//   { livree, carene, tier, levels }
//
// C'est ce qui permet trois choses d'un seul coup : la personnalisation choisie à
// la création du pseudo, les paliers de coque gagnés avec les fragments, et — le
// plus important pour le joueur — le fait que CE QU'ON ACHÈTE SE VOIE. Un canon
// jumelé qui n'ajoute rien à la silhouette n'a pas été acheté, il a été coché.
export function createPlayerShip(fiche = {}) {
  const L = livree(fiche.livree);
  const C = carene(fiche.carene);
  const tier = Math.max(0, Math.min(2, fiche.tier ?? 0));
  const lv = fiche.levels || {};

  const g = new THREE.Group();
  const shell = new THREE.Group(); // la carène : mise à l'échelle sans toucher au repère
  g.add(shell);

  const hull = mat(L.hull, { metalness: 0.75, roughness: 0.3 });
  const dark = mat(L.dark, { metalness: 0.8, roughness: 0.4 });
  const accent = glow(L.accent);

  const fuselage = new THREE.Mesh(new THREE.ConeGeometry(C.nez[0], C.nez[1], 6), hull);
  fuselage.rotation.x = -Math.PI / 2;
  shell.add(fuselage);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), glow(0x9ffbff));
  cockpit.position.set(0, 0.28, 0.1);
  cockpit.scale.set(1, 0.7, 1.4);
  shell.add(cockpit);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(C.aile[0], 0.1, C.aile[1]), hull);
    wing.position.set(side * (C.aile[0] * 0.62), -0.05, 0.55);
    wing.rotation.y = side * C.angle;
    shell.add(wing);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.9), accent);
    tip.position.set(side * (C.aile[0] * 1.05), -0.05, 0.95);
    tip.rotation.y = side * C.angle;
    shell.add(tip);

    // PROPULSEURS : la tuyère grossit avec le niveau acheté. Le plus visible de
    // tous les modules, parce qu'on le regarde en permanence — il est derrière.
    const boost = 1 + (lv.engine || 0) * 0.13;
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * boost, 0.26 * boost, 0.7 * boost, 6),
      dark
    );
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 0.45, -0.08, 1.15);
    shell.add(engine);

    const exhaust = new THREE.Mesh(new THREE.SphereGeometry(0.16 * boost, 6, 6), accent);
    exhaust.position.set(side * 0.45, -0.08, 1.55);
    exhaust.name = 'exhaust';
    shell.add(exhaust);

    // CANONS JUMELÉS : un tube de plus par niveau, sur l'aile. On voit d'où sortent
    // les nouveaux tirs, ce qui rend l'achat lisible sans une ligne de texte.
    for (let n = 0; n < (lv.cannons || 0); n++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6), dark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * (0.7 + n * 0.34), -0.12, -0.35);
      shell.add(barrel);
    }

    // MISSILES : une nacelle sous l'aile par niveau.
    for (let n = 0; n < (lv.missiles || 0); n++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.6), dark);
      pod.position.set(side * (0.9 + n * 0.3), -0.2, 0.5);
      shell.add(pod);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5), accent);
      head.rotation.x = -Math.PI / 2;
      head.position.set(side * (0.9 + n * 0.3), -0.2, 0.14);
      shell.add(head);
    }

    // PALIERS DE COQUE : le blindage gagné avec les fragments. Palier II boulonne
    // une plaque sur chaque aile, palier III ajoute une dérive avant.
    if (tier >= 1) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.7), dark);
      plate.position.set(side * 0.85, 0.06, 0.5);
      plate.rotation.y = side * C.angle;
      shell.add(plate);
    }
    if (tier >= 2) {
      const canard = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.4), hull);
      canard.position.set(side * 0.6, 0.14, -0.6);
      canard.rotation.y = side * 0.5;
      canard.rotation.z = side * -0.25;
      shell.add(canard);
    }
  }

  // BOUCLIER : un anneau émetteur autour du fuselage, visible dès le premier niveau.
  if (lv.shield) {
    const emitter = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 5, 14), accent);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.z = 0.35;
    shell.add(emitter);
  }

  // RÉFLEXE CHRONO : un petit cadran sur le dos. Discret, mais on le cherche.
  if (lv.reflex) {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10), accent);
    dial.position.set(0, 0.3, 0.7);
    shell.add(dial);
  }

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.8), dark);
  fin.position.set(0, 0.35, 0.9);
  shell.add(fin);

  // La carène est plus petite que sa silhouette d'origine : elle donnait
  // l'impression d'un vaisseau bien plus large que sa vraie zone de collision.
  shell.scale.setScalar(0.78);

  // REPÈRE DE COLLISION : seul ce noyau peut être touché. Tout ce qui dépasse
  // (ailes, ailerons, réacteurs) est purement décoratif et traverse les balles.
  // toneMapped reste actif : sans ça le bloom en fait une tache qui noie le vaisseau.
  // depthTest désactivé : le repère doit rester lisible même quand la coque passe devant.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })
  );
  core.name = 'hitcore';
  core.renderOrder = 5;
  g.add(core);

  // Cercle au sol matérialisant exactement le rayon de collision.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLAYER.radius - 0.08, PLAYER.radius, 28),
    new THREE.MeshBasicMaterial({
      color: 0x8ffbff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  ring.name = 'hitring';
  ring.renderOrder = 4;
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);

  return g;
}

function createDrone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    mat(0xff5db1, { emissive: 0xff5db1, emissiveIntensity: 0.45 })
  );
  body.scale.set(1, 0.75, 1.1);
  g.add(body);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.45), mat(0x8e2d64));
    wing.position.set(side * 0.75, 0, 0);
    wing.rotation.z = side * 0.35;
    g.add(wing);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), glow(0xffe066));
  eye.position.set(0, 0.1, 0.5);
  g.add(eye);
  return g;
}

function createWasp() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.5, 5),
    mat(0xff3df0, { emissive: 0xff3df0, emissiveIntensity: 0.5 })
  );
  body.rotation.x = Math.PI / 2; // pointe vers +z (vers le joueur)
  g.add(body);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.55), mat(0x7a1d74));
    wing.position.set(side * 0.7, 0.05, -0.3);
    wing.rotation.y = side * 0.5;
    wing.rotation.z = side * 0.2;
    g.add(wing);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 5), glow(0xff9ff6));
    tip.position.set(side * 1.25, 0.16, -0.55);
    g.add(tip);
  }
  return g;
}

function createBrute() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.65, 0.8, 6),
    mat(0xff9f43, { emissive: 0xff9f43, emissiveIntensity: 0.35, roughness: 0.5 })
  );
  g.add(body);
  const armor = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.16, 6, 6),
    mat(0x5a3a1a, { metalness: 0.85 })
  );
  armor.rotation.x = Math.PI / 2;
  g.add(armor);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), glow(0xffc857));
  core.position.y = 0.45;
  g.add(core);
  return g;
}

// KORN, en trois états. Le combat se joue en trois actes, et personne ne compte des
// points de vie au milieu d'une nappe de balles : on regarde la SILHOUETTE. Chaque
// acte casse donc d'abord quelque chose qui change le contour — la couronne, puis un
// pod — et ne change une teinte qu'ensuite. C'est ce qui reste lisible à la taille
// où le boss apparaît sur un téléphone, c'est-à-dire minuscule.
//
// Les matériaux sont créés UNE fois et seulement réassignés. createEnemyShip clone
// un gabarit, et un clone partage ses matériaux par référence : une teinte posée en
// place sur la coque suivrait le boss suivant dès son entrée en scène.
//
// La coque S'ÉTEINT d'un acte à l'autre — c'est elle qui occupe le plus de pixels,
// c'est donc elle qui porte le message. L'émissif tombe avec elle : une coque
// « incandescente de rage » monterait en luminosité et se lirait comme une montée
// en puissance, exactement l'inverse de ce qu'on raconte. Ce qui brille à la fin,
// ce n'est plus le vaisseau, c'est ce qui sort de ses trous.
//
// L'anneau, lui, reste allumé aux trois actes : c'est sa BRÈCHE qui informe, et une
// couronne éteinte n'a plus de brèche — elle a juste disparu.
const BOSS_ETATS = [
  {
    hull: mat(0xff4757, { emissive: 0xff4757, emissiveIntensity: 0.4, roughness: 0.45 }),
    anneau: mat(0xffc857, { emissive: 0xffc857, emissiveIntensity: 0.5, metalness: 0.9 }),
    oeil: glow(0xffe066),
  },
  {
    // Le métal baisse en même temps que la peinture brûle : sans carte
    // d'environnement, une coque métallique ne renvoie que trois reflets et vire au
    // noir. C'est le diffus qui doit reprendre la main pour qu'elle reste une coque.
    hull: mat(0x7a1b26, {
      emissive: 0x3a0a04,
      emissiveIntensity: 0.5,
      roughness: 0.6,
      metalness: 0.3,
    }),
    anneau: mat(0xc07030, { emissive: 0xff7a1e, emissiveIntensity: 0.45, metalness: 0.9 }),
    oeil: glow(0xff6a1e),
  },
  {
    // La cendre. Éteinte, mais pas effacée : sous une coque vraiment noire il ne
    // reste qu'un bouquet de lueurs qui flottent, et on a perdu le vaisseau. Le gris
    // change aussi la TEINTE et pas seulement la valeur — rouge vif, sang brûlé,
    // cendre : trois actes qu'on distingue même à travers un écran de balles.
    // L'émissif ne sert pas à faire briller la coque, il sert à la RENDRE VISIBLE :
    // les trois lampes du secteur sont volontairement faibles pendant le combat, et
    // sans cet appoint la cendre tombe à un noir indistinct du vide. Il est gris et
    // non rouge — une lueur chaude se lirait comme un vaisseau qui repart.
    hull: mat(0x4d3b40, {
      emissive: 0x6a5a66,
      emissiveIntensity: 0.75,
      roughness: 0.85,
      metalness: 0.15,
    }),
    anneau: mat(0x7a4a24, { emissive: 0xff4a10, emissiveIntensity: 0.3, metalness: 0.9 }),
    oeil: glow(0xff1e2e),
  },
];

// Une seule teinte de tôle arrachée pour tous les morceaux qui pendent ou qui
// restent en moignon : on doit les lire comme une même carène éventrée, pas comme
// des pièces rapportées. Assez claire pour attraper le contre-jour — sur fond noir,
// une tôle vraiment noire est une tôle qu'on n'a pas dessinée.
const BOSS_TOLE = mat(0x4a1620, { metalness: 0.85, roughness: 0.6 });
const BOSS_BRAISE = glow(0xff7a2a);
const BOSS_BRAISE_VIVE = glow(0xffc061);
const BOSS_NOYAU = glow(0xfff2d0);
const BOSS_HALO = new THREE.MeshBasicMaterial({
  color: 0xff8a4a,
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

// Une brèche est un bulbe incandescent à demi ENFONCÉ dans la coque : ses bords
// s'effilent et disparaissent sous la carène, seule sa calotte ressort. Une plaque
// plate, elle, flotterait au-dessus d'une coque bombée dès qu'on la regarde de côté.
const BOSS_BRECHE = new THREE.SphereGeometry(1, 6, 5);

function bossBreche(taille, pos, ry, matiere) {
  const m = new THREE.Mesh(BOSS_BRECHE, matiere);
  m.scale.set(...taille);
  m.position.set(...pos);
  m.rotation.y = ry;
  return m;
}

function createBoss() {
  const g = new THREE.Group();
  const E = BOSS_ETATS[0];

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), E.hull);
  body.scale.set(1.3, 0.7, 1);
  body.name = 'bossHull';
  g.add(body);

  // Les trois couronnes existent en même temps, une seule est allumée. Reconstruire
  // une géométrie de tore en plein combat pour la rogner coûterait une allocation
  // pile au moment où l'écran est le plus chargé ; ici on bascule un booléen.
  const couronnes = new THREE.Group();
  couronnes.name = 'bossRings';
  couronnes.rotation.x = Math.PI / 2;
  const intacte = new THREE.Group();
  intacte.add(new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.22, 6, 10), E.anneau));
  const entamee = new THREE.Group();
  entamee.visible = false;
  entamee.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.22, 6, 8, Math.PI * 1.3).rotateZ(Math.PI * 0.45),
      E.anneau
    )
  );
  const moignons = new THREE.Group();
  moignons.visible = false;
  // Deux tronçons laissés bâbord et tribord : la brèche s'ouvre devant et derrière,
  // là où le regard passe. Un anneau rogné n'importe où ne se verrait pas.
  for (const depart of [-0.17, 0.83]) {
    moignons.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(2.1, 0.2, 5, 3, Math.PI * 0.34).rotateZ(Math.PI * depart),
        E.anneau
      )
    );
  }
  couronnes.add(intacte, entamee, moignons);
  g.add(couronnes);

  const podMat = mat(0x6e1220, { metalness: 0.8 });
  for (const side of [-1, 1]) {
    const bord = side < 0 ? 'L' : 'R';
    const pod = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 5), podMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 2.3, 0, 0.3);
    pod.name = `bossPod${bord}`;
    g.add(pod);
    const podGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), glow(0xff8080));
    podGlow.position.set(side * 2.3, 0, 1.15);
    podGlow.name = `bossPodGlow${bord}`;
    g.add(podGlow);
  }

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), E.oeil);
  eye.position.set(0, 0.2, 1.1);
  eye.name = 'bossEye';
  g.add(eye);

  // ACTE II : la coque s'ouvre. Les brèches sont sur le DOS parce que la caméra du
  // jeu regarde d'en haut — une avarie sous le ventre serait une avarie invisible.
  // La plaque de flanc, elle, pend sans se détacher : c'est le détail qui dit que le
  // vaisseau tient encore, mais mal.
  const degats2 = new THREE.Group();
  degats2.name = 'bossDmg2';
  degats2.visible = false;
  degats2.add(bossBreche([0.34, 0.6, 0.7], [-0.66, 0.62, 0.05], 0.35, BOSS_BRAISE));
  degats2.add(bossBreche([0.28, 0.5, 0.5], [0.92, 0.55, -0.42], -0.5, BOSS_BRAISE));
  // La plaque pend DANS la brèche de la couronne, et pas ailleurs : les avaries
  // groupées au même endroit racontent un coup encaissé, éparpillées elles ne
  // racontent qu'un vaisseau sale. C'est aussi le seul endroit où l'anneau ne la
  // masque pas.
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.11, 0.85), BOSS_TOLE);
  plaque.position.set(1.95, -0.5, 0.3);
  plaque.rotation.set(0.1, 0.3, -0.9);
  degats2.add(plaque);
  // La ligne d'arrachement rougeoie encore, posée sur l'arête de la coque : sans
  // elle, la plaque n'est qu'une tôle sombre sur fond noir et rien ne dit qu'elle
  // a été déchirée de quelque chose.
  const dechirure = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.95), BOSS_BRAISE);
  dechirure.position.set(1.86, 0.12, 0.35);
  degats2.add(dechirure);
  g.add(degats2);

  // ACTE III : le pod bâbord est arraché et le dos s'ouvre sur le noyau. C'est le
  // seul moment du jeu où l'on voit ce qu'il y a DEDANS — et il est blanc.
  const degats3 = new THREE.Group();
  degats3.name = 'bossDmg3';
  degats3.visible = false;
  const trappe = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 5, 8), BOSS_TOLE);
  trappe.rotation.x = Math.PI / 2;
  trappe.position.set(0, 0.98, -0.1);
  degats3.add(trappe);
  const noyau = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), BOSS_NOYAU);
  noyau.position.set(0, 1, -0.1);
  degats3.add(noyau);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 8), BOSS_HALO);
  halo.position.copy(noyau.position);
  degats3.add(halo);
  const moignon = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.55, 5), BOSS_TOLE);
  moignon.rotation.x = Math.PI / 2;
  moignon.position.set(-2.05, 0, -0.15);
  degats3.add(moignon);
  const arrachement = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), BOSS_BRAISE_VIVE);
  arrachement.position.set(-2.05, 0, 0.15);
  degats3.add(arrachement);
  degats3.add(bossBreche([0.34, 0.5, 0.5], [0.36, 0.55, 0.78], 0.8, BOSS_BRAISE_VIVE));
  g.add(degats3);

  return g;
}

// Phase 1, 2 ou 3 : l'état de la carène du boss. Rien n'est construit ici — tout
// dort déjà dans le gabarit, éteint — donc deux appels de suite sur la même phase
// ne peuvent rien empiler, et une bascule ne coûte pas une allocation.
export function setBossPhase(group, phase) {
  const p = Math.min(3, Math.max(1, Math.round(phase) || 1));
  if (group.userData.bossPhase === p) return;
  const hull = group.getObjectByName('bossHull');
  if (!hull) return; // pas un boss : on ne casse rien au passage
  group.userData.bossPhase = p;

  const E = BOSS_ETATS[p - 1];
  hull.material = E.hull;
  const oeil = group.getObjectByName('bossEye');
  if (oeil) oeil.material = E.oeil;

  const couronnes = group.getObjectByName('bossRings');
  if (couronnes) {
    couronnes.children.forEach((niveau, i) => {
      niveau.visible = i === p - 1;
      for (const m of niveau.children) m.material = E.anneau;
    });
  }

  // Les avaries S'ACCUMULENT : l'acte III garde les brèches de l'acte II. Un boss
  // qui se répare entre deux phases raconterait l'exact contraire du combat.
  const d2 = group.getObjectByName('bossDmg2');
  if (d2) d2.visible = p >= 2;
  const d3 = group.getObjectByName('bossDmg3');
  if (d3) d3.visible = p >= 3;

  // Le pod bâbord s'efface au profit du moignon qui occupe sa place exacte.
  for (const nom of ['bossPodL', 'bossPodGlowL']) {
    const o = group.getObjectByName(nom);
    if (o) o.visible = p < 3;
  }
}

const BUILDERS = { drone: createDrone, wasp: createWasp, brute: createBrute, boss: createBoss };
const templates = new Map();

// Les matériaux restent partagés par type (le flash de dégât est fait par un pop
// d'échelle dans enemies.js) : garde le nombre de states GPU au minimum.
export function createEnemyShip(type) {
  if (!templates.has(type)) templates.set(type, BUILDERS[type]());
  return templates.get(type).clone(true);
}

export function createGem() {
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28),
    new THREE.MeshBasicMaterial({ color: 0xffc857, toneMapped: false })
  );
  gem.scale.set(1, 1.5, 1);
  return gem;
}

// Anneau matérialisant la zone de frôlement : discret au repos, il s'embrase à
// chaque balle frôlée pour enseigner la mécanique sans un mot.
export function createGrazeAura() {
  const geo = new THREE.RingGeometry(GRAZE.radius - 0.12, GRAZE.radius + 0.06, 40);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8ffbff,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.name = 'grazeAura';
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export function createShieldMesh() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0x4ff2ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
}
