// LE FORMAT BINAIRE D'UN ENREGISTREMENT.
//
// Un replay n'est pas une vidéo : c'est une suite de commandes comptée à l'octet,
// écrite par l'Écrivain et relue par le Lecteur. Deux façons de le casser, et
// aucune des deux ne fait de bruit.
//
// La première : décaler l'écriture et la lecture. Un bit de drapeau déplacé, un
// champ ajouté d'un seul côté, et tout ce qui suit dans le flux est lu de travers
// — le vaisseau part à gauche là où le joueur allait à droite, et personne ne
// comprend pourquoi le replay ne ressemble pas à la partie.
//
// La seconde : laisser gonfler l'enregistrement. Le format tient parce qu'une
// frame coûte trois octets au clavier et sept au doigt ; écrire la visée sur
// CHAQUE frame doublerait la facture sans qu'aucun test fonctionnel ne bronche,
// et le panthéon ne tiendrait plus dans le stockage du navigateur.
//
// S'y ajoute ce qui protège le joueur : un flux abîmé doit s'arrêter, jamais
// tourner en rond ; et une partie enregistrée sous d'autres règles doit être
// refusée plutôt que rejouée de travers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Ecrivain,
  Lecteur,
  ecritFrame,
  litFrame,
  empaquete,
  depaquete,
  VERSION,
} from '../src/game/rejeu/format.js';
import { Enregistreur, ouvreReplay, LecteurReplay } from '../src/game/rejeu/index.js';
import {
  commandeVide,
  quantifieDt,
  dtDepuis,
  quantifieEchelle,
  echelleDepuis,
  quantifiePos,
  posDepuis,
  EV,
} from '../src/game/rejeu/commandes.js';

// Un hasard SEMÉ : les épreuves doivent tomber pareil à chaque exécution, sinon
// une régression n'apparaîtrait qu'une fois sur trois et personne n'y croirait.
function semeur(graine) {
  let s = graine >>> 0;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

// La visée n'est écrite QUE lorsque le doigt est posé : quand elle est absente,
// le lecteur laisse ax/az tels quels et le jeu ne les regarde pas (player.js
// n'y touche que sous `if (cmd.vise)`). On compare donc ce qui fait foi.
// Le « + 0 » ramène -0 à 0 : l'aller-retour par l'entier court perd le signe du
// zéro, ce dont la simulation se moque complètement mais que deepEqual refuse.
function vue(c) {
  const v = {
    dt: c.dt + 0,
    echelle: c.echelle + 0,
    dx: c.dx + 0,
    dz: c.dz + 0,
    vise: c.vise,
    tir: c.tir,
    ev: c.ev,
  };
  if (c.vise) {
    v.ax = c.ax + 0;
    v.az = c.az + 0;
  }
  return v;
}

// Une trace qui RESSEMBLE à une partie : pas de temps régulier, mouvements lisses,
// alternance clavier/doigt. Le hasard pur de `suiteVariee` est incompressible et
// dirait n'importe quoi de la taille d'un enregistrement réel.
function traceRealiste(n) {
  const cmds = [];
  for (let i = 0; i < n; i++) {
    const c = commandeVide();
    c.dt = dtDepuis(quantifieDt(1 / 60));
    if (Math.floor(i / 400) % 2 === 0) {
      c.dx = Math.sign(Math.sin(i / 55));
      c.dz = 0;
    } else {
      c.vise = true;
      c.ax = posDepuis(quantifiePos(9 * Math.sin(i / 90)));
      c.az = posDepuis(quantifiePos(-6 + 2 * Math.cos(i / 130)));
    }
    c.tir = i % 7 !== 0;
    c.ev = i % 900 === 0 ? EV.PIROUETTE_DROITE : EV.RIEN;
    cmds.push(c);
  }
  return cmds;
}

// Une suite de commandes variée mais reproductible, DÉJÀ quantifiée — c'est l'état
// dans lequel le jeu les produit (lireEntrees arrondit à la source), donc le seul
// pour lequel l'aller-retour doit être exact.
function suiteVariee(n, graine = 7) {
  const alea = semeur(graine);
  const echelles = [1, 0.15, 0.4, 0.62];
  const cmds = [];
  for (let i = 0; i < n; i++) {
    const c = commandeVide();
    c.dt = dtDepuis(quantifieDt(0.008 + alea() * 0.04));
    c.echelle = echelleDepuis(quantifieEchelle(echelles[i % echelles.length]));
    c.vise = alea() < 0.3;
    if (c.vise) {
      c.ax = posDepuis(quantifiePos(alea() * 29 - 14.5));
      c.az = posDepuis(quantifiePos(alea() * 20 - 10));
    } else {
      c.dx = Math.round(alea() * 2) - 1;
      c.dz = Math.round(alea() * 2) - 1;
    }
    c.tir = alea() < 0.65;
    c.ev = alea() < 0.05 ? 1 + Math.floor(alea() * 5) : EV.RIEN;
    cmds.push(c);
  }
  return cmds;
}

function ecrisTout(cmds) {
  const w = new Ecrivain();
  for (const c of cmds) ecritFrame(w, c);
  return w.fini();
}

test('une longue partie fait l’aller-retour sans qu’une seule commande bouge', () => {
  // Deux mille frames de tout ce que le joueur peut faire, écrites d'affilée puis
  // relues d'affilée. C'est LE test qui attrape un décalage écriture/lecture :
  // comme les frames n'ont pas toutes la même longueur, un octet écrit et non relu
  // (ou l'inverse) ne se rattrape jamais — tout ce qui suit part en vrille.
  //
  // Deux mille frames dépassent aussi les 4096 octets du tampon initial : on
  // vérifie du même coup que l'agrandissement de l'Écrivain ne perd rien.
  const cmds = suiteVariee(2000);
  const octets = ecrisTout(cmds);
  assert.ok(
    octets.length > 4096,
    'échantillon trop court pour éprouver l’agrandissement du tampon'
  );

  const r = new Lecteur(octets);
  const cmd = commandeVide(); // le lecteur réel réutilise un seul objet
  const lues = [];
  while (r.reste) lues.push(vue(litFrame(r, cmd)));

  assert.equal(
    lues.length,
    cmds.length,
    `${cmds.length} frames écrites, ${lues.length} relues — l’écriture et la lecture ne consomment pas le même nombre d’octets`
  );
  for (let i = 0; i < cmds.length; i++) {
    assert.deepEqual(
      lues[i],
      vue(cmds[i]),
      `la frame ${i} ne revient pas telle qu’elle est partie`
    );
  }
});

test('chaque drapeau vit dans ses propres bits, sans déborder sur le voisin', () => {
  // Direction, visée, tir et événement partagent un seul octet. Deux cent
  // seize combinaisons : si un jour quelqu'un déplace un bit ou en réutilise un,
  // au moins une de ces combinaisons se met à en lire une autre.
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const vise of [false, true]) {
        for (const tir of [false, true]) {
          for (const ev of Object.values(EV)) {
            const c = commandeVide();
            Object.assign(c, { dx, dz, vise, tir, ev });
            if (vise) {
              c.ax = posDepuis(quantifiePos(-11.5));
              c.az = posDepuis(quantifiePos(6.25));
            }
            const w = new Ecrivain();
            ecritFrame(w, c);
            const r = new Lecteur(w.fini());
            const lue = litFrame(r, commandeVide());
            const quoi = `dx=${dx} dz=${dz} vise=${vise} tir=${tir} ev=${ev}`;
            assert.deepEqual(vue(lue), vue(c), `drapeaux mal relus pour ${quoi}`);
            assert.ok(!r.reste, `${quoi} : la frame laisse des octets derrière elle`);
          }
        }
      }
    }
  }
});

test('une frame coûte trois octets au clavier, sept au doigt', () => {
  // Le chiffre sur lequel repose tout le format. Écrire la visée sur chaque frame
  // — la simplification la plus tentante — ferait passer la ligne du clavier de
  // trois à sept, et une partie de cinq minutes de cinquante-quatre kilo-octets à
  // cent vingt-six.
  const clavier = commandeVide();
  clavier.dx = 1;
  clavier.tir = true;
  assert.equal(
    ecrisTout([clavier]).length,
    3,
    'une frame au clavier ne tient plus en trois octets'
  );

  const doigt = commandeVide();
  doigt.vise = true;
  doigt.ax = posDepuis(quantifiePos(9.5));
  doigt.az = posDepuis(quantifiePos(-4.75));
  assert.equal(ecrisTout([doigt]).length, 7, 'une frame au doigt ne tient plus en sept octets');
});

test('un événement ne coûte un octet que la frame où il arrive', () => {
  // Une pirouette ou un Appel arrive quelques fois par vague. Leur réserver un
  // octet permanent coûterait dix-huit mille octets par partie pour porter une
  // centaine d'informations.
  const sans = [];
  const avec = [];
  for (let i = 0; i < 1000; i++) {
    const a = commandeVide();
    const b = commandeVide();
    b.ev = EV.PIROUETTE_GAUCHE;
    sans.push(a);
    avec.push(b);
  }
  assert.equal(
    ecrisTout(avec).length - ecrisTout(sans).length,
    1000,
    'l’événement n’est plus facturé à la frame près'
  );
});

test('une partie de cinq minutes reste dans son budget d’octets', () => {
  // Dix-huit mille frames, soit cinq minutes à soixante images par seconde, avec
  // une part réaliste de jeu au doigt et d'événements. Le contrôle porte sur la
  // MOYENNE par frame : c'est elle qui décrit le format, et elle bouge dès qu'un
  // champ est écrit plus souvent qu'il ne le devrait.
  const cmds = suiteVariee(18000, 99);
  const octets = ecrisTout(cmds);
  const parFrame = octets.length / cmds.length;
  assert.ok(
    parFrame < 4.6,
    `${parFrame.toFixed(2)} octets par frame — l’enregistrement a gonflé (un champ écrit sur toutes les frames ?)`
  );
  assert.ok(
    octets.length < 90_000,
    `une partie de cinq minutes pèse ${octets.length} octets bruts`
  );
});

test('l’empaquetage garde l’enregistrement transportable et compact', async () => {
  // Le flux voyage en texte, dans du JSON, dans le stockage du navigateur : il doit
  // rester du base64 pur, précédé de la lettre qui dit comment le relire.
  const octets = ecrisTout(traceRealiste(6000));
  const paquet = await empaquete(octets);
  assert.ok(
    'zb'.includes(paquet[0]),
    `préfixe inattendu « ${paquet[0]} » — un lecteur ne saura pas quoi en faire`
  );
  assert.match(
    paquet.slice(1),
    /^[A-Za-z0-9+/]*={0,2}$/,
    'le corps n’est pas du base64 : il ne survivra pas au JSON'
  );
  // Le « b » n'existe que pour les navigateurs sans CompressionStream. Là où la
  // compression est disponible — et elle l'est ici — elle DOIT être employée :
  // c'est elle qui fait tenir dix parties dans le stockage. Sans elle, le base64
  // seul gonflerait le flux d'un tiers au lieu de le réduire des deux tiers.
  if (typeof CompressionStream !== 'undefined') {
    assert.equal(paquet[0], 'z', 'la compression est disponible mais le flux part en clair');
    assert.ok(
      paquet.length < octets.length * 0.75,
      `compressé puis encodé, le flux pèse ${paquet.length} pour ${octets.length} octets bruts — le gzip ne réduit plus rien`
    );
  }
});

test('un flux tronqué s’arrête proprement, où qu’on le coupe', async () => {
  // Un enregistrement peut arriver amputé : stockage plein, copier-coller
  // incomplet, écriture interrompue. Le lecteur doit alors s'arrêter — jamais
  // jeter, jamais tourner en rond — et ne pas inventer de frames.
  const cmds = suiteVariee(40, 21);
  const entier = ecrisTout(cmds);
  for (let k = 0; k <= entier.length; k++) {
    const r = new Lecteur(entier.slice(0, k));
    let lues = 0;
    const plafond = cmds.length + 2;
    while (r.reste) {
      litFrame(r, commandeVide()); // doit ne rien jeter : l'épreuve échoue sinon
      if (++lues > plafond) {
        assert.fail(`coupé à ${k} octets, le lecteur ne s’arrête plus (${lues} frames lues)`);
      }
    }
    assert.ok(
      lues <= cmds.length,
      `coupé à ${k} octets, le lecteur rend ${lues} frames alors que ${cmds.length} ont été écrites`
    );
  }
});

test('un flux corrompu ne fait ni boucler ni jeter le lecteur', () => {
  // Des octets abîmés font lire des drapeaux qui n'ont jamais été écrits, donc des
  // frames de longueurs incohérentes. L'invariant qui nous sauve : une frame
  // consomme toujours au moins ses trois octets d'en-tête, donc le lecteur avance
  // forcément et finit par sortir. Si quelqu'un ouvrait un chemin qui n'avance
  // pas, le jeu se figerait à l'ouverture d'un replay au lieu d'afficher une
  // erreur.
  const alea = semeur(4242);
  const propre = ecrisTout(suiteVariee(60, 13));
  for (let essai = 0; essai < 60; essai++) {
    const abime = propre.slice(0, 1 + Math.floor(alea() * propre.length));
    for (let i = 0; i < abime.length; i++) {
      if (alea() < 0.25) abime[i] = Math.floor(alea() * 256);
    }
    const r = new Lecteur(abime);
    const plafond = Math.ceil(abime.length / 3);
    let lues = 0;
    while (r.reste) {
      litFrame(r, commandeVide());
      if (++lues > plafond) {
        assert.fail(
          `essai ${essai} : ${abime.length} octets abîmés rendent ${lues} frames — le lecteur n’avance plus`
        );
      }
    }
  }
});

test('les bords de l’arène tiennent dans les deux octets réservés à une position', () => {
  // La position part en entier court SIGNÉ. L'arène fait vingt-neuf de large et la
  // position est au soixante-quatrième d'unité : on est loin du bord, mais si
  // quelqu'un agrandissait l'arène au-delà de cinq cents unités, l'entier
  // déborderait en silence et le vaisseau réapparaîtrait de l'autre côté du monde
  // à la relecture.
  for (const v of [0, 14.5, -14.5, 32, -32, 1e9, -1e9]) {
    const q = quantifiePos(v);
    assert.ok(
      q >= -32768 && q <= 32767,
      `la position ${v} donne ${q}, hors de portée d’un entier court`
    );
    const w = new Ecrivain();
    w.court(q);
    assert.equal(
      new Lecteur(w.fini()).court(),
      q,
      `la position ${v} ne survit pas aux deux octets`
    );
  }
});

test('l’octet du pas de temps couvre la plus longue frame que la boucle produit', () => {
  // main.js plafonne le pas de temps réel à cinquante millisecondes (« évite les
  // sauts après un gel d'onglet »). Cet octet doit donc porter cinquante
  // millisecondes SANS saturer : s'il saturait, une frame lente serait enregistrée
  // plus courte qu'elle n'a été jouée et le replay divergerait de la partie.
  assert.ok(
    quantifieDt(0.05) < 255,
    'l’octet du pas de temps sature avant le plafond de la boucle'
  );
  assert.equal(
    dtDepuis(quantifieDt(0.05)),
    0.05,
    'cinquante millisecondes ne se représentent plus exactement'
  );
  // Et rien ne peut en sortir : un pas de temps aberrant serait tronqué par
  // `v & 0xff` à l'écriture, donc relu comme une valeur toute différente.
  for (const dt of [0, 0.05, 1, 1e6, Infinity]) {
    const q = quantifieDt(dt);
    assert.ok(
      q >= 0 && q <= 255,
      `le pas de temps ${dt} donne ${q}, qui ne tient pas dans un octet`
    );
  }
  for (const ts of [1, 0.15, 0.4, 1e6]) {
    const q = quantifieEchelle(ts);
    assert.ok(
      q >= 0 && q <= 255,
      `l’échelle de temps ${ts} donne ${q}, qui ne tient pas dans un octet`
    );
  }
});

test('une partie enregistrée sous d’autres règles est refusée, pas rejouée', async () => {
  // C'est la garde qui empêche de raconter n'importe quoi. Un replay ne contient
  // que des commandes : rejoué par un jeu dont les règles ont bougé, il montre une
  // autre partie que celle qu'il prétend. Mieux vaut dire « version antérieure ».
  const partie = await enregistreUnePartie();
  for (const v of [VERSION - 1, VERSION + 1, undefined, null, String(VERSION)]) {
    const ouvert = await ouvreReplay({ ...partie, version: v });
    assert.equal(
      ouvert?.obsolete,
      true,
      `la version ${JSON.stringify(v)} est acceptée alors qu’elle n’est pas ${VERSION}`
    );
  }
  // Et la version courante passe, sinon la garde refuserait tout.
  const bon = await ouvreReplay(partie);
  assert.ok(bon && !bon.obsolete, 'la version courante est refusée : plus aucun replay ne s’ouvre');
});

test('un enregistrement traverse le stockage sans perdre une commande', async () => {
  // Le trajet réel : l'Enregistreur produit un objet, il est sérialisé en JSON pour
  // le stockage du navigateur, puis relu. Si un champ cessait d'être du texte ou
  // un nombre — un Uint8Array oublié tel quel, par exemple — JSON.stringify le
  // transformerait en objet vide et le replay s'ouvrirait sur un flux muet.
  const partie = await enregistreUnePartie();
  const revenue = JSON.parse(JSON.stringify(partie));
  assert.equal(
    revenue.version,
    VERSION,
    'l’enregistrement n’est pas estampillé de la version courante'
  );

  const lecteur = await ouvreReplay(revenue);
  assert.equal(lecteur.nbVagues, 2, 'les vagues n’ont pas survécu au stockage');
  assert.equal(lecteur.totalFrames, ATTENDUES[0] + ATTENDUES[1], 'le total d’images a bougé');

  for (let v = 0; v < 2; v++) {
    assert.deepEqual(
      lecteur.vaVersVague(v),
      { vague: v + 1 },
      `l’instantané de la vague ${v} est perdu`
    );
    let n = 0;
    let c;
    while ((c = lecteur.suivante())) {
      assert.deepEqual(vue(c), vue(COMMANDES[v][n]), `vague ${v}, frame ${n} : commande altérée`);
      n++;
    }
    assert.equal(n, ATTENDUES[v], `vague ${v} : ${n} frames relues au lieu de ${ATTENDUES[v]}`);
  }
});

// Les deux épreuves du trajet complet partagent la même partie : deux vagues de
// longueurs différentes, pour que le découpage du flux ait quelque chose à dire.
const ATTENDUES = [300, 120];
const COMMANDES = [suiteVariee(ATTENDUES[0], 31), suiteVariee(ATTENDUES[1], 32)];

async function enregistreUnePartie() {
  const e = new Enregistreur();
  e.demarre({ coque: 'ORION', mode: 'arcade' });
  for (let v = 0; v < 2; v++) {
    e.ouvreVague({ vague: v + 1 });
    for (const c of COMMANDES[v]) e.frame(c, null);
  }
  return e.termine({ score: 4200 });
}

// --- Un enregistrement abîmé se refuse, il ne casse pas ----------------------
//
// Le flux vient de la base, et la base a été écrite par un navigateur, transportée
// par un réseau, migrée par une colonne. Il ne faut pas beaucoup d'imagination
// pour qu'un jour il arrive tordu : une ligne tronquée, un transfert coupé. Ce
// jour-là, l'écran de rejeu doit dire « illisible », pas se figer.

test('un flux illisible rend null au lieu de jeter', async () => {
  for (const abime of ['zpas-du-base64!!', 'z', 'zQUJD', '@@@@', 'zAAAAAAAAAAAA']) {
    const r = await depaquete(abime);
    assert.equal(r, null, `« ${abime} » aurait dû être refusé proprement`);
  }
});

test('un flux valide se dépaquette toujours', async () => {
  // La garde ne doit pas avaler le cas normal.
  const octets = new Uint8Array([1, 2, 3, 4, 5]);
  assert.deepEqual([...(await depaquete(await empaquete(octets)))], [...octets]);
});

test('un nombre de vagues aberrant ne fige pas la lecture', () => {
  // Quatre octets qui annoncent deux milliards de vagues, et rien derrière. La
  // boucle tournait dessus, empilait des vagues vides et bloquait l'onglet.
  const w = new Ecrivain();
  w.entier(2_000_000_000);
  const lecteur = new LecteurReplay({ etats: [], controles: [] }, w.fini());
  assert.ok(lecteur.vagues.length < 10, `${lecteur.vagues.length} vagues sorties de quatre octets`);
});

test('une taille de vague qui déborde arrête la lecture', () => {
  const w = new Ecrivain();
  w.entier(3); // trois vagues annoncées
  w.entier(60); // la première : soixante frames…
  w.entier(999_999); // …et un million d'octets qui ne sont pas là
  const lecteur = new LecteurReplay({ etats: [{}], controles: [[]] }, w.fini());
  assert.equal(lecteur.vagues.length, 0, 'on a lu au-delà du tampon');
});
