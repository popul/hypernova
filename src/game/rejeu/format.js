// Sérialisation d'un replay. Une partie de cinq minutes, c'est dix-huit mille
// frames : le format doit être compté à l'octet, sinon le panthéon ne tiendrait
// pas dans le stockage du navigateur.
//
// Par frame : trois octets au clavier, sept au doigt. Puis gzip, qui divise encore
// par quatre ou cinq sur des données aussi répétitives. Une partie complète pèse
// une trentaine de kilo-octets — on peut en garder dix sans y penser.

import {
  quantifieDt,
  quantifieEchelle,
  quantifiePos,
  dtDepuis,
  echelleDepuis,
  posDepuis,
} from './commandes.js';

// LA VERSION DES RÈGLES, pas celle du format d'octets.
//
// Un replay ne contient pas des images mais des commandes : il ne redonne la même
// partie que rejoué par le MÊME jeu. Changer une règle — la portée d'un tir, la
// vitesse d'une balle — fait diverger la relecture de la partie enregistrée, et le
// replay se met à raconter autre chose. On l'incrémente donc à chaque changement
// de règles, et on refuse de lire ce qui vient d'une autre version : mieux vaut
// dire « enregistré par une version antérieure » que montrer une partie fausse.
//
//   1 — première version
//   2 — les ennemis ne tirent plus depuis le dos du vaisseau, ni à plat
//       (noFireBehind, minShotSlope)
//   3 — les boss combattent en trois phases (BOSS_PHASES)
//   4 — l'amiral est deux fois plus gros, l'Appel porte deux fois plus loin
//   5 — la Survie n'a plus ni boutique ni crédits : les modules tombent des ennemis
//   6 — trois coques jouables (ORION, HÉLIOS, VULCAIN) : armement et source
//       d'énergie dépendent de celle qu'on a choisie
//   7 — HÉLIOS tient le CONTACT et non plus une colonne, et elle surchauffe ;
//       le canon de VULCAIN et le rythme de sa forge sont revus
//   8 — la pirouette RENVOIE les tirs au lieu de les effacer, le cœur d'un ennemi
//       compte double, le dernier mort emporte ses balles, et l'escale devient un
//       niveau bis sans boss dont le fragment se gagne à la sortie
//   9 — les charges de VULCAIN sont des missiles qui n'explosent qu'AU CONTACT,
//       et leur souffle naît sur l'ennemi touché — il ratait l'amiral jusqu'ici
//  10 — un colosse traverse le champ de débris : il balaie ennemis, tirs et
//       joueur, et s'annonce trois secondes avant par une flèche au sol
//  11 — la Chambre de fureur : pendant l'Overdrive, les tirs frappent plus fort
//       et changent de couleur et de taille à chaque niveau du module
//  12 — la pente de l'arcade : la difficulté est ÉTALÉE, sans rien perdre de sa
//       montée. La vague 12 joue ce que jouait la neuvième, la vague 15 ce que
//       jouait la onzième. Les ennemis ne se comportent donc plus pareil à
//       numéro de vague égal, et un enregistrement d'avant raconterait une autre
//       partie que celle qu'il prétend.
//  13 — la graine de l'arcade suit le numéro de vague. Depuis la pente, deux
//       vagues voisines pouvaient recevoir la même difficulté ARRONDIE ; avec la
//       même graine, elles étaient alors la même vague, jouée deux fois de suite.
//  14 — la couture s'achète. Sortir par un bord pour rentrer par l'autre était
//       acquis dès la première vague ; c'est un module désormais, et sans lui les
//       bords sont des murs. Un enregistrement d'avant a été joué dans une arène
//       qui bouclait toujours : rejoué ici, le vaisseau taperait un mur là où il
//       passait, et la partie divergerait dès le premier bord touché.
//  15 — la zone de jeu est la même pour tout le monde. Elle se déduisait du
//       CADRAGE, donc de la taille de la fenêtre : en portrait on volait jusqu'à
//       z = 26 quand un écran large s'arrêtait à 14, et les balles s'effaçaient
//       onze unités plus loin. Un enregistrement d'avant a été joué dans une
//       arène qui n'existe plus, aux dimensions de l'écran de celui qui l'a fait.
export const VERSION = 15;

// --- Écriture ---------------------------------------------------------------

export class Ecrivain {
  constructor() {
    this.buf = new Uint8Array(4096);
    this.n = 0;
  }

  _place(k) {
    if (this.n + k <= this.buf.length) return;
    const grand = new Uint8Array(Math.max(this.buf.length * 2, this.n + k));
    grand.set(this.buf);
    this.buf = grand;
  }

  octet(v) {
    this._place(1);
    this.buf[this.n++] = v & 0xff;
  }

  // Entier signé sur deux octets, petit-boutiste.
  court(v) {
    this._place(2);
    this.buf[this.n++] = v & 0xff;
    this.buf[this.n++] = (v >> 8) & 0xff;
  }

  entier(v) {
    this._place(4);
    for (let i = 0; i < 4; i++) this.buf[this.n++] = (v >> (i * 8)) & 0xff;
  }

  fini() {
    return this.buf.slice(0, this.n);
  }
}

export class Lecteur {
  constructor(buf) {
    this.buf = buf;
    this.n = 0;
  }

  get reste() {
    return this.n < this.buf.length;
  }

  octet() {
    return this.buf[this.n++];
  }

  court() {
    const v = this.buf[this.n] | (this.buf[this.n + 1] << 8);
    this.n += 2;
    return (v << 16) >> 16; // extension de signe
  }

  entier() {
    let v = 0;
    for (let i = 0; i < 4; i++) v |= this.buf[this.n + i] << (i * 8);
    this.n += 4;
    return v;
  }
}

// --- Une frame --------------------------------------------------------------
//
// octet 0 : dt          (pas de 0,2 ms)
// octet 1 : échelle de temps (÷255)
// octet 2 : drapeaux — dx+1 sur 2 bits, dz+1 sur 2 bits, visée, tir, événement
// puis, si visée    : deux entiers courts (point visé, au 1/64 d'unité)
// puis, si événement : un octet
//
// Une pirouette ou un appel arrive quelques fois par vague : lui réserver un octet
// sur CHAQUE frame coûterait plus cher que de le signaler par un bit et de ne
// l'écrire que lorsqu'il existe.

export function ecritFrame(w, cmd) {
  w.octet(quantifieDt(cmd.dt));
  w.octet(quantifieEchelle(cmd.echelle));
  w.octet(
    (cmd.dx + 1) |
      ((cmd.dz + 1) << 2) |
      (cmd.vise ? 16 : 0) |
      (cmd.tir ? 32 : 0) |
      (cmd.ev ? 64 : 0)
  );
  if (cmd.vise) {
    w.court(quantifiePos(cmd.ax));
    w.court(quantifiePos(cmd.az));
  }
  if (cmd.ev) w.octet(cmd.ev);
}

export function litFrame(r, cmd) {
  cmd.dt = dtDepuis(r.octet());
  cmd.echelle = echelleDepuis(r.octet());
  const d = r.octet();
  cmd.dx = (d & 3) - 1;
  cmd.dz = ((d >> 2) & 3) - 1;
  cmd.vise = !!(d & 16);
  cmd.tir = !!(d & 32);
  if (cmd.vise) {
    cmd.ax = posDepuis(r.court());
    cmd.az = posDepuis(r.court());
  }
  cmd.ev = d & 64 ? r.octet() : 0;
  return cmd;
}

// --- Transport --------------------------------------------------------------

const AVEC_GZIP = typeof CompressionStream !== 'undefined';

async function gzip(octets) {
  const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

async function gunzip(octets) {
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

function versBase64(octets) {
  let s = '';
  const pas = 0x8000; // String.fromCharCode a une limite d'arguments
  for (let i = 0; i < octets.length; i += pas) {
    s += String.fromCharCode.apply(null, octets.subarray(i, i + pas));
  }
  return btoa(s);
}

function depuisBase64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Le préfixe dit comment relire : « z » compressé, « b » brut. Sans lui, un replay
// enregistré sur un navigateur qui compresse serait illisible sur un autre.
export async function empaquete(octets) {
  if (!AVEC_GZIP) return 'b' + versBase64(octets);
  try {
    return 'z' + versBase64(await gzip(octets));
  } catch {
    return 'b' + versBase64(octets);
  }
}

// UN ENREGISTREMENT ABÎMÉ SE REFUSE, IL NE SE JETTE PAS.
//
// Les deux étages peuvent échouer sur des octets qui ne veulent rien dire :
// `atob` jette sur un base64 tronqué, et le dégonflage rejette sur un flux
// corrompu. Rien de tout cela n'était rattrapé — une ligne mal recopiée, un
// transfert coupé, une vieille colonne à demi migrée, et l'écran de rejeu
// cassait au lieu de dire « enregistrement illisible ». L'appelant sait déjà
// traiter `null` : c'est ce qu'il reçoit quand il n'y a rien à lire.
export async function depaquete(texte) {
  if (!texte) return null;
  try {
    const corps = depuisBase64(texte.slice(1));
    if (texte[0] !== 'z') return corps;
    return await gunzip(corps);
  } catch {
    return null;
  }
}
