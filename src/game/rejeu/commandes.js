// Les COMMANDES : tout ce que le joueur demande au vaisseau pendant une frame,
// et rien d'autre.
//
// Le vaisseau lisait l'objet Input directement — donc la position d'un doigt en
// coordonnées d'écran, projetée avec la caméra du moment. Une partie jouée sur un
// téléphone en portrait n'aurait alors jamais pu être rejouée sur un écran large :
// les mêmes pixels y désignent un autre point du monde.
//
// La commande est donc exprimée dans le MONDE, jamais en pixels. Ce qu'on
// enregistre, ce n'est pas « le doigt était à tel endroit de l'écran », c'est
// « le vaisseau devait aller là ».
//
// Et tout y est QUANTIFIÉ — y compris pendant une partie normale. C'est le point
// délicat : si le jeu tournait en pleine précision et le replay sur des valeurs
// arrondies, les deux dérivéraient l'une de l'autre en quelques secondes, un
// ennemi survivrait ici et pas là, et le replay finirait par raconter une autre
// partie. En arrondissant AUSSI en direct, la partie jouée est exactement celle
// qu'on rejoue.

// Pas de quantification. dt : 0,2 ms. Position : un soixante-quatrième d'unité,
// soit deux millimètres à l'échelle du vaisseau.
const DT_PAS = 1 / 5000;
const DT_MAX = 255;
const POS_PAS = 1 / 64;
const POS_MAX = 32; // l'arène fait 29 de large, la profondeur 20

export const EV = {
  RIEN: 0,
  PIROUETTE_GAUCHE: 1,
  PIROUETTE_DROITE: 2,
  BOMBE: 3,
  OVERDRIVE: 4,
  APPEL: 5,
};

export function quantifieDt(dt) {
  return Math.max(0, Math.min(DT_MAX, Math.round(dt / DT_PAS)));
}

export function dtDepuis(q) {
  return q * DT_PAS;
}

// timeScale ne prend que quelques valeurs (1, ou l'échelle du Réflexe), mais il
// divise le déplacement du vaisseau : il doit être arrondi comme le reste.
export function quantifieEchelle(ts) {
  return Math.max(1, Math.min(255, Math.round((ts || 1) * 255)));
}

export function echelleDepuis(q) {
  return q / 255;
}

export function quantifiePos(v) {
  const c = Math.max(-POS_MAX, Math.min(POS_MAX, v));
  return Math.round(c / POS_PAS);
}

export function posDepuis(q) {
  return q * POS_PAS;
}

// LA COMMANDE, POUR LE RÉSEAU. Le jeu à deux s'échange soixante commandes par
// seconde : on les met à plat dans un tableau de neuf nombres, ce que JSON
// encode en une trentaine d'octets là où l'objet nommé en coûterait cent.
//
// Les valeurs sont DÉJÀ arrondies quand elles arrivent ici — c'est tout l'objet
// de la quantification — donc ce tableau ne perd rien. Deux clients qui
// s'échangent ces neuf nombres appliquent rigoureusement la même commande.
export function commandeVersTableau(c) {
  return [c.dt, c.echelle, c.dx, c.dz, c.vise ? 1 : 0, c.ax, c.az, c.tir ? 1 : 0, c.ev];
}

export function tableauVersCommande(t, dans = commandeVide()) {
  if (!t || t.length < 9) return dans;
  dans.dt = t[0];
  dans.echelle = t[1];
  dans.dx = t[2];
  dans.dz = t[3];
  dans.vise = !!t[4];
  dans.ax = t[5];
  dans.az = t[6];
  dans.tir = !!t[7];
  dans.ev = t[8];
  return dans;
}

// Une commande vide, réutilisée d'une frame à l'autre : la boucle de jeu ne doit
// pas allouer soixante objets par seconde.
export function commandeVide() {
  return { dt: 0, echelle: 1, dx: 0, dz: 0, vise: false, ax: 0, az: 0, tir: false, ev: EV.RIEN };
}

// Depuis les entrées réelles. `viser` projette le doigt sur le plan de jeu — c'est
// le seul endroit où l'écran intervient encore, et son résultat est aussitôt
// converti en monde puis arrondi.
export function lireEntrees(cmd, input, viser, dt, echelle, ev) {
  cmd.dt = dtDepuis(quantifieDt(dt));
  cmd.echelle = echelleDepuis(quantifieEchelle(echelle));
  cmd.tir = !!input.fire;
  cmd.ev = ev;
  if (input.touchActive && viser) {
    const p = viser(input.touchNdc);
    cmd.vise = true;
    cmd.ax = posDepuis(quantifiePos(p.x));
    cmd.az = posDepuis(quantifiePos(p.z));
    cmd.dx = 0;
    cmd.dz = 0;
  } else {
    cmd.vise = false;
    cmd.dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    cmd.dz = (input.back ? 1 : 0) - (input.forward ? 1 : 0);
  }
  return cmd;
}
