// Escale : LA TRAVERSÉE DU PLAN DES ANNEAUX.
//
// Jusqu'ici on s'est toujours battu dans le vide, et le vide n'a ni sol ni
// plafond : rien ne défile, rien ne dit qu'on avance. Ici on est DEDANS. Une nappe
// de glace sale court sous le vaisseau jusqu'à l'horizon, la géante mange le haut
// du cadre, et son ombre barre la nappe en biais.
//
// Trois décisions commandent tout le reste :
//
//  1. LE PLAN DES ANNEAUX EST SOUS L'ARÈNE, à quinze unités et demie. La caméra est
//     haute (0, 21, 27) et plongeante de trente-cinq degrés : elle voit donc la
//     nappe par-dessus, en raccourci, comme depuis un avion. C'est le seul cadrage
//     qui donne « on traverse les anneaux » sans jamais rien poser entre le joueur
//     et ce qu'il doit tirer.
//  2. ON NE MEUBLE QUE CE QUI SE VOIT. Mesuré depuis cette caméra, le plan y = -15,5
//     n'occupe l'écran qu'entre dix-huit et deux cent quatre-vingt-treize unités de
//     distance en paysage ; au-delà il sort par le haut du cadre. Tout ce qui est
//     semé plus loin est du budget jeté — sauf en portrait, où le champ vertical
//     monte à soixante-douze degrés et découvre l'horizon. C'est ce cadre-là, et pas
//     le confortable seize-neuvièmes, qui décide où les choses ont le droit de
//     s'arrêter : chaque bord de ce décor est posé pour rester invisible EN
//     PORTRAIT.
//  3. TROIS CALIBRES, PAS UN. Des poussières innombrables qui s'entassent vers
//     l'horizon, des galets, et quelques blocs qui passent près. Un seul calibre de
//     caillou donne un semis, pas des anneaux — c'est le mélange des tailles, et lui
//     seul, qui installe l'échelle.
//
// Budget mesuré : six appels de dessin, vingt-trois mille triangles, neuf mille
// points, quatre textures générées (aucune chargée d'un fichier). À titre de
// comparaison, le palier « saturne » actuel en demande quarante-six.

import * as THREE from 'three';

// Générateur déterministe : deux parties de même graine doivent donner le même
// paysage, sinon ce n'est plus un lieu, seulement du bruit. (Même motif que
// landmarks.js, qui ne l'exporte pas.)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLANC = new THREE.Color(1, 1, 1);
const GRIS = new THREE.Color(0.55, 0.55, 0.58);

// Position de repos de la caméra. Elle sert à calibrer la disparition de la nappe :
// on éteint par la DISTANCE et pas par la profondeur, sinon les coins de la nappe,
// beaucoup plus loin que son bord avant, restent allumés tout seuls.
const CAM = new THREE.Vector3(0, 21, 27);

const Y_NAPPE = -15.5;
const Y_OMBRE = -10.4; // au-dessus de toute la poussière, sous l'arène : ne peut qu'assombrir
const Z_AVANT = 70; // derrière la caméra : rien ne « naît » dans le cadre
const PERIODE = 460; // longueur du motif de bandes, en unités monde
const DEFILE = 21; // unités par seconde ; c'est ça, la vitesse ressentie

// --- Structure en bandes ------------------------------------------------------
//
// Ce qui fait qu'on RECONNAÎT des anneaux, ce n'est pas la poussière : c'est
// l'inégalité. Des divisions vides, des sur-densités, des annelets fins. Une nappe
// homogène se lit comme du brouillard posé à plat.
//
// Le profil est échantillonné une fois dans un tableau circulaire, et TOUT s'y
// réfère : la texture de la nappe, la probabilité de tirage d'un grain, la
// luminosité d'un caillou. C'est ce partage qui fait que la division qu'on voit
// creuser la nappe est aussi celle où la poussière manque.
function profilBandes(r) {
  const N = 512;
  const d = new Float32Array(N);
  const ph = [r() * 6.283, r() * 6.283, r() * 6.283];
  for (let i = 0; i < N; i++) {
    const u = (i / N) * Math.PI * 2;
    d[i] =
      0.56 +
      0.2 * Math.sin(u + ph[0]) +
      0.15 * Math.sin(u * 3 + ph[1]) +
      0.1 * Math.sin(u * 7 + ph[2]);
  }

  // Les divisions. Trois à cinq, jamais régulières, et à bords adoucis : une
  // division nette au pixel se lit comme un trait tiré à la règle.
  const divisions = 3 + ((r() * 3) | 0);
  for (let k = 0; k < divisions; k++) {
    const centre = r();
    const demi = 0.014 + r() * 0.05;
    const fond = 0.04 + r() * 0.13;
    for (let i = 0; i < N; i++) {
      let dist = Math.abs(i / N - centre);
      dist = Math.min(dist, 1 - dist); // le motif est cyclique : la division aussi
      if (dist >= demi) continue;
      const k2 = 1 - dist / demi;
      const s = k2 * k2 * (3 - 2 * k2);
      d[i] = d[i] * (1 - s) + fond * s;
    }
  }

  // Deux ou trois annelets vifs. Ils ne coûtent rien et ce sont eux qu'on remarque.
  for (let k = 0, n = 2 + ((r() * 2) | 0); k < n; k++) {
    const centre = r();
    const demi = 0.004 + r() * 0.008;
    for (let i = 0; i < N; i++) {
      let dist = Math.abs(i / N - centre);
      dist = Math.min(dist, 1 - dist);
      if (dist < demi) d[i] = Math.min(1, d[i] + 0.5 * (1 - dist / demi));
    }
  }

  for (let i = 0; i < N; i++) d[i] = Math.max(0, Math.min(1, d[i]));

  return (u) => {
    const x = (((u % 1) + 1) % 1) * N;
    const i = Math.floor(x);
    const f = x - i;
    return d[i % N] * (1 - f) + d[(i + 1) % N] * f;
  };
}

// --- Textures -----------------------------------------------------------------

// La peau de la nappe. Une seule colonne de pixels suffirait — les anneaux ne
// varient qu'avec le RAYON — mais une bande parfaitement unie en largeur trahit
// tout de suite le calcul. On garde donc soixante-quatre pixels de large pour y
// poser quelques traînées de sur-densité, très étirées et très douces.
//
// La texture défile en V et se répète : le raccord est gratuit puisque le profil
// de bandes est cyclique par construction.
function peauNappe(base, bandes, r) {
  const w = 64;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const clair = base.clone().lerp(BLANC, 0.28);
  const c = new THREE.Color();

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    // flipY vaut vrai par défaut : la ligne 0 du canevas est le haut, donc V = 1.
    const u = 1 - (y + 0.5) / h;
    // Modulation haute fréquence : les vrais anneaux sont faits de milliers
    // d'annelets, et c'est ce grain fin qui les distingue d'un dégradé.
    const fin = 0.78 + 0.22 * Math.sin(u * Math.PI * 2 * 37);
    const k = 0.05 + 0.95 * bandes(u) * fin;
    c.copy(clair).multiplyScalar(k);
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.fillRect(0, y, w, 1);
  }

  // Les amas. Larges en azimut, minces en rayon — c'est le sens dans lequel la
  // gravité les étire. Dessinés deux fois près des bords pour rester cycliques.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) {
    const y = r() * h;
    const rx = 18 + r() * 40;
    const ry = 3 + r() * 10;
    c.copy(clair).multiplyScalar(0.1 + r() * 0.16);
    ctx.fillStyle = `#${c.getHexString()}`;
    for (const dy of [0, -h, h]) {
      ctx.beginPath();
      ctx.ellipse(r() * w, y + dy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping; // rien à répéter en largeur, et pas de couture à gérer
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8; // la nappe est vue en raccourci extrême : sans ça, elle moire
  return tex;
}

// La peau de la géante. Même principe que surfaceTexture() dans landmarks.js, mais
// entièrement dérivée de `teinte` : le décor doit tenir de l'ocre saturnien au
// bleu-vert neptunien sans qu'on retouche une seule couleur en dur.
function peauGeante(base, r) {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color();
  const hex = (col) => `#${col.getHexString()}`;

  ctx.fillStyle = hex(c.copy(base).multiplyScalar(0.6));
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 32; i++) {
    const y = r() * h;
    const ep = 3 + r() * 17;
    c.copy(base).lerp(BLANC, 0.1 + r() * 0.45);
    if (r() < 0.42) c.multiplyScalar(0.4); // une bande sur deux est plus SOMBRE que le fond
    ctx.globalAlpha = 0.12 + r() * 0.26;
    ctx.fillStyle = hex(c);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.024 + i) * 3.4);
    ctx.lineTo(w, y + ep);
    for (let x = w; x >= 0; x -= 16) ctx.lineTo(x, y + ep + Math.sin(x * 0.024 + i) * 3.4);
    ctx.closePath();
    ctx.fill();
  }

  // Quelques tourbillons pris dans les bandes. Trois suffisent : on ne les compte
  // pas, on constate qu'il se passe quelque chose là-dedans.
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.3 + r() * 0.25;
    ctx.fillStyle = hex(
      c
        .copy(base)
        .lerp(BLANC, r() < 0.5 ? 0.55 : 0)
        .multiplyScalar(0.9)
    );
    ctx.beginPath();
    ctx.ellipse(r() * w, 50 + r() * (h - 100), 16 + r() * 34, 7 + r() * 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Calottes assombries. Sans elles la sphère paraît éclairée par en dessous.
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.35, 'rgba(0,0,0,0)');
  g.addColorStop(0.65, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Le masque de l'ombre portée. Pur alpha, aucune couleur : la matière est noire, la
// texture ne dit que « jusqu'où ». Bords adoucis en largeur — une ombre projetée
// par un corps de deux cent cinquante unités a une pénombre énorme — et fondus aux
// deux bouts pour qu'elle ne commence ni ne finisse nulle part.
function masqueOmbre() {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  const lisse = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    const av = lisse(v / 0.08) * lisse((1 - v) / 0.1);
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const au = lisse(u / 0.17) * lisse((1 - u) / 0.17);
      img.data[(y * S + x) * 4 + 3] = Math.round(255 * au * av);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

// Pastille ronde pour les grains. Un point carré se lit comme un pixel mort.
function pastille() {
  const S = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Le décor -----------------------------------------------------------------
//
// CE DÉCOR EST UN LOINTAIN, et il ne doit surtout pas lever le drapeau `proche` que
// Space sait lire. C'est contre-intuitif pour une escale, alors autant l'écrire :
//
//  — LE BROUILLARD. Un plan des anneaux vu en enfilade s'étend jusqu'à sept cent
//    soixante unités. Sous la densité d'une escale, le brouillard exponentiel
//    couvre déjà les trois quarts à cent unités : il ne fondrait pas le lointain,
//    il l'effacerait, et il ne resterait qu'un aplat de la couleur de brume. Pire,
//    sur les matières additives de la nappe et de la poussière, le brouillard
//    AJOUTE sa couleur au lieu de la substituer — un voile clair sur tout le bas
//    de l'écran, exactement ce qu'on cherche à éviter.
//  — L'ASSOMBRISSEMENT D'UN TIERS. Le décor est calibré AVEC lui. Mesuré sur ce
//    cadrage : la colonne de jeu est à 0,07 de luminance moyenne, contre 0,20 pour
//    le palier « saturne » actuel. S'en exempter la remonterait à 0,11 pour rien.
export function createAnneaux({ teinte = 0xd8c49a, densite = 1, seed = 1 } = {}) {
  const r = rng(seed);
  const base = new THREE.Color(teinte);
  const bandes = profilBandes(r);

  const group = new THREE.Group();
  // Deux étages, et la séparation n'est pas cosmétique. Space.setFraming() rétrécit
  // les décors quand le champ horizontal se resserre — mesuré : facteur 0,35 sur un
  // téléphone en portrait. C'est exactement ce qu'il faut pour la géante, qui est un
  // objet BORNÉ dont la taille apparente doit rester constante. C'est exactement ce
  // qu'il ne faut pas pour la nappe, qui déborde du cadre de tous les côtés : la
  // rétrécir ne change rien à ce qu'on en voit, mais la remonte de -15,5 à -5,4,
  // c'est-à-dire juste sous le nez du joueur. `proche` annule donc le cadrage.
  const lointain = new THREE.Group();
  const proche = new THREE.Group();
  group.add(lointain, proche);

  // --- La géante ---------------------------------------------------------------
  // Placée pour que son CENTRE soit juste au-dessus du bord haut du cadre : on ne
  // voit que sa moitié basse, et un astre dont on ne voit pas le sommet est un astre
  // trop grand pour l'écran. C'est ça, « écraser l'horizon ».
  const RAYON = 250;
  const geante = new THREE.Mesh(
    new THREE.SphereGeometry(RAYON, 56, 30),
    new THREE.MeshStandardMaterial({
      map: peauGeante(base, r),
      roughness: 1,
      metalness: 0,
    })
  );
  geante.position.set(-250, -58, -650);
  geante.renderOrder = -30;
  lointain.add(geante);

  // Le terminateur vient de la lampe principale de la scène, comme pour les autres
  // planètes du jeu — pas d'un dégradé peint, qui ne suivrait pas le durcissement de
  // l'éclairage pendant les combats de boss.
  //
  // Le liseré atmosphérique, lui, fait le reste : sans lui une planète est une balle
  // peinte posée sur du noir, et c'est encore plus vrai quand elle est coupée par le
  // bord de l'écran.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(RAYON * 1.03, 36, 20),
    new THREE.MeshBasicMaterial({
      color: base.clone().lerp(BLANC, 0.32),
      transparent: true,
      opacity: 0.075,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.position.copy(geante.position);
  halo.renderOrder = -29;
  lointain.add(halo);

  // --- La nappe ----------------------------------------------------------------
  // La surface continue, en cinq cent soixante-seize triangles. La poussière seule
  // ne suffit pas : vers l'horizon il faut une NAPPE, pas des grains, et aucun nuage
  // de points raisonnable ne comble ça.
  //
  // LA COURBE D'ALLUMAGE EST TOUT. Premier essai : nappe pleine puissance en bas,
  // s'éteignant au loin. Résultat mesuré à l'écran — un SOL gris pâle sur les deux
  // tiers inférieurs du cadre, exactement là où passent les projectiles. Injouable.
  //
  // C'est l'inverse qu'il faut, et c'est aussi ce qu'on voit en vrai : de près on
  // distingue des grains séparés et le vide entre eux ; c'est en enfilade, vers
  // l'horizon, que les grains s'empilent et deviennent opaques. On n'allume donc la
  // nappe qu'au-delà de cent dix unités — mesuré, c'est-à-dire au-dessus de la
  // rangée d'ennemis la plus haute — puis on la rééteint avant son bord, que
  // personne ne verra jamais. La bande claire vit dans le dixième supérieur de
  // l'écran, par-dessus le disque de la géante. Le reste de la nappe est sombre, et
  // ce sont les grains seuls qui l'habitent.
  const PROF = 1000;
  const geoNappe = new THREE.PlaneGeometry(940, PROF, 16, 24);
  const zCentre = Z_AVANT - PROF / 2;
  {
    const p = geoNappe.attributes.position;
    const couleurs = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // Le plan est encore à plat dans XY : son +Y local deviendra le -Z du monde.
      const x = p.getX(i);
      const z = zCentre - p.getY(i);
      // On éteint par la DISTANCE et pas par la profondeur : sinon les coins de la
      // nappe, bien plus loin que son bord avant, restent allumés tout seuls.
      const d = Math.hypot(x - CAM.x, Y_NAPPE - CAM.y, z - CAM.z);
      const k =
        0.05 +
        0.95 *
          THREE.MathUtils.smoothstep(d, 55, 175) *
          (1 - THREE.MathUtils.smoothstep(d, 350, 760));
      couleurs[i * 3] = couleurs[i * 3 + 1] = couleurs[i * 3 + 2] = k;
    }
    geoNappe.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
  }
  const texNappe = peauNappe(base, bandes, r);
  texNappe.repeat.set(1, PROF / PERIODE);
  const nappe = new THREE.Mesh(
    geoNappe,
    new THREE.MeshBasicMaterial({
      map: texNappe,
      vertexColors: true,
      transparent: true,
      opacity: 0.4 * (0.78 + 0.22 * densite),
      // FrontSide, et pas DoubleSide : une matière transparente double face est
      // dessinée en DEUX passes par three.js. Mesuré, ça faisait huit appels de
      // dessin au lieu de six pour un résultat identique — la caméra est à y = 21,
      // elle ne verra jamais le dessous de la nappe.
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  nappe.rotation.x = -Math.PI / 2;
  nappe.position.set(0, Y_NAPPE, zCentre);
  nappe.renderOrder = -28;
  proche.add(nappe);

  // --- La poussière ------------------------------------------------------------
  // Le nuage occupe exactement une PERIODE en profondeur, et chaque grain revient au
  // fond dès qu'il a dépassé la caméra. Le motif de bandes ayant la même période, un
  // grain retrouve toujours la bande d'où il vient : le recyclage est invisible.
  //
  // ESSAI ABANDONNÉ, et c'est sa raison qui vaut d'être notée. On peut éviter d'écrire
  // les milliers de z à chaque image : il suffit de semer le nuage sur DEUX périodes
  // et de translater l'objet entier, ce qui ramène la mise à jour à un seul flottant.
  // Ça marche — mais le nuage a alors un bord arrière qui se promène sur toute une
  // période. En paysage il reste hors cadre ; en portrait, où le champ vertical monte
  // à soixante-douze degrés et découvre l'horizon, ce bord traverse l'écran en une
  // bande scintillante qui se voit immédiatement, d'autant plus dure que la
  // perspective y entasse les grains. Le bord doit être FIXE, et posé là où la nappe
  // est encore lumineuse pour le masquer — donc à une période exactement, soit
  // quatre cent dix-neuf unités de la caméra. Ça coûte une boucle par image ; le
  // champ d'étoiles d'index.js fait déjà la même chose.
  const NB = Math.max(1500, Math.min(20000, Math.round(9000 * densite)));
  const pos = new Float32Array(NB * 3);
  const col = new Float32Array(NB * 3);
  const c = new THREE.Color();
  for (let i = 0; i < NB; i++) {
    let z = 0;
    let u = 0;
    // Tirage par rejet sur le profil : c'est ce qui creuse VRAIMENT les divisions
    // dans la poussière au lieu de les peindre seulement sur la nappe.
    for (let essai = 0; essai < 8; essai++) {
      z = Z_AVANT - r() * PERIODE;
      u = (Z_AVANT - z) / PERIODE;
      if (r() <= bandes(u)) break;
    }
    // Trois tirages additionnés : la nappe doit être MINCE, avec une décroissance
    // douce sur les bords. Une épaisseur uniforme donne une dalle.
    const ep = (r() + r() + r() - 1.5) * 2.2;
    pos[i * 3] = (r() - 0.5) * 840;
    pos[i * 3 + 1] = Y_NAPPE + ep;
    pos[i * 3 + 2] = z;
    const lum = (0.35 + 0.65 * bandes(u)) * (0.35 + r() * r() * 1.3);
    c.copy(base)
      .lerp(BLANC, 0.12 + r() * 0.6)
      .multiplyScalar(lum);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const geoGrains = new THREE.BufferGeometry();
  geoGrains.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geoGrains.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const poussiere = new THREE.Points(
    geoGrains,
    new THREE.PointsMaterial({
      size: 1.1,
      map: pastille(),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  poussiere.renderOrder = -27;
  proche.add(poussiere);

  // --- Galets et blocs ---------------------------------------------------------
  // Un seul maillage instancié pour les deux calibres : c'est le mélange des tailles
  // qui installe l'échelle, mais ça ne vaut pas deux appels de dessin.
  //
  // LE COULOIR. Premier essai : les galets semés uniformément en x. À l'écran, des
  // rochers pâles traversaient la colonne de tir en permanence — et un caillou de
  // décor qui passe devant un ennemi, le joueur le lit comme un ennemi. On dégage
  // donc un couloir vide sous l'arène, et les blocs sont relégués franchement sur
  // les côtés.
  //
  // Subdivision 1 et pas 0 : un icosaèdre nu fait vingt faces, et à cinq unités
  // de la caméra ça se lit comme un dé en papier froissé, pas comme un rocher.
  const geoRoc = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = geoRoc.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = 0.62 + r() * 0.62;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
    }
    geoRoc.computeVertexNormals();
  }
  const NB_ROCS = Math.max(50, Math.min(450, Math.round(220 * densite)));
  const rocs = new THREE.InstancedMesh(
    geoRoc,
    new THREE.MeshStandardMaterial({
      // Très sombre, et ce n'est pas négociable : sous la lampe principale du jeu,
      // une glace « réaliste » rend un caillou blanc papier, et trois cents cailloux
      // blancs derrière la formation, c'est le fouillis clair qu'on veut éviter.
      color: base.clone().lerp(GRIS, 0.5).multiplyScalar(0.4),
      // Les paliers lointains n'ont presque plus de lumière : sans cette braise
      // minuscule, les cailloux deviennent des trous noirs découpés dans la nappe.
      emissive: base.clone().multiplyScalar(0.035),
      roughness: 1,
      metalness: 0,
      flatShading: true,
    }),
    NB_ROCS
  );
  rocs.renderOrder = -26;
  proche.add(rocs);

  const cailloux = [];
  for (let i = 0; i < NB_ROCS; i++) {
    const gros = r() < 0.05;
    // Le couloir est une largeur FIXE, pas une fonction de z : les cailloux défilent
    // en z, donc tout dégagement calculé à la volée les ferait glisser latéralement
    // en approchant — un caillou qui s'écarte tout seul se remarque immédiatement.
    // Seize unités, c'est la demi-largeur de l'arène.
    cailloux.push({
      x: (gros ? 38 + r() * 76 : 16 + r() * 165) * (r() < 0.5 ? -1 : 1),
      y: gros ? -19 - r() * 12 : Y_NAPPE + (r() + r() + r() - 1.5) * 2.6,
      z: Z_AVANT - r() * PERIODE,
      s: gros ? 3 + r() * 4.5 : 0.4 + r() * r() * 2.1,
      rx: r() * 6.283,
      ry: r() * 6.283,
      vx: (r() - 0.5) * 0.3,
      vy: (r() - 0.5) * 0.3,
    });
  }
  const dummy = new THREE.Object3D();

  // --- L'ombre de la géante ----------------------------------------------------
  // Le détail qui fait « oh », et il est presque gratuit : deux triangles.
  //
  // Le quadrilatère est NOIR, en mélange normal, sans écriture de profondeur, et
  // dessiné après la nappe et la poussière : il ne peut donc que les assombrir. Il
  // ne peut pas atteindre le jeu, et pas par convention — par géométrie. La caméra
  // est à y = 21 ; tout rayon qui descend vers un ennemi ou le vaisseau, à y = 0,
  // traverse ce plan à y = -10,4 APRÈS les avoir touchés. Le test de profondeur le
  // rejette là où ça compte, toujours.
  //
  // Le bord lointain converge vers l'aplomb de la géante, le bord proche s'écarte
  // sur la droite : c'est cette convergence, et pas l'obscurité, qui fait lire
  // « ombre projetée » plutôt que « bande sombre ».
  const geoOmbre = new THREE.BufferGeometry();
  geoOmbre.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [45, Y_OMBRE, 90, 255, Y_OMBRE, 90, -340, Y_OMBRE, -520, -40, Y_OMBRE, -520],
      3
    )
  );
  geoOmbre.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geoOmbre.setIndex([0, 1, 2, 2, 1, 3]);
  const ombre = new THREE.Mesh(
    geoOmbre,
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: masqueOmbre(),
      transparent: true,
      opacity: 0.9,
      side: THREE.FrontSide, // même raison que la nappe : double face transparente = deux passes
      depthWrite: false,
    })
  );
  ombre.renderOrder = -25;
  proche.add(ombre);

  let t = 0;
  let cadrage = 0; // forcera le premier ajustement dès la première image

  return {
    group,
    update(dt) {
      // Le plafond évite qu'un retour d'onglet ne téléporte la nappe. Le test en
      // forme de « dt > 0 » n'est pas de la coquetterie : les positions des grains
      // s'ACCUMULENT, donc un seul dt non fini les rendrait tous non finis, et le
      // nuage entier disparaîtrait jusqu'à la fin de la partie. Un NaN échoue au
      // test et vaut zéro.
      const pas = dt > 0 ? Math.min(dt, 0.1) : 0;
      t += pas;

      // Annulation du cadrage. On la relit à chaque image plutôt que de la câbler :
      // Space.setFraming() peut tomber à n'importe quel moment, une rotation
      // d'écran suffit.
      const f = group.scale.x || 1;
      if (f !== cadrage) {
        cadrage = f;
        proche.scale.setScalar(1 / f);
      }

      const av = DEFILE * pas;
      texNappe.offset.y = (t * DEFILE) / PERIODE;

      for (let i = 2; i < pos.length; i += 3) {
        pos[i] += av;
        if (pos[i] > Z_AVANT) pos[i] -= PERIODE;
      }
      geoGrains.attributes.position.needsUpdate = true;

      // On ne traverse pas le plan des anneaux d'un coup : on l'approche, on le
      // frôle, on s'en éloigne. Une minute et demie de cycle, jamais au-dessus de
      // -13,3 — le combat garde toute sa place.
      proche.position.y = (Math.sin(t * 0.068) * 2.2) / cadrage;

      for (let i = 0; i < cailloux.length; i++) {
        const o = cailloux[i];
        o.z += av;
        if (o.z > Z_AVANT) o.z -= PERIODE; // multiple exact de la période : la bande suit
        o.rx += o.vx * pas;
        o.ry += o.vy * pas;
        dummy.position.set(o.x, o.y, o.z);
        dummy.rotation.set(o.rx, o.ry, 0);
        dummy.scale.setScalar(o.s);
        dummy.updateMatrix();
        rocs.setMatrixAt(i, dummy.matrix);
      }
      rocs.instanceMatrix.needsUpdate = true;
    },
  };
}
