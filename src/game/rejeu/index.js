// Enregistrer une partie, et la rejouer.
//
// Le principe : on ne filme pas le jeu, on note ce que le joueur a demandé. Le
// replay refait alors tourner la MÊME simulation avec les MÊMES commandes, et il
// en ressort la même partie. Quelques kilo-octets au lieu de quelques mégaoctets,
// et une lecture qui n'est pas une vidéo mais le jeu lui-même — on pourrait y
// entrer et reprendre la main.
//
// Ce qui rend la chose possible : le hasard de la simulation est semé (core/rng),
// les commandes sont exprimées dans le monde et arrondies des deux côtés
// (commandes.js), et chaque VAGUE repart d'un état complet. Ce dernier point est
// l'assurance-vie du système : même si une vague dérivait, la suivante repart d'un
// instantané exact et la dérive ne s'accumule jamais.
//
// Des points de contrôle réguliers permettent en plus de MESURER la fidélité —
// c'est ce qui distingue « je crois que ça marche » de « je sais où ça casse ».

import {
  Ecrivain,
  Lecteur,
  ecritFrame,
  litFrame,
  empaquete,
  depaquete,
  VERSION,
} from './format.js';
import { commandeVide } from './commandes.js';

const PAS_CONTROLE = 60; // une frame sur soixante, soit environ une par seconde

export class Enregistreur {
  constructor() {
    this.actif = false;
    this.vagues = [];
    this.courante = null;
    this.secondes = 0;
  }

  demarre(meta) {
    this.actif = true;
    this.vagues = [];
    this.courante = null;
    this.meta = meta;
    // La durée est celle du JEU, pas de l'horloge : additionner les pas de temps
    // donne le temps réellement joué, pauses et écrans de boutique exclus.
    this.secondes = 0;
  }

  // Un instantané complet au début de chaque vague : tout ce dont la simulation a
  // besoin pour repartir d'ici sans rien savoir de ce qui précède.
  ouvreVague(etat) {
    if (!this.actif) return;
    this.fermeVague();
    this.courante = { etat, w: new Ecrivain(), frames: 0, controles: [] };
  }

  frame(cmd, controle) {
    const v = this.courante;
    if (!v) return;
    ecritFrame(v.w, cmd);
    this.secondes += cmd.dt;
    if (v.frames % PAS_CONTROLE === 0 && controle) v.controles.push(controle);
    v.frames++;
  }

  fermeVague() {
    if (!this.courante) return;
    const v = this.courante;
    this.vagues.push({
      etat: v.etat,
      frames: v.frames,
      octets: v.w.fini(),
      controles: v.controles,
    });
    this.courante = null;
  }

  // Renvoie l'objet stockable, ou null s'il n'y a rien à garder.
  async termine(resume) {
    this.fermeVague();
    this.actif = false;
    if (!this.vagues.length) return null;
    const w = new Ecrivain();
    w.entier(this.vagues.length);
    for (const v of this.vagues) {
      w.entier(v.frames);
      w.entier(v.octets.length);
      for (const o of v.octets) w.octet(o);
    }
    return {
      version: VERSION,
      ...this.meta,
      ...resume,
      duree: Math.round(this.secondes),
      etats: this.vagues.map((v) => v.etat),
      controles: this.vagues.map((v) => v.controles),
      flux: await empaquete(w.fini()),
    };
  }
}

// --- Lecture ----------------------------------------------------------------

export class LecteurReplay {
  constructor(partie, octets) {
    this.partie = partie;
    this.vagues = [];
    const r = new Lecteur(octets);
    const n = r.entier();
    for (let i = 0; i < n; i++) {
      const frames = r.entier();
      const taille = r.entier();
      const debut = r.n;
      r.n += taille;
      this.vagues.push({
        frames,
        octets: octets.subarray(debut, debut + taille),
        etat: partie.etats[i],
        controles: partie.controles?.[i] || [],
      });
    }
    this.cmd = commandeVide();
    this.index = -1;
    this.flux = null;
    this.frame = 0;
  }

  get nbVagues() {
    return this.vagues.length;
  }

  // Positionne la lecture au début d'une vague et renvoie son instantané.
  vaVersVague(i) {
    if (i < 0 || i >= this.vagues.length) return null;
    this.index = i;
    this.flux = new Lecteur(this.vagues[i].octets);
    this.frame = 0;
    return this.vagues[i].etat;
  }

  // Commande suivante, ou null quand la vague est finie.
  suivante() {
    if (!this.flux || !this.flux.reste) return null;
    this.frame++;
    return litFrame(this.flux, this.cmd);
  }

  get progression() {
    const v = this.vagues[this.index];
    return v && v.frames ? this.frame / v.frames : 0;
  }

  // Le point de contrôle attendu à la frame courante, s'il y en a un.
  controleAttendu() {
    if (this.frame % PAS_CONTROLE !== 1) return null;
    const v = this.vagues[this.index];
    return v?.controles[Math.floor((this.frame - 1) / PAS_CONTROLE)] || null;
  }
}

export async function ouvreReplay(partie) {
  const octets = await depaquete(partie.flux);
  if (!octets) return null;
  return new LecteurReplay(partie, octets);
}
