// LE COLOSSE. Il traverse le champ, et il ne discute pas.
//
// Une escale « champ de débris » était un beau décor et rien d'autre : les blocs
// passaient loin, on se battait au milieu comme on se serait battu dans le vide.
// Le lieu ne changeait pas la façon de jouer, ce qui est le seul reproche qu'on
// puisse faire à un décor.
//
// Un bloc énorme le traverse donc de temps à autre, et il balaie TOUT — les
// ennemis, leurs tirs, et le joueur s'il est encore là. Ce n'est pas une punition
// aléatoire : il s'annonce trois secondes à l'avance par une flèche posée sur son
// abscisse. Qui regarde l'écran a tout le temps de s'écarter ; qui ne regarde que
// sa cible se fait écraser, et comprend pourquoi.
//
// C'est la seule chose du jeu qui tue les deux camps, et c'est ce qui la rend
// intéressante : bien placé, on lui fait nettoyer une vague.

import * as THREE from 'three';
import { geometriesCailloux, matiereRoche } from './space/cailloux.js';
import { ARENA } from './constants.js';

// Trois secondes d'annonce. C'est long — assez pour finir ce qu'on faisait, se
// replacer, et même décider de rester pour lui laisser un rang d'ennemis.
const ANNONCE = 3;
// Il descend à deux fois et demie la vitesse d'un plongeur. Assez pour qu'on ne
// puisse pas le prendre de vitesse une fois qu'il est là, pas assez pour qu'il
// soit sur nous avant qu'on ait réagi.
const VITESSE = 46;
const RAYON = 4.6;
// D'où il part et où il finit. Il naît hors champ derrière la formation, et il
// s'efface une fois passé derrière la caméra.
const DEPART_Z = -78;
const FIN_Z = 26;

export class Colosse {
  constructor(scene) {
    this.scene = scene;
    this.etat = 'dort';
    this.t = 0;
    this.x = 0;

    const [forme] = geometriesCailloux({ nb: 1, seed: 4242, detail: 2 });
    this.bloc = new THREE.Mesh(forme, matiereRoche({ teinte: 0x8a7a68, seed: 7, emission: 0.2 }));
    this.bloc.scale.setScalar(RAYON);
    this.bloc.frustumCulled = false;
    this.bloc.visible = false;
    scene.add(this.bloc);

    // LA FLÈCHE. Elle est posée au SOL, à plat, et non dressée face à la caméra :
    // ce qu'on doit lire, c'est une abscisse — « il va passer LÀ » — et une
    // pancarte verticale dit mal une position horizontale.
    this.flecheGroupe = new THREE.Group();
    const pointe = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 3.2, 3),
      new THREE.MeshBasicMaterial({
        color: 0xff5a3d,
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
        depthWrite: false,
      })
    );
    pointe.rotation.x = -Math.PI / 2; // couchée, la pointe vers le joueur
    this.flecheGroupe.add(pointe);
    this.matFleche = pointe.material;

    // Le couloir qu'il va prendre, tracé au sol. C'est lui qui dit la LARGEUR du
    // danger : une flèche seule indique un point, et on croit qu'il suffit de
    // s'écarter d'un mètre.
    const couloir = new THREE.Mesh(
      new THREE.PlaneGeometry(RAYON * 2, 120),
      new THREE.MeshBasicMaterial({
        color: 0xff5a3d,
        transparent: true,
        opacity: 0.14,
        toneMapped: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    couloir.rotation.x = -Math.PI / 2;
    couloir.position.z = -34;
    this.flecheGroupe.add(couloir);
    this.matCouloir = couloir.material;

    this.flecheGroupe.visible = false;
    scene.add(this.flecheGroupe);
  }

  get actif() {
    return this.etat !== 'dort';
  }

  // `tirage` vient de la graine de la partie : deux parties identiques voient le
  // colosse passer aux mêmes endroits.
  lance(tirage) {
    if (this.actif) return false;
    this.etat = 'annonce';
    this.t = 0;
    // Jamais dans les deux unités du bord : un colosse qui rase la paroi ne laisse
    // aucune échappatoire du mauvais côté, et ça se lit comme une injustice.
    const marge = ARENA.playerXMax - RAYON - 2;
    this.x = ((Math.abs(tirage) % 2000) / 2000) * marge * 2 - marge;
    this.flecheGroupe.position.set(this.x, -0.6, 8);
    this.flecheGroupe.visible = true;
    this.bloc.position.set(this.x, 0, DEPART_Z);
    this.bloc.rotation.set(0.3, 0.7, 0.1);
    return true;
  }

  annule() {
    this.etat = 'dort';
    this.bloc.visible = false;
    this.flecheGroupe.visible = false;
  }

  // `onBalaye(position, rayon)` est appelé à chaque image pendant le passage :
  // c'est l'appelant qui détruit ce qui se trouve là, jamais ce module. Une seule
  // simulation, à un seul endroit — sinon le rejeu n'est plus vérifiable.
  update(dt, onBalaye) {
    if (this.etat === 'dort') return;
    this.t += dt;

    if (this.etat === 'annonce') {
      // La flèche bat de plus en plus vite à mesure que l'échéance approche. C'est
      // le seul signal du jeu qui dise « dépêche-toi » sans écrire un chiffre.
      const reste = 1 - this.t / ANNONCE;
      const battement = Math.sin(this.t * (8 + (1 - reste) * 26));
      this.matFleche.opacity = 0.45 + 0.45 * (0.5 + battement * 0.5);
      this.matCouloir.opacity = 0.08 + 0.16 * (0.5 + battement * 0.5);
      this.flecheGroupe.position.z = 8 - (1 - reste) * 2;
      if (this.t >= ANNONCE) {
        this.etat = 'passe';
        this.bloc.visible = true;
      }
      return;
    }

    // Il passe. La flèche reste allumée tant qu'il est dans le champ : elle cesse
    // d'être une annonce pour devenir un rappel de là où il ne faut pas être.
    this.bloc.position.z += VITESSE * dt;
    this.bloc.rotation.x += dt * 0.5;
    this.bloc.rotation.y += dt * 0.35;
    this.matFleche.opacity = 0.7;
    this.matCouloir.opacity = 0.2;
    onBalaye?.(this.bloc.position, RAYON);

    if (this.bloc.position.z > FIN_Z) this.annule();
  }
}
