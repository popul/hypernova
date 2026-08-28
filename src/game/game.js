// Chef d'orchestre : machine à états (titre → jeu → boutique → game over, carte de
// survie, victoire), collisions, score, combo, économie, persistance.

import * as THREE from 'three';
import { Player } from './player.js';
import { VERSION as VERSION_REJEU } from './rejeu/format.js';
import { note, poseContexte } from '../core/journal.js';
import { Enemies } from './enemies.js';
import { PlayerBullets, EnemyBullets, Missiles } from './bullets.js';
import { Pickups, Modules } from './pickups.js';
import { ArmeHelios } from './armes/helios.js';
import { ArmeVulcain } from './armes/vulcain.js';
import { Hud } from './hud.js';
import { Shop } from './shop.js';
import { Cinematic } from './cinematic.js';
import { makeWave, dailySeed, paramsVague } from './waves.js';
import {
  UPGRADES,
  priceOf,
  emptyLevels,
  computeStats,
  equipementPourVague,
  niveauxPourPart,
} from './upgrades.js';
import {
  ARENA,
  COMBO,
  FUREUR,
  GRAZE,
  OVERDRIVE,
  MINE,
  WAVES,
  bossPourVague,
  gesteEnergie,
  PICKUPS,
  PLAYER,
  PRECISION,
  REFLEX,
  ROLL,
  STORAGE_KEYS,
} from './constants.js';
import { Jump } from './jump.js';
import {
  biomeForWave,
  durcisPourBoss,
  stageForWave,
  estDernierSecteur,
  STAGES,
} from './space/biomes.js';
import { A_UNE_ESCALE, escalePourSecteur } from './space/escales.js';
import { SoutienAerien } from './soutien.js';
import { ArriveeEscale } from './escale-arrivee.js';
import { Aura } from './aura.js';
import { PiloteAuto } from './pilote-auto.js';
import { Colosse } from './asteroide.js';
import { Duo, PAS as PAS_DUO } from './duo.js';
import { Installation } from './installation.js';
import { Voix } from './voix.js';
import { DemoArme } from './demo-arme.js';

// Combien de temps la carène tourne sur elle-même avant que l'arme ne parle.
// Un tour complet à 1,1 radian par seconde en fait un peu moins de six ; on
// s'arrête à un tour et demi de face, ce qui suffit largement à lire la
// silhouette et ne fait pas attendre celui qui fait défiler les trois.
const COQUE_PRESENTATION = 1.5;
// La taille du vaisseau pendant la démonstration. Pas tout à fait celle du jeu :
// à cette profondeur l'écran ne donne que vingt-trois pixels par unité, et une
// coque à l'échelle 1 devient une vignette. Un tiers de plus la rend lisible
// sans que ses propres tirs aient l'air d'appartenir à un autre vaisseau.
const COQUE_COMBAT = 1.5;
// Où se tient le vaisseau pendant qu'on le présente, et où il se place ensuite.
// Pendant la présentation il est deux fois et demie trop gros pour la place qui
// lui reste au-dessus du panneau : on le recule d'abord, puis il redescend en
// même temps qu'il rapetisse — ce qui, à l'écran, ressemble à un vaisseau qui
// vient prendre son poste.
const COQUE_Z_PRESENTATION = -2;
const COQUE_Z_COMBAT = 1.5;
import {
  routesForStage,
  palierDeCoque,
  fragmentsAvantPalierSuivant,
  prochainPalier,
  PALIERS,
} from './routes.js';
import {
  classement,
  classementConnu,
  enregistrePartie,
  partieParId,
  challengeText,
} from './parties.js';
import * as reseau from './reseau.js';
import { mesAmis, gesteAmi, monLien, ouvreLien, jeton, profilDistant } from './reseau.js';

import {
  pilotesConnus,
  oubliePilote,
  activePilot,
  connecte,
  deconnecte,
  majApparence,
  reprends,
  sanitizeName,
} from './pilots.js';
import { CARENES, LIVREES } from './ships.js';
// En namespace : l'habillage des phases du boss vit dans ships.js, et cet appel ne
// doit pas empêcher le jeu de démarrer si la fonction n'y est pas encore.
import * as Ships from './ships.js';
import { Characters } from './characters.js';
import { Director, romanTier } from './director.js';
import {
  SURVIE,
  DEFAULT_MODS,
  DUO,
  BOSS_PHASES,
  MODULE_RARETE,
  COQUES,
  coqueParId,
} from './constants.js';
import { alea, semer } from '../core/rng.js';
import {
  commandeVide,
  lireEntrees,
  EV,
  quantifieDt,
  dtDepuis,
  commandeVersTableau,
  tableauVersCommande,
} from './rejeu/commandes.js';
import { Enregistreur, ouvreReplay } from './rejeu/index.js';
import { isTouchDevice } from '../core/input.js';

const IS_TOUCH = isTouchDevice();

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
// Date d'une partie, en heure LOCALE. La date stockée est en temps universel — la
// tronquer donnerait « hier » à toute partie jouée après vingt-deux heures.
// « 12 s », « 3 min 04 s » — jamais « 0 min 12 s ».
function duree(s) {
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

function dateCourte(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
}

export class Game {
  constructor({ scene, camera, renderer, input, audio, fx, stage, hudRoot, overlayRoot }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.fx = fx;
    this.stage = stage; // composer, bloom, lampes, réglage de qualité, cadrage

    this.player = new Player(scene, {
      livree: activePilot()?.livree,
      carene: activePilot()?.carene,
    });
    this.enemies = new Enemies(scene);
    this.bullets = new PlayerBullets(scene);
    this.enemyBullets = new EnemyBullets(scene);
    this.missiles = new Missiles(scene, fx);
    this.pickups = new Pickups(scene);
    // Les modules du mode Survie : les améliorations qui tombent des ennemis, et
    // qui y remplacent entièrement la boutique.
    this.modules = new Modules(scene);

    // LES ARMES DES DEUX AUTRES COQUES. Chacune vit dans son fichier et s'occupe de
    // tout — ses meshes, ses dégâts, sa source d'énergie, son instantané de replay.
    // Le jeu ne fait que lui passer la main quand c'est sa coque qui vole. ORION n'a
    // pas d'entrée ici : son armement EST celui du vaisseau, depuis toujours.
    this.armes = {
      helios: new ArmeHelios(scene),
      vulcain: new ArmeVulcain(scene),
    };
    // Le bombardement en escadrille : la bombe lâchée EN PLEINE FURIE n'est plus
    // une bombe, c'est un appel aux deux autres coques.
    this.soutien = new SoutienAerien(scene);
    // L'arrivée dans une escale. Le décor basculait en fondu et on se retrouvait
    // ailleurs sans avoir voyagé — or c'est un DÉTOUR : il faut le voir se faire.
    this.arrivee = new ArriveeEscale(scene, camera);
    // L'aura de furie. Elle fait sa propre attaque et sa propre retombée, si bien
    // qu'une intensité binaire suffit : on lui dit si l'Overdrive court, elle
    // s'occupe de monter et de redescendre.
    this.aura = new Aura(scene);
    // Le pilote fantôme, qui joue en fond de l'écran d'accueil.
    this.piloteAuto = new PiloteAuto();
    // Le bloc qui traverse le champ de débris et balaie tout sur son passage.
    this.colosse = new Colosse(scene);
    this._colosseTimer = 0;
    // La démonstration d'arme de l'écran de choix. Elle construit dix-sept
    // vaisseaux : on ne la fabrique qu'à la première ouverture de l'écran, pour
    // ne pas les payer au démarrage d'une partie qui n'y passera peut-être pas.
    this.demoArme = null;
    this._poseCoque = null;
    // ON EST ARRIVÉ PAR LE LIEN D'UN COPAIN.
    //
    // Le code est retiré de l'adresse tout de suite : il n'a plus rien à y faire,
    // et une adresse partagée ou mise en favori avec le code dedans ferait ajouter
    // le même ami à qui la rouvrirait. On le garde de côté le temps de savoir qui
    // est aux commandes — sans pilote, il n'y a personne à rendre ami.
    this._lienAmi = new URLSearchParams(location.search).get('ami');
    if (this._lienAmi) {
      const propre = new URL(location.href);
      propre.searchParams.delete('ami');
      history.replaceState(null, '', propre);
    }

    // L'invitation à poser le jeu sur l'écran d'accueil. Elle écoute dès le
    // départ, parce que le navigateur envoie son crochet quand il l'a décidé —
    // souvent avant qu'on ait affiché quoi que ce soit.
    this.installation = new Installation();
    // Le canal des amis. Il porte la présence en continu, et sert de salon quand
    // on veut jouer à deux : une seule connexion pour les deux usages.
    this.duo = new Duo();
    // La voix. Elle emprunte le canal des amis pour se présenter, puis l'audio va
    // d'un navigateur à l'autre sans passer par le serveur.
    this.voix = new Voix({
      envoie: (vers, sujet, d) => this.duo.signale(vers, sujet, d),
      onEtat: (etat, qui) => this._surVoix(etat, qui),
    });
    this.demo = false;
    this.hud = new Hud(hudRoot);
    this.overlayRoot = overlayRoot;
    this.shop = new Shop(overlayRoot, {
      onBuy: (id) => this.buy(id),
      onLaunch: () => this.launchNextWave(),
    });
    // La relance est un achat comme un autre : elle se refuse si la bourse est vide.
    this.shop.onReroll = () => this._reroll();
    this.characters = new Characters(hudRoot.parentElement, audio);
    this.cinematic = new Cinematic({
      scene,
      audio,
      fx,
      overlayRoot,
      player: this.player,
      characters: this.characters,
      stage,
    });
    this.jump = new Jump({
      scene,
      audio,
      fx,
      space: stage.space,
      player: this.player,
      characters: this.characters,
      overlayRoot,
    });
    this.cameraOverride = null;
    this.director = new Director();
    this.timeScale = 1; // échelle de temps courante, lue par le vaisseau
    this.reflexCooldown = 0;

    // La commande de la frame : ce que le joueur demande, exprimé dans le monde.
    // Le vaisseau ne lit plus que ça — en partie comme en relecture.
    // Les modules du mode Survie : les améliorations qui tombent des ennemis.
    this.modules = new Modules(scene);
    this.cmd = commandeVide();
    this._demandes = []; // pirouettes, bombes, appels : un par frame, dans l'ordre
    this.enregistreur = new Enregistreur();
    this.rejeu = null; // { lecteur, vitesse, fini } quand on regarde une partie

    this.state = 'title';
    this.mode = 'arcade';
    // 'solo' | 'duo' | 'entrainement' — orthogonal au mode, qui reste les règles.
    this.variante = 'solo';
    this.paused = false;
    // Les records viennent du SERVEUR, avec le pilote — ils ne sont plus ceux de
    // l'appareil. Deux enfants qui se passent un téléphone n'ont plus le même
    // « Record » affiché, et le sien le suit sur la tablette.
    // Ils vivent en mémoire le temps de la partie : rien ne s'écrit sur disque.
    this.hiscore = 0;
    this.bestWave = 0;
    this._tmp = new THREE.Vector3();

    // Reprise de session : le jeton dit au serveur « c'est encore moi », et l'on
    // récupère nom et vaisseau. Puis les parties en attente partent — une session
    // hors ligne se rattrape au démarrage suivant, sans rien demander au joueur.
    reprends().then((moi) => {
      if (moi) this._appliquePilote(moi);
      reseau.pousse().then(() => {
        if (this.state === 'title') this.showTitle();
      });
    });

    const typing = (e) => e.target instanceof Element && e.target.closest('input, button');
    input.on('Space', (e) => {
      if (typing(e)) return;
      if (this.state === 'cinematic') this.cinematic.skip();
      else if (this.state === 'jump') this.jump.skip();
      else if (this.state === 'gate') {
        this.audio.unlock();
        this.playCinematic();
      } else if (this.state === 'title') this.startRun('arcade');
      else if (this.state === 'gameover') this._replay();
    });
    // Une seule touche pour les deux dépenses d'énergie : tap = bombe, maintien = Overdrive.
    input.on('KeyX', (e) => {
      if (typing(e)) return;
      this._energyPressStart = performance.now();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyX') this._releaseEnergyButton();
    });
    // Le saut s'escamote aussi d'une simple touche à l'écran : sur mobile il n'y a
    // pas de barre d'espace, et une transition qu'on ne peut pas couper devient une
    // corvée dès la troisième partie.
    window.addEventListener('pointerdown', () => {
      if (this.state === 'jump') this.jump.skip();
    });
    // PIROUETTE. Deux appuis rapprochés du même côté : le vaisseau part en tonneau
    // et devient invincible AUX TIRS le temps de la manœuvre. On mémorise le
    // dernier appui par direction, jamais un seul horodatage commun — sinon
    // gauche-droite rapide déclencherait un tonneau, ce qui est exactement le
    // geste d'un joueur qui slalome.
    this._lastTap = { left: 0, right: 0 };
    const tap = (dir) => {
      const now = performance.now() / 1000;
      const cle = dir < 0 ? 'left' : 'right';
      if (now - this._lastTap[cle] < ROLL.doubleTapWindow) {
        this._lastTap[cle] = 0;
        this._demande(dir < 0 ? EV.PIROUETTE_GAUCHE : EV.PIROUETTE_DROITE);
      } else {
        this._lastTap[cle] = now;
      }
    };
    for (const code of ['ArrowLeft', 'KeyA', 'KeyQ'])
      input.on(code, (e) => {
        if (!typing(e)) tap(-1);
      });
    for (const code of ['ArrowRight', 'KeyD'])
      input.on(code, (e) => {
        if (!typing(e)) tap(1);
      });
    // Au tactile il n'y a pas de touche « gauche » à répéter : on pilote en
    // DÉSIGNANT un point. Le même geste devient donc « deux appuis rapprochés du
    // même côté du vaisseau » — et ce côté se lit sur le point visé, pas sur la
    // moitié d'écran, sinon un vaisseau déjà à droite ne pourrait plus rouler à
    // droite. Le second appui peut venir d'un second doigt : le pouce qui pilote
    // n'a pas besoin de quitter l'écran.
    input.onTap((ndc) => {
      if (this.state !== 'playing' || this.paused || !this.player.alive) return;
      const ecart = this.player.aimPoint(ndc, this.camera).x - this.player.position.x;
      if (Math.abs(ecart) < ROLL.tapDeadzone) return;
      tap(ecart < 0 ? -1 : 1);
    });

    // L'Appel : rabat l'argent vers le vaisseau. Touche dédiée, jamais mélangée
    // avec la touche d'énergie — ce sont deux économies distinctes, et confondre
    // leurs boutons ferait de la collecte un choix de survie.
    input.on('KeyC', (e) => {
      if (typing(e)) return;
      this._demande(EV.APPEL);
    });
    input.on('ShiftLeft', (e) => {
      if (typing(e)) return;
      this._demande(EV.APPEL);
    });
    input.on('KeyP', () => this.togglePause());
    input.on('Escape', () => {
      if (this.state === 'cinematic') this.cinematic.skip();
      else if (this.state === 'jump') this.jump.skip();
      else this.togglePause();
    });
    input.on('KeyM', (e) => {
      if (typing(e)) return;
      this._toggleSound();
    });

    this.hud.root.querySelector('#btn-pause-touch').addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePause();
    });
    this.hud.root.querySelector('#btn-sound-touch').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleSound();
    });

    // Bouton d'énergie tactile : même geste que la touche X (tap / maintien).
    const energyBtn = this.hud.root.querySelector('#btn-energy-touch');
    const press = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._energyPressStart = performance.now();
    };
    const release = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._releaseEnergyButton();
    };
    const callBtn = this.hud.root.querySelector('#btn-call-touch');
    if (callBtn) {
      const appel = (e) => {
        e.preventDefault();
        this._demande(EV.APPEL);
      };
      callBtn.addEventListener('touchstart', appel, { passive: false });
      callBtn.addEventListener('mousedown', appel);
    }

    const microBtn = this.hud.root.querySelector('#btn-micro-touch');
    if (microBtn) {
      const micro = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._toucheMicro();
      };
      microBtn.addEventListener('touchstart', micro, { passive: false });
      microBtn.addEventListener('mousedown', micro);
    }

    energyBtn.addEventListener('touchstart', press, { passive: false });
    energyBtn.addEventListener('touchend', release, { passive: false });
    energyBtn.addEventListener('mousedown', press);
    energyBtn.addEventListener('mouseup', release);

    // Premier lancement : petit écran-porte (le geste débloque l'audio), puis la cinématique.
    if (!localStorage.getItem(STORAGE_KEYS.introSeen)) {
      this.showGate();
    } else {
      this.showTitle();
    }
  }

  // Écran-porte du premier lancement. On y demande l'indicatif : dans la cinématique,
  // ORSO prononce le pseudo du joueur — sans lui, il parlerait dans le vide.
  showGate() {
    this.state = 'gate';
    this.hud.root.classList.add('hidden');
    const known = activePilot()?.name || '';
    const el = this._screen(`
      <div class="screen gate">
        <div class="gate-logo">HYPER<span>NOVA</span></div>
        <div class="gate-callsign">Identifiez-vous, pilote</div>
        <form class="lb-form" id="gate-form">
          <input id="gate-name" type="text" maxlength="10" autocomplete="off"
                 placeholder="INDICATIF" value="${esc(known)}" aria-label="Indicatif du pilote" />
          <button class="btn-launch" type="submit">▶ Décoller</button>
        </form>
      </div>
    `);
    const input = el.querySelector('#gate-name');
    setTimeout(() => input.focus(), 100);
    el.querySelector('#gate-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.audio.unlock();
      // Le nom saisi ici ne crée plus de pilote : il ne sert qu'à ce que NOVA
      // s'adresse à quelqu'un pendant l'introduction. L'identification, elle, se
      // fait devant le serveur — avec un code — au moment de décoller.
      const name = sanitizeName(input.value);
      if (name) this.characters.setContext({ pilote: name });
      this.playCinematic({ handoff: true });
    });
  }

  // handoff : depuis l'écran-porte, la cinématique se plie sur la pose de jeu et
  // enchaîne directement sur la première vague. Depuis « Histoire », elle revient
  // au titre — sinon rejouer l'intro lancerait une partie non désirée.
  playCinematic({ handoff = false } = {}) {
    this.quitteVitrine();
    // LA CINÉMATIQUE COMPOSE TOUT CE QU'ON VOIT — et le secteur passait dessus.
    //
    // Elle fabrique ses propres étoiles, sa planète, son soleil, son épave. Mais
    // `stage.space` continuait d'afficher le SIEN par-dessus, resté sur ce que la
    // scène précédente montrait : au démarrage du jeu c'est l'orbite terrestre,
    // donc personne ne l'avait jamais vu ; depuis « Histoire », c'était le sol
    // martien de la vitrine.
    //
    // Poser le bon secteur ne suffisait pas — et c'est la deuxième leçon : ses
    // étoiles sont taillées pour la caméra du JEU. À vingt unités, 0,78 unité de
    // côté, elles sont justes ; une caméra de cinéma qui traverse le champ passe
    // à deux unités des mêmes points et les transforme en blocs crème gros comme
    // des débris. On efface donc le secteur au lieu de le corriger.
    this.stage?.space?.setVisible(false);
    this.state = 'cinematic';
    this.audio.setMode('cinematic');
    this.hud.root.classList.add('hidden');
    this.shop.close();
    this.overlayRoot.innerHTML = '';
    this.player.showHitMarkers(false);
    this.stage?.setQuality?.(true);
    this.cinematic.play(
      () => {
        localStorage.setItem(STORAGE_KEYS.introSeen, '1');
        this.player.showHitMarkers(true);
        this.stage?.space?.setVisible(true);
        this.stage?.setQuality?.(false);
        if (handoff) this.startRun('arcade');
        else this.showTitle();
      },
      { handoff, pilotName: activePilot()?.name || 'VEILLE-3' }
    );
  }

  // Une action ponctuelle n'est pas exécutée au moment où la touche est pressée
  // mais mise en FILE, puis consommée par la boucle — une par frame, dans l'ordre.
  //
  // Ce détour n'est pas de la cérémonie : c'est ce qui rend une partie
  // enregistrable. Un événement déclenché depuis un écouteur arrive « entre » deux
  // frames, à un instant que rien ne date ; le même événement consommé par la
  // boucle appartient à une frame précise, et cette frame se rejoue.
  _demande(ev) {
    if (this.rejeu) return; // pendant une relecture, seul le flux commande
    if (this.state !== 'playing' || this.paused) return;
    if (this._demandes.length < 4) this._demandes.push(ev);
  }

  _executeEvenement(ev) {
    switch (ev) {
      case EV.PIROUETTE_GAUCHE:
        this._tryRoll(-1);
        break;
      case EV.PIROUETTE_DROITE:
        this._tryRoll(1);
        break;
      case EV.BOMBE:
        this._tryBomb();
        break;
      case EV.OVERDRIVE:
        this._tryOverdrive();
        break;
      case EV.APPEL:
        this._tryCall();
        break;
      default:
        break;
    }
  }

  _toggleSound() {
    const muted = this.audio.toggleMute();
    this.hud.announce(muted ? 'Son coupé' : 'Son activé', '', 900);
  }

  // ---- Énergie : frôler pour charger, dépenser en bombe ou en Overdrive ----

  // LE MAINTIEN DÉCLENCHE PENDANT QU'ON MAINTIENT.
  //
  // Il ne partait qu'au RELÂCHÉ, et c'est ce qui faisait dire que l'Overdrive
  // « n'apparaît pas quand la barre est à fond ». La jauge affiche MAINTIENS ; le
  // joueur maintient ; rien ne se passe. Il finit par lâcher — et là ça part,
  // sans qu'il fasse le lien avec son geste. Un bouton qui promet un maintien
  // doit répondre au maintien.
  //
  // Appelée à chaque image de jeu. L'événement passe par `_demande`, donc il est
  // enregistré comme n'importe quel autre : le rejeu ne bouge pas.
  _verifieMaintien() {
    if (!this._energyPressStart || this._energyConsomme) return;
    if (this.state !== 'playing' || this.paused || !this.player.alive) return;
    const tenu = (performance.now() - this._energyPressStart) / 1000;
    if (gesteEnergie({ tenu, energie: this.energy }) !== 'overdrive') return;
    this._energyConsomme = true;
    this._demande(EV.OVERDRIVE);
  }

  _releaseEnergyButton() {
    if (!this._energyPressStart) return;
    const held = (performance.now() - this._energyPressStart) / 1000;
    this._energyPressStart = 0;
    // Déjà parti pendant le maintien : le relâché ne doit rien déclencher de plus,
    // surtout pas une bombe.
    if (this._energyConsomme) {
      this._energyConsomme = false;
      return;
    }
    if (this.state !== 'playing' || this.paused || !this.player.alive) return;
    // `refus` et `overdrive` empruntent le même événement : c'est _tryOverdrive
    // qui dit non, et il le dit avec un son. La règle, elle, tient dans
    // gesteEnergie et se vérifie hors du moteur.
    const geste = gesteEnergie({ tenu: held, energie: this.energy, relache: true });
    this._demande(geste === 'bombe' ? EV.BOMBE : EV.OVERDRIVE);
  }

  // La pirouette se paie sur la jauge de furie, un peu. C'est ce qui la relie au
  // reste de l'économie : la même ressource sert à esquiver et à frapper, donc
  // chaque tonneau est une fraction de bombe qu'on n'aura pas.
  _tryRoll(dir) {
    if (this.state !== 'playing' || this.paused || !this.player.alive) return;
    if (this.energy < ROLL.cost) {
      this.audio.deny();
      return;
    }
    if (!this.player.startRoll(dir)) return;
    this.energy -= ROLL.cost;
    this.hud.setEnergy(this.energy / OVERDRIVE.max);
    this.audio.roll(dir);
    this.fx.burst(this.player.position, 0x8ffbff, { count: 12, speed: 9, life: 0.3, spread: 1.2 });
  }

  // L'Appel. Une onde part du vaisseau et balaie l'écran : tout l'argent qu'elle
  // touche rentre. Elle ne coûte pas d'énergie — l'énergie est la ressource de
  // combat, et mélanger les deux économies ferait de la collecte un choix de
  // survie. Elle coûte l'UNIQUE charge de la vague.
  _tryCall() {
    if (this.state !== 'playing' || this.paused || !this.player.alive) return;
    if (this.callLeft <= 0) {
      this.audio.deny();
      return;
    }
    this.callLeft--;
    this.callWave = {
      origin: this.player.position.clone(),
      radius: 0,
      max: this.stats.callRadius,
      pris: 0,
    };
    this.audio.call();
    this.hud.setCall(this.callLeft, this.stats.callCharges);
  }

  // L'onde s'étend au lieu de tout ramasser d'un coup : on la VOIT passer, et
  // l'argent lointain arrive après le proche. Un effet instantané n'aurait donné
  // aucune lecture — juste des gemmes qui changent de direction sans raison.
  _updateCall(dt) {
    // Pédagogie : NOVA n'explique l'Appel qu'au premier moment où il SERT
    // vraiment — de l'argent en vue, hors de portée de l'aimant, et une charge
    // disponible. Expliqué plus tôt, l'avertissement tombe dans le vide ; expliqué
    // au bon moment, il se comprend sans être relu.
    if (this.callLeft > 0 && this.pickups.activeCount() >= 3) {
      let loin = 0;
      const r2 = this.stats.magnetRadius * this.stats.magnetRadius;
      this.pickups.forEachActive?.((e) => {
        if (e.mesh.position.distanceToSquared(this.player.position) > r2) loin++;
      });
      if (loin >= 3) this.characters.teachOnce('callFirst', IS_TOUCH);
    }

    const w = this.callWave;
    if (!w) return;
    w.radius += (w.max / PICKUPS.callSweep) * dt;
    w.pris += this.pickups.call(w.origin, w.radius);
    // En survie l'onde ne rabat pas de l'argent — il n'y en a pas — mais les
    // modules. Sans cela l'Appel n'aurait plus rien à attraper dans ce mode.
    w.pris += this.modules.call(w.origin, w.radius);
    // L'onde se dessine à SA TAILLE. Elle était tracée à la moitié de sa portée :
    // le joueur voyait un petit cercle près du vaisseau, des gemmes rentraient de
    // bien plus loin sans raison visible, et rien ne disait jusqu'où l'Appel
    // portait. Un pouvoir dont on ne voit pas la limite ne s'apprend pas.
    this.fx.shockwave(w.origin, 0xffc857, w.radius);
    if (w.radius >= w.max) {
      if (w.pris > 0) this.audio.callHit(w.pris);
      this.callWave = null;
    }
  }

  _addEnergy(amount) {
    if (this.odTimer > 0) return; // gain gelé pendant l'Overdrive : pas de boucle infinie
    this.energy = Math.min(OVERDRIVE.max, this.energy + amount);
    this.hud.setEnergy(this.energy / OVERDRIVE.max);
    // NOVA explique la bombe et l'Overdrive à la première occasion réelle de s'en servir.
    if (this.energy >= OVERDRIVE.odCost) this.characters.teachOnce('odReady', IS_TOUCH);
    else if (this.energy >= OVERDRIVE.bombCost) this.characters.teachOnce('bombReady', IS_TOUCH);
    else if (this.energy >= ROLL.cost) this.characters.teachOnce('rollFirst', IS_TOUCH);
  }

  // Quel module lâcher ? Pondéré par la rareté, et surtout : ceux qui sont déjà au
  // maximum sortent du tirage. La montée en puissance s'arrête donc d'elle-même
  // quand il n'y a plus rien à gagner — aucun compteur n'a besoin de le décider.
  _tireModule() {
    // Même filtre qu'en boutique : un module qui ne sert pas à la coque pilotée ne
    // doit pas non plus TOMBER en survie, où il n'y a pas de boutique pour le
    // refuser — le joueur le ramasserait sans pouvoir dire non.
    const dispo = UPGRADES.filter(
      (u) => (this.levels[u.id] || 0) < u.maxLevel && (!u.coques || u.coques.includes(this.coque))
    );
    // Plus rien à améliorer : place aux surcharges, tant qu'il en reste à prendre.
    if (!dispo.length) return this.surcharge < SURVIE.surchargeMax ? 'surcharge' : null;
    let total = 0;
    for (const u of dispo) total += MODULE_RARETE[u.id] || 0.002;
    let r = alea() * total;
    for (const u of dispo) {
      r -= MODULE_RARETE[u.id] || 0.002;
      if (r <= 0) return u.id;
    }
    return dispo[dispo.length - 1].id;
  }

  // Un module ramassé. C'est LE moment de la boucle en survie : il doit s'entendre,
  // se voir sur la coque, et se lire sans quitter l'action des yeux.
  _prendModule(id, pos) {
    if (id === 'surcharge') {
      this.surcharge = Math.min(SURVIE.surchargeMax, this.surcharge + 1);
      this.stats = computeStats(this.levels, this.surcharge);
      this.audio.moduleRamasse?.(1) ?? this.audio.buy();
      this.fx.burst(pos, 0xff3df0, { count: 22, speed: 11, life: 0.55 });
      this.fx.shockwave(pos, 0xff3df0, 6);
      this.hud.announce(
        `SURCHARGE ×${this.surcharge}`,
        `Cadence +${Math.round(this.surcharge * SURVIE.surchargeGain * 100)} %`,
        1100
      );
      return;
    }
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return;
    const niveau = (this.levels[id] || 0) + 1;
    this.levels[id] = Math.min(u.maxLevel, niveau);
    this.stats = computeStats(this.levels, this.surcharge);
    if (id === 'hull') this.lives = Math.min(PLAYER.maxLives + 2, this.lives + 1);
    this.hud.setLives(this.lives);
    this._refreshShip();
    // La rareté du module décide de l'intensité du retour : une cadence de plus
    // n'est pas un lance-missiles, et le joueur doit l'entendre.
    const rarete = 1 - Math.min(1, (MODULE_RARETE[id] || 0.002) / (1 / 70));
    this.audio.moduleRamasse?.(rarete) ?? this.audio.buy();
    this.fx.burst(pos, 0x4ff2ff, { count: 16 + Math.round(rarete * 14), speed: 9, life: 0.5 });
    this.fx.shockwave(pos, 0x4ff2ff, 3.5 + rarete * 3);
    this.hud.announce(u.name.toUpperCase(), `Niveau ${this.levels[id]}`, 1500);
    this.hud.creditPop(
      ...(() => {
        this._tmp.copy(pos).project(this.camera);
        const r = this.renderer.domElement.getBoundingClientRect();
        return [(this._tmp.x * 0.5 + 0.5) * r.width, (-this._tmp.y * 0.5 + 0.5) * r.height];
      })(),
      `${u.icon || '+'} ${u.name}`,
      true
    );
  }

  // Bouton panique, pas bouton « annuler la mort » : coûteuse, en recharge, à portée
  // limitée, et elle ne rapporte aucun crédit — bomber n'est jamais rentable.
  _tryBomb() {
    if (this.energy < OVERDRIVE.bombCost || this.bombCooldown > 0) {
      this.audio.deny();
      return;
    }
    this.energy -= OVERDRIVE.bombCost;
    this.hud.setEnergy(this.energy / OVERDRIVE.max);
    this.bombCooldown = OVERDRIVE.bombCooldown;

    // LA BOMBE EST UN APPEL, TOUJOURS. Ce n'est plus une explosion qu'on déclenche,
    // c'est un copain qu'on siffle.
    //
    // En pleine furie, les DEUX coques qu'on n'a pas choisies arrivent, bombardent
    // avec nous et repartent — quatre secondes pendant lesquelles le vaisseau
    // s'élève, ce qui rend son invulnérabilité lisible sans qu'on ait à l'écrire.
    //
    // Le reste du temps, l'appel est BREF : un seul ailier, la même chorégraphie
    // jouée deux fois et demie plus vite, et surtout aucune élévation — donc aucune
    // invulnérabilité. La bombe se recharge en six secondes : y coller la séquence
    // complète mettrait le joueur en plan quatre-vingts pour cent du temps et
    // invulnérable presque en permanence. Ce ne serait plus une arme, ce serait un
    // abri. La fiction est la même à chaque bombe ; c'est son AMPLEUR qui se gagne.
    if (this._lanceSoutien({ bref: this.odTimer <= 0 })) return;

    // N'efface que les tirs PROCHES : la menace lointaine reste à gérer.
    const rr = OVERDRIVE.bombRadius * OVERDRIVE.bombRadius;
    this.enemyBullets.forEachActive((b) => {
      if (b.mesh.position.distanceToSquared(this.player.position) > rr) return;
      this.fx.burst(b.mesh.position, 0xff3df0, { count: 2, speed: 4, life: 0.25 });
      this.enemyBullets.kill(b);
    });
    // Puis un front qui part du vaisseau et balaie l'arène en un peu moins d'une
    // seconde. Retarder ainsi la détonation est ce qui lui permet enfin d'atteindre
    // la formation lointaine et le boss, sans rien retirer à son effet immédiat.
    this.bombFront = {
      origin: this.player.position.clone(),
      radius: OVERDRIVE.bombRadius,
      hit: new Set(),
      ringTimer: 0,
    };
    for (const e of this.enemies.list) {
      if (e.alive && e.state === 'diving') e.state = 'returning';
    }
    this.fx.shockwave(this.player.position, 0x8ffbff, OVERDRIVE.bombRadius * 2);
    this.fx.addShake(1.2);
    this.fx.hitStop(0.12);
    this.audio.explosionBig();
    this.hud.announce('NOVA BOMB', '', 900);
  }

  // LE COLOSSE. Il n'existe que dans un champ de débris — ailleurs, rien ne
  // justifierait qu'un bloc de neuf unités traverse l'arène, et un danger qu'on ne
  // s'explique pas est un danger injuste.
  _updateColosse(dt) {
    const dansUnChamp =
      this.bis && this.escale?.vague === this.wave && this._lieuEscale()?.escale === 'champ';
    if (!dansUnChamp) {
      if (this.colosse.actif) this.colosse.annule();
      return;
    }

    if (!this.colosse.actif) {
      this._colosseTimer -= dt;
      if (this._colosseTimer <= 0) {
        // Entre douze et vingt secondes : assez rare pour qu'on ne l'attende pas,
        // assez fréquent pour qu'on apprenne à surveiller le sol.
        this._colosseTimer = 12 + ((this.wave * 7919) % 8);
        this.colosse.lance(this.seed * 13 + this.wave * 977 + Math.round(this.horlogeVague ?? 0));
      }
      return;
    }

    this.colosse.update(dt, (pos, rayon) => {
      const r2 = rayon * rayon;
      // Il emporte les ennemis…
      for (const e of this.enemies.list) {
        if (!e.alive) continue;
        if (e.group.position.distanceToSquared(pos) > r2) continue;
        if (this.enemies.damage(e, 99, this)) this._onEnemyKilled(e, 'colosse');
      }
      // …leurs tirs…
      this.enemyBullets.forEachActive((b) => {
        if (b.mesh.position.distanceToSquared(pos) > r2) return;
        this.fx.burst(b.mesh.position, 0xff3df0, { count: 2, speed: 4, life: 0.2 });
        this.enemyBullets.kill(b);
      });
      // …et le joueur, qui n'a aucun privilège ici. C'est ce qui donne son poids à
      // l'annonce : un danger dont on serait exempté n'apprendrait rien.
      if (
        this.player.alive &&
        !this.player.rolling &&
        this.player.invulnTimer <= 0 &&
        this.player.position.distanceToSquared(pos) < r2
      ) {
        this._playerHit();
      }
    });
  }

  _lieuEscale() {
    return this.escale
      ? escalePourSecteur(stageForWave(this.escale.vague), this.escale.tirage)
      : null;
  }

  // Le soutien aérien. Les dégâts restent ICI, jamais dans le module d'animation :
  // une seule simulation à un seul endroit, sinon le rejeu n'est plus vérifiable.
  _lanceSoutien({ bref = false } = {}) {
    const deja = new Set();
    const ok = this.soutien.start({
      game: this,
      bref,
      coqueJoueur: this.coque,
      onImpact: (pos, rayon) => {
        // UN ENNEMI NE PREND QU'UNE FOIS. Les vingt-deux impacts se recouvrent —
        // un ennemi se trouve dans le rayon de trois d'entre eux en moyenne — et
        // appliquer les dégâts à chaque fois donnerait le triple d'une bombe pour
        // le même bouton. On garde le premier souffle qui l'atteint ; le reste
        // n'est que du spectacle.
        const r2 = rayon * rayon;
        for (const e of this.enemies.list) {
          if (!e.alive || deja.has(e)) continue;
          if (e.group.position.distanceToSquared(pos) > r2) continue;
          deja.add(e);
          const d = e.type === 'boss' ? OVERDRIVE.bombBossDamage : OVERDRIVE.bombDamage;
          if (this.enemies.damage(e, d, this)) this._onEnemyKilled(e, 'bomb');
        }
        // Les projectiles pris dans le souffle disparaissent aussi : un tapis de
        // bombes qui laisserait passer les balles serait incompréhensible.
        this.enemyBullets.forEachActive((b) => {
          if (b.mesh.position.distanceToSquared(pos) > r2) return;
          this.fx.burst(b.mesh.position, 0xff3df0, { count: 2, speed: 4, life: 0.25 });
          this.enemyBullets.kill(b);
        });
      },
      onDone: () => {
        this._soutienEnCours = false;
      },
    });
    if (!ok) return false;
    this._soutienEnCours = true;
    for (const e of this.enemies.list) {
      if (e.alive && e.state === 'diving') e.state = 'returning';
    }
    return true;
  }

  _tryOverdrive() {
    if (this.energy < OVERDRIVE.odCost) {
      this.audio.deny(); // ne déclenche PAS la bombe par erreur : le maintien est un choix
      return;
    }
    this.energy = 0;
    this.hud.setEnergy(0);
    this.odTimer = OVERDRIVE.odDuration;
    this.hud.setOverdrive(true);

    // CE QUI SE PASSE DOIT SE VOIR ET S'ENTENDRE.
    //
    // Tout marchait déjà — cadence ×1,5, balles qui transpercent deux ennemis,
    // tirs adverses ralentis, score doublé — mais rien ne le DISAIT. Un liseré
    // doré sur le cadre du HUD, une aura discrète autour de la coque, et le son
    // du combo emprunté à autre chose. Le joueur remplissait une jauge entière
    // pour obtenir quelque chose qu'il ne remarquait pas.
    //
    // Trois anneaux qui partent l'un après l'autre, une gerbe, une secousse, et
    // un ralenti d'un quart de seconde : le ralenti est ce qui compte le plus,
    // parce qu'il est la seule façon de dire « ce qui vient de se passer est
    // important » sans écrire un mot.
    this.fx.shockwave(this.player.position, 0xffc857, 16);
    this.fx.shockwave(this.player.position, 0xffffff, 9);
    this.fx.burst(this.player.position, 0xffe066, { count: 46, speed: 22, life: 0.8, spread: 1.6 });
    this.fx.addShake(0.9);
    this.fx.slowmo?.(0.24, 0.45);
    this.audio.overdrive();
    this.hud.announce('OVERDRIVE', 'tirs ×1,5 · perforants · score ×2', 1800, true);
  }

  // ---- Écrans ----

  _screen(html) {
    this.overlayRoot.innerHTML = '';
    const div = document.createElement('div');
    div.innerHTML = html;
    const el = div.firstElementChild;
    this.overlayRoot.appendChild(el);
    return el;
  }

  // Une ligne de classement n'est plus un affichage : c'est une porte. Quand la
  // partie a été enregistrée, on peut la revoir — et c'est la seule façon de
  // répondre à « comment il a fait ce score ? » autrement qu'en le croyant.
  _leaderboardHtml(scores, highlightRank = -1, mode = 'arcade') {
    // Le classement peut être INCONNU — pas vide : quand le serveur ne répond pas
    // et qu'on n'a rien vu de la session, il n'y a aucun tableau à montrer. Le
    // distinguer du tableau vide évite d'annoncer « personne n'a encore joué » à
    // quelqu'un qui a simplement perdu le réseau.
    if (!scores) {
      return '<div class="lb-empty">Panthéon indisponible — pas de réseau.</div>';
    }
    if (!scores.length) {
      return '<div class="lb-empty">Aucun pilote au panthéon — soyez le premier !</div>';
    }
    return `<ol class="lb-list">${scores
      .map((s, i) => {
        // UNE LIGNE NE PROPOSE PAS CE QU'ELLE NE PEUT PAS TENIR.
        //
        // Un enregistrement fait sous d'autres règles ne se rejoue pas — la
        // simulation d'aujourd'hui ne referait pas la partie d'hier. Le bouton
        // « revoir » s'affichait quand même : on cliquait, et rien ne se passait,
        // parce que le refus s'annonçait dans un HUD masqué par l'écran du
        // panthéon. Signalé par Paul, et c'est arrivé le jour où les règles ont
        // changé quatre fois.
        const perime = s.version != null && s.version !== VERSION_REJEU;
        const revoyable = !!s.flux && !perime;
        const balise = revoyable ? 'button' : 'div';
        return `
        <li class="lb-row${i + 1 === highlightRank ? ' me' : ''}${i === 0 ? ' first' : ''}">
          <${balise} class="lb-ligne${revoyable ? ' revoyable' : ''}"${
            revoyable ? ` data-rejeu="${esc(s.id)}" title="Revoir la partie de ${esc(s.name)}"` : ''
          }>
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-name">${esc(s.name)}</span>
            ${
              mode === 'survie'
                ? `<span class="lb-score">v.${s.wave}</span><span class="lb-wave">${s.score} pts</span>`
                : `<span class="lb-wave">v.${s.wave}</span><span class="lb-score">${s.score}</span>`
            }
            <span class="lb-play" ${
              perime && s.flux ? 'title="Enregistré par une version antérieure du jeu"' : ''
            }>${revoyable ? '▶' : perime && s.flux ? '⧖' : ''}</span>
          </${balise}>
        </li>`;
      })
      .join('')}</ol>`;
  }

  // Ce qu'un changement de pilote entraîne : son vaisseau, et SES records. Le HUD
  // affichait le record du pilote précédent après un changement — deux enfants qui
  // se passent le téléphone voyaient chacun le « Record » de l'autre.
  _appliquePilote(moi) {
    if (!moi) return;
    this._refreshShip();
    this.hiscore = (this.mode === 'survie' ? moi.meilleurSurvie : moi.meilleur) || 0;
    this.bestWave = (this.mode === 'survie' ? moi.meilleureVagueSurvie : moi.meilleureVague) || 0;
    this.hud.setHiscore(this.hiscore);
  }

  // Le formulaire d'inscription, là où le manque se constate : sous son propre
  // score, au moment où l'on regarde le tableau des autres.
  _inviteInscription(el, pilot) {
    const ligne = el.querySelector('#go-pilot');
    if (!ligne) return;
    ligne.innerHTML = `
      <form class="lb-form go-inscription" id="form-inscrire">
        <div class="pilot-note">
          Un code à 4 chiffres pour que personne d'autre ne publie sous
          <b>${esc(pilot.name)}</b>, et une adresse pour le retrouver si tu l'oublies.
        </div>
        <input id="ins-pin" type="password" inputmode="numeric" maxlength="4"
               placeholder="Code à 4 chiffres" autocomplete="off" aria-label="Code secret" />
        <input id="ins-mail" type="email" maxlength="120" placeholder="Adresse d'un parent"
               autocomplete="email" aria-label="Adresse électronique" />
        <button class="btn-launch" type="submit">Publier</button>
        <div class="pilot-error" id="ins-erreur"></div>
      </form>`;
    ligne.querySelector('#form-inscrire').addEventListener('submit', async (e) => {
      e.preventDefault();
      const erreur = ligne.querySelector('#ins-erreur');
      const code = ligne.querySelector('#ins-pin').value;
      const mail = ligne.querySelector('#ins-mail').value.trim();
      if (!/^\d{4}$/.test(code) || !mail) {
        erreur.textContent = 'Il faut les deux : un code à 4 chiffres et une adresse.';
        return;
      }
      erreur.textContent = 'Inscription…';
      const r = await reseau.inscris(pilot.name, code, mail);
      if (!r.ok) {
        erreur.textContent =
          r.erreur === 'code'
            ? 'Ce nom est déjà pris en ligne, par quelqu’un qui a un autre code.'
            : 'Pas de réseau. Tes parties sont gardées et monteront plus tard.';
        return;
      }
      // Les parties jouées avant l'inscription attendaient dans la file : elles
      // partent maintenant, d'un coup.
      const { envoyees } = await reseau.pousse();
      ligne.innerHTML = `${esc(pilot.name)} — en ligne ✓${
        envoyees > 1 ? ` · ${envoyees} parties envoyées` : ''
      }`;
      this._rafraichitPantheon(el, '#go-lb', this.mode);
    });
  }

  // Le tableau commun. Le classement du serveur remplace le local dès qu'il
  // arrive — jamais avant : un écran qui s'affiche vide en attendant le réseau est
  // pire qu'un écran qui montre ce qu'on a sous la main.
  // `limite` compte, et son absence était un bogue : l'écran d'accueil rendait
  // trois lignes, puis CE rafraîchissement en réinjectait dix par-dessus. Le
  // premier affichage était donc court, et le tableau reprenait toute la hauteur
  // dès que le serveur répondait — c'est-à-dire aussitôt, et c'est ce qu'on
  // voyait sur le téléphone.
  async _rafraichitPantheon(el, selecteur = '#go-lb', mode = 'arcade', limite = 10) {
    const cible = el?.querySelector?.(selecteur);
    if (!cible) return;
    const distant = (await classement(10, mode))?.slice(0, limite);
    if (!distant || !cible.isConnected) return;
    cible.innerHTML = this._leaderboardHtml(distant, -1, mode);
    this._brancheRejeux(cible);
    const titre = cible.parentElement?.querySelector('.lb-title');
    if (titre) {
      titre.textContent = mode === 'survie' ? '— Survie · en ligne —' : '— Panthéon commun —';
    }
  }

  // Branche les lignes revoyables d'un tableau déjà inséré dans le document.
  _brancheRejeux(racine) {
    for (const b of racine.querySelectorAll('[data-rejeu]')) {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._lanceRejeu(b.dataset.rejeu);
      });
    }
  }

  // UN MOT SUR L'ÉCRAN QU'ON REGARDE, quel qu'il soit.
  //
  // `hud.announce` ne vaut qu'en partie : tous les écrans de menu masquent le
  // HUD. Ce bandeau-là se pose sur l'overlay, donc il se voit partout — et c'est
  // le troisième endroit du jeu où l'on tombe dans le même piège, après la
  // demande de regard et l'ajout d'un copain.
  _ditEcran(texte, combien = 3600) {
    document.getElementById('mot-ecran')?.remove();
    const b = document.createElement('div');
    b.id = 'mot-ecran';
    b.className = 'voix-barre';
    b.innerHTML = `<span class="voix-nom">${esc(texte)}</span>`;
    const f = document.createElement('button');
    f.className = 'btn-ghost petit';
    f.textContent = 'OK';
    f.addEventListener('click', () => b.remove());
    b.append(f);
    document.body.append(b);
    clearTimeout(this._motEcran);
    this._motEcran = setTimeout(() => b.remove(), combien);
  }

  async _lanceRejeu(id) {
    // La vitrine tourne encore quand on clique une ligne du panthéon depuis le
    // menu : sans ça, `update` prendrait sa branche à elle avant celle du rejeu.
    this.quitteVitrine();
    // Une ligne du classement ne porte qu'un marqueur : l'enregistrement lui-même
    // ne se télécharge qu'au moment où on le demande. Charger douze replays pour
    // en regarder un seul serait payer douze fois trop.
    // LE MESSAGE DOIT ARRIVER OÙ LE JOUEUR REGARDE. `hud.announce` écrit dans le
    // HUD, et le HUD est MASQUÉ sur tous les écrans de menu — dont celui du
    // panthéon, d'où l'on ouvre justement un rejeu. Chargement, refus, échec :
    // les trois partaient dans le vide, et cliquer une ligne « ne faisait rien ».
    this._ditEcran('Chargement…');
    const partie = await partieParId(id);
    if (!partie || !partie.flux) {
      this._ditEcran('Enregistrement indisponible.');
      return;
    }
    const ok = await this.regarde(partie);
    if (ok === 'obsolete') {
      this._ditEcran(
        'Cette partie a été enregistrée par une version antérieure — les règles ont changé depuis, elle ne se rejouerait pas fidèlement.'
      );
      return;
    }
    if (!ok) {
      this._ditEcran('Enregistrement illisible.');
      return;
    }
    this._montreBandeauRejeu(partie);
  }

  // Le bandeau de relecture : qui, quand, où l'on en est, et de quoi contrôler.
  // Il vit dans l'overlay et non dans le HUD, pour que le HUD de la partie reste
  // exactement celui qu'on regarde.
  _montreBandeauRejeu(partie) {
    const el = this._screen(`
      <div class="rejeu-barre">
        <div class="rejeu-qui">
          <span class="rejeu-pastille">REPLAY</span>
          <b>${esc(partie.name)}</b>
          <span class="rejeu-detail">${partie.score} pts · vague ${partie.wave}${
            partie.duree ? ` · ${duree(partie.duree)}` : ''
          }${partie.date ? ` · ${esc(dateCourte(partie.date))}` : ''}</span>
        </div>
        <div class="rejeu-piste" id="rejeu-piste" role="slider" tabindex="0"
             aria-label="Position dans la partie" aria-valuemin="0" aria-valuemax="100">
          <i id="rejeu-avance"></i>
        </div>
        <div class="rejeu-boutons">
          <button id="rejeu-pause" aria-label="Pause">⏸</button>
          <button id="rejeu-vitesse">×1</button>
          <button id="rejeu-quitter">Quitter</button>
        </div>
      </div>
    `);
    // L'overlay est transparent aux clics par défaut : ce bandeau, lui, doit les
    // recevoir sans jamais avaler ceux destinés au jeu qu'il surplombe.
    el.classList.add('rejeu-cadre');
    const pause = el.querySelector('#rejeu-pause');
    const vitesse = el.querySelector('#rejeu-vitesse');
    pause.addEventListener('click', () => {
      if (!this.rejeu) return;
      this.rejeu.pause = !this.rejeu.pause;
      pause.textContent = this.rejeu.pause ? '▶' : '⏸';
    });
    vitesse.addEventListener('click', () => {
      if (!this.rejeu) return;
      const paliers = [1, 2, 4, 0.5];
      const i = paliers.indexOf(this.rejeu.vitesse);
      this.rejeu.vitesse = paliers[(i + 1) % paliers.length];
      vitesse.textContent = `×${this.rejeu.vitesse}`;
    });
    el.querySelector('#rejeu-quitter').addEventListener('click', () => this.quitteRejeu());
    this._rejeuAvance = el.querySelector('#rejeu-avance');

    // ALLER QUELQUE PART DANS LA PARTIE. Un enregistrement ne contient pas
    // d'états : seulement ce que le joueur a appuyé, image par image. On ne peut
    // donc pas s'y « téléporter » — la seule façon d'atteindre un instant est de
    // repartir du dernier instantané qui le précède et de REJOUER la simulation
    // jusque-là. C'est ce que fait `_chercheDansRejeu`, sans rien afficher.
    const piste = el.querySelector('#rejeu-piste');
    const vise = (ev) => {
      const r = piste.getBoundingClientRect();
      if (!r.width) return;
      this._chercheDansRejeu((ev.clientX - r.left) / r.width);
    };
    piste.addEventListener('pointerdown', (ev) => {
      piste.setPointerCapture?.(ev.pointerId);
      vise(ev);
    });
    // On suit le doigt : sur une barre, relâcher au mauvais endroit est frustrant.
    piste.addEventListener('pointermove', (ev) => {
      if (ev.buttons) vise(ev);
    });
    piste.addEventListener('keydown', (ev) => {
      const pas = ev.key === 'ArrowLeft' ? -0.02 : ev.key === 'ArrowRight' ? 0.02 : 0;
      if (!pas || !this.rejeu) return;
      ev.preventDefault();
      this._chercheDansRejeu(this.rejeu.lecteur.avancement + pas);
    });
  }

  // Rejouer en accéléré jusqu'à l'instant demandé, sans rien montrer ni faire
  // entendre. Une partie complète fait quelques milliers d'images ; les repasser
  // prend quelques dizaines de millisecondes, ce qui se ressent comme un saut.
  _chercheDansRejeu(fraction) {
    const r = this.rejeu;
    if (!r || r.fini) return;
    const saut = r.lecteur.prepareSaut(fraction);
    if (!saut || !saut.etat) return;

    // Le son est COUPÉ pendant la recherche. Sans ça, repasser mille images en
    // trente millisecondes déclenche mille tirs et mille explosions d'un coup :
    // ce n'est pas un bruit désagréable, c'est un mur.
    const muetAvant = this.audio.muted;
    if (!muetAvant) this.audio.toggleMute();

    this._restaure(saut.etat);
    for (let i = 0; i < saut.aRejouer; i++) {
      const cmd = r.lecteur.suivante();
      if (!cmd) break;
      this.cmd = cmd;
      this._updatePlaying(cmd.dt);
    }

    if (!muetAvant) this.audio.toggleMute();
    r.acc = 0;
    r.ecarts = 0; // les points de contrôle sautés ne sont pas des divergences
    if (this._rejeuAvance) {
      this._rejeuAvance.style.transform = `scaleX(${r.lecteur.avancement})`;
    }
  }

  _finDeRejeu() {
    if (!this.rejeu) return;
    const p = this.rejeu.partie;
    const el = this._screen(`
      <div class="screen gameover">
        <div class="go-title">Fin du replay</div>
        <div class="go-stats">
          <div><span class="hud-label">Pilote</span><b>${esc(p.name)}</b></div>
          <div><span class="hud-label">Score</span><b class="gold">${p.score}</b></div>
          <div><span class="hud-label">Vague</span><b>${p.wave}</b></div>
        </div>
        <div class="title-menu">
          <button class="btn-secondary" id="btn-revoir">↺ Revoir</button>
          <button class="btn-launch" id="btn-retour">Retour au menu</button>
        </div>
      </div>
    `);
    el.querySelector('#btn-revoir').addEventListener('click', () => this._lanceRejeu(p.id));
    el.querySelector('#btn-retour').addEventListener('click', () => this.quitteRejeu());
  }

  // LA PARTIE QUI TOURNE DERRIÈRE LE MENU.
  //
  // C'est une VRAIE partie : mêmes vagues, mêmes armes, mêmes explosions. Elle
  // n'est simplement enregistrée nulle part et ne finit jamais — à la mort du
  // pilote fantôme, on en relance une autre, avec une autre coque, comme une
  // borne d'arcade qui se remet à jouer toute seule.
  _lanceDemo() {
    const coques = ['orion', 'helios', 'vulcain'];
    const coque = coques[Math.floor(Math.random() * coques.length)];
    this.demo = true;
    this.horlogeDemo = 0;
    this.piloteAuto.reinitialise();
    this._sansPilote(() => this.startRun('arcade', coque));

    // CE N'EST PAS UNE PARTIE, C'EST UNE BANDE-ANNONCE. Une vague 1 en orbite
    // terrestre avec un canon nu ne donne envie de rien : trois ennemis, un tir
    // pâle et un fond noir. On montre donc le jeu tel qu'il devient au bout d'un
    // quart d'heure — armé, dans un endroit qui vaut le détour, avec assez de
    // monde à l'écran pour que ça bouge.
    this.levels = { cannons: 2, firerate: 3, missiles: 2, engine: 2, magnet: 1 };
    this.stats = computeStats(this.levels, this.surcharge);
    this._refreshShip();
    this.energy = OVERDRIVE.max * 0.8; // la furie arrive vite, c'est le plus beau

    // Un tableau tiré au sort parmi les plus jolis. Ce sont des ESCALES : les
    // secteurs ordinaires sont du vide avec un astre au loin, alors qu'ici on
    // traverse quelque chose.
    const vitrines = [
      { vague: 19, type: 'anneaux' },
      { vague: 13, type: 'champ' },
      { vague: 10, type: 'surface' },
      { vague: 22, type: 'anneaux' },
    ];
    // Les ennemis plongent moins et tirent moins qu'en vraie partie. Personne ne
    // le verra — on ne compte pas les piqués d'une vague qu'on regarde — mais ça
    // laisse au fantôme de quoi montrer autre chose que des esquives.
    this.routeMods = { hp: 1, fire: 0.5, dive: 0.35, credits: 1 };
    const choix = vitrines[Math.floor(Math.random() * vitrines.length)];
    let tirage = 0;
    while (
      tirage < 8 &&
      escalePourSecteur(stageForWave(choix.vague), tirage)?.escale !== choix.type
    )
      tirage++;
    this.escale = { vague: choix.vague, tirage };
    this.bis = true;
    this.startWave(choix.vague);
    this.stage.space?.setBiome(this._biomeFor(choix.vague), { instant: true });

    // Rien de cette partie ne doit atteindre le panthéon ni le fichier de rejeu.
    this.enregistreur.actif = false;
    this.state = 'title';
    this.hud.root.classList.add('hidden');
  }

  // `startRun` exige un pilote connecté — c'est juste pour une vraie partie, et
  // faux pour celle-ci : la démonstration doit tourner même quand personne ne
  // s'est encore identifié, et c'est même le cas le plus fréquent.
  _sansPilote(fn) {
    const avant = this._demoForce;
    this._demoForce = true;
    try {
      fn();
    } finally {
      this._demoForce = avant;
    }
  }

  // On enchaîne, mais pas dans la même image : `_updatePlaying` est encore dans
  // sa pile, et repartir de zéro sous ses pieds laisserait des objets à moitié
  // rangés. Un compte à rebours court suffit, et il laisse voir l'explosion.
  _relanceDemo() {
    if (this._demoRelance) return;
    this._demoRelance = true;
    setTimeout(() => {
      this._demoRelance = false;
      if (!this.demo) return;
      this.shop.close();
      // On repasse par l'écran entier : `_lanceDemo` seul rejouerait la partie
      // mais laisserait l'overlay vide, puisque c'est `startRun` qui l'efface.
      this.showTitle();
    }, 1400);
  }

  // LE MENU S'EFFACE, PUIS REVIENT AU MOINDRE GESTE.
  //
  // Il ne disparaît pas : il descend à un quart d'opacité. Un menu qui s'en va
  // complètement force à deviner où cliquer pour le rappeler, et c'est le genre
  // de coquetterie qui agace dès la deuxième fois.
  _veilleMenu(el) {
    clearTimeout(this._veille);
    const reveille = () => {
      el.classList.remove('en-veille');
      clearTimeout(this._veille);
      this._veille = setTimeout(() => {
        if (this.state === 'title') el.classList.add('en-veille');
      }, 6000);
    };
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
      window.addEventListener(ev, reveille, { passive: true });
    }
    // Les écouteurs vivent le temps de l'écran : `_screen` vide l'overlay au
    // suivant, et un menu qui n'existe plus n'a pas à se réveiller.
    this._arreteVeille = () => {
      clearTimeout(this._veille);
      for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
        window.removeEventListener(ev, reveille);
      }
    };
    reveille();
  }

  // QUITTER LA VITRINE. TOUT CE QUI PART DU MENU PASSE PAR ICI.
  //
  // La partie de fond force `state` à `title` à chaque image — c'est ce qui
  // empêche le menu de disparaître quand la simulation passe en vague ou en
  // boutique. Mais elle ne sait pas distinguer un changement d'état qu'elle a
  // provoqué d'un changement VOULU par le joueur : quiconque quittait l'écran
  // d'accueil se faisait ramener au titre à l'image suivante, avec le fantôme
  // toujours aux commandes.
  //
  // C'était visible sur « Histoire » — la cinématique ne démarrait jamais, on
  // continuait de regarder la vitrine — et ça valait tout autant pour le choix
  // du pilote et pour la relecture d'une partie du panthéon. Trois écrans, un
  // seul défaut : le premier avait été rafistolé sur place, ce qui a masqué les
  // deux autres. La sortie est donc une seule porte, et chaque écran l'emprunte.
  quitteVitrine() {
    // `_demoForce` signale que c'est la vitrine elle-même qui appelle `startRun` :
    // elle ne doit pas se couper en s'installant.
    if (!this.demo || this._demoForce) return;
    this.arreteDemo();
    this._arreteVeille?.();
    this._arreteVeille = null;
    // Ce qu'elle laisse derrière : des ennemis figés en l'air, des balles
    // suspendues et une bourse pleine ne racontent rien sur l'écran suivant.
    this.shop.close();
    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.pickups.clear();
    this.modules.clear();
    this.enemies.clear();
    this.colosse?.annule();
    this.soutien?.annule();
    this.aura?.clear();
    this.arrivee?.annule();
    for (const a of Object.values(this.armes)) a.clear();
    this.characters.taisToi();
    this.characters.muet = false;
    this.player.reset();
    this.hud.root.classList.add('hidden');
    // La vitrine se joue dans une escale, à la vague dix-neuf ou vingt-deux : si
    // on lui laisse ces valeurs, l'écran suivant calcule son décor pour une
    // partie qui n'existe plus.
    this.wave = 0;
    this.bis = false;
    this.escale = null;
    this.routeMods = null;
  }

  arreteDemo() {
    if (!this.demo) return;
    this.demo = false;
    this.enregistreur.actif = true;
    this.input.held.clear();
  }

  showTitle() {
    this.state = 'title';
    // LA PARTIE DE FOND DÉMARRE EN PREMIER, et l'ordre n'est pas négociable :
    // `startRun` vide l'overlay pour faire place au jeu. Lancer la démonstration
    // après avoir construit le menu l'effacerait aussitôt — l'écran d'accueil
    // devenait une partie sans titre ni boutons.
    this._lanceDemo();
    // Quel tableau on regardait la dernière fois : revenir au menu ne doit pas
    // ramener systématiquement sur l'arcade quand on enchaîne les survies.
    const mode = this._modeTableau || 'arcade';
    this.audio.setMode('title');
    this.hud.root.classList.add('hidden');
    // LE CLASSEMENT ENTIER, DANS UNE BOÎTE QUI DÉFILE.
    //
    // J'avais coupé à trois lignes pour rendre sa hauteur au titre. C'était la
    // mauvaise réponse à la bonne question : on vient aussi voir OÙ L'ON EST, et
    // trois noms ne le disent pas. Ce n'est pas le nombre de lignes qu'il fallait
    // réduire, c'est la place que le bloc prend dans la colonne — et pour ça il
    // suffit qu'il défile chez lui (voir .title-lb dans la feuille de style).
    const scores = classementConnu(this._modeTableau || 'arcade').slice(0, 10);
    const pilot = activePilot();
    const el = this._screen(`
      <div class="screen title">
        <button class="pilot-badge" id="btn-pilot" title="Changer de pilote">
          <span class="pilot-avatar">${pilot ? esc(pilot.name[0]) : '?'}</span>
          <span class="pilot-badge-name">${pilot ? esc(pilot.name) : 'Choisir un pilote'}</span>
        </button>
        <div class="title-logo">HYPER<span>NOVA</span></div>
        <div class="title-tag">— Faites décoller la légende —</div>
        <div class="title-menu">
          <button class="btn-launch" id="btn-arcade">
            Arcade${IS_TOUCH ? '' : ' <span class="key-hint">Espace</span>'}
          </button>
          <button class="btn-secondary" id="btn-survie">
            Survie · ${SURVIE.vagues} vagues
          </button>
        </div>
        <div class="title-controls">
          ${
            IS_TOUCH
              ? '<span>Glissez pour piloter</span><span>Tir automatique</span><span>Bouton ✦&nbsp;&nbsp;bombe (maintenir = Overdrive)</span>'
              : '<span>← → ou Q / D&nbsp;&nbsp;bouger</span><span>Espace&nbsp;&nbsp;tirer</span><span>X&nbsp;&nbsp;bombe (maintenir = Overdrive)</span>'
          }
        </div>
        <button class="btn-ghost" id="btn-story">◈ Histoire</button>
        <div class="title-version">v${__VERSION__}</div>
        <button class="btn-ghost title-amis" id="btn-amis">☍ Mes copains<span class="amis-pastille" id="amis-pastille" hidden></span></button>
        ${
          scores.length
            ? `<div class="title-lb">
                 <div class="lb-onglets">
                   <button class="lb-onglet${mode === 'arcade' ? ' on' : ''}" data-mode="arcade">Arcade</button>
                   <button class="lb-onglet${mode === 'survie' ? ' on' : ''}" data-mode="survie">Survie</button>
                 </div>
                 <div class="lb-title" id="titre-lb">— Meilleurs pilotes —</div>
                 <div id="title-lb">${this._leaderboardHtml(scores, -1, mode)}</div>
               </div>`
            : `<div class="title-lb">
                 <div class="lb-onglets">
                   <button class="lb-onglet${mode === 'arcade' ? ' on' : ''}" data-mode="arcade">Arcade</button>
                   <button class="lb-onglet${mode === 'survie' ? ' on' : ''}" data-mode="survie">Survie</button>
                 </div>
                 <div class="lb-title" id="titre-lb">— Meilleurs pilotes —</div>
                 <div id="title-lb">${this._leaderboardHtml([], -1, mode)}</div>
               </div>`
        }
        <div class="title-install" id="title-install" hidden></div>
      </div>
    `);
    this._brancheRejeux(el); // le panthéon du menu est cliquable, comme celui de fin
    this._rafraichitPantheon(el, '#title-lb', mode, 10);
    for (const b of el.querySelectorAll('.lb-onglet')) {
      b.addEventListener('click', () => {
        this._modeTableau = b.dataset.mode;
        this.audio.uiTick();
        this.showTitle();
      });
    }
    el.querySelector('#btn-arcade').addEventListener('click', () => this.showVariante('arcade'));
    el.querySelector('#btn-survie').addEventListener('click', () => this.showVariante('survie'));
    // Le menu s'efface tout seul si personne ne touche à rien : c'est ce que fait
    // une borne d'arcade, et ce que fait une vignette qui se met à jouer quand on
    // s'attarde dessus.
    this._veilleMenu(el);

    this._brancheInstallation(el);
    el.querySelector('#btn-amis').addEventListener('click', () => this.showAmis());
    // Le titre est le seul écran qu'on traverse forcément — avant comme après
    // une inscription. C'est donc là qu'on essaie d'honorer le lien reçu.
    this._consommeLienAmi().then(() => {
      this._rafraichitPastilleAmis(el);
      this.ouvreCanalAmis();
    });
    el.querySelector('#btn-story').addEventListener('click', () => this.playCinematic());
    el.querySelector('#btn-pilot').addEventListener('click', () => this.showPilotSelect());
  }

  // Sélecteur de profils : chaque copain a son badge ; un code secret optionnel (4 chiffres)
  // dissuade l'emprunt de pseudo sur un appareil partagé.
  // L'ÉCRAN D'IDENTIFICATION. Ce n'est plus une liste locale mais une connexion :
  // les pilotes vivent sur le serveur, donc on y retrouve les copains qui jouent
  // depuis LEUR téléphone. C'était tout l'intérêt de sortir du localStorage.
  // ---------------------------------------------------------------- LE PROFIL
  //
  // SA MEILLEURE PARTIE, ET CELLE DE SES COPAINS.
  //
  // Le panthéon répond à « qui est le meilleur ». Il ne répond pas à « qu'est-ce
  // que TU as fait de mieux » : celui qui n'entre pas dans les vingt premiers n'y
  // trouve jamais sa propre partie — et c'est pourtant la seule qu'il ait envie de
  // remontrer. Le profil est fait pour ça.
  //
  // Un mode par colonne, parce que les deux ne se comparent pas : l'arcade se juge
  // au score, la survie à la vague atteinte. Afficher les deux sous le même chiffre
  // laisserait croire qu'ils se mesurent.
  async showProfil(nom = null, retour = null) {
    this.quitteVitrine();
    this.state = 'profil';
    this.hud.root.classList.add('hidden');
    const revenir = retour || (() => this.showTitle());
    const el = this._screen(`
      <div class="screen profil">
        <h2 class="shop-title" id="profil-nom">${esc(nom || activePilot()?.name || 'Profil')}</h2>
        <div class="coque-sous" id="profil-sous">Chargement…</div>
        <div class="profil-cartes" id="profil-cartes"></div>
        <button class="btn-ghost" id="profil-back">← Retour</button>
      </div>`);
    el.querySelector('#profil-back').addEventListener('click', revenir);

    const p = await profilDistant(nom);
    if (!el.isConnected) return;
    const sous = el.querySelector('#profil-sous');
    if (!p) {
      sous.textContent = nom
        ? `Impossible de voir le profil de ${nom} — êtes-vous bien copains ?`
        : 'Profil indisponible — pas de réseau.';
      return;
    }
    el.querySelector('#profil-nom').textContent = p.nom;
    const total = Object.values(p.parties || {}).reduce((a, b) => a + b, 0);
    sous.textContent = total
      ? `${total} partie${total > 1 ? 's' : ''} jouée${total > 1 ? 's' : ''}`
      : 'Aucune partie pour l’instant.';

    const MODES = [
      ['arcade', 'Arcade', (m) => `${m.score} pts`, (m) => `vague ${m.vague}`],
      ['survie', 'Survie', (m) => `vague ${m.vague}`, (m) => `${m.score} pts`],
    ];
    el.querySelector('#profil-cartes').innerHTML = MODES.map(([cle, titre, gros, petit]) => {
      const m = p.meilleures?.[cle];
      if (!m) {
        return `<div class="profil-carte vide"><h3>${titre}</h3>
                  <div class="profil-rien">Jamais joué</div></div>`;
      }
      // MÊME RÈGLE QU'AU PANTHÉON : on ne propose pas un rejeu qu'on ne sait plus
      // lire. Une partie enregistrée sous d'autres règles ne se rejouerait pas
      // fidèlement, et le bouton mentirait.
      const perime = m.version != null && m.version !== VERSION_REJEU;
      const revoyable = !!m.a_replay && !perime;
      return `<div class="profil-carte">
          <h3>${titre}</h3>
          <div class="profil-gros">${esc(gros(m))}</div>
          <div class="profil-petit">${esc(petit(m))} · ${new Date(m.jouee_le).toLocaleDateString('fr-FR')}</div>
          ${
            revoyable
              ? `<button class="btn-secondary" data-revoir="${esc(m.id)}">▶ Revoir</button>`
              : m.a_replay
                ? '<div class="profil-rien">⧖ enregistrée par une version antérieure</div>'
                : '<div class="profil-rien">Pas d’enregistrement</div>'
          }
        </div>`;
    }).join('');

    el.querySelectorAll('[data-revoir]').forEach((b) =>
      b.addEventListener('click', () => this._lanceRejeu(b.dataset.revoir))
    );
  }

  async showPilotSelect(onDone = null) {
    this.quitteVitrine();
    this.state = 'pilots';
    this.hud.root.classList.add('hidden');
    const done = () => {
      this._vitrine(false);
      return onDone ? onDone() : this.showTitle();
    };
    const moi = activePilot();
    const el = this._screen(`
      <div class="screen pilots">
        <h2 class="shop-title">Qui pilote ?</h2>
        ${
          moi
            ? `<div class="pilot-moi">Tu es <b>${esc(moi.name)}</b>${
                moi.horsLigne ? ' <span class="pilot-note">(hors ligne)</span>' : ''
              }</div>
               <div class="title-menu">
                 <button class="btn-launch" id="pilot-jouer">Jouer</button>
                 <button class="btn-secondary" id="pilot-vaisseau">Mon vaisseau</button>
                 <button class="btn-secondary" id="pilot-profil">Mes meilleures parties</button>
                 <button class="btn-ghost" id="pilot-changer">Changer de pilote</button>
               </div>`
            : '<div class="pilot-note" id="pilot-etat">Chargement des pilotes…</div>'
        }
        <div class="pilot-grid" id="pilot-grid"></div>
        <div class="pilot-form-zone" id="pilot-form-zone"></div>
        <button class="btn-ghost" id="pilots-back">← Retour</button>
      </div>
    `);
    const zone = el.querySelector('#pilot-form-zone');
    const grille = el.querySelector('#pilot-grid');
    el.querySelector('#pilots-back').addEventListener('click', () => {
      this._vitrine(false);
      this.showTitle();
    });
    el.querySelector('#pilot-jouer')?.addEventListener('click', done);
    el.querySelector('#pilot-vaisseau')?.addEventListener('click', () =>
      this._formVaisseau(zone, moi, done)
    );
    el.querySelector('#pilot-profil')?.addEventListener('click', () =>
      this.showProfil(null, () => this.showPilotSelect(onDone))
    );
    el.querySelector('#pilot-changer')?.addEventListener('click', () => {
      deconnecte();
      this.showPilotSelect(onDone);
    });
    if (moi) return;

    // CEUX QUI SE SONT DÉJÀ CONNECTÉS ICI, ET PERSONNE D'AUTRE.
    //
    // L'écran demandait au serveur la liste de TOUS les pilotes du jeu. Ça marche
    // à trois et plus du tout ensuite : la grille devient un annuaire où l'on
    // cherche son propre nom. La liste est donc locale à l'appareil — sur la
    // tablette du salon, les deux frères ; sur un téléphone, son propriétaire.
    // Elle est courte par construction, elle ne demande rien au réseau, et elle
    // répond au vrai geste : « je reviens sur mon pseudo », pas « qui existe ? ».
    const pilotes = pilotesConnus();
    const etat = el.querySelector('#pilot-etat');
    if (etat) {
      etat.textContent = pilotes.length
        ? 'Choisis ton nom, ou entre un autre pseudo'
        : 'Crée-toi un pilote, ou entre un pseudo que tu as déjà.';
    }
    grille.innerHTML = `
      ${pilotes
        .map(
          (p, i) => `
        <button class="pilot-card" data-pilot="${i}">
          <span class="pilot-avatar big">${esc(p.name[0] || '?')}</span>
          <span class="pilot-card-name">${esc(p.name)}</span>
          <span class="pilot-oublie" data-oublie="${i}" role="button" tabindex="0"
                title="Retirer de cet appareil">✕</span>
        </button>`
        )
        .join('')}
      <button class="pilot-card new" id="pilot-autre">
        <span class="pilot-avatar big">↩</span>
        <span class="pilot-card-name">Un autre pseudo</span>
      </button>
      <button class="pilot-card new" id="pilot-new">
        <span class="pilot-avatar big">+</span>
        <span class="pilot-card-name">Nouveau pilote</span>
      </button>`;

    // Retirer quelqu'un de CET APPAREIL ne touche pas à son compte : il existe
    // toujours, il ne s'affiche simplement plus ici. Sur une tablette partagée,
    // c'est le seul moyen que la grille ne finisse pas en annuaire à son tour.
    grille.querySelectorAll('[data-oublie]').forEach((x) =>
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        oubliePilote(pilotes[Number(x.dataset.oublie)].name);
        this.showPilotSelect(onDone);
      })
    );

    grille.querySelectorAll('.pilot-card[data-pilot]').forEach((card) =>
      card.addEventListener('click', () => {
        const p = pilotes[Number(card.dataset.pilot)];
        // Le code est TOUJOURS demandé : c'est lui qui prouve que ce pseudo est le
        // vôtre. Sans lui, n'importe qui publierait sous le nom d'un autre.
        zone.innerHTML = `
          <form class="lb-form" id="pin-form">
            <input id="pin-input" type="password" inputmode="numeric" maxlength="4"
                   placeholder="Code de ${esc(p.name)}" autocomplete="off" aria-label="Code secret" />
            <button class="btn-launch" type="submit">C'est moi</button>
            <div class="pilot-error" id="pilot-error"></div>
          </form>`;
        const input = zone.querySelector('#pin-input');
        input.focus();
        zone.querySelector('#pin-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const erreur = zone.querySelector('#pilot-error');
          erreur.textContent = 'Connexion…';
          const r = await connecte(p.name, input.value, null, {
            livree: p.livree,
            carene: p.carene,
          });
          if (r.ok) {
            this.audio.buy();
            this._appliquePilote(await reprends());
            done();
            return;
          }
          this.audio.deny();
          input.value = '';
          erreur.textContent =
            r.error === 'code' ? 'Mauvais code…' : 'Pas de réseau : réessaie plus tard.';
        });
      })
    );

    // « UN AUTRE PSEUDO » — celui qui joue depuis un appareil qu'il n'a jamais
    // utilisé. Sans lui, la liste locale serait une prison : on ne pourrait
    // revenir que sur les pilotes déjà passés par là, et un enfant chez un copain
    // n'aurait plus aucun moyen de retrouver son propre pseudo.
    grille.querySelector('#pilot-autre').addEventListener('click', () => {
      zone.innerHTML = `
        <form class="lb-form" id="autre-form">
          <input id="autre-nom" type="text" maxlength="10" placeholder="TON PSEUDO"
                 autocomplete="off" aria-label="Pseudo" />
          <input id="autre-pin" type="password" inputmode="numeric" maxlength="4"
                 placeholder="Ton code à 4 chiffres" autocomplete="off" aria-label="Code secret" />
          <button class="btn-launch" type="submit">C'est moi</button>
          <div class="pilot-note">
            Ton pseudo existe déjà quelque part : il te suit d'un écran à l'autre.
          </div>
          <div class="pilot-error" id="pilot-error"></div>
        </form>`;
      const nom = zone.querySelector('#autre-nom');
      nom.focus();
      zone.querySelector('#autre-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const erreur = zone.querySelector('#pilot-error');
        const propre = sanitizeName(nom.value);
        if (!propre) {
          erreur.textContent = 'Écris ton pseudo.';
          return;
        }
        erreur.textContent = 'Connexion…';
        const r = await connecte(propre, zone.querySelector('#autre-pin').value, null);
        if (r.ok) return done();
        // « email-requis » veut dire que le pseudo est LIBRE : ce n'est pas un
        // échec, c'est une création qui commence. On le dit dans ces mots-là.
        erreur.textContent =
          r.error === 'code'
            ? 'Mauvais code…'
            : r.error === 'email-requis'
              ? 'Ce pseudo est libre — passe par « Nouveau pilote » pour le prendre.'
              : r.error === 'trop-d-essais'
                ? 'Trop d’essais. Réessaie dans un moment.'
                : 'Pas de réseau : réessaie plus tard.';
      });
    });

    grille.querySelector('#pilot-new').addEventListener('click', () => {
      // On choisit son nom ET son vaisseau du même geste. Faire le tour du hangar
      // avant de décoller fait partie du plaisir, et un vaisseau qu'on a choisi
      // soi-même n'est plus le vaisseau du jeu : c'est le sien.
      const choix = { livree: 'flotte', carene: 'dague' };
      zone.innerHTML = `
        <form class="lb-form pilot-create" id="create-form">
          <input id="new-name" type="text" maxlength="10" placeholder="TON NOM" autocomplete="off" aria-label="Nom du pilote" />
          ${this._pimpHtml(choix)}
          <input id="new-pin" type="password" inputmode="numeric" maxlength="4"
                 placeholder="Code secret à 4 chiffres" autocomplete="off" aria-label="Code secret" />
          <input id="new-mail" type="email" maxlength="120" placeholder="Adresse d'un parent"
                 autocomplete="email" aria-label="Adresse électronique" />
          <div class="pilot-note">
            Le code empêche les copains de publier sous ton nom. L'adresse sert à le
            retrouver si tu l'oublies — elle n'apparaît nulle part dans le jeu.
          </div>
          <button class="btn-launch" type="submit">C'est moi !</button>
          <div class="pilot-error" id="pilot-error"></div>
        </form>`;
      const nameInput = zone.querySelector('#new-name');
      nameInput.focus();
      this._branchePimp(zone, choix);
      zone.querySelector('#create-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const erreur = zone.querySelector('#pilot-error');
        const code = zone.querySelector('#new-pin').value;
        const mail = zone.querySelector('#new-mail').value.trim();
        if (!sanitizeName(nameInput.value)) {
          erreur.textContent = 'Choisis un nom (lettres et chiffres).';
          return;
        }
        if (!/^\d{4}$/.test(code) || !mail) {
          erreur.textContent = 'Il faut un code à 4 chiffres et une adresse.';
          return;
        }
        erreur.textContent = 'Création…';
        const r = await connecte(nameInput.value, code, mail, choix);
        if (r.ok) {
          this.audio.buy();
          this._appliquePilote(await reprends());
          done();
          return;
        }
        this.audio.deny();
        erreur.textContent =
          r.error === 'code'
            ? 'Ce nom est déjà pris. Choisis-en un autre, ou entre son code.'
            : r.error === 'email-requis'
              ? 'Il manque une adresse valable.'
              : 'Pas de réseau : impossible de créer un pilote pour l’instant.';
      });
    });
  }

  // Le hangar de son propre vaisseau. On ne modifie que le SIEN — celui d'un
  // copain ne nous regarde pas, et le serveur le refuserait de toute façon.
  _formVaisseau(zone, moi, done) {
    const choix = { livree: moi.livree || 'flotte', carene: moi.carene || 'dague' };
    zone.innerHTML = `
      <form class="lb-form pilot-create" id="edit-form">
        <div class="pilot-note">Le vaisseau de <b>${esc(moi.name)}</b></div>
        ${this._pimpHtml(choix)}
        <button class="btn-launch" type="submit">Enregistrer</button>
        <div class="pilot-error" id="pilot-error"></div>
      </form>`;
    this._branchePimp(zone, choix);
    zone.querySelector('#edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const erreur = zone.querySelector('#pilot-error');
      erreur.textContent = 'Enregistrement…';
      const ok = await majApparence(choix);
      this._refreshShip();
      if (!ok) {
        erreur.textContent = 'Pas de réseau : ton vaisseau sera enregistré plus tard.';
        return;
      }
      this.audio.buy();
      done();
    });
  }

  _pimpHtml(choix) {
    return `
      <div class="pimp">
        <div class="pimp-row">
          <span class="pimp-label">Carène</span>
          <div class="pimp-opts" id="pimp-carene">
            ${CARENES.map(
              (c) =>
                `<button type="button" class="pimp-opt${c.id === choix.carene ? ' on' : ''}" data-v="${c.id}">${esc(c.nom)}</button>`
            ).join('')}
          </div>
        </div>
        <div class="pimp-row">
          <span class="pimp-label">Livrée</span>
          <div class="pimp-opts" id="pimp-livree">
            ${LIVREES.map(
              (l) =>
                `<button type="button" class="pimp-opt swatch${l.id === choix.livree ? ' on' : ''}" data-v="${l.id}"
                   style="--h:#${l.hull.toString(16).padStart(6, '0')};--a:#${l.accent.toString(16).padStart(6, '0')}"
                   title="${esc(l.nom)}"><i></i>${esc(l.nom)}</button>`
            ).join('')}
          </div>
        </div>
      </div>`;
  }

  // LA VITRINE. Le vaisseau était bien affiché pendant qu'on le choisissait — mais
  // à sa place de combat : tout en bas de l'écran, à cent vingt pixels du bord, et
  // de la taille d'un pouce. On choisissait donc une livrée sans la voir.
  //
  // Le temps du hangar, il vient au centre, grandit et tourne sur lui-même. Rien
  // de tout cela n'est simulé : c'est un présentoir, pas une partie.
  // `fraction` dit OÙ le vaisseau doit tomber dans la largeur de l'écran : 0,5 au
  // centre, 0,27 au quart gauche. On ne peut pas le poser en dur en unités de jeu —
  // le rapport unités/pixels dépend de l'aspect de la fenêtre, et il change du
  // simple au double entre un téléphone à la verticale et le même à l'horizontale.
  // On le mesure donc à chaque fois, en projetant deux points connus.
  _vitrine(actif, fraction = 0.5) {
    this.vitrine = actif;
    const g = this.player.group;
    if (actif) {
      g.visible = true;
      g.position.set(this._xPourFraction(fraction), 0, 1.5);
      g.rotation.set(-0.35, 0, 0);
      g.scale.setScalar(2.4);
    } else {
      g.scale.setScalar(1);
      g.rotation.set(0, 0, 0);
      g.position.set(0, 0, ARENA.playerZMax * 0.8);
    }
  }

  // DEUX TEMPS : ON REGARDE, PUIS ON VOIT TIRER.
  //
  // Il fallait choisir entre montrer la CARÈNE — grande, inclinée, tournant sur
  // elle-même, c'est la seule occasion de la voir — et montrer l'ARME, qui exige
  // un vaisseau à sa taille réelle au milieu de ses projectiles. Les deux à la
  // fois donnent un vaisseau deux fois et demie trop gros crachant des balles
  // minuscules ; l'échelle ment, et on ne comprend plus rien aux distances.
  //
  // On ne choisit donc pas : la présentation dure une seconde et demie, le temps
  // d'un tour complet, puis le vaisseau redescend à sa taille de combat et
  // l'arme se met au travail. Changer de coque rejoue la présentation.
  _updateChoixCoque(dt) {
    const pose = this._poseCoque;
    if (!pose || !this.demoArme) return;
    pose.t += dt;
    const g = this.player.group;

    // L'anneau de frôlement est éteint le temps de la présentation. Il est utile
    // en vol — c'est lui qui dit jusqu'où l'on peut s'approcher d'une balle —
    // mais ici c'est une ellipse lumineuse de la taille du vaisseau, posée
    // dessus, et les trois coques se ressemblent d'un coup beaucoup trop.
    const halo = g.getObjectByName('grazeAura');

    if (pose.t < COQUE_PRESENTATION) {
      g.rotation.y += dt * 1.1;
      g.position.z = COQUE_Z_PRESENTATION;
      if (halo) halo.visible = false;
      return;
    }
    if (!this.demoArme.actif) {
      g.rotation.y = 0;
      this.demoArme.demarre(this);
    }
    if (halo) halo.visible = true;
    // La mise en place, en un demi-tour de main : plus lent, on croirait le
    // vaisseau en train de reculer plutôt que de se poser.
    const k = Math.min(1, (pose.t - COQUE_PRESENTATION) / 0.45);
    const e = k * k * (3 - 2 * k);
    g.scale.setScalar(2.4 + (COQUE_COMBAT - 2.4) * e);
    g.rotation.x = -0.35 * (1 - e);
    g.position.z = COQUE_Z_PRESENTATION + (COQUE_Z_COMBAT - COQUE_Z_PRESENTATION) * e;
    this.demoArme.update(dt, this);
  }

  _xPourFraction(fraction) {
    if (!this.camera || fraction === 0.5) return 0;
    const cible = fraction * 2 - 1; // fraction d'écran -> coordonnée normalisée
    const zero = this._tmp.set(0, 0, 1.5).project(this.camera).x;
    const dix = this._tmp.set(10, 0, 1.5).project(this.camera).x;
    const parUnite = (dix - zero) / 10;
    if (!parUnite) return 0;
    return (cible - zero) / parUnite;
  }

  // Le vaisseau se reconstruit à chaque clic : on voit ce qu'on choisit, tout de
  // suite et en trois dimensions. C'est la moitié de l'intérêt de choisir.
  _branchePimp(zone, choix) {
    for (const [cle, id] of [
      ['carene', '#pimp-carene'],
      ['livree', '#pimp-livree'],
    ]) {
      zone.querySelectorAll(`${id} .pimp-opt`).forEach((b) =>
        b.addEventListener('click', () => {
          choix[cle] = b.dataset.v;
          zone.querySelectorAll(`${id} .pimp-opt`).forEach((o) => o.classList.remove('on'));
          b.classList.add('on');
          this.player.rebuild(choix);
          this._vitrine(true); // rebuild remet une échelle neuve : on repose la pose
          this.audio.uiTick();
        })
      );
    }
    this.player.rebuild(choix);
    this._vitrine(true);
  }

  // « Rejouer » relance le même mode AVEC la même coque : celui qui enchaîne les
  // parties pour améliorer son score ne veut pas repasser par le choix à chaque fois.
  //
  // SAUF EN ENTRAÎNEMENT, et c'est tout l'inverse. On s'y entraîne à une vague
  // PRÉCISE, avec un équipement PRÉCIS — c'est la seule raison d'être du mode.
  // Relancer avec la même coque mais depuis la vague 1 et le vaisseau nu, c'est
  // perdre exactement ce qu'on était venu régler : le joueur mourait à la vague
  // 18 et se retrouvait à la 1, sans rien comprendre. On revient donc au menu du
  // mode, avec ses réglages en place, prêt à repartir d'un bouton.
  _replay() {
    if (this.variante === 'entrainement') return this.showEntrainement(this.mode);
    this.startRun(this.mode === 'survie' ? 'survie' : 'arcade', this.coque);
  }

  showGameOver() {
    if (this.rejeu) return; // on regarde une partie : elle est déjà finie
    // LA MORT DU COPAIN N'EST PAS LA NÔTRE. On la reconstitue à l'écran comme le
    // reste, mais elle n'ouvre pas d'écran de fin et ne publie rien : ce score
    // appartient à celui qui l'a joué.
    if (this.spectateur) {
      this.hud.announce(`${this.spectateur.de} est tombé`, 'En attente de la suite', 2600);
      return;
    }
    this.duo?.annonceJeu(false);
    // Ceux qui regardaient n'ont plus rien à voir : on les libère.
    for (const qui of this._regardeurs || []) this.duo.signale(qui, 'regard-fin', null);
    this._regardeurs?.clear();
    this.state = 'gameover';
    this.audio.setMode('title');
    this.audio.gameOver();
    this.hud.root.classList.add('hidden');

    // Arcade : records + inscription au panthéon local.
    // LE RECORD NON PLUS. Commencer à la vague 20 avec un vaisseau garni et
    // battre son record de partie honnête n'aurait aucun sens : le record cesse
    // alors de dire ce qu'il dit.
    const horsConcours = this.variante === 'entrainement';
    const newRecord = !horsConcours && this.score > 0 && this.score >= this.hiscore;
    if (!horsConcours && this.score > this.hiscore) this.hiscore = this.score;
    if (!horsConcours && this.wave > this.bestWave) this.bestWave = this.wave;
    // Inscription automatique au panthéon sous le pilote actif : zéro friction.
    // L'enregistrement de la partie, lui, se compresse — donc il s'écrit APRÈS
    // l'affichage. On ne fait pas attendre un écran de fin pour un gzip.
    const pilot = activePilot();
    const scores = classementConnu(this.modeTableau);
    // L'ENTRAÎNEMENT NE S'INSCRIT NULLE PART, ET IL DOIT LE DIRE. Rien n'était
    // publié — la garde existe plus bas — mais l'écran de fin annonçait quand
    // même « inscription au panthéon… », promesse qui ne s'accomplissait jamais.
    // Un mode d'essai qui a l'air de compter est pire qu'un mode qui compte.
    const entraine = this.variante === 'entrainement';
    const pilotLine = entraine
      ? '<div class="go-pilot">Entraînement — rien n’est inscrit au panthéon.</div>'
      : this.score > 0 && pilot
        ? `<div class="go-pilot" id="go-pilot">${esc(pilot.name)} — inscription au panthéon…</div>`
        : '';
    const el = this._screen(`
      <div class="screen gameover">
        <div class="go-title">Partie terminée</div>
        ${newRecord ? '<div class="go-record">★ Nouveau record ★</div>' : ''}
        <div class="go-stats">
          <div><span class="hud-label">Score</span><b>${this.score}</b></div>
          <div><span class="hud-label">Vague</span><b>${this.wave}</b></div>
          <div><span class="hud-label">Record</span><b class="gold">${this.hiscore}</b></div>
        </div>
        ${pilotLine}
        <div class="title-lb">
          <div class="lb-title">${this._titreTableau()}</div>
          <div id="go-lb">${this._leaderboardHtml(scores, -1, this.modeTableau)}</div>
        </div>
        <div class="title-menu">
          <button class="btn-secondary" id="btn-share">📣 Défier les copains</button>
          <button class="btn-launch" id="btn-replay">Rejouer${IS_TOUCH ? '' : ' <span class="key-hint">Espace</span>'}</button>
          <button class="btn-ghost" id="btn-menu">← Menu principal</button>
        </div>
      </div>
    `);
    this.characters.onGameOver();
    el.querySelector('#btn-share').addEventListener('click', () => {
      this._share(challengeText(pilot?.name || 'Un pilote', this.score, this.wave));
    });
    el.querySelector('#btn-replay').addEventListener('click', () => this._replay());
    // Sans cette sortie, changer de mode ou de pilote après une partie obligeait à
    // recharger la page — c'est-à-dire à quitter le jeu pour naviguer dedans.
    el.querySelector('#btn-menu')?.addEventListener('click', () => this.showTitle());
    // L'ENTRAÎNEMENT NE PUBLIE RIEN. C'est sa raison d'être : on y recommence la
    // même vague dix fois, avec l'équipement qu'on veut, et aucun de ces essais
    // n'est comparable à une partie jouée depuis le début.
    // L'ENTRAÎNEMENT NE PUBLIE JAMAIS. Le duo publie s'il y a un pilote — jouer
    // à l'invitation d'un copain sans compte reste possible, ça ne laisse
    // simplement pas de trace au tableau.
    if (this.score > 0 && pilot && this.variante !== 'entrainement') this._archive(el, pilot);
  }

  // Écrit la partie — score, nom, et l'enregistrement qui permettra de la revoir.
  async _archive(el, pilot) {
    let replay;
    try {
      replay = await this.enregistreur.termine({
        mode: this.mode,
        seed: this.seed,
        pilote: pilot.name,
      });
    } catch {
      replay = null; // un enregistrement raté ne doit jamais coûter le score
    }
    const {
      id,
      rang,
      classement: table,
    } = enregistrePartie({
      name: pilot.name,
      score: this.score,
      wave: this.wave,
      duree: replay?.duree || 0,
      mode: this.modeTableau,
      replay,
    });
    // Le local d'abord, le serveur ensuite : la partie est déjà en sûreté sur
    // l'appareil quand on tente de la publier, donc une panne réseau ne coûte rien.
    reseau.enFile(partieParId(id));
    reseau.pousse().then(() => this._rafraichitPantheon(el, '#go-lb', this.modeTableau));

    if (!el.isConnected) return;
    const ligne = el.querySelector('#go-pilot');
    if (ligne) {
      const local =
        rang > 0
          ? `${esc(pilot.name)} — inscrit au panthéon <b class="gold">n°${rang}</b>`
          : `${esc(pilot.name)} — pas encore dans le top 10, retente !`;
      // UN PILOTE QUI N'EST PAS INSCRIT NE LE SAIT PAS. Sa partie part dans la file
      // d'envoi, la file attend un jeton qui n'existe pas, et le panthéon commun
      // reste vide sans que rien ne l'explique — c'est exactement ce qu'on nous a
      // signalé. Tous les pilotes créés avant l'arrivée du serveur sont dans ce cas.
      ligne.innerHTML = reseau.estInscrit(pilot.name)
        ? local
        : `${local}<button class="btn-ghost go-inscrire" id="go-inscrire">↑ Publier mes scores en ligne</button>`;
      el.querySelector('#go-inscrire')?.addEventListener('click', () =>
        this._inviteInscription(el, pilot)
      );
    }
    const lb = el.querySelector('#go-lb');
    if (lb) {
      lb.innerHTML = this._leaderboardHtml(table, rang, this.mode);
      this._brancheRejeux(lb);
    }
    void id;
  }

  // Cent vagues franchies. C'est rare, et ça doit se voir.
  showVictoire() {
    if (this.rejeu) return;
    if (this.mode !== 'survie') return this.showMissionComplete();
    this.state = 'gameover';
    this.audio.setMode('shop');
    this.audio.waveStart();
    this.hud.root.classList.add('hidden');
    if (this.score > this.hiscore) this.hiscore = this.score;
    const pilot = activePilot();
    const el = this._screen(`
      <div class="screen gameover">
        <div class="go-record">★ ${SURVIE.vagues} VAGUES ★</div>
        <div class="go-title">Vous êtes passé</div>
        <div class="go-stats">
          <div><span class="hud-label">Score</span><b class="gold">${this.score}</b></div>
          <div><span class="hud-label">Vagues</span><b>${SURVIE.vagues}</b></div>
          <div><span class="hud-label">Pilote</span><b>${esc(pilot?.name || '—')}</b></div>
        </div>
        <div class="go-pilot" id="go-pilot">Inscription au tableau de survie…</div>
        <div class="title-lb">
          <div class="lb-title">— Survie —</div>
          <div id="go-lb">${this._leaderboardHtml(classementConnu('survie'), -1, 'survie')}</div>
        </div>
        <div class="title-menu">
          <button class="btn-secondary" id="btn-share">📣 Le dire aux copains</button>
          <button class="btn-launch" id="btn-replay">Rejouer${IS_TOUCH ? '' : ' <span class="key-hint">Espace</span>'}</button>
          <button class="btn-ghost" id="btn-menu">← Menu principal</button>
        </div>
      </div>
    `);
    el.querySelector('#btn-share').addEventListener('click', () => {
      this._share(
        `🏁 ${pilot?.name || 'Un pilote'} a franchi les ${SURVIE.vagues} vagues de la Survie sur HYPERNOVA — ${this.score} points. Qui suit ?`
      );
    });
    el.querySelector('#btn-replay').addEventListener('click', () => this._replay());
    // Sans cette sortie, changer de mode ou de pilote après une partie obligeait à
    // recharger la page — c'est-à-dire à quitter le jeu pour naviguer dedans.
    el.querySelector('#btn-menu')?.addEventListener('click', () => this.showTitle());
    if (pilot) this._archive(el, pilot);
  }

  async _share(text) {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      this.hud.announce('Défi copié !', 'Collez-le à vos copains', 1600);
    } catch {
      // Partage annulé par l'utilisateur : rien à faire.
    }
  }

  // ---- Cycle de vie d'une partie ----

  // LE CHOIX DE COQUE, À CHAQUE PARTIE. Pas à la création du pilote : il faut
  // pouvoir essayer. Trois coques qu'on ne peut comparer qu'en les jouant, et un
  // engagement qui ne dure que le temps d'une partie.
  // UNE COQUE À LA FOIS, ET ON LA VOIT.
  //
  // Les trois fiches côte à côte ne marchaient pas, pour deux raisons qui se
  // voyaient à l'écran. Le vaisseau de démonstration est dessiné au centre par la
  // caméra du jeu, donc EXACTEMENT sur la fiche du milieu — et on ne peut pas le
  // déplacer : la caméra est presque au zénith, monter le vaisseau de quatre unités
  // ne le remonte que de trente-sept pixels. C'est l'écran qui doit s'écarter, pas
  // le vaisseau.
  //
  // Surtout, la fiche ne se montrait qu'au SURVOL. Sur un téléphone il n'y a pas de
  // survol : le premier joueur du jeu, celui pour qui il est écrit, n'aurait jamais
  // vu que la première des trois coques. C'est le même défaut que sur l'écran de
  // profil, et la même correction — on choisit ce qu'on voit.
  // Ce qu'on est en train de jouer, en une ligne : le mode et sa variante. Trois
  // écrans l'affichent, il n'y a donc qu'un endroit où l'écrire.
  _sousTitreMode(mode, variante = this.variante) {
    const base = mode === 'survie' ? `Survie · ${SURVIE.vagues} vagues` : 'Arcade';
    if (variante === 'entrainement') return `${base} · Entraînement`;
    if (variante === 'duo') return `${base} · À deux`;
    return base;
  }

  // TROIS FAÇONS DE JOUER LE MÊME MODE.
  //
  // Le titre n'offrait que deux boutons, et chacun lançait directement une partie
  // en solo. Les trois variantes sont orthogonales au mode — on peut s'entraîner
  // en survie comme en classique, et jouer à deux dans les deux — d'où un menu à
  // deux niveaux plutôt que six boutons côte à côte, qui ne diraient plus ce qui
  // change de ce qui reste pareil.
  //
  // La touche Espace continue de lancer une partie d'arcade en solo : c'est le
  // chemin le plus fréquent, et il ne doit pas coûter un clic de plus qu'avant.
  // L'INVITATION À INSTALLER, sur l'écran d'accueil et nulle part ailleurs.
  //
  // Discrète, en bas, à côté du numéro de version : ce n'est pas une bannière
  // qui recouvre le jeu, c'est une ligne qu'on remarque quand on cherche quoi
  // faire. Et elle se ferme pour de bon — une invitation qui revient est une
  // invitation qu'on apprend à ignorer.
  _brancheInstallation(el) {
    const zone = el.querySelector('#title-install');
    if (!zone) return;
    const peint = () => {
      if (!zone.isConnected) return;
      const forme = this.installation.forme;
      zone.hidden = !forme;
      if (!forme) return;
      zone.innerHTML = '';
      const b = document.createElement('button');
      b.className = 'btn-ghost install-oui';
      b.textContent = '⤓ Installer sur l’écran d’accueil';
      b.addEventListener('click', async () => {
        this.audio.uiTick?.();
        if (forme === 'native') {
          const issue = await this.installation.propose();
          // Un refus au niveau du système est une réponse : on n'insiste pas.
          if (issue !== 'accepted') this.installation.refuse();
          peint();
        } else {
          this._montreInstallPomme();
        }
      });
      const non = document.createElement('button');
      non.className = 'btn-ghost install-non';
      non.textContent = '✕';
      non.title = 'Ne plus proposer';
      non.addEventListener('click', () => {
        this.installation.refuse();
        peint();
      });
      zone.append(b, non);
    };
    // Le crochet du navigateur peut arriver après l'affichage de l'écran.
    this.installation.onChangement = peint;
    peint();
  }

  // LE CAS D'APPLE. Safari n'a jamais implémenté le crochet d'installation et
  // n'expose aucun moyen de déclencher l'ajout depuis une page : il reste
  // Partager puis « Sur l'écran d'accueil ». On ne peut pas proposer, on ne peut
  // qu'expliquer — et le dire franchement vaut mieux qu'un bouton qui ne ferait
  // rien.
  _montreInstallPomme() {
    // Le bouton Partager n'est pas au même endroit selon l'appareil et le
    // navigateur — bas de l'écran sur iPhone en Safari, haut sur iPad, dans le
    // menu ailleurs. Une instruction fausse est pire qu'une instruction vague :
    // elle envoie chercher là où il n'y a rien.
    const ou = {
      iphone: 'la barre du bas',
      ipad: 'la barre du haut',
      'ios-autre': 'le menu de votre navigateur',
    }[this.installation.appareil];
    const boite = document.createElement('div');
    boite.className = 'install-pomme';
    boite.innerHTML = `
      <div class="install-carte">
        <h3>Poser HYPERNOVA sur l’écran d’accueil</h3>
        <p>Sur iPhone et iPad, c’est le navigateur qui s’en charge — le jeu ne
        peut pas le faire à votre place.</p>
        <ol>
          <li>Touchez <b>Partager</b> <span class="install-ico">⤴</span>, dans ${ou}.</li>
          <li>Faites défiler jusqu’à <b>Sur l’écran d’accueil</b>.</li>
          <li>Touchez <b>Ajouter</b>.</li>
        </ol>
        <p class="install-note">Le jeu s’ouvrira alors en plein écran, sans barre
        d’adresse, et fonctionnera même sans réseau.</p>
        <button class="btn-primary" id="install-ok">J’ai compris</button>
      </div>`;
    this.overlayRoot.append(boite);
    const ferme = () => boite.remove();
    boite.querySelector('#install-ok').addEventListener('click', ferme);
    boite.addEventListener('click', (e) => {
      if (e.target === boite) ferme();
    });
  }

  // Le lien reçu se consomme UNE FOIS, quand on sait qui l'ouvre. Sans pilote on
  // le garde : l'enfant vient peut-être d'arriver et va s'inscrire dans la
  // minute, et lui faire perdre l'invitation de son copain serait bête.
  // Le canal reste ouvert tant qu'on est identifié : c'est lui qui dit quand un
  // copain arrive. Sans pilote, il n'y a personne à annoncer et rien à ouvrir.
  ouvreCanalAmis() {
    if (!jeton()) return;
    // Le journal apprend QUI joue et sur QUELLE version : sans ça, un défaut
    // remonté ne se rattache à rien.
    poseContexte({ pilote: activePilot()?.name || null, version: __VERSION__ });
    this.duo.r = {
      ...this.duo.r,
      onPresence: (l) => this._surPresence(l),
      onSignal: (de, sujet, d) => this._surSignal(de, sujet, d),
    };
    this.duo.connecte({ nom: activePilot()?.name, mode: this.mode, jeton: jeton() });
  }

  // UN COPAIN VIENT D'ARRIVER. On le dit une fois, discrètement, et seulement
  // pour les nouveaux venus : réannoncer à chaque battement de douze secondes
  // ceux qui sont là depuis une heure serait le meilleur moyen qu'on cesse de
  // lire les annonces.
  _surPresence(l) {
    const avant = this._presence || {};
    this._presence = l;
    const amis = new Set((this._amis?.amis || []).map((a) => a.nom));
    for (const nom of Object.keys(l)) {
      if (avant[nom] || !amis.has(nom)) continue;
      this.hud.announce(`${nom} est en ligne`, l[nom].partie ? 'en pleine partie' : '', 2600);
    }
    // Le nombre d'amis connectés se lit sur l'écran d'accueil sans y entrer.
    const pastille = this.overlayRoot.querySelector('#amis-pastille');
    if (pastille) this._rafraichitPastilleAmis(this.overlayRoot);
  }

  async _consommeLienAmi() {
    if (!this._lienAmi || !jeton()) return;
    const code = this._lienAmi;
    this._lienAmi = null;
    const r = await ouvreLien(code);
    if (!r.ok) {
      this.hud.announce(
        'Lien périmé',
        r.erreur === 'soi-meme' ? 'C’est votre propre lien' : 'Ce lien ne vaut plus',
        2600
      );
      return;
    }
    this._amis = r;
    this.hud.announce(
      r.deja ? 'Déjà copains' : 'Nouveau copain',
      `${r.nom} est dans votre liste`,
      2800
    );
  }

  // REGARDER LA PARTIE D'UN COPAIN.
  //
  // C'est le système de REJEU, mais en cours d'écriture. L'hôte envoie son
  // instantané de vague puis ses commandes au fil de l'eau ; le spectateur
  // restaure et rejoue. Tout le code existe déjà et il est éprouvé depuis des
  // mois — c'est ce qui rend cette fonction si peu coûteuse, alors que basculer
  // une partie solo en duo au milieu d'une vague aurait demandé du transfert
  // d'état en vol, c'est-à-dire le genre de chose qui casse en silence.
  //
  // Quelques octets par image, et le spectateur voit exactement la même partie :
  // mêmes ennemis, mêmes tirs, même score.

  // Le canal des amis porte deux conversations : la voix et le spectacle. On
  // trie ici, et la voix reçoit ce qui la concerne.
  _surSignal(de, sujet, d) {
    switch (sujet) {
      case 'regarde':
        return this._demandeDeRegard(de);
      case 'regard-oui':
        return this._commenceARegarder(de);
      case 'regard-non':
        clearTimeout(this._attenteRegard);
        this._ditAmis(`${de} préfère jouer tranquille.`);
        return this.hud.announce('Refusé', `${de} préfère jouer tranquille`, 2400);
      case 'regard-fin':
        this._regardeurs?.delete(de);
        return;
      // ---- REJOINDRE UNE PARTIE EN COURS ----
      case 'rejoindre':
        return this._demandeDeRejoindre(de, d);
      case 'rejoindre-oui':
        return this._rejoindreAccepte(de, d);
      case 'rejoindre-non':
        this._ditRegard(`${de} préfère finir seul.`);
        return this.hud.announce('Refusé', `${de} préfère finir sa partie seul`, 2400);
      // Les commandes du pas verrouillé, quand on joue à deux SANS salon.
      case 'c':
        if (this.duo.direct === de) this.duo.recues.set(d.f, d.d);
        return;
      // La vérification croisée, et sa réparation.
      case 'emp':
        return this._recoisEmpreinte(de, d);
      case 'resync':
        // L'autre a vu qu'on avait divergé : on lui enverra notre état au début
        // du prochain tableau, comme on le fait pour un spectateur.
        this._doitResync = de;
        return;
      case 'resync-etat':
        if (this.variante !== 'duo' || this.duo.direct !== de) return;
        this._restaure(d);
        this._resyncDemande = false;
        note('resync', { ou: `vague ${this.wave}`, avec: de });
        this.hud.announce('Resynchronisé', de, 1800);
        return;
      case 'vue':
        if (this.spectateur?.de !== de) return;
        // AVANT de restaurer : est-ce qu'on avait raison ? C'est le seul moment
        // du jeu où l'on connaît la vérité de l'autre machine.
        if (this.spectateur.vue) this._verifieSynchro(d, de);
        this._restaure(d);
        this.spectateur.vue = true;
        this.spectateur.file.length = 0;
        this.spectateur.amorti = false;
        // La vague commence : on cesse d'annoncer une attente.
        this._ditRegard(`👁 Vous regardez ${de}`);
        // `_restaure` a rappelé `startWave`, qui repose l'état à « playing ».
        // Et si l'on avait demandé à JOUER, c'est le moment : l'état qu'on vient
        // de restaurer est exactement celui de l'hôte.
        if (this._duoEnVol?.moi === 1) this._basculeEnDuo();
        return;
      case 'vc':
        // La file est bornée À LA RÉCEPTION aussi : pendant une pause, la boucle
        // de jeu ne tourne pas du tout, donc personne n'irait la vider. Elle
        // grossirait tout le temps que dure la pause, sans limite.
        if (this.spectateur?.de === de) {
          const f = this.spectateur.file;
          if (f.length > Game.RETARD_MAX * 2) f.length = 0;
          f.push(d);
        }
        return;
      default:
        return this.voix.recois(de, sujet, d);
    }
  }

  // On demande la permission. Le copain répond, et c'est lui qui décide.
  // LE RETOUR PASSE PAR L'ÉCRAN, PAS PAR LE HUD.
  //
  // `hud.announce` était invisible ici : l'écran des copains masque le HUD, comme
  // tous les écrans de menu. Le bouton envoyait donc bien sa demande et ne
  // disait rien — c'est-à-dire qu'il « ne faisait rien » pour celui qui appuie.
  //
  // Et il faut une SUITE : sans réponse au bout de quelques secondes, on doit
  // savoir que le copain n'a pas vu ou n'a pas voulu, plutôt que de rester devant
  // un bouton muet.
  demandeARegarder(nom) {
    this.duo.signale(nom, 'regarde', null);
    this._ditAmis(`Demande envoyée à ${nom} — il doit accepter…`);
    clearTimeout(this._attenteRegard);
    this._attenteRegard = setTimeout(() => {
      if (!this.spectateur) this._ditAmis(`${nom} n'a pas répondu.`);
    }, 14000);
  }

  // La ligne d'état de l'écran des copains, quand il est affiché.
  _ditAmis(texte) {
    const el = this.overlayRoot.querySelector('#amis-sous');
    if (el) el.textContent = texte;
  }

  // ---- LA DÉTECTION DE DÉSYNCHRONISATION -------------------------------------
  //
  // UN DÉFAUT DE SYNCHRONISATION NE LAISSE AUCUNE TRACE, et c'est ce qui le rend
  // si pénible : les deux machines continuent de tourner, chacune persuadée
  // d'avoir raison, et le joueur ne peut dire que « ça a déraillé ». Pour le
  // corriger il faut savoir QUAND, ENTRE QUI, et DE COMBIEN.
  //
  // Or il existe un endroit où l'on connaît la vérité sans rien ajouter au
  // réseau : le début de chaque vague. L'hôte y envoie son état complet, et le
  // spectateur le restaure. Avant de le restaurer, on peut donc comparer ce
  // qu'on avait simulé de son côté avec ce que l'hôte dit réellement. Toute
  // différence est une désynchronisation, mesurée, datée, chiffrée — et corrigée
  // dans la foulée puisqu'on restaure juste après.
  //
  // C'est gratuit : aucun octet de plus ne circule.

  // Ce qu'on compare. Pas l'état entier — il contient des tableaux entiers de
  // positions — mais les quelques nombres dont un écart trahit tout le reste.
  _empreinte(e) {
    if (!e) return null;
    return {
      vague: e.w,
      score: e.score,
      vies: e.vies,
      credits: e.credits,
      // La position du vaisseau au centième : en dessous, on signalerait le bruit
      // de la virgule flottante plutôt que de vraies divergences.
      x: Math.round((e.vaisseau?.[0] ?? 0) * 100) / 100,
      z: Math.round((e.vaisseau?.[2] ?? 0) * 100) / 100,
    };
  }

  // Compare ce que j'avais simulé avec ce que l'hôte affirme, et le dit si ça
  // diffère. Appelée juste AVANT la restauration, donc l'écart est corrigé
  // aussitôt — on le note pour le comprendre, pas pour le subir.
  _verifieSynchro(vue, de) {
    const sien = this._empreinte(vue);
    const mien = this._empreinte(this._instantane());
    if (!sien || !mien) return;
    const ecarts = {};
    for (const cle of Object.keys(sien)) {
      if (sien[cle] !== mien[cle]) ecarts[cle] = { lui: sien[cle], moi: mien[cle] };
    }
    // La vague, elle, diffère légitimement : on peut arriver en cours de route,
    // ou avoir été resynchronisé après un retard. Seule elle ne prouve rien.
    const cles = Object.keys(ecarts).filter((c) => c !== 'vague');
    if (!cles.length) return;
    note('desynchro', {
      ou: `vague ${vue.w}`,
      quoi: cles.join(','),
      avec: de,
      mode: this.mode,
      variante: this.variante,
      ecarts,
    });
  }

  // ---- LA VÉRIFICATION CROISÉE, À DEUX ---------------------------------------
  //
  // LE SPECTATEUR A UN RENDEZ-VOUS, LE DUO N'EN A AUCUN.
  //
  // Celui qui regarde reçoit l'état complet de l'hôte à chaque vague : il suffit
  // de comparer avant de restaurer, et l'on sait tout. À DEUX, personne n'envoie
  // jamais son état — les deux machines partent de la même graine et n'échangent
  // que des commandes. C'est ce qui rend le jeu à deux si économe, et c'est aussi
  // ce qui fait qu'une divergence peut y courir jusqu'à la fin de la partie sans
  // que rien ne la signale.
  //
  // On comble le trou avec ce qu'on a déjà : une EMPREINTE, quelques nombres,
  // envoyée une fois par seconde sur le canal qui porte déjà les commandes. Celui
  // qui la reçoit la compare à ce qu'il avait, lui, à cette image-là.
  //
  // Pourquoi pas un serveur qui arbitre : il ne simule pas la partie. Il faudrait
  // qu'il fasse tourner le jeu entier chez lui pour trancher, ce qui coûterait
  // exactement ce qui fait la valeur du système actuel — des rejeux vérifiables
  // et quelques octets par image au lieu de kilo-octets.

  // Tous les combien on s'envoie une empreinte. Une par seconde : assez pour
  // attraper une divergence avant qu'elle n'ait tout emporté, assez rare pour ne
  // rien coûter.
  static EMPREINTE_TOUS_LES = 60;
  // Combien d'empreintes on garde en attendant celle de l'autre. Elle arrive avec
  // le retard du réseau, donc après l'image qu'elle décrit.
  static EMPREINTES_GARDEES = 240;

  // Ce qu'on compare : les quelques nombres dont un écart trahit tout le reste.
  // Pas les positions de chaque ennemi — ce serait plus sûr et cent fois plus
  // cher, alors qu'un score qui diverge suffit à dire que le reste a divergé.
  _empreinteDuo() {
    const p = this.player.position;
    const q = this.joueur2?.position;
    return [
      this.wave,
      this.score | 0,
      this.lives | 0,
      this.enemies.list.length,
      Math.round(p.x * 100),
      Math.round(p.z * 100),
      Math.round((q?.x ?? 0) * 100),
      Math.round((q?.z ?? 0) * 100),
    ];
  }

  // Appelée à chaque image du pas verrouillé, chez les deux joueurs.
  _croiseEmpreintes(frame) {
    if (frame % Game.EMPREINTE_TOUS_LES !== 0) return;
    if (!this._empreintes) this._empreintes = new Map();
    const mienne = this._empreinteDuo();
    this._empreintes.set(frame, mienne);
    // On oublie les vieilles : sans ça, une partie d'une heure garderait trois
    // mille six cents tableaux pour rien.
    if (this._empreintes.size > Game.EMPREINTES_GARDEES) {
      const vieux = frame - Game.EMPREINTE_TOUS_LES * Game.EMPREINTES_GARDEES;
      for (const f of this._empreintes.keys()) if (f < vieux) this._empreintes.delete(f);
    }
    const pair = this.duo.direct || this.bord2?.nom;
    if (pair) this.duo.signale(pair, 'emp', { f: frame, e: mienne });
  }

  // L'empreinte de l'autre vient d'arriver. Elle décrit une image qu'on a déjà
  // jouée : on la retrouve et on compare.
  _recoisEmpreinte(de, d) {
    if (!d || !this._empreintes) return;
    const mienne = this._empreintes.get(d.f);
    if (!mienne) return; // trop vieille, ou pas encore atteinte : on ne conclut rien
    this._empreintes.delete(d.f);
    const sienne = d.e;
    if (!Array.isArray(sienne) || sienne.length !== mienne.length) return;

    const NOMS = ['vague', 'score', 'vies', 'ennemis', 'x', 'z', 'x2', 'z2'];
    const ecarts = {};
    for (let i = 0; i < mienne.length; i++) {
      if (mienne[i] !== sienne[i]) ecarts[NOMS[i]] = { lui: sienne[i], moi: mienne[i] };
    }
    // À deux, les positions sont SYMÉTRIQUES : mon vaisseau est son second, et
    // inversement. Une différence sur x/x2 n'est donc pas une divergence, c'est
    // le point de vue. On ne compare que ce qui doit être identique des deux
    // côtés — et le score, qui est celui de chacun, en fait partie pour la même
    // raison : chacun compte le sien.
    for (const cle of ['x', 'z', 'x2', 'z2', 'score', 'vies']) delete ecarts[cle];
    const cles = Object.keys(ecarts);
    if (!cles.length) return;

    note('desynchro', {
      ou: `vague ${this.wave} image ${d.f}`,
      quoi: cles.join(','),
      avec: de,
      mode: this.mode,
      variante: 'duo',
      ecarts,
    });
    // ET ON SE REPARLE AU PROCHAIN TABLEAU. Détecter sans réparer ne servirait
    // qu'à écrire de belles lignes de journal : celui qui a rejoint — le second —
    // demande l'état de l'autre, exactement comme un spectateur.
    if (this.duoMoi === 1 && !this._resyncDemande) {
      this._resyncDemande = true;
      this.duo.signale(de, 'resync', null);
      this.hud.announce('Resynchronisation', 'au prochain tableau', 2000);
    }
  }

  // ---- REJOINDRE UNE PARTIE EN COURS -----------------------------------------
  //
  // LA BASCULE SE FAIT À LA FRONTIÈRE D'UNE VAGUE, ET NULLE PART AILLEURS.
  //
  // Passer une partie solo à deux au milieu d'un combat demanderait de transférer
  // l'état en vol — la position de chaque ennemi, chaque balle, chaque gemme —
  // c'est-à-dire le genre de chose qui casse en silence. Or il existe déjà un
  // point de rendez-vous, éprouvé, où l'hôte envoie son état complet et où le
  // spectateur le restaure : le début de chaque vague. C'est celui-là qu'on
  // emprunte. Le copain attend donc au plus une vague, et la bascule ne coûte
  // aucun code de transfert.
  //
  // Le pas verrouillé, lui, ne change pas d'une ligne : seul son tuyau change —
  // le canal des amis au lieu d'un salon. Voir `duo.publie`.

  // Chez celui qui regarde : on demande à jouer.
  demandeARejoindre() {
    const qui = this.spectateur?.de;
    if (!qui) return;
    // ON EMPORTE SA PROPRE COQUE. En regardant, `this.coque` est celle de
    // l'hôte : c'est son état qu'on restaure à chaque vague. Sans cet échange,
    // celui qui rejoint se retrouvait à piloter le vaisseau de l'autre — et
    // l'hôte le voyait arriver dans un double du sien.
    this.duo.signale(qui, 'rejoindre', { coque: this._coqueAMoi || 'orion' });
    this._ditRegard(`Demande envoyée à ${qui}…`);
    this.hud.announce('Demande envoyée', `${qui} doit accepter`, 2200);
  }

  // Chez l'hôte : un spectateur veut prendre les commandes du second vaisseau.
  // On ne l'accepte JAMAIS d'office — la partie est la sienne, et jouer à deux
  // change tout : les ennemis durcissent, et le score ne va plus au même tableau.
  _demandeDeRejoindre(qui, d) {
    if (this.variante === 'duo') return this.duo.signale(qui, 'rejoindre-non', null);
    this._coqueDuRenfort = coqueParId(d?.coque).id;
    const barre = document.createElement('div');
    barre.className = 'voix-barre';
    barre.innerHTML = `<span class="voix-nom">${esc(qui)} veut JOUER avec vous</span>`;
    const b = (texte, classe, action) => {
      const bt = document.createElement('button');
      bt.className = classe;
      bt.textContent = texte;
      bt.addEventListener('click', () => {
        barre.remove();
        action();
      });
      barre.append(bt);
      return bt;
    };
    b('Accepter', 'btn-ghost petit voix-oui', () => this._accepteRejoindre(qui));
    b('Refuser', 'btn-ghost petit', () => this.duo.signale(qui, 'rejoindre-non', null));
    this.overlayRoot.append(barre);
    this.audio.bossAlarm?.();
  }

  _accepteRejoindre(qui) {
    // Chacun annonce la sienne : l'hôte garde la sienne, le renfort arrive avec
    // la sienne, et les deux vaisseaux sont enfin ceux qu'on croit.
    this.duo.signale(qui, 'rejoindre-oui', { coque: this.coque });
    // On note l'intention ; la bascule attend la prochaine vague.
    this._duoEnVol = { qui, moi: 0, saCoque: this._coqueDuRenfort || 'orion' };
    this.hud.announce('Renfort en approche', `${qui} entre au prochain tableau`, 2600);
    // S'IL DISPARAÎT AVANT LE RENDEZ-VOUS, ON N'Y VA PAS SEUL. Basculer en pas
    // verrouillé avec quelqu'un qui n'est plus là, c'est se figer en attendant
    // des commandes qui ne viendront jamais. Une minute est bien plus qu'il n'en
    // faut pour finir une vague ; au-delà, la promesse est caduque.
    clearTimeout(this._attenteRenfort);
    this._attenteRenfort = setTimeout(() => {
      if (this._duoEnVol?.qui !== qui) return;
      this._duoEnVol = null;
      this.hud.announce('Renfort annulé', `${qui} n'est plus là`, 2400);
    }, 60000);
  }

  // Chez celui qui regarde : c'est accepté. Même attente, même rendez-vous.
  _rejoindreAccepte(qui, d) {
    if (this.spectateur?.de !== qui) return;
    this._duoEnVol = { qui, moi: 1, saCoque: coqueParId(d?.coque).id };
    this._ditRegard(`${qui} a accepté — vous entrez au prochain tableau`);
    this.hud.announce('Accepté', `Vous entrez au prochain tableau`, 2600);
  }

  // LE RENDEZ-VOUS. Appelé des deux côtés au début d'une vague, une fois l'état
  // posé : à partir d'ici, les deux machines simulent la même chose et
  // s'échangent leurs commandes.
  _basculeEnDuo() {
    const v = this._duoEnVol;
    if (!v) return;
    this._duoEnVol = null;
    clearTimeout(this._attenteRenfort);
    // Le copain est-il toujours en ligne ? Basculer vers quelqu'un qui a fermé
    // son onglet, c'est se condamner à l'attendre.
    if (this._presence && !this._presence[v.qui]) {
      this.hud.announce('Renfort annulé', `${v.qui} s'est déconnecté`, 2400);
      return;
    }

    const moiNom = activePilot()?.name || 'MOI';
    this.variante = 'duo';
    this.duo.ouvreDirect(v.qui, v.moi);

    if (v.moi === 1) {
      // CELUI QUI ARRIVE hérite de l'état de l'hôte : le vaisseau qu'il vient de
      // restaurer est celui de l'HÔTE, pas le sien. On le déplace donc au second
      // bord, et l'on s'en fabrique un neuf.
      this.spectateur = null;
      // Le second bord, c'est l'HÔTE : il garde sa coque à lui.
      this._ouvreSecondBord({ luiNom: v.qui, luiCoque: v.saCoque || this.coque });
      this.joueur2.group.position.copy(this.player.position);
      this.bord2.score = this.score;
      this.bord2.lives = this.lives;
      this.bord2.levels = { ...this.levels };
      this.bord2.stats = computeStats(this.bord2.levels, this.surcharge);
      // ET ON REPREND SA PROPRE COQUE. Elle avait été remplacée par celle de
      // l'hôte au premier instantané restauré, puisqu'on rejouait sa partie.
      this.coque = this._coqueAMoi || 'orion';
      // Le nouveau venu arrive nu, avec ses propres vies : il n'a rien acheté.
      this.player.reset();
      this.levels = emptyLevels();
      this.stats = computeStats(this.levels, 0);
      this.lives = PLAYER.baseLives;
      this.score = 0;
      this.player.rebuild(this._fiche());
    } else {
      // Le second bord, c'est le RENFORT : il arrive avec la coque qu'il pilote.
      this._ouvreSecondBord({ luiNom: v.qui, luiCoque: v.saCoque || 'orion' });
    }
    this.duoMoi = v.moi;
    this._attenteDuo = 0;
    // IL NE REGARDE PLUS, IL JOUE. Le laisser dans la liste des spectateurs lui
    // enverrait encore l'instantané complet de l'hôte à chaque vague — qui
    // écraserait son propre vaisseau par celui de l'hôte, en pleine partie.
    this._regardeurs?.delete(v.qui);
    // On ne regarde plus : on joue. Le bandeau du spectateur n'a plus lieu d'être.
    document.getElementById('regard-barre')?.remove();
    this.duo.amorce(commandeVersTableau(commandeVide()));
    this.hud.announce('À DEUX', `${moiNom} & ${v.qui}`, 2600);
    this.audio.comboUp?.(4);
  }

  // Chez l'hôte : quelqu'un veut regarder. On ne l'accepte JAMAIS d'office —
  // savoir qu'on est observé change la façon de jouer, et c'est à l'hôte de
  // décider s'il veut d'un public.
  _demandeDeRegard(qui) {
    const barre = document.createElement('div');
    barre.className = 'voix-barre';
    barre.innerHTML = `<span class="voix-nom">${esc(qui)} veut regarder votre partie</span>`;
    const b = (texte, classe, action) => {
      const el = document.createElement('button');
      el.className = classe;
      el.textContent = texte;
      el.addEventListener('click', () => {
        barre.remove();
        action();
      });
      barre.append(el);
    };
    b('Accepter', 'btn-ghost petit voix-oui', () => this._accepteRegard(qui));
    b('Refuser', 'btn-ghost petit', () => this.duo.signale(qui, 'regard-non', null));
    document.body.append(barre);
    // Une demande qui reste à l'écran pendant une vague est une gêne : elle
    // s'efface d'elle-même, et le copain saura que c'est non.
    setTimeout(() => barre.remove(), 12000);
  }

  _accepteRegard(qui) {
    this._regardeurs = this._regardeurs || new Set();
    this._regardeurs.add(qui);
    this.duo.signale(qui, 'regard-oui', null);
    this.hud.announce(`${qui} vous regarde`, 'à la prochaine vague', 2400);
    // ON NE L'ACCROCHE PAS EN COURS DE VAGUE, ET C'EST UNE CONTRAINTE, PAS UN
    // CHOIX DE CONFORT.
    //
    // J'envoyais l'instantané tout de suite pour ne pas le faire attendre. Or
    // `_restaure` termine par `startWave` : la vague REPART de son début chez le
    // spectateur pendant qu'elle est à sa moitié chez l'hôte. Les deux
    // simulations racontent alors deux parties différentes, sans rien signaler.
    // Mesuré sur deux onglets : 875 points contre 1690, une vie contre trois.
    //
    // Un instantané ne décrit pas un instant quelconque : il décrit un DÉBUT DE
    // VAGUE. C'est ce qui fait tenir le rejeu depuis des mois, et c'est la même
    // propriété ici. Le spectateur attend donc la vague suivante — trente
    // secondes au pire — et démarre sur un point de reprise exact.
  }

  // Chez le spectateur : on est accepté, on se met en position.
  _commenceARegarder(qui) {
    clearTimeout(this._attenteRegard);
    this.quitteVitrine();
    // LA SIENNE, AVANT D'ENDOSSER CELLE DE L'AUTRE. À partir du premier
    // instantané restauré, `this.coque` sera celle de l'hôte — c'est sa partie
    // qu'on rejoue. Si l'on demande ensuite à jouer, il faut savoir quoi
    // reprendre : sans cette ligne, on repart avec le vaisseau de l'hôte.
    this._coqueAMoi = this.coque || 'orion';
    this.spectateur = { de: qui, file: [], vue: false };
    // L'ÉTAT EST « playing », ET C'EST LE POINT DE TOUT.
    //
    // J'avais donné au spectateur un état à lui, ce qui paraissait plus propre.
    // Mesuré : la reconstitution divergeait à la quatre-centième image, et
    // toujours sur une pirouette. La cause tient en une ligne — `_tryRoll`
    // commence par `if (this.state !== 'playing') return`, comme la bombe,
    // l'Overdrive et l'Appel. Le spectateur refusait donc en silence des gestes
    // que l'hôte avait bel et bien faits.
    //
    // La règle générale est celle-là : pour reconstituer une partie à
    // l'identique, il faut emprunter EXACTEMENT les mêmes chemins. Un état
    // différent est un chemin différent, et chaque garde qui le teste devient
    // une divergence. On se distingue donc par `spectateur`, jamais par l'état.
    this.state = 'playing';
    this.hud.root.classList.remove('hidden');
    this.overlayRoot.innerHTML = '';
    this.hud.announce(`Vous regardez ${qui}`, 'Ça commence à sa prochaine vague', 3000);
    this._montreBandeauRegard(qui);
  }

  _ditRegard(texte) {
    const t = document.getElementById('regard-texte');
    if (t) t.textContent = texte;
  }

  _montreBandeauRegard(qui) {
    const barre = document.createElement('div');
    barre.id = 'regard-barre';
    barre.className = 'voix-barre';
    barre.innerHTML = `<span class="voix-nom" id="regard-texte">👁 ${esc(qui)} — en attente de sa prochaine vague…</span>`;
    // REGARDER DONNE ENVIE DE JOUER, et c'est le geste suivant le plus naturel :
    // on regarde son copain se battre, et on veut y aller. Le bouton est donc là,
    // à côté du nom, et pas caché dans un menu qu'il faudrait quitter la partie
    // pour atteindre.
    const rejoindre = document.createElement('button');
    rejoindre.className = 'btn-ghost petit voix-oui';
    rejoindre.id = 'regard-rejoindre';
    rejoindre.textContent = 'Jouer avec lui';
    rejoindre.addEventListener('click', () => {
      rejoindre.disabled = true;
      this.demandeARejoindre();
    });
    barre.append(rejoindre);
    const stop = document.createElement('button');
    stop.className = 'btn-ghost petit';
    stop.textContent = 'Arrêter';
    stop.addEventListener('click', () => this.arreteDeRegarder());
    barre.append(stop);
    document.body.append(barre);
  }

  arreteDeRegarder() {
    if (!this.spectateur) return;
    this.duo.signale(this.spectateur.de, 'regard-fin', null);
    this.spectateur = null;
    this.state = 'title';
    document.getElementById('regard-barre')?.remove();
    this.enemies.clear();
    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.showTitle();
  }

  // Une image de spectacle. La file sert d'AMORTISSEUR : le réseau ne livre pas
  // soixante paquets régulièrement espacés, il en livre trois d'un coup puis
  // rien. Sans réserve, l'image saccaderait au rythme du réseau plutôt qu'à
  // celui du jeu.
  // Au-delà de ça, on ne rattrape plus : on se resynchronise. Quatre secondes de
  // retard, c'est déjà une autre partie que celle qu'on croit regarder.
  static RETARD_MAX = 240;

  _updateRegard(dtReel) {
    const sp = this.spectateur;
    if (!sp || !sp.vue) return;

    // ON NE RATTRAPE PAS LE PASSÉ, ON SE REBRANCHE SUR LE PRÉSENT.
    //
    // Quand le spectateur met en pause — ou passe son onglet en arrière-plan,
    // ce qui gèle sa boucle — l'hôte, lui, continue d'émettre. La file grossit
    // pendant tout ce temps. Au retour, l'ancien code essayait de la rejouer
    // image par image, plafonné par le rattrapage : le spectateur regardait donc
    // le passé, de plus en plus loin derrière, et ça se lit exactement comme une
    // désynchronisation. Signalé par Paul, et surtout « quand le spectateur se
    // met en pause et reprend ».
    //
    // On jette donc le retard et on attend le prochain instantané de vague —
    // c'est le point de rendez-vous qui existe déjà, celui-là même qui sert à
    // entrer en spectateur.
    if (sp.file.length > Game.RETARD_MAX) {
      sp.file.length = 0;
      sp.vue = false;
      sp.amorti = false;
      this._ditRegard(`Trop de retard — on reprend au prochain tableau`);
      return;
    }

    let n = this.duo.pas(dtReel);
    while (n-- > 0) {
      if (sp.file.length <= (sp.amorti ? 0 : 6)) {
        // On laisse la réserve se remplir avant de partir, et on s'arrête net
        // quand elle est vide plutôt que d'inventer des images.
        sp.amorti = sp.file.length > 6;
        return;
      }
      sp.amorti = true;
      tableauVersCommande(sp.file.shift(), this.cmd);
      // LE PAS VIENT DE LA COMMANDE, PAS DE L'HORLOGE.
      //
      // Passer un soixantième « rond » paraît naturel et c'est une divergence :
      // l'hôte a joué un pas QUANTIFIÉ, dont la valeur diffère de 1/60 de
      // quelques millionièmes. Mesuré, cet écart-là suffisait à faire dériver la
      // reconstitution — 1990 points contre 3165 au bout de douze secondes. La
      // commande porte le pas exact ; c'est d'ailleurs ce que fait le rejeu.
      this._updatePlaying(this.cmd.dt);
    }
  }

  // L'ÉTAT DE LA LIGNE, EN UN BANDEAU. Un appel qui sonne doit se voir quel que
  // soit l'écran — y compris en pleine vague, où c'est justement le moment où
  // l'on veut savoir qu'un copain appelle.
  _surVoix(etat, qui) {
    let barre = document.getElementById('voix-barre');
    if (etat === 'raccroche' || etat === 'refus' || etat === 'echec') {
      barre?.remove();
      if (etat === 'echec') {
        this.hud.announce('Liaison impossible', 'Votre réseau ne laisse pas passer l’appel', 3000);
      }
      return;
    }
    if (!barre) {
      barre = document.createElement('div');
      barre.id = 'voix-barre';
      barre.className = 'voix-barre';
      document.body.append(barre);
    }
    barre.innerHTML = '';
    const nom = document.createElement('span');
    nom.className = 'voix-nom';
    nom.textContent =
      etat === 'sonne'
        ? `${qui} vous appelle`
        : etat === 'appelle'
          ? `Appel de ${qui}…`
          : `En ligne avec ${qui}`;
    barre.append(nom);

    const bouton = (texte, classe, action) => {
      const b = document.createElement('button');
      b.className = classe;
      b.textContent = texte;
      b.addEventListener('click', action);
      barre.append(b);
      return b;
    };
    if (etat === 'sonne') {
      bouton('Décrocher', 'btn-ghost petit voix-oui', () => this.voix.decroche());
      bouton('Refuser', 'btn-ghost petit', () => this.voix.refuse());
    } else {
      const m = bouton(this.voix.muet ? '🔇 Muet' : '🎙 Micro', 'btn-ghost petit', () => {
        m.textContent = this.voix.basculeMuet() ? '🔇 Muet' : '🎙 Micro';
      });
      bouton('Raccrocher', 'btn-ghost petit', () => this.voix.raccroche());
    }
  }

  // La pastille sur le bouton : combien de demandes attendent une réponse, et
  // combien d'amis sont là maintenant. C'est la seule chose qui doit se voir
  // depuis l'écran d'accueil — le reste est à un clic.
  async _rafraichitPastilleAmis(el) {
    const p = el.querySelector('#amis-pastille');
    if (!p || !jeton()) return;
    const r = await mesAmis();
    if (!r.ok || !p.isConnected) return;
    this._amis = r;
    const n = r.recues?.length || 0;
    p.hidden = n === 0;
    p.textContent = n || '';
  }

  // MES COPAINS. La liste, les demandes, et le lien à coller dans un message.
  showAmis() {
    this.quitteVitrine();
    // On ouvre le canal ICI aussi, et pas seulement au titre : sans ça, arriver
    // sur cet écran par un autre chemin montre tous les copains hors ligne, ce
    // qui est faux et ne s'explique par rien à l'écran. L'appel ne coûte rien si
    // la ligne est déjà debout.
    this.ouvreCanalAmis();
    this.state = 'amis';
    this.hud.root.classList.add('hidden');
    this.player.group.visible = false;

    const el = this._screen(`
      <div class="screen amis">
        <div class="coque-haut">
          <h2 class="shop-title">Mes copains</h2>
          <div class="coque-sous" id="amis-sous">…</div>
        </div>
        <div class="amis-corps" id="amis-corps"></div>
        <!-- DEUX GESTES, ET IL FAUT SAVOIR LEQUEL FAIT QUOI AVANT D'APPUYER.
             « Inviter un copain » était le bouton principal et ouvrait le
             sélecteur de partage du système : on croyait taper un pseudo, on
             tombait sur la feuille de partage du téléphone. Le geste courant —
             ajouter quelqu'un qu'on connaît déjà par son pseudo — était relégué
             au bouton secondaire.
             Les deux ont échangé leur place et disent maintenant ce qu'ils font :
             l'un envoie une DEMANDE, l'autre envoie un LIEN. -->
        <div class="rangee amis-actes">
          <button class="btn-primary" id="amis-ajouter">+ Demander par pseudo</button>
          <button class="btn-ghost" id="amis-inviter">✉ Envoyer un lien</button>
        </div>
        <button class="btn-ghost" id="amis-back">← Retour</button>
      </div>
    `);

    const corps = el.querySelector('#amis-corps');
    const sous = el.querySelector('#amis-sous');

    const peint = (r) => {
      if (!el.isConnected) return;
      this._amis = r;
      corps.innerHTML = '';
      const enLigne = r.enLigne || this._presence || {};
      const combien = (r.amis || []).filter((a) => enLigne[a.nom]).length;
      sous.textContent = !jeton()
        ? 'Il faut un pilote pour avoir des copains.'
        : `${r.amis?.length || 0} copain(s) · ${combien} en ligne`;

      for (const d of r.recues || []) {
        const ligne = document.createElement('div');
        ligne.className = 'ami-ligne ami-demande';
        ligne.innerHTML = `<span class="ami-nom">${esc(d.nom)}</span>
          <span class="ami-etat">vous demande en ami</span>`;
        const oui = document.createElement('button');
        oui.className = 'btn-ghost petit';
        oui.textContent = 'Accepter';
        oui.addEventListener('click', async () => peint(await gesteAmi('accepter', d.nom)));
        const non = document.createElement('button');
        non.className = 'btn-ghost petit';
        non.textContent = 'Refuser';
        non.addEventListener('click', async () => peint(await gesteAmi('refuser', d.nom)));
        ligne.append(oui, non);
        corps.append(ligne);
      }

      for (const a of r.amis || []) {
        const p = enLigne[a.nom];
        const ligne = document.createElement('div');
        ligne.className = `ami-ligne${p ? ' ami-en-ligne' : ''}`;
        ligne.innerHTML = `<span class="ami-nom">${esc(a.nom)}</span>
          <span class="ami-etat">${p ? (p.partie ? 'en partie' : 'en ligne') : 'hors ligne'}</span>`;
        if (p) {
          const appel = document.createElement('button');
          appel.className = 'btn-ghost petit voix-appel';
          appel.textContent = '🎙 Parler';
          appel.addEventListener('click', () => this.voix.appelle(a.nom));
          ligne.append(appel);
          // On ne propose de regarder que ceux qui jouent : proposer de regarder
          // quelqu'un assis dans un menu ne mène nulle part.
          if (p.partie) {
            const voir = document.createElement('button');
            voir.className = 'btn-ghost petit';
            voir.textContent = '👁 Regarder';
            voir.addEventListener('click', () => this.demandeARegarder(a.nom));
            ligne.append(voir);
          }
        }
        // SES MEILLEURES PARTIES, qu'il soit en ligne ou non — c'est justement ce
        // qu'on veut regarder quand le copain n'est pas là. Le serveur ne le
        // laissera voir qu'aux amis, et l'on en est un puisqu'il est dans la liste.
        const profil = document.createElement('button');
        profil.className = 'btn-ghost petit';
        profil.textContent = '★ Ses parties';
        profil.addEventListener('click', () => this.showProfil(a.nom, () => this.showAmis()));
        ligne.append(profil);

        const retirer = document.createElement('button');
        retirer.className = 'btn-ghost petit';
        retirer.textContent = '✕';
        retirer.title = 'Retirer de mes copains';
        retirer.addEventListener('click', async () => peint(await gesteAmi('oublier', a.nom)));
        ligne.append(retirer);
        corps.append(ligne);
      }

      for (const d of r.envoyees || []) {
        const ligne = document.createElement('div');
        ligne.className = 'ami-ligne ami-attente';
        ligne.innerHTML = `<span class="ami-nom">${esc(d.nom)}</span>
          <span class="ami-etat">demande envoyée</span>`;
        corps.append(ligne);
      }

      if (!corps.children.length) {
        const vide = document.createElement('p');
        vide.className = 'salon-vide';
        vide.textContent = jeton()
          ? 'Personne encore. Envoyez votre lien à un copain : il n’a qu’à le toucher.'
          : 'Créez un pilote depuis l’écran d’accueil pour ajouter des copains.';
        corps.append(vide);
      }
    };

    el.querySelector('#amis-inviter').addEventListener('click', () => this._partageLienAmi());
    el.querySelector('#amis-ajouter').addEventListener('click', async () => {
      const nom = await this._demandeTexte(
        'Ajouter un copain',
        'Son pseudo, exactement comme il l’a écrit.'
      );
      if (!nom) return;
      const r = await gesteAmi('demander', nom);
      if (!r.ok) {
        this._ditAmis(r.erreur === 'inconnu' ? `Personne ne s'appelle ${nom}.` : 'Impossible.');
        return this.hud.announce(
          'Impossible',
          r.erreur === 'inconnu' ? 'Pseudo inconnu' : '',
          2000
        );
      }
      // ON DIT QUE C'EST PARTI. Une demande d'ami ne produit rien de visible chez
      // celui qui l'envoie — l'autre doit encore l'accepter — donc sans un mot,
      // le bouton a l'air de n'avoir rien fait.
      this._ditAmis(`Demande envoyée à ${nom}. Il doit l'accepter.`);
      peint(r);
    });
    const sortie = () => window.removeEventListener('keydown', clavier);
    const clavier = (e) => {
      if (this.state !== 'amis' || e.key !== 'Escape') return;
      sortie();
      this.showTitle();
      e.preventDefault();
    };
    window.addEventListener('keydown', clavier);
    el.querySelector('#amis-back').addEventListener('click', () => {
      sortie();
      this.showTitle();
    });

    if (this._amis) peint(this._amis);
    if (jeton()) mesAmis().then((r) => r.ok && peint(r));
    else peint({});
  }

  // LE LIEN, DANS LA FEUILLE DE PARTAGE DU TÉLÉPHONE.
  //
  // `navigator.share` ouvre le sélecteur du système : messages, WhatsApp, ce
  // qu'on veut. C'est la seule façon d'atteindre ces applications depuis une page
  // web, et c'est aussi la bonne — on ne demande aucun contact, on ne lit rien,
  // c'est l'utilisateur qui choisit à qui.
  //
  // Sur un ordinateur, `share` n'existe souvent pas : on recopie alors le lien
  // dans le presse-papiers, ce qui revient au même en un geste de plus.
  // LE PARTAGE NATIF EST RÉSERVÉ AU LIEN, ET SEULEMENT AU LIEN.
  //
  // C'est son seul usage légitime : on colle un lien dans une conversation pour
  // quelqu'un qui n'a peut-être pas encore de compte. Ajouter un copain qu'on
  // connaît déjà passe par son pseudo et par une demande d'ami — pas par la
  // feuille de partage du téléphone.
  async _partageLienAmi() {
    if (!jeton()) return this.hud.announce('Il faut un pilote', 'Créez-en un d’abord', 2200);
    const r = await monLien();
    if (!r.ok) return this.hud.announce('Lien indisponible', '', 1800);
    const lien = `${location.origin}/?ami=${r.code}`;
    const texte = `Viens jouer à HYPERNOVA avec moi : ${lien}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'HYPERNOVA', text: texte, url: lien });
        return;
      }
      await navigator.clipboard.writeText(lien);
      this.hud.announce('Lien copié', 'Collez-le dans un message', 2400);
    } catch {
      // Partage annulé : rien à faire, et surtout rien à dire.
    }
  }

  // Une saisie courte, dans un dialogue du document. Voir la régie : `prompt`
  // fige l'onglet et se désactive dans certains navigateurs.
  _demandeTexte(titre, detail) {
    return new Promise((resolve) => {
      const boite = document.createElement('div');
      boite.className = 'install-pomme';
      boite.innerHTML = `
        <div class="install-carte">
          <h3>${esc(titre)}</h3>
          <p>${esc(detail)}</p>
          <input type="text" id="dt-champ" autocomplete="off" maxlength="10" />
          <div class="rangee" style="justify-content:flex-end">
            <button class="btn-ghost" id="dt-non">Annuler</button>
            <button class="btn-primary" id="dt-oui">Valider</button>
          </div>
        </div>`;
      this.overlayRoot.append(boite);
      const champ = boite.querySelector('#dt-champ');
      const fin = (v) => {
        boite.remove();
        resolve(v);
      };
      boite.querySelector('#dt-oui').addEventListener('click', () => fin(champ.value.trim()));
      boite.querySelector('#dt-non').addEventListener('click', () => fin(null));
      champ.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fin(champ.value.trim());
        if (e.key === 'Escape') fin(null);
      });
      champ.focus();
    });
  }

  showVariante(mode) {
    this.quitteVitrine();
    this.state = 'variante';
    this.hud.root.classList.add('hidden');
    // La partie de fond vient de s'arrêter, et il resterait un vaisseau seul,
    // immobile au milieu du décor — exactement ce qu'on reprochait à l'ancien
    // écran d'accueil. On le range : tous les chemins de sortie le remontrent
    // (`player.reset()` et la pose de vitrine le rallument tous les deux).
    this.player.group.visible = false;
    const survie = mode === 'survie';
    const el = this._screen(`
      <div class="screen variantes">
        <div class="coque-haut">
          <h2 class="shop-title">${survie ? 'Survie' : 'Arcade'}</h2>
          <div class="coque-sous">${
            survie
              ? `${SURVIE.vagues} vagues d'affilée, sans boutique`
              : 'Les vagues s’enchaînent, on joue pour le score'
          }</div>
        </div>
        <div class="variante-liste">
          <button class="variante" data-v="solo">
            <span class="variante-nom">1 joueur</span>
            <span class="variante-desc">Seul aux commandes, et au panthéon.</span>
          </button>
          <button class="variante" data-v="duo">
            <span class="variante-nom">2 joueurs <em>en réseau</em></span>
            <span class="variante-desc">
              Un salon d’attente, un copain qui rejoint, et deux vaisseaux dans la même
              arène. Les ennemis sont plus durs — vous êtes deux.
            </span>
          </button>
          <button class="variante" data-v="entrainement">
            <span class="variante-nom">Entraînement</span>
            <span class="variante-desc">
              Commencez à la vague que vous voulez, avec l’équipement que vous voulez.
              Rien n’est publié au panthéon.
            </span>
          </button>
        </div>
        <button class="btn-ghost" id="variante-back">← Retour</button>
      </div>
    `);
    const clavier = (e) => {
      if (this.state !== 'variante') return;
      if (e.key !== 'Escape') return;
      quitte();
      this.showTitle();
      e.preventDefault();
    };
    const quitte = () => window.removeEventListener('keydown', clavier);
    window.addEventListener('keydown', clavier);

    for (const b of el.querySelectorAll('.variante')) {
      b.addEventListener('click', () => {
        quitte();
        this.audio.uiTick();
        const v = b.dataset.v;
        if (v === 'entrainement') this.showEntrainement(mode);
        else if (v === 'duo') this.showSalons(mode);
        else this.startRun(mode);
      });
    }
    el.querySelector('#variante-back').addEventListener('click', () => {
      quitte();
      this.showTitle();
    });
  }

  // L'ENTRAÎNEMENT. On choisit où l'on tombe, et dans quel état.
  //
  // Mourir vague 22 et devoir refaire les vingt et une premières pour réessayer,
  // c'est ce qui rend un jeu de vagues épuisant à apprendre. Ici on se pose où
  // l'on veut, équipé comme on le serait en y arrivant — et on recommence autant
  // qu'on veut, sans que rien n'atteigne le panthéon.
  //
  // L'équipement par défaut n'est pas inventé : il rejoue la mesure de
  // l'économie — deux achats et demi par vague, le moins cher d'abord — donc la
  // panoplie proposée est celle qu'on aurait vraiment. Le curseur permet ensuite
  // de s'entraîner à l'envers : la vague 25 avec le vaisseau de la vague 3, pour
  // voir. C'est un mode d'essai, il n'a pas à être juste.
  // LE SALON D'ATTENTE.
  //
  // Un écran, trois états, et c'est tout : on regarde qui attend, on ouvre sa
  // propre table, ou on est à table et le compte à rebours tourne. Pas de
  // recherche de partie automatique — on joue avec un copain qu'on connaît, et
  // voir son pseudo apparaître dans la liste vaut mieux qu'un appariement qui
  // décide à votre place.
  //
  // Le pilote n'est pas obligatoire : le pseudo sert à s'afficher chez l'autre,
  // pas à publier. Un enfant qui n'a pas encore de compte peut jouer avec son
  // frère.
  showSalons(mode) {
    this.quitteVitrine();
    this.state = 'salons';
    this.hud.root.classList.add('hidden');
    this.player.group.visible = false;

    const nom = activePilot()?.name || 'INVITÉ';
    const el = this._screen(`
      <div class="screen salons">
        <div class="coque-haut">
          <h2 class="shop-title">Jouer à deux</h2>
          <div class="coque-sous">${this._sousTitreMode(mode, 'duo')}</div>
        </div>
        <div class="salon-etat" id="salon-etat">Connexion au serveur…</div>
        <div class="salon-liste" id="salon-liste"></div>
        <div class="rangee" id="salon-actes"></div>
        <button class="btn-ghost" id="salon-back">← Retour</button>
      </div>
    `);

    const zoneEtat = el.querySelector('#salon-etat');
    const zoneListe = el.querySelector('#salon-liste');
    const zoneActes = el.querySelector('#salon-actes');
    const dit = (t) => {
      if (el.isConnected) zoneEtat.textContent = t;
    };

    const duo = this.duo;
    // La coque choisie pour cette table. Elle voyage jusqu'à l'autre joueur :
    // on doit savoir avec quoi il vole avant que ça commence.
    let coque = this._entrainement?.coque || 'orion';

    const peintActes = () => {
      if (!el.isConnected) return;
      zoneActes.innerHTML = '';
      const coques = document.createElement('div');
      coques.className = 'entr-coques';
      for (const c of COQUES) {
        const b = document.createElement('button');
        b.className = `entr-coque${c.id === coque ? ' on' : ''}`;
        b.innerHTML = `<b>${c.nom}</b><span>${esc(c.titre)}</span>`;
        b.addEventListener('click', () => {
          coque = c.id;
          duo.choisitCoque(coque);
          this.audio.uiTick();
          peintActes();
        });
        coques.append(b);
      }
      zoneActes.append(coques);
      if (duo.etat === 'hall') {
        const ouvrir = document.createElement('button');
        ouvrir.className = 'btn-primary';
        ouvrir.textContent = 'Ouvrir une table';
        ouvrir.addEventListener('click', () => {
          this.audio.buy();
          duo.choisitCoque(coque);
          duo.cree();
        });
        zoneActes.append(ouvrir);
      } else if (duo.etat === 'salon') {
        const fermer = document.createElement('button');
        fermer.className = 'btn-ghost';
        fermer.textContent = 'Fermer ma table';
        fermer.addEventListener('click', () => {
          duo.quitte();
          peintTout();
        });
        zoneActes.append(fermer);
      }
    };

    const peintListe = (l) => {
      if (!el.isConnected) return;
      zoneListe.innerHTML = '';
      if (duo.etat === 'salon') return;
      if (!l?.length) {
        const vide = document.createElement('p');
        vide.className = 'salon-vide';
        vide.textContent =
          'Personne n’attend. Ouvrez une table : votre copain la verra apparaître.';
        zoneListe.append(vide);
        return;
      }
      for (const s of l) {
        const b = document.createElement('button');
        b.className = 'salon-ligne';
        b.innerHTML = `<span class="salon-nom">${esc(s.nom)}</span>
          <span class="salon-coque">${esc(coqueParId(s.coque).nom)}</span>
          <span class="salon-go">Rejoindre →</span>`;
        b.addEventListener('click', () => {
          this.audio.buy();
          duo.choisitCoque(coque);
          duo.rejoint(s.id);
        });
        zoneListe.append(b);
      }
    };

    const peintTout = () => {
      peintActes();
      if (duo.etat === 'salon') {
        dit('Votre table est ouverte. On attend un deuxième pilote…');
        zoneListe.innerHTML = '';
      } else {
        dit('Choisissez une table, ou ouvrez la vôtre.');
        duo.lister();
      }
    };

    // On AJOUTE les rappels du salon sans effacer ceux du canal des amis : la
    // même connexion sert aux deux, et remplacer l'objet entier couperait la
    // présence dès qu'on entre ici.
    duo.r = {
      ...duo.r,
      onEtat: (e, avant) => {
        if (e === 'hall') peintTout();
        else if (e === 'ferme' && avant !== 'ferme') dit('Connexion perdue.');
      },
      onSalons: (l) => peintListe(l),
      onSalon: () => peintTout(),
      onPair: (p) => dit(`${p.nom} arrive, en ${coqueParId(p.coque).nom}.`),
      onCompte: (n) => {
        this.audio.uiTick?.();
        dit(`Décollage dans ${n}…`);
      },
      onGo: (m) => this._lanceDuo(m, mode),
      onParti: (p) => {
        if (this.state === 'playing' && this.variante === 'duo') return this._duoSeul();
        dit(p.hote ? 'La table s’est fermée.' : 'Votre copain est parti. La table reste ouverte.');
      },
      onErreur: (code) =>
        dit(
          code === 'salon-indisponible'
            ? 'Cette table vient de se remplir.'
            : 'Le serveur ne répond pas.'
        ),
    };
    duo.connecte({ nom, mode, jeton: jeton() });
    // LA CONNEXION EST DÉJÀ OUVERTE, ET C'EST LE PIÈGE.
    //
    // Depuis que le canal des amis s'ouvre au démarrage, `connecte` n'ouvre plus
    // rien quand on entre ici : il redemande seulement la liste. `onEtat('hall')`
    // ne part donc jamais, et l'écran restait sur « Connexion au serveur… » alors
    // qu'il était connecté depuis une minute — en affichant, juste en dessous, la
    // liste vide qu'il venait de recevoir. On peint tout de suite si la ligne est
    // déjà debout.
    if (duo.etat === 'hall' || duo.etat === 'salon') peintTout();

    const clavier = (e) => {
      if (this.state !== 'salons' || e.key !== 'Escape') return;
      sortie();
      this.showVariante(mode);
      e.preventDefault();
    };
    const sortie = () => {
      window.removeEventListener('keydown', clavier);
      // On ne FERME pas : cette connexion porte aussi la présence des amis. On
      // quitte seulement la table, si l'on en occupait une.
      if (duo.salonId) duo.quitte();
    };
    window.addEventListener('keydown', clavier);
    el.querySelector('#salon-back').addEventListener('click', () => {
      sortie();
      this.showVariante(mode);
    });
  }

  // LE DÉCOLLAGE À DEUX.
  //
  // Les deux clients arrivent ici au même instant, avec la même graine et le même
  // tableau de joueurs. À partir de là ils ne se parlent plus que par commandes :
  // tout le reste — ennemis, tirs, score — est recalculé des deux côtés à partir
  // de ce point de départ commun.
  _lanceDuo(m) {
    const moi = m.joueurs[m.moi];
    const lui = m.joueurs[m.moi === 0 ? 1 : 0];
    this.startRun(m.mode, moi.coque, {
      variante: 'duo',
      graine: m.graine,
      duo: { moi: m.moi, moiNom: moi.nom, luiNom: lui.nom, luiCoque: lui.coque },
    });
    // Les premières images n'ont pas de commande à échanger — voir `amorce`.
    this.duo.amorce(commandeVersTableau(commandeVide()));
    this.hud.announce('Décollage', `${moi.nom} & ${lui.nom}`, 2000);
  }

  // LE COPAIN EST PARTI, LA PARTIE CONTINUE.
  //
  // On ne renvoie pas au menu : celui qui reste est peut-être à sa meilleure
  // vague, et perdre sa partie parce que l'autre a fermé son onglet serait la
  // pire façon de découvrir le jeu à deux. La partie redevient donc SOLO — le
  // second vaisseau s'efface, la difficulté redescend à la vague suivante, et le
  // score continue de compter.
  //
  // Elle ne rejoint pas pour autant le panthéon solo : elle a commencé à deux,
  // avec l'aide de quelqu'un, et la comparer à une partie jouée seule du début à
  // la fin serait faux. Elle reste au tableau du jeu à deux.
  _duoSeul() {
    if (this.variante !== 'duo') return;
    this._fermeSecondBord();
    this._duoAttente = false;
    this._duoAbandonne = false;
    // UNE LIAISON DIRECTE SE COUPE SANS FERMER LE CANAL DES AMIS. Le même
    // WebSocket porte les deux : le fermer ici mettrait tous les copains hors
    // ligne parce qu'un seul est parti — et l'on perdrait au passage la présence,
    // la voix et toute possibilité de recommencer.
    if (this.duo?.direct) this.duo.fermeDirect();
    else this.duo?.ferme();
    // La variante reste « duo » pour le tableau des scores, mais la simulation
    // repasse en temps réel : il n'y a plus personne à attendre.
    this._duoAbandonne = true;
    this.hud.announce('Seul aux commandes', 'Votre copain a quitté la partie', 2600);
    // S'il était mort en attendant que l'autre tombe, la partie s'arrête ici.
    if (!this.player.alive && this.lives <= 0) this.gameOverTimer = 1.8;
  }

  // Le second vaisseau, et son poste de pilotage. Il vit tant que la partie à
  // deux dure ; le premier joueur, lui, est celui du jeu depuis toujours.
  _ouvreSecondBord(duo) {
    this._fermeSecondBord();
    const fiche = { ...this._fiche(), carene: coqueParId(duo.luiCoque).carene };
    this.joueur2 = new Player(this.scene, fiche);
    this.joueur2.reset();
    this.bord2 = {
      cmd: commandeVide(),
      // Le second joueur a ses propres améliorations, donc ses propres stats.
      // Elles partent de zéro comme les nôtres et suivent SES achats.
      levels: emptyLevels(),
      stats: computeStats(emptyLevels(), 0),
      coque: duo.luiCoque,
      odTimer: 0,
      energy: 0,
      credits: 0,
      lives: PLAYER.baseLives,
      respawnTimer: 0,
      score: 0,
      nom: duo.luiNom,
    };
  }

  _fermeSecondBord() {
    if (!this.joueur2) return;
    this.joueur2.dispose?.();
    this.scene.remove(this.joueur2.group);
    if (this.joueur2.seam) this.scene.remove(this.joueur2.seam);
    this.joueur2 = null;
    this.bord2 = null;
  }

  // LE PAS VERROUILLÉ, VU DU JEU.
  //
  // `main.js` appelle `update` avec le temps réel. En solo on simule cette durée
  // telle quelle. À deux, on la découpe en pas d'un soixantième — les deux
  // machines doivent avancer par les MÊMES incréments — et chaque pas attend
  // d'avoir les commandes des deux joueurs.
  _updateDuo(dtReel) {
    const d = this.duo;
    // Plus de copain : on ne verrouille plus rien, on joue comme en solo.
    if (this._duoAbandonne || !d || d.etat !== 'partie') return this._updatePlaying(dtReel);
    let n = d.pas(dtReel);
    while (n-- > 0) {
      if (!d.pret()) {
        // On attend l'autre. Ce n'est pas une erreur : c'est le prix du pas
        // verrouillé, et ça ne dure que le temps d'un aller-retour.
        d.attentes++;
        this._duoAttend = true;

        // MAIS ON N'ATTEND PAS INDÉFINIMENT, ET C'EST TOUT LE SUJET.
        //
        // En salon, le serveur envoie « parti » quand le copain s'en va : la
        // partie repasse en solo et personne ne reste bloqué. En liaison DIRECTE
        // — celle d'un spectateur qui vient de rejoindre — il n'y a pas de
        // salon, donc rien ne peut sauver celui qui attend. Si la bascule échoue
        // d'un seul côté, ou si l'autre ferme son onglet, le jeu se fige : on ne
        // simule plus, on ne rend plus la main, et le joueur n'a plus qu'à
        // recharger la page. Signalé par Paul, et c'est exactement ce qui se
        // passait.
        //
        // Cinq secondes sans une seule commande, c'est cent fois un
        // aller-retour normal : ce n'est plus de la latence, c'est une absence.
        this._attenteDuo = (this._attenteDuo || 0) + dtReel;
        if (this._attenteDuo > 5) {
          note('duo-perdu', { ou: `vague ${this.wave}`, avec: d.direct || this.bord2?.nom });
          this._duoSeul();
        }
        return;
      }
      this._attenteDuo = 0;
      this._duoAttend = false;
      // Ma commande part avec de l'avance ; celle de l'autre arrive pour MAINTENANT.
      this._construitCommande(PAS_DUO);
      d.publie(commandeVersTableau(this.cmd));
      tableauVersCommande(d.consomme(), this.bord2.cmd);
      this.enregistreur.frame(this.cmd, this._controle());
      d.frame++;
      this._updatePlaying(PAS_DUO);
      // Une empreinte par seconde, croisée avec celle de l'autre : c'est tout ce
      // qui sépare une divergence silencieuse d'une divergence mesurée.
      this._croiseEmpreintes(d.frame);
    }
  }

  showEntrainement(mode) {
    this.quitteVitrine();
    this.state = 'entrainement';
    this.hud.root.classList.add('hidden');
    const maxVague = mode === 'survie' ? SURVIE.vagues : 40;
    const reglages = this._entrainement || { vague: 1, coque: 'orion', part: null };
    reglages.vague = Math.min(maxVague, Math.max(1, reglages.vague));

    const el = this._screen(`
      <div class="screen entrainement">
        <div class="coque-haut">
          <h2 class="shop-title">Entraînement</h2>
          <div class="coque-sous">${
            mode === 'survie' ? `Survie · ${SURVIE.vagues} vagues` : 'Arcade'
          } · hors panthéon</div>
        </div>

        <label class="entr-bloc">
          <span class="entr-titre">Commencer à la vague <b id="entr-vague">1</b></span>
          <input type="range" id="entr-vague-r" min="1" max="${maxVague}" step="1" />
          <span class="entr-note" id="entr-secteur"></span>
        </label>

        <div class="entr-bloc">
          <span class="entr-titre">Coque</span>
          <div class="entr-coques">
            ${COQUES.map(
              (c) => `<button class="entr-coque" data-coque="${c.id}">
                <b>${c.nom}</b><span>${esc(c.titre)}</span>
              </button>`
            ).join('')}
          </div>
        </div>

        <label class="entr-bloc">
          <span class="entr-titre">Équipement <b id="entr-part">0 %</b></span>
          <input type="range" id="entr-part-r" min="0" max="100" step="5" />
          <span class="entr-note" id="entr-modules"></span>
        </label>

        <button class="btn-primary" id="entr-go">Lancer</button>
        <button class="btn-ghost" id="entr-back">← Retour</button>
      </div>
    `);

    const rVague = el.querySelector('#entr-vague-r');
    const rPart = el.querySelector('#entr-part-r');
    const lblVague = el.querySelector('#entr-vague');
    const lblPart = el.querySelector('#entr-part');
    const lblSecteur = el.querySelector('#entr-secteur');
    const lblModules = el.querySelector('#entr-modules');

    const peint = () => {
      const v = Number(rVague.value);
      const part = Number(rPart.value) / 100;
      lblVague.textContent = v;
      lblPart.textContent = `${Math.round(part * 100)} %`;
      lblSecteur.textContent = stageForWave(v).name;
      const n = niveauxPourPart(part);
      const liste = UPGRADES.filter((u) => n[u.id] > 0).map((u) => `${u.name} ${n[u.id]}`);
      lblModules.textContent = liste.length ? liste.join(' · ') : 'Vaisseau nu';
      for (const b of el.querySelectorAll('.entr-coque')) {
        b.classList.toggle('on', b.dataset.coque === reglages.coque);
      }
    };

    rVague.value = reglages.vague;
    // Le curseur d'équipement suit la vague TANT QU'ON N'Y A PAS TOUCHÉ. Une fois
    // déplacé à la main, il reste où on l'a mis : c'est tout l'intérêt de pouvoir
    // s'entraîner sous-équipé, et le remettre d'office à chaque cran de vague
    // rendrait ce réglage-là impossible à tenir.
    rPart.value = Math.round((reglages.part ?? equipementPourVague(reglages.vague)) * 100);
    peint();

    rVague.addEventListener('input', () => {
      if (reglages.part === null)
        rPart.value = Math.round(equipementPourVague(Number(rVague.value)) * 100);
      peint();
    });
    rPart.addEventListener('input', () => {
      reglages.part = Number(rPart.value) / 100;
      peint();
    });
    for (const b of el.querySelectorAll('.entr-coque')) {
      b.addEventListener('click', () => {
        reglages.coque = b.dataset.coque;
        this.audio.uiTick();
        peint();
      });
    }

    const clavier = (e) => {
      if (this.state !== 'entrainement' || e.key !== 'Escape') return;
      quitte();
      this.showVariante(mode);
      e.preventDefault();
    };
    const quitte = () => window.removeEventListener('keydown', clavier);
    window.addEventListener('keydown', clavier);

    el.querySelector('#entr-go').addEventListener('click', () => {
      quitte();
      this.audio.buy();
      reglages.vague = Number(rVague.value);
      this._entrainement = reglages;
      this.startRun(mode, reglages.coque, {
        variante: 'entrainement',
        vague: Number(rVague.value),
        niveaux: niveauxPourPart(Number(rPart.value) / 100),
      });
    });
    el.querySelector('#entr-back').addEventListener('click', () => {
      quitte();
      this.showVariante(mode);
    });
  }

  showChoixCoque(mode, onDone) {
    this.state = 'coques';
    this.hud.root.classList.add('hidden');
    this.quitteVitrine();
    if (!this.demoArme) this.demoArme = new DemoArme(this.scene);
    const el = this._screen(`
      <div class="screen coques">
        <div class="coque-haut">
          <h2 class="shop-title">Quelle coque ?</h2>
          <div class="coque-sous">${this._sousTitreMode(mode)}</div>
        </div>
        <div class="coque-bas">
          <div class="coque-nav">
            <button class="coque-fleche" data-pas="-1" aria-label="Coque précédente">‹</button>
            <span class="coque-nom"></span>
            <button class="coque-fleche" data-pas="1" aria-label="Coque suivante">›</button>
          </div>
          <div class="coque-fiche">
            <span class="coque-titre"></span>
            <span class="coque-phrase"></span>
            <span class="coque-arme"></span>
            <span class="coque-jauge"></span>
          </div>
          <div class="coque-points">
            ${COQUES.map((_, i) => `<i data-point="${i}"></i>`).join('')}
          </div>
          <button class="btn-primary coque-go">Lancer</button>
          <button class="btn-ghost" id="coques-back">← Retour</button>
        </div>
      </div>
    `);

    let index = 0;
    const nom = el.querySelector('.coque-nom');
    const titre = el.querySelector('.coque-titre');
    const phrase = el.querySelector('.coque-phrase');
    const arme = el.querySelector('.coque-arme');
    const jauge = el.querySelector('.coque-jauge');
    const points = [...el.querySelectorAll('[data-point]')];

    // En paysage court — un téléphone tenu à l'horizontale — il n'y a pas assez de
    // hauteur pour empiler titre, vaisseau et fiche : le panneau finit par recouvrir
    // le vaisseau qu'il est censé décrire. On passe alors en deux colonnes, fiche à
    // droite et vaisseau décalé à gauche.
    const etroit = () => window.innerHeight < 520 && window.innerWidth > window.innerHeight;
    const dispose = () => {
      const cote = etroit();
      el.classList.toggle('coques-cote', cote);
      return cote ? 0.27 : 0.5;
    };

    const montre = (i, avecSon = true) => {
      index = (i + COQUES.length) % COQUES.length;
      const c = COQUES[index];
      nom.textContent = c.nom;
      titre.textContent = c.titre;
      phrase.textContent = c.phrase;
      arme.textContent = c.arme;
      jauge.textContent = c.resume;
      points.forEach((p, k) => p.classList.toggle('on', k === index));
      // rebuild remet une échelle neuve : on repose la pose de vitrine après.
      const f = dispose();
      this._vitrine(true, f);
      this.player.rebuild({ ...this._fiche(), carene: c.carene });
      this._vitrine(true, f);
      // On change de coque : la démonstration en cours n'a plus lieu d'être, et
      // la nouvelle repart de la présentation. `coque` est posée dès maintenant
      // parce que c'est elle qui désigne l'arme qui va tirer.
      this.coque = c.id;
      this.demoArme?.arrete(this);
      this.demoArme.place(this.player.group.position.x);
      this._poseCoque = { t: 0, x: this.player.group.position.x };
      if (avecSon) this.audio.uiTick?.();
      // Une bascule courte : on voit que quelque chose a changé même en un clin
      // d'œil, ce qui compte quand on fait défiler vite.
      el.querySelector('.coque-bas')?.classList.remove('bascule');
      void el.offsetWidth;
      el.querySelector('.coque-bas')?.classList.add('bascule');
    };

    const lance = () => {
      this.audio.buy();
      quitte();
      this._vitrine(false);
      onDone(COQUES[index].id);
    };

    const clavier = (e) => {
      if (this.state !== 'coques') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') montre(index - 1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') montre(index + 1);
      else if (e.key === 'Enter' || e.key === ' ') lance();
      else if (e.key === 'Escape') {
        quitte();
        this.showTitle();
      } else return;
      e.preventDefault();
    };
    // Le listener vit le temps de l'écran, pas plus : le laisser courir ferait
    // changer de coque pendant la partie suivante.
    // Tourner le téléphone change la disposition ET la place du vaisseau : les deux
    // se recalculent, sinon le vaisseau resterait décalé sur un écran redevenu haut.
    const replace = () => {
      this._vitrine(true, dispose());
      if (this.demoArme) this.demoArme.place(this.player.group.position.x);
      if (this._poseCoque) this._poseCoque.x = this.player.group.position.x;
    };
    const quitte = () => {
      window.removeEventListener('keydown', clavier);
      window.removeEventListener('resize', replace);
      // La démonstration rend ce qu'elle a emprunté au jeu — liste d'ennemis,
      // niveaux, compteurs. Sans ça, la partie suivante commencerait avec les
      // cibles de la vitrine dans sa vague.
      this.demoArme?.arrete(this);
      this._poseCoque = null;
      this.player.group.rotation.set(0, 0, 0);
      const halo = this.player.group.getObjectByName('grazeAura');
      if (halo) halo.visible = true;
    };
    window.addEventListener('keydown', clavier);
    window.addEventListener('resize', replace);

    el.querySelectorAll('.coque-fleche').forEach((b) =>
      b.addEventListener('click', () => montre(index + Number(b.dataset.pas)))
    );
    points.forEach((p, i) => p.addEventListener('click', () => montre(i)));
    el.querySelector('.coque-go').addEventListener('click', lance);
    el.querySelector('#coques-back').addEventListener('click', () => {
      quitte();
      this.showTitle();
    });

    // Le glissé horizontal, parce que c'est le geste qu'on essaie d'instinct devant
    // un carrousel sur un téléphone.
    let x0 = null;
    const bas = el.querySelector('.coque-bas');
    bas.addEventListener('pointerdown', (e) => {
      x0 = e.clientX;
    });
    bas.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const d = e.clientX - x0;
      x0 = null;
      if (Math.abs(d) > 40) montre(index + (d < 0 ? 1 : -1));
    });

    montre(0, false);
  }

  // `options` porte ce qui n'est pas une partie ordinaire : la variante jouée, la
  // vague de départ, et l'équipement déjà en place. Une partie normale n'en passe
  // aucune — c'est le cas par défaut, et il ne change pas d'un iota.
  startRun(mode = 'arcade', coque = null, options = null) {
    // Toute partie appartient à un pilote : c'est lui qui la publie au panthéon.
    // Sauf la démonstration de l'écran d'accueil, qui ne publie rien.
    // SEULE LA PARTIE SOLO EXIGE UN PILOTE. Il sert à publier au panthéon.
    // L'entraînement ne publie rien — exiger un pseudo et un code pour refaire
    // trois fois la vague 22 serait un péage sans contrepartie. Et le jeu à deux
    // se joue à l'invitation d'un copain : lui demander de créer un compte
    // pendant que l'autre attend dans le salon, c'est perdre les deux. Sans
    // pilote, le score ne part simplement pas au tableau.
    const variante = options?.variante || 'solo';
    if (!activePilot() && !this._demoForce && variante === 'solo') {
      this.showPilotSelect(() => this.startRun(mode, coque, options));
      return;
    }
    // Et toute partie appartient à une coque : sans elle, on ne sait ni quoi tirer
    // ni comment remplir la jauge.
    if (!coque) {
      this.showChoixCoque(mode, (choisie) => this.startRun(mode, choisie, options));
      return;
    }
    // Une vraie partie commence : la démonstration s'arrête, et avec elle la
    // veille du menu.
    if (!this._demoForce) {
      this.arreteDemo();
      this._arreteVeille?.();
      this._arreteVeille = null;
    }
    this.coque = coque;
    this.mode = mode === 'survie' ? 'survie' : 'arcade';
    this.variante = options?.variante || 'solo';
    // LA PARTIE RETIENT SES PROPRES RÉGLAGES D'ENTRAÎNEMENT.
    //
    // Ils n'étaient mémorisés qu'au clic sur « Lancer ». Toute partie
    // d'entraînement démarrée autrement — et c'est le cas quand on revient au
    // menu après être mort — retrouvait donc le curseur à la vague 1, c'est-à-dire
    // perdait exactement ce qu'on était venu régler. C'est la PARTIE qui sait ce
    // qu'elle joue ; c'est donc elle qui doit le retenir.
    if (this.variante === 'entrainement') {
      this._entrainement = {
        vague: options?.vague || 1,
        coque,
        part: this._entrainement?.part ?? null,
      };
    }
    // Le second vaisseau n'existe qu'à deux, et il est reconstruit à chaque
    // partie : sa coque change avec le copain qu'on a en face.
    this.duoMoi = options?.duo ? options.duo.moi : 0;
    this._duoAttente = false;
    if (options?.duo) this._ouvreSecondBord(options.duo);
    else this._fermeSecondBord();
    // Filet : un secteur caché pour une cinématique se rallume à sa fin, mais un
    // chemin de sortie oublié laisserait le jeu se jouer dans le noir. On le
    // repose ici, où passe forcément toute partie.
    this.stage?.space?.setVisible(true);

    this.shop.close();
    this.shop.reinitialise();
    this.overlayRoot.innerHTML = '';
    this.hud.root.classList.remove('hidden');

    this.score = 0;
    this.wave = 0;
    this.surcharge = 0;
    {
      this.levels = options?.niveaux ? { ...emptyLevels(), ...options.niveaux } : emptyLevels();
      this.credits = 0;
      // La Coque renforcée donne ses vies à l'achat, pas au calcul des stats :
      // une panoplie posée d'un bloc doit donc les créditer elle-même, sinon
      // l'entraînement partirait avec trois vies en annonçant le module.
      this.lives = Math.min(PLAYER.maxLives, PLAYER.baseLives + (this.levels.hull || 0));
    }
    this.stats = computeStats(this.levels, this.surcharge);
    this.fragments = 0;
    this._refreshShip(); // la coque repart de la livrée et de la carène du pilote
    this.combo = { chain: 0, mult: 1, timer: 0 };
    this.respawnTimer = 0;
    this.gameOverTimer = 0;
    this.waveEndTimer = 0;
    // Les premières secondes d'une vague : les ennemis entrent encore en formation,
    // personne ne tire. C'est le meilleur moment pour dire quelque chose.
    this.waveBonusGiven = false;
    this.waveGrazes = 0;
    this.energy = 0;
    this.odTimer = 0;
    this.callLeft = 0;
    this.callWave = null;
    this.reflexCooldown = 0;
    this.bombFront = null;
    this.callLeft = 0; // Appels restants pour la vague en cours
    this.callWave = null; // onde d'Appel en cours d'expansion
    this.fragments = 0; // morceaux du Registre récupérés sur les routes longues
    // L'escale armée par le dernier détour : { vague, tirage } ou null. Le détour
    // mène QUELQUE PART — une surface, des anneaux, un champ de débris — et c'est
    // la vague suivante qui s'y joue. Une seule : c'est une escale, pas un secteur.
    this.escale = null;
    // Vrai pendant le niveau BIS de l'escale. Ce n'est pas la vague prévue, c'est
    // une vague EN PLUS, insérée avant elle et portant le même numéro.
    this.bis = false;
    this.routeMods = null; // risque choisi, appliqué à la vague suivante seulement
    this.bombCooldown = 0;
    this.waveDeath = false;
    this.waveBestTier = 1;
    // L'Appel se recharge à chaque vague, jamais entre-temps.
    this.callLeft = this.stats.callCharges;
    this.callWave = null;
    this.hud.setCall(this.callLeft, this.stats.callCharges);
    this._energyPressStart = 0;
    this.director.reset();
    // Graine de la partie : en arcade, celle du jour (mêmes vagues pour tous les

    // La graine du jour : les mêmes vagues pour tous les copains le même jour, donc
    // des scores qui se comparent honnêtement. La survie décale la sienne, sinon
    // ses cent vagues seraient les vagues d'arcade dans le même ordre.
    // À deux, la graine vient du SERVEUR : les deux clients doivent tirer le même
    // hasard, et aucun des deux ne doit pouvoir le choisir.
    this.seed = options?.graine ?? dailySeed() + (this.mode === 'survie' ? 613 : 0);
    this.hud.setEnergy(0);
    this.hud.setOverdrive(false);

    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.pickups.clear();
    this.modules.clear();
    for (const a of Object.values(this.armes)) a.clear();
    this.modules.clear();
    this.enemies.clear();
    this.player.shieldUp = false;
    this.player.reset();
    this.player.invulnTimer = 0;
    // Les deux vaisseaux ne partent pas au même endroit : superposés, on ne
    // saurait pas lequel on pilote pendant les deux premières secondes. Posé
    // APRÈS `reset`, qui ramène tout le monde au centre.
    if (this.joueur2) {
      this.joueur2.reset();
      this.joueur2.invulnTimer = 0;
      // LA PLACE DÉPEND DU RÔLE, PAS DE QUI REGARDE.
      //
      // Poser « mon vaisseau à gauche » chez les deux joueurs paraît naturel et
      // c'est une divergence : chacun croit alors que l'autre est à droite, et
      // les deux simulations racontent deux mondes différents dès la première
      // image. Le joueur zéro est à gauche pour TOUT LE MONDE.
      const gauche = this.duoMoi === 0 ? this.player : this.joueur2;
      const droite = this.duoMoi === 0 ? this.joueur2 : this.player;
      gauche.group.position.x = -3.2;
      droite.group.position.x = 3.2;
    }

    this.hud.setScore(0);
    this.hud.setHiscore(this.hiscore);
    this.hud.setCredits(0);
    this.hud.setLives(this.lives);
    this.hud.hideBossBar();

    // Les répliques citent le pilote et le système : NOVA tient un registre nominatif.
    this.characters.setContext({
      pilote: activePilot()?.name || 'pilote',
      systeme: 'Ce secteur',
    });
    // LES DEUX MODES S'ENREGISTRENT. La restriction à l'arcade datait du temps où
    // l'autre mode était la campagne, qui dépendait d'un fichier de mission chargé
    // à distance — impossible à garantir identique des semaines plus tard. La
    // Survie, elle, ne dépend que du jeu : elle se rejoue exactement comme
    // l'arcade. Et c'est même là qu'on a le plus envie de revoir comment un copain
    // est monté si haut.
    this.enregistreur.demarre({
      mode: this.mode,
      seed: this.seed,
      pilote: activePilot()?.name || null,
    });
    // LE MODE SURVIE N'A PAS D'HISTOIRE. Pas de KORN, pas de souvenirs, pas de
    // dialogues : cent vagues d'affilée, et rien qui s'interpose. Le récit vit en
    // arcade, où l'on prend le temps de sauter d'un secteur à l'autre.
    //
    // LA VITRINE NON PLUS NE PARLE PAS. La partie qui tourne derrière le menu
    // ouvrait une fenêtre de comm par-dessus elle-même : c'est une bande-annonce,
    // et une bande-annonce ne se commente pas.
    this.hud.setModeSurvie(this.mode === 'survie');
    this.characters.muet = this.mode === 'survie' || this.demo;
    if (this.characters.muet) this.characters.taisToi();
    else this.characters.onRunStart(false);
    this.startWave(Math.max(1, options?.vague || 1));
    // Nos amis peuvent maintenant proposer de regarder.
    this.duo?.annonceJeu(true);
    // Ce qui tournait au moment d'un défaut : le mode, la coque, la vague. Trois
    // nombres qui replacent n'importe quel signalement dans son contexte.
    if (this.wave === 1 || this.variante === 'duo') {
      note('partie', {
        ou: `vague ${this.wave}`,
        mode: this.mode,
        variante: this.variante,
        coque: this.coque,
      });
    }
    // LE CANAL DOIT SAVOIR CE QU'ON JOUE. Il gardait le mode qu'il avait à la
    // connexion — « arcade » — même quand la partie en cours était une Survie.
    // Le relais des demandes n'en dépend pas, mais la liste des parties, elle,
    // est filtrée par mode : un copain cherchant une partie de survie ne voyait
    // pas celle qu'on était en train de jouer.
    if (this.duo && this.duo.mode !== this.mode) this.duo.changeMode(this.mode);
    // LA RÉPLIQUE D'OUVERTURE ARRIVE AU PREMIER HANGAR, PAS SUR LA VAGUE 1.
    //
    // Il n'existe aucun moment calme entre le choix de la coque et le premier
    // ennemi : la dire au lancement revenait à l'afficher onze secondes durant
    // par-dessus le pilotage — mesuré — puis, une fois la fenêtre coupée à la
    // reprise du manche, à ne plus l'afficher du tout. Elle part donc dans la
    // file, comme le reste, et sort au premier moment où l'on ne vole pas.
  }

  startWave(n) {
    this.wave = n;
    // Le hasard de la simulation est semé À CHAQUE VAGUE, à partir de la graine de
    // la partie. Une vague qui repart du même état rejoue donc exactement le même
    // hasard, et une erreur d'arrondi ne peut pas se propager d'une vague à l'autre.
    semer(this.seed * 1000003 + n * 7919 + 17);
    // Une vague commence PROPRE. Le chemin normal passe par la boutique, qui purge
    // déjà ; le garantir ici ferme le dernier écart possible entre l'état enregistré
    // et l'état restauré — et accessoirement, hériter des balles de la vague morte
    // n'a jamais eu de sens.
    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    for (const a of Object.values(this.armes)) a.clear();
    this.aura?.clear();
    this.soutien?.annule();
    this.colosse?.annule();
    this.arrivee?.annule();
    if (!this.rejeu) this.enregistreur.ouvreVague(this._instantane());
    // Le spectateur se recale à chaque vague : c'est ce qui empêche un écart
    // minuscule de s'accumuler, et c'est aussi ce qui lui permet d'arriver en
    // cours de route sans rien avoir vu de ce qui précède.
    if (this._regardeurs?.size && !this.rejeu) {
      const vue = this._instantane();
      for (const qui of this._regardeurs) this.duo.signale(qui, 'vue', vue);
    }
    this.state = 'playing';
    // LA RÉPARATION D'UNE DIVERGENCE. L'autre a mesuré qu'on ne simulait plus la
    // même chose : on lui envoie notre état, il le restaure, et l'écart est
    // effacé. C'est le même mécanisme que pour le spectateur, au même moment.
    if (this._doitResync) {
      this.duo.signale(this._doitResync, 'resync-etat', this._instantane());
      this._doitResync = null;
    }
    // LE RENDEZ-VOUS. L'instantané vient de partir : les deux machines ont
    // exactement le même état, c'est donc ICI, et seulement ici, qu'une partie
    // solo peut devenir une partie à deux. Chez l'hôte comme chez celui qui
    // arrive, la bascule se fait juste après la pose de l'état.
    if (this._duoEnVol?.moi === 0) this._basculeEnDuo();
    this.audio.setMode('play');
    this.waveEndTimer = 0;
    // Les premières secondes d'une vague : les ennemis entrent encore en formation,
    // personne ne tire. C'est le meilleur moment pour dire quelque chose.
    this.waveBonusGiven = false;
    this.waveGrazes = 0;
    this.waveDeath = false;
    this.waveBestTier = 1;
    // L'Appel se recharge à chaque vague, jamais entre-temps.
    this.callLeft = this.stats.callCharges;
    this.callWave = null;
    this.hud.setCall(this.callLeft, this.stats.callCharges);

    let def;
    {
      // En survie, la difficulté suit une pente adoucie : cent vagues à la montée
      // de l'arcade seraient saturées dès la vingtième, et les quatre-vingts
      // suivantes se ressembleraient toutes. La GRAINE, elle, suit le vrai numéro
      // de vague — sinon deux vagues de difficulté égale seraient identiques.
      const survie = this.mode === 'survie';
      // La difficulté suit une pente adoucie dans les DEUX modes. L'arcade n'en
      // avait pas : elle prenait le numéro de vague brut, et doublait de dureté
      // entre la sixième et la douzième — voir PENTE_ARCADE.
      const { diff: nDiff, seed: graine } = paramsVague(n, { survie, seed: this.seed });
      // UNE ESCALE N'A PAS DE BOSS. C'est un détour, pas le rendez-vous : on est
      // venu chercher quelque chose dans un endroit, pas affronter l'amiral au
      // milieu d'un champ de débris. Il attend au niveau suivant, et il y sera.
      const boss = this.bis ? false : survie ? n % SURVIE.bossTousLes === 0 : undefined;
      // LA GRAINE SUIT LE VRAI NUMÉRO DE VAGUE, DANS LES DEUX MODES.
      //
      // L'arcade avait `0` ici, et ça allait tant que sa difficulté valait son
      // numéro de vague : deux vagues n'avaient jamais la même. Depuis la pente,
      // elles l'ont — l'arrondi donne la même difficulté aux vagues 2 et 3, 6 et
      // 7, 9 et 10, 13 et 14. Même difficulté PLUS même graine, c'est la même
      // vague, à l'ennemi près. On rejouait donc quatre vagues en double sur les
      // quatorze premières, ce qui est exactement ce que la pente cherchait à
      // éviter.
      // QUI ATTEND AU BOUT DE CETTE VAGUE.
      //
      // On passe le VRAI numéro de vague, pas la difficulté aplatie : c'est le
      // voyage qui décide, et le voyage se compte en vagues. En survie, KORN
      // garde la toute dernière — c'est la seule ligne d'arrivée du mode.
      const fin = survie ? n >= SURVIE.vagues : estDernierSecteur(n);
      // Le RANG de la rencontre, pas le numéro de vague : en arcade, c'est la
      // difficulté qui déclenche le combat, donc c'est elle qui les numérote.
      const rang = survie
        ? Math.round(n / SURVIE.bossTousLes)
        : Math.round(nDiff / WAVES.bossEvery);
      def = makeWave(nDiff, {
        seed: graine,
        boss: bossPourVague({ rang, dernierSecteur: fin }),
        forceBoss: boss === true ? true : undefined,
        noBoss: boss === false ? true : undefined,
      });
      // Le risque choisi sur la route ne vaut que pour UNE vague : on le consomme.
      // TOUJOURS UNE COPIE. Sans le `...` du cas par défaut, `mods` ÉTAIT l'objet
      // DEFAULT_MODS lui-même — une constante partagée par tout le jeu. Le
      // multiplicateur du duo la modifiait alors définitivement : il se composait
      // à chaque vague (1,35 puis 1,82 puis 2,46…) et contaminait les parties
      // solo suivantes jusqu'au rechargement de la page. Mesuré avant
      // correction : 137 points de vie en solo, 276 à deux, là où l'on attendait
      // 185.
      const mods = { ...DEFAULT_MODS, ...(this.routeMods || {}) };
      this.routeMods = null;
      // À DEUX, LA VAGUE EST PLUS DURE — sinon elle est deux fois plus facile.
      //
      // Deux vaisseaux, c'est deux fois la puissance de feu et deux fois les
      // chances qu'un tir trouve une cible. Les chiffres ci-dessous ne doublent
      // pas la difficulté pour autant : à deux on se gêne, on partage l'arène, et
      // l'un couvre l'autre. Un tiers de points de vie en plus, un quart de tirs
      // et de piqués en plus — assez pour qu'on ait besoin d'être deux, pas assez
      // pour que ce soit une punition. Les crédits, eux, ne bougent pas : chacun
      // ramasse les siens et la boutique reste au même prix.
      if (this.variante === 'duo' && this.joueur2) {
        mods.hp *= DUO.hp;
        mods.fire *= DUO.fire;
        mods.dive *= DUO.dive;
      }
      this.enemies.startWave(def, nDiff, mods, this.director.heat);
      this.hud.setWave(survie ? `${n}/${SURVIE.vagues}` : n);
      this.hud.announce(
        survie ? `Vague ${n} / ${SURVIE.vagues}` : `Vague ${n}`,
        def.boss ? '⚠ KORN en approche ⚠' : ''
      );
    }
    // Le secteur est déjà en place quand la vague démarre : il a basculé sous le
    // flash du saut. Ce setBiome n'agit donc qu'au tout premier lancement, ou après
    // un saut escamoté.
    this.stage.space?.setBiome(this._biomeFor(n), { instant: this.wave <= 1 });
    // La musique appartient au SECTEUR, pas à la vague : on s'éloigne de la Terre,
    // et le thème s'éloigne avec. Le palier de boss garde celui de son secteur —
    // c'est `darken()` qui l'assombrit, pas un changement de partition.
    this.audio.setThemePourPalier?.(stageForWave(n).id);
    // L'ESCALE A SA COULEUR. Le détour se paie d'un niveau entier à survivre :
    // le lieu doit se sentir avant de se voir. Un boss reste prioritaire — c'est
    // le sommet, rien ne passe devant.
    if (!def.boss) this.audio.setMode(this.bis && this.escale?.vague === n ? 'escale' : 'play');
    if (!def.boss) this.audio.waveStart();
  }

  // ---- LE MICRO, EN PARTIE ---------------------------------------------------
  //
  // À QUI PEUT-ON PARLER, LÀ, MAINTENANT ?
  //
  // Quatre situations, et une seule réponse : le copain avec qui on partage cette
  // partie. À deux c'est le coéquipier ; en spectateur c'est celui qu'on regarde ;
  // quand on est regardé, c'est celui qui regarde. Sinon, personne — et le bouton
  // n'a pas lieu d'exister.
  get copainDeJeu() {
    if (this.voix?.pair) return this.voix.pair;
    if (this.variante === 'duo' && this.bord2?.nom) return this.bord2.nom;
    if (this.spectateur?.de) return this.spectateur.de;
    const premier = this._regardeurs?.values?.().next?.().value;
    return premier || null;
  }

  // L'état à montrer sur le bouton. Recalculé à chaque image : la ligne peut
  // s'ouvrir ou tomber sans qu'on ait touché à rien.
  _rafraichitMicro() {
    const copain = this.copainDeJeu;
    if (!copain || this.state !== 'playing') return this.hud.setMicro?.(null);
    const e = this.voix?.etat || 'raccroche';
    if (e === 'enligne') return this.hud.setMicro?.(this.voix.muet ? 'muet' : 'ouvert');
    if (e === 'appelle' || e === 'sonne') return this.hud.setMicro?.('sonne');
    this.hud.setMicro?.('appeler');
  }

  // UN SEUL BOUTON POUR TOUTE LA LIGNE : il appelle, il décroche, il coupe.
  // Trois boutons auraient demandé de la place qu'un téléphone n'a pas, et de
  // toute façon un seul de leurs états est utile à la fois.
  _toucheMicro() {
    const copain = this.copainDeJeu;
    if (!copain) return;
    const e = this.voix?.etat || 'raccroche';
    if (e === 'enligne') {
      const muet = this.voix.basculeMuet();
      this.hud.announce(muet ? 'Micro coupé' : 'Micro ouvert', copain, 1200);
    } else if (e === 'sonne') {
      this.voix.decroche();
    } else if (e === 'raccroche') {
      this.voix.appelle(copain);
      this.hud.announce('Appel…', copain, 1600);
    }
    this._rafraichitMicro();
  }

  // JE NE PILOTE PAS CETTE PARTIE.
  //
  // Deux situations où ce qui est à l'écran ne m'appartient pas : la relecture
  // d'un enregistrement, et le fait de regarder un copain jouer. Dans les deux
  // cas, tout ce qui se DÉCIDE entre deux vagues — la boutique, le choix de
  // trajectoire, le saut — n'a aucun sens : il n'y a rien à acheter, rien à
  // choisir, et le prochain tableau viendra de l'extérieur.
  //
  // La relecture était protégée partout ; le spectateur ne l'était nulle part. La
  // boutique s'ouvrait donc chez celui qui regarde, avec ses cartes et son bouton
  // « Lancer la vague » — sur une partie qui n'est pas la sienne. Vu par Paul.
  //
  // Une seule question désormais, pour que la prochaine situation du même genre
  // n'ait qu'un seul endroit à compléter.
  // CE QU'ON VOIT PENDANT QUE L'AUTRE S'ÉQUIPE.
  //
  // Le copain est dans son hangar : ça prend le temps que ça prend, et il ne se
  // passe rien à l'écran. Sans un mot, on croit que la liaison est tombée.
  _entreDeuxVagues() {
    if (!this.spectateur) return;
    this._ditRegard(`${this.spectateur.de} est au hangar…`);
  }

  get spectacle() {
    return !!this.rejeu || !!this.spectateur;
  }

  // Entre deux vagues : on saute. La boutique s'ouvre à l'arrivée, dans le nouveau
  // secteur — donc le joueur choisit ses améliorations en regardant déjà l'endroit
  // où il va se battre, et non l'arène vide qu'il vient de nettoyer.
  _startJump() {
    if (this.spectacle) return this._entreDeuxVagues();
    const nextWave = this.wave + 1;
    const nextBiome = this._biomeFor(nextWave);
    this.characters.setContext({ secteur: nextBiome.name });

    // KORN s'invite une fois sur trois, et systématiquement après un boss : sa
    // rareté est ce qui lui donne du poids. Un ennemi qui commente chaque vague
    // n'est plus une menace, c'est un présentateur.
    const afterBoss = !!this.enemies.bossDefeatedThisWave;
    const taunt = afterBoss || this.wave % 3 === 0;
    const dialogue = taunt ? ['kornJump', 'novaAnswer'] : [afterBoss ? 'jumpAfterBoss' : 'jump'];

    this.state = 'jump';
    this.enemyBullets.clear();
    this.bullets.clear();
    this.missiles.clear();
    // Les armes aussi : sans ça, le rayon d'HÉLIOS et les charges de VULCAIN
    // traversaient le saut, la boutique et l'écran de trajectoire — le combat
    // était fini depuis longtemps, l'arme tirait encore.
    for (const a of Object.values(this.armes)) a.clear();
    this.aura.clear();
    // ET LE BOMBARDEMENT. Le cas se produit tout le temps : le tapis nettoie la
    // vague entière, la partie enchaîne sur le saut, et `_updatePlaying` cesse
    // d'appeler la séquence — qui restait donc « en cours » pour le reste de la
    // partie, si bien que le bouton ne répondait plus jamais.
    this.soutien.annule();
    this.fx.cancelSlowmo();
    this.jump.start({
      dialogue,
      onSwap: () => {
        this.stage.space?.setBiome(nextBiome);
        // Le thème bascule SOUS LE FLASH du saut, en même temps que le décor : c'est
        // le seul instant où l'oreille accepte un changement de tempo sans l'entendre
        // comme une coupure.
        this.audio.setThemePourPalier?.(stageForWave(nextWave).id);
        this.hud.announce(nextBiome.name, nextBiome.sub, 2400);
      },
      onDone: () => {
        // On ne choisit une trajectoire qu'aux CHANGEMENTS DE PALIER. En proposer
        // un à chaque vague userait la décision en trois minutes : ce qui donne du
        // poids à un choix, c'est sa rareté, pas sa fréquence.
        const ici = stageForWave(this.wave);
        const apres = stageForWave(nextWave);
        if (ici !== apres) this._showRouteChoice();
        else this.openShop();
      },
    });
  }

  // La fiche du vaisseau : tout ce qui décide de sa SILHOUETTE. Livrée et carène
  // viennent du pilote, le palier des fragments, les modules des achats.
  _fiche() {
    const p = activePilot();
    return {
      livree: p?.livree,
      // La CARÈNE suit la coque choisie, pas la préférence du pilote : on doit
      // reconnaître ORION d'HÉLIOS au premier coup d'œil, sans lire un menu. La
      // livrée, elle, reste au pilote — c'est sa couleur, pas son arme.
      carene: this.coque ? coqueParId(this.coque).carene : p?.carene,
      tier: palierDeCoque(this.fragments),
      levels: this.levels,
    };
  }

  // Sous quel tableau cette partie s'inscrit. Le duo a le sien : comparer un
  // score fait à deux à un score fait seul n'aurait pas de sens.
  _titreTableau() {
    if (this.variante === 'entrainement') return '— Entraînement · hors panthéon —';
    const duo = this.variante === 'duo' ? ' à deux' : '';
    return this.mode === 'survie' ? `— Survie${duo} —` : `— Panthéon${duo} —`;
  }

  get modeTableau() {
    return this.variante === 'duo' ? `${this.mode}2` : this.mode;
  }

  _refreshShip() {
    this.player.rebuild(this._fiche());
  }

  // Deux routes, deux récompenses, et un vrai dilemme : s'équiper ou comprendre.
  _showRouteChoice() {
    if (this.spectacle) return this._entreDeuxVagues();
    this.state = 'route';
    // Le HUD n'apporte rien pendant une décision — le score et les commandes
    // tactiles se contentaient de traverser le texte qu'on demande de lire.
    this.hud.root.classList.add('hidden');
    this.audio.setMode('shop');
    const idx = STAGES.indexOf(stageForWave(this.wave));
    const r = routesForStage(idx, this.seed);
    const reste = fragmentsAvantPalierSuivant(this.fragments);

    // Ce que chaque route apporte, en clair. « Un fragment du Registre » ne veut
    // rien dire pour qui joue pour la première fois : il faut écrire l'effet, pas
    // le nom de l'objet. Le détour se lisait comme « moins d'argent et une vague
    // plus dure » — c'est-à-dire comme un mauvais choix.
    const vise = prochainPalier(this.fragments);
    const effets = (o) =>
      o.fragment
        ? [
            vise
              ? `Coque <b>${vise.chiffre}</b> dans ${vise.fragments - this.fragments} fragment${
                  vise.fragments - this.fragments > 1 ? 's' : ''
                } — ${esc(vise.effet)}`
              : 'Coque au maximum',
            'Un souvenir de l’épave s’ouvre',
          ]
        : ['À dépenser tout de suite au hangar'];

    // LA PROGRESSION SE VOIT, elle ne se lit pas.
    //
    // Tout était déjà écrit — combien de fragments, pour quel palier, pour quel
    // effet — mais en une phrase grise en pied de page, et « il en faut trois »
    // demande de retenir de tête où l'on en est d'une décision à l'autre, à dix
    // vagues d'intervalle. Une rangée de pastilles répond à la seule question qu'on
    // se pose devant ce choix : est-ce que ce détour-ci débloque quelque chose ?
    const jauge = () => {
      if (!vise) return '';
      const dejaLa = this.fragments;
      const total = vise.fragments;
      const cases = Array.from(
        { length: total },
        (_, i) => `<i class="${i < dejaLa ? 'plein' : i === dejaLa ? 'suivant' : ''}"></i>`
      ).join('');
      const encore = total - dejaLa;
      return `
        <span class="route-jauge">
          <span class="route-jauge-cases">${cases}</span>
          <span class="route-jauge-txt">${
            encore === 1
              ? `celui-ci débloque la coque ${vise.chiffre}`
              : `encore ${encore} pour la coque ${vise.chiffre}`
          }</span>
        </span>`;
    };

    const carte = (o) => `
      <button class="route" data-type="${o.type}">
        <span class="route-kind">${o.type === 'longue' ? 'Détour' : 'Direct'}</span>
        <span class="route-name">${esc(o.nom)}</span>
        <span class="route-desc">${esc(o.desc)}</span>
        <span class="route-gain">${esc(o.gain)}</span>
        ${o.fragment ? jauge() : ''}
        <ul class="route-effets">${effets(o)
          .map((e) => `<li>${e}</li>`)
          .join('')}</ul>
        ${o.credits && o.fragment ? `<span class="route-side">et tout de même +${o.credits} cr</span>` : ''}
        ${o.risque ? `<span class="route-risk">⚠ ${esc(o.risque.label)} à la vague suivante</span>` : ''}
      </button>`;

    const el = this._screen(`
      <div class="screen route-pick">
        <div class="route-head">
          <h2 class="route-title">Choix de trajectoire</h2>
          <div class="route-dest">Cap sur ${esc(r.destination.name)}</div>
        </div>
        <div class="route-grid">${carte(r.courte)}${carte(r.longue)}</div>
        <div class="route-foot">
          Fragments du Registre : <b>${this.fragments}</b> · Coque
          <b>${PALIERS[palierDeCoque(this.fragments)].chiffre}</b>${
            reste != null && vise
              ? ` · encore ${reste} pour la coque ${vise.chiffre} (${esc(vise.effet)})`
              : ' · au maximum'
          }
        </div>
      </div>
    `);
    for (const b of el.querySelectorAll('.route')) {
      b.addEventListener('click', () =>
        this._takeRoute(b.dataset.type === 'longue' ? r.longue : r.courte, idx)
      );
    }
  }

  _takeRoute(choix, stageIdx) {
    // ON NE CHOISIT QU'UNE FOIS.
    //
    // `openShop` AJOUTE son panneau à l'overlay au lieu de le remplacer : après
    // avoir pris l'argent, l'écran de trajectoire restait donc dans le document,
    // sous le hangar, ses deux cartes toujours branchées. Un clic sur l'autre
    // carte rejouait tout — le joueur empochait l'argent ET partait chercher le
    // fragment, et le vidage d'overlay du second passage détachait au passage le
    // panneau de hangar que la boutique croyait encore tenir.
    //
    // Deux verrous plutôt qu'un : l'état, parce qu'un choix de trajectoire n'a de
    // sens que tant qu'on est sur cet écran-là ; et l'overlay, parce qu'un écran
    // qu'on a quitté n'a rien à faire dans le document.
    if (this.state !== 'route') return;
    this.overlayRoot.innerHTML = '';
    // Le détour dépose le vaisseau dans un lieu, et un niveau BIS s'y joue — une
    // vague en plus, portant le même numéro que celle qui viendra après. Le
    // tirage sort de la GRAINE, jamais d'un hasard vif : deux parties de même
    // graine doivent passer par les mêmes escales, sinon le rejeu ne montrerait
    // pas ce que le joueur a vu.
    const suivante = this.wave + 1;
    this.escale =
      choix.fragment && A_UNE_ESCALE(stageForWave(suivante).id)
        ? { vague: suivante, tirage: (this.seed * 31 + suivante * 7919) % 100003 }
        : null;
    this.credits += choix.credits;
    this.hud.setCredits(this.credits);
    this.routeMods = choix.risque ? choix.risque.mods : null;
    this.audio.buy();

    if (!choix.fragment) {
      this.openShop();
      return;
    }

    // LE FRAGMENT NE SE DONNE PLUS ICI. Il se mérite : on part le chercher dans
    // l'escale, et on ne l'a qu'en ressortant vivant. Tant qu'il tombait au moment
    // du choix, le détour ne coûtait qu'un peu d'argent ; il coûte maintenant un
    // niveau entier à survivre, et c'est ce qui en fait un pari.
    this.bis = !!this.escale;

    this.state = 'cinematic';
    const suite = () => (this.escale ? this._entreEscale() : this.openShop());
    if (!this.cinematic.playSouvenir(stageIdx, suite)) suite();
  }

  // On y ENTRE, on n'y apparaît pas. L'animation prend la main sur la caméra le
  // temps de l'approche, puis la boutique s'ouvre — sur place, dans le lieu où
  // l'on va se battre.
  _entreEscale() {
    const lieu = this.escale
      ? escalePourSecteur(stageForWave(this.escale.vague), this.escale.tirage)
      : null;
    if (!lieu) return this.openShop();
    this.stage.space?.setBiome(lieu, { instant: true });
    this.hud.root.classList.add('hidden');
    this.characters.hide();
    this.hud.announce(lieu.name, lieu.sub, 2600);
    this.state = 'arrivee';
    const lance = this.arrivee.start({
      type: lieu.escale,
      teinte: lieu.landmark?.[0]?.teinte,
      ship: this.player.group,
      onDone: () => {
        this.cameraOverride = null;
        this.openShop();
      },
    });
    if (!lance) this.openShop();
  }

  // ON RESSORT DE L'ESCALE. On empoche ce qu'on est venu chercher, on quitte la
  // zone, et on rejoint le rendez-vous : la vague qui suit porte le MÊME numéro,
  // puisque l'escale était une vague en plus. C'est là, et seulement là, que
  // l'amiral attend.
  _quitteEscale() {
    this.bis = false;
    // On quitte le lieu : la musique reprend son assiette.
    this.audio.setMode('play');
    const avant = palierDeCoque(this.fragments);
    this.fragments++;
    const apres = palierDeCoque(this.fragments);
    if (apres > avant) {
      const gagnees = PALIERS[apres].vies || 0;
      if (gagnees) {
        this.lives += gagnees;
        this.hud.setLives(this.lives);
      }
      this.hud.announce(
        `COQUE ${PALIERS[apres].chiffre}`,
        gagnees ? `Fragment intégré · +${gagnees} vie` : 'Fragment intégré',
        2600
      );
      this._refreshShip();
    } else {
      this.hud.announce('FRAGMENT RÉCUPÉRÉ', `${this.fragments} au Registre`, 2200);
    }

    // Le départ se joue avec le saut lumière, qui existe déjà pour ça : un flash,
    // le décor qui bascule, et on est ailleurs. Écrire une seconde animation de
    // sortie n'aurait rien ajouté qu'une seconde d'attente.
    const vague = this.escale?.vague ?? this.wave;
    this.escale = null;
    this.state = 'jump';
    this.enemyBullets.clear();
    this.bullets.clear();
    this.missiles.clear();
    for (const a of Object.values(this.armes)) a.clear();
    this.aura.clear();
    this.soutien.annule();
    this.fx.cancelSlowmo();
    this.jump.start({
      dialogue: ['jump'],
      onSwap: () => {
        const lieu = this._biomeFor(vague);
        this.stage.space?.setBiome(lieu);
        this.hud.announce(lieu.name, lieu.sub, 2400);
      },
      onDone: () => this.openShop(),
    });
  }

  _biomeFor(wave) {
    // Un boss assombrit son secteur au lieu d'en changer : en survie ils tombent
    // tous les dix, en arcade tous les quatre.
    const pas = this.mode === 'survie' ? SURVIE.bossTousLes : 4;
    const boss = wave % pas === 0;

    // L'escale REMPLACE le secteur pour une vague. Un boss qui tombe pendant une
    // escale ne la renvoie pas dans le vide : il l'assombrit, exactement comme il
    // assombrit un secteur. Se battre contre KORN dans un champ de débris vaut
    // mieux que de perdre le lieu au moment le plus spectaculaire.
    if (this.bis && this.escale?.vague === wave) {
      const lieu = escalePourSecteur(stageForWave(wave), this.escale.tirage);
      if (lieu) return boss ? durcisPourBoss(lieu) : lieu;
    }
    return biomeForWave(wave, boss);
  }

  launchNextWave() {
    if (this.state !== 'shop') return;
    this.shop.close();
    this.startWave(this.wave + 1);
  }

  openShop() {
    if (this.spectacle) return this._entreDeuxVagues();
    // Le HUD revient ICI, et pas au choix de trajectoire. Il s'y rallumait, et le
    // voyage vers l'escale se jouait donc derrière un score, des crédits, un
    // numéro de vague et les boutons tactiles — pour un plan de trois secondes
    // dont tout l'intérêt est qu'on ne voie que le vaisseau et le lieu.
    this.hud.root.classList.remove('hidden');
    this.state = 'shop';
    this.audio.setMode('shop');
    // Purge les projectiles en vol : sinon ils restent gelés pendant la boutique
    // et frappent le joueur dès le lancement de la vague suivante.
    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.combo = { chain: 0, mult: 1, timer: 0 };
    this.hud.setCombo(1, 0);
    this.shop.open(this._shopState());
    this.characters.onShopOpen();
  }

  // Relancer le tirage coûte de plus en plus cher dans la même visite : on peut
  // forcer le destin une fois, deux à la rigueur, jamais indéfiniment.
  _reroll() {
    if (this.state !== 'shop') return;
    const prix = this.shop.prixRelance;
    if (this.credits < prix) {
      this.audio.deny();
      return;
    }
    this.credits -= prix;
    this.hud.setCredits(this.credits);
    this.audio.uiTick();
    this.shop.reroll(this._shopState());
  }

  _shopState() {
    return {
      credits: this.credits,
      levels: this.levels,
      wave: this.wave + 1,
      lives: this.lives,
      // La coque pilotée : c'est elle qui décide si un module propre à une coque
      // a le droit d'être proposé.
      coque: this.coque,
    };
  }

  buy(id) {
    const upgrade = UPGRADES.find((u) => u.id === id);
    if (!upgrade || this.state !== 'shop') return;
    const level = this.levels[id];
    const maxedHull = id === 'hull' && this.lives >= PLAYER.maxLives;
    const price = priceOf(upgrade, level);
    if (level >= upgrade.maxLevel || maxedHull || this.credits < price) {
      this.audio.deny();
      return;
    }
    this.credits -= price;
    this.levels[id]++;
    if (id === 'hull') {
      this.lives++;
      this.hud.setLives(this.lives);
    }
    this.stats = computeStats(this.levels, this.surcharge);
    // Ce qu'on achète se voit sur la coque, sinon ce n'est pas un achat : c'est
    // une case cochée.
    this._refreshShip();
    this.hud.setCredits(this.credits);
    this.audio.buy();
    this.characters.onBuy();
    // On passe l'état APRÈS l'achat : le module rappelé doit être choisi pour la
    // bourse qu'il reste, pas pour celle d'avant.
    this.shop.markBought(id, this._shopState());
    this.shop.refresh(this._shopState());
  }

  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    // 'paused' et non 'off' : couper la musique la ferait repartir de son intro
    // à chaque reprise, et trois pauses suffiraient à user les quatre premières mesures.
    this.audio.setMode(this.paused ? 'paused' : 'play');
    if (this.paused) {
      // Une pause sans sortie oblige à recharger la page pour changer de mode ou
      // de pilote — c'est-à-dire à quitter le jeu pour naviguer dans le jeu.
      const el = this._screen(`
        <div class="screen pause">
          <div class="go-title">Pause</div>
          <div class="title-menu">
            <button class="btn-launch" id="pause-reprendre">Reprendre${
              IS_TOUCH ? '' : ' <span class="key-hint">P</span>'
            }</button>
            <button class="btn-secondary" id="pause-quitter">Abandonner la partie</button>
          </div>
          <div class="title-press">${
            IS_TOUCH ? 'Touchez ailleurs pour reprendre' : 'Échap pour reprendre'
          }</div>
        </div>`);
      // Le fond reprend la partie ; les boutons, eux, doivent garder leur clic.
      el.addEventListener('click', () => this.togglePause());
      el.querySelector('#pause-reprendre').addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePause();
      });
      el.querySelector('#pause-quitter').addEventListener('click', (e) => {
        e.stopPropagation();
        // Abandonner est une fin de partie comme une autre : le score compte, et
        // il s'inscrit. Sans quoi la pause deviendrait le moyen d'effacer une
        // mauvaise partie.
        this.paused = false;
        this.audio.setMode('play');
        this.overlayRoot.innerHTML = '';
        this.showGameOver();
      });
    } else {
      this.overlayRoot.innerHTML = '';
    }
  }

  // Le boss change d'acte. Tout ce qui se VOIT part d'ici : la coque qui se
  // dégrade, le secteur qui se durcit, la barre qui change de tronçon. Le combat
  // n'a que trois moments à raconter, ils doivent s'entendre et se voir.
  onBossPhase(phase, { annonce = true } = {}) {
    this.hud.setBossPhase?.(phase);
    this.stage?.space?.setBossPhase?.(phase);
    const boss = this.enemies.boss;
    if (boss) Ships.setBossPhase?.(boss.group, phase);
    if (phase <= 1) return;
    // LA TABLE D'ACTES DU BOSS QUI EST LÀ, pas celle de KORN.
    //
    // Elle lisait BOSS_PHASES en dur : au deuxième acte de l'ombre d'ORION, le
    // jeu annonçait « MEUTE — Il ne patrouille plus, il bondit », c'est-à-dire le
    // nom et la phrase d'un boss qui n'était pas à l'écran. Vérifié en jouant.
    const ph = (boss?.fiche?.phases || BOSS_PHASES)[phase - 1];
    // Pendant une transformation, la phrase a déjà été dite — c'est le CRI, et il
    // doit rester à l'écran pendant la déflagration. Le nom de l'acte, lui, est
    // sur la barre de vie : le répéter par-dessus effacerait le cri.
    if (annonce) this.hud.announce(ph?.nom || '', ph?.dit || '', 2200, true);
    this.audio.bossAlarm();
    this.fx.shockwave(boss ? boss.group.position : this.player.position, 0xff4757, 9);
    this.fx.addShake(0.6);
    if (this.mode !== 'survie') this.characters.onBossHalf?.();
  }

  // ---- Commandes, instantanés, enregistrement ----

  // Le point visé par un doigt, converti dans le monde. C'est la seule fonction du
  // pipeline de commande qui connaisse encore l'écran.
  _viser(ndc) {
    return this.player.aimPoint(ndc, this.camera);
  }

  // La commande de cette frame, depuis les entrées réelles. On consomme au plus une
  // demande : deux actions dans la même frame sont indiscernables à l'œil, et la
  // seconde attendra seize millisecondes.
  _construitCommande(dt) {
    const ev = this._demandes.length ? this._demandes.shift() : EV.RIEN;
    return lireEntrees(this.cmd, this.input, (ndc) => this._viser(ndc), dt, this.fx.timeScale, ev);
  }

  // Tout ce dont une vague a besoin pour recommencer exactement pareil. Un replay
  // repart de cet état à CHAQUE vague : c'est ce qui empêche un écart minuscule de
  // s'accumuler sur dix minutes de jeu.
  _instantane() {
    return {
      w: this.wave,
      seed: this.seed,
      mode: this.mode,
      niveaux: { ...this.levels },
      coque: this.coque,
      // L'état de l'arme entre dans l'instantané : une charge en vol au changement
      // de vague doit être là au rejeu, sinon la partie diverge dès la première
      // détonation.
      arme: this.armes[this.coque]?.instantane?.() || null,
      surcharge: this.surcharge,
      score: this.score,
      // L'enchaînement en cours fait partie de l'état : il ne s'arrête pas à la
      // frontière d'une vague, il expire tout seul quelques secondes plus tard.
      combo: [this.combo.chain, this.combo.mult, this.combo.timer],
      credits: this.credits,
      vies: this.lives,
      fragments: this.fragments,
      // Sans elle, la relecture d'une escale se jouerait dans le vide : la
      // simulation serait juste, le lieu serait faux.
      escale: this.escale ? { ...this.escale } : null,
      bis: this.bis,
      energie: this.energy,
      mods: this.routeMods ? { ...this.routeMods } : null,
      heat: this.director.heat,
      vaisseau: this.player.instantane(),
      // À DEUX, UN SEUL VAISSEAU NE SUFFIT PAS.
      //
      // L'instantané ne portait que le mien. Il servait au rejeu et au
      // spectateur, où c'est exactement ce qu'il faut — mais il sert désormais à
      // réparer une divergence entre deux joueurs, et là il faut les deux bords.
      // Sans ça, celui qui restaure se retrouve avec le vaisseau de l'autre à la
      // place du sien.
      //
      // On les indexe par NUMÉRO DE JOUEUR, jamais par « moi » et « lui » : ces
      // deux mots désignent des choses différentes de chaque côté de la ligne,
      // et c'est précisément ainsi qu'on inverse deux vaisseaux sans s'en
      // apercevoir.
      duoMoi: this.variante === 'duo' ? this.duoMoi : null,
      vaisseau2: this.joueur2 ? this.joueur2.instantane() : null,
      bord2:
        this.variante === 'duo' && this.bord2
          ? {
              score: this.bord2.score,
              lives: this.bord2.lives,
              energy: this.bord2.energy,
              credits: this.bord2.credits,
              odTimer: this.bord2.odTimer,
            }
          : null,
      fiche: this._fiche(),
      systemIdx: this.mission?.systemIdx ?? null,
      gemmes: this.pickups.instantane(),
    };
  }

  // Un point de contrôle : de quoi VÉRIFIER, à la relecture, que la simulation
  // raconte toujours la même partie. Sans mesure, « c'est fidèle » n'est qu'une
  // opinion.
  _controle() {
    return [this.score, Math.round(this.player.position.x * 16), this.enemies.list.length];
  }

  // ---- Relecture ----

  // Restaure l'état complet d'une vague, puis la relance. On ne « rembobine » pas :
  // on repose la simulation exactement telle qu'elle était, et on la laisse
  // repartir. C'est plus court à écrire et bien plus sûr à vérifier.
  // ON RESTAURE PAR NUMÉRO DE JOUEUR, JAMAIS PAR « MOI » ET « LUI ».
  //
  // L'instantané vient de l'autre machine, où « moi » désigne quelqu'un d'autre.
  // Restaurer `etat.vaisseau` dans `this.player` est juste en rejeu et en
  // spectateur — on rejoue SA partie — mais faux à deux, où l'on garde le sien.
  // On regarde donc qui est qui, et l'on croise si nécessaire.
  _croiseBords(etat) {
    if (this.variante !== 'duo' || etat.duoMoi == null || !etat.vaisseau2) return etat;
    if (etat.duoMoi === this.duoMoi) return etat; // même point de vue, rien à faire
    // Points de vue opposés : son vaisseau est mon second, et inversement.
    return {
      ...etat,
      vaisseau: etat.vaisseau2,
      vaisseau2: etat.vaisseau,
      score: etat.bord2?.score ?? etat.score,
      vies: etat.bord2?.lives ?? etat.vies,
      energie: etat.bord2?.energy ?? etat.energie,
      credits: etat.bord2?.credits ?? etat.credits,
      bord2: {
        score: etat.score,
        lives: etat.vies,
        energy: etat.energie,
        credits: etat.credits,
        odTimer: 0,
      },
    };
  }

  _restaure(brut) {
    const etat = this._croiseBords(brut);
    this.mode = etat.mode || 'arcade';
    this.seed = etat.seed;
    this.levels = { ...etat.niveaux };
    this.coque = etat.coque || 'orion';
    for (const a of Object.values(this.armes)) a.clear();
    this.surcharge = etat.surcharge || 0;
    this.stats = computeStats(this.levels, this.surcharge);
    this.score = etat.score || 0;
    this.combo = etat.combo
      ? { chain: etat.combo[0], mult: etat.combo[1], timer: etat.combo[2] }
      : { chain: 0, mult: 1, timer: 0 };
    this.credits = etat.credits;
    this.lives = etat.vies;
    this.fragments = etat.fragments;
    this.escale = etat.escale ? { ...etat.escale } : null;
    this.bis = !!etat.bis;
    this.energy = etat.energie;
    this.routeMods = etat.mods ? { ...etat.mods } : null;
    this.director.reset();
    this.director.heat = etat.heat || 0;

    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.pickups.restaure(etat.gemmes);
    // Le second bord, quand il y en a un : sans lui, une resynchronisation à deux
    // remettrait mon vaisseau en place et laisserait celui du copain là où ma
    // simulation le croyait — c'est-à-dire au mauvais endroit.
    if (this.variante === 'duo' && this.joueur2 && etat.vaisseau2) {
      this.joueur2.restaure(etat.vaisseau2, this);
      if (etat.bord2) Object.assign(this.bord2, etat.bord2);
    }
    this.enemies.clear();
    this.bombFront = null;
    this.callWave = null;
    this.odTimer = 0;
    this.bombCooldown = 0;
    this.reflexCooldown = 0;

    this._refreshShip();
    this.player.restaure(etat.vaisseau, this);

    this.hud.setCredits(this.credits);
    this.hud.setLives(this.lives);
    this.hud.setScore(this.score);
    this.hud.setEnergy(this.energy / OVERDRIVE.max);
    this.startWave(etat.w);
    // APRÈS `startWave`, et l'ordre n'est pas négociable : la vague commence par
    // purger les armes, comme elle purge les projectiles. Restaurer avant
    // reviendrait à tout effacer juste après — une charge en vol au changement de
    // vague manquerait, et le rejeu divergerait à la première détonation.
    this.armes[this.coque]?.restaure?.(etat.arme);
  }

  // Lance la relecture d'une partie enregistrée.
  async regarde(partie) {
    const lecteur = await ouvreReplay(partie);
    if (lecteur?.obsolete) return 'obsolete';
    if (!lecteur || !lecteur.nbVagues) return false;
    this.overlayRoot.innerHTML = '';
    this.hud.root.classList.remove('hidden');
    this.shop.close();
    this.characters.hide();
    this.enregistreur.actif = false;
    this.rejeu = { lecteur, vitesse: 1, fini: false, acc: 0, ecarts: 0, partie };
    this.hud.setHiscore(this.hiscore);
    this.cmd = lecteur.cmd;
    this._restaure(lecteur.vaVersVague(0));
    this.audio.setMode('play');
    return true;
  }

  quitteRejeu() {
    if (!this.rejeu) return;
    this.rejeu = null;
    this.cmd = commandeVide();
    this.state = 'title';
    this.enemies.clear();
    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.pickups.clear();
    this.modules.clear();
    for (const a of Object.values(this.armes)) a.clear();
    this.showTitle();
  }

  // Une frame de relecture. On consomme autant de commandes que le temps réel
  // écoulé en réclame — donc la lecture garde la vitesse de la partie d'origine,
  // que l'écran affiche soixante ou cent vingt images par seconde.
  _updateRejeu(dtReel) {
    const r = this.rejeu;
    if (r.fini || r.pause) return;
    r.acc += dtReel * r.vitesse;
    let garde = 0;
    while (r.acc > 0 && garde++ < 12) {
      const cmd = r.lecteur.suivante();
      if (!cmd) {
        const suite = r.lecteur.vaVersVague(r.lecteur.index + 1);
        if (!suite) {
          r.fini = true;
          this._finDeRejeu();
          return;
        }
        this._restaure(suite);
        continue;
      }
      this.cmd = cmd;
      r.acc -= cmd.dt;
      this._updatePlaying(cmd.dt);
      const attendu = r.lecteur.controleAttendu();
      if (attendu && Math.abs(attendu[0] - this.score) > 0) r.ecarts++;
    }
    if (this._rejeuAvance) {
      // En images, pas en vagues : une partie de dix vagues dont la dernière dure
      // trois fois plus que les autres faisait avancer le curseur par à-coups, et
      // cliquer dessus n'aurait désigné aucun instant précis.
      this._rejeuAvance.style.transform = `scaleX(${r.lecteur.avancement})`;
    }
  }

  // ---- Boucle ----

  update(dt) {
    // Hors combat, rien ne gêne : la parole est libre. Sauf pendant l'arrivée en
    // escale, qui est un PLAN de trois secondes : une fenêtre de comm posée
    // dessus le réduit à un fond d'écran derrière un dialogue de boutique.
    if (this.state !== 'playing') this.characters.setCalme(this.state !== 'arrivee');

    // LA DÉMONSTRATION DE L'ÉCRAN D'ACCUEIL. On fait tourner une vraie partie
    // sous le menu : le pilote fantôme pousse des touches, et la simulation
    // avance comme pour un humain. L'état reste `title`, sinon le menu
    // disparaîtrait — c'est un fond, pas une partie qu'on aurait lancée.
    if (this.demo) {
      // LA VITRINE NE S'ARRÊTE PAS À LA FIN D'UNE VAGUE.
      //
      // Le fantôme, équipé comme il l'est, nettoie un tableau en dix secondes :
      // mesuré, la démonstration mourait de SUCCÈS et repartait sans arrêt, alors
      // qu'on lui demande de tenir une bonne minute. Une vague nettoyée enchaîne
      // donc sur la suivante, sans saut ni hangar — un spectateur n'a que faire
      // d'un écran de boutique. On ne rebat les cartes (autre coque, autre
      // tableau) qu'au bout d'une minute et demie.
      if (this.state !== 'title') {
        if (this.player.alive && this.horlogeDemo < 90) {
          this.shop.close();
          this.state = 'title';
          this.routeMods = { hp: 1, fire: 0.5, dive: 0.35, credits: 1 };
          this.startWave(this.wave + 1);
          this.state = 'title';
        } else {
          this._relanceDemo();
          return;
        }
      }
      this.horlogeDemo = (this.horlogeDemo || 0) + dt;
      dt = dtDepuis(quantifieDt(dt));
      this.piloteAuto.update(dt, this);
      this._updatePlaying(dt);
      return;
    }
    // Le présentoir du hangar tourne doucement : une carène ne se juge pas de face.
    if (this.vitrine && this.state === 'pilots') {
      this.player.group.rotation.y += dt * 0.55;
      return;
    }
    if (this.state === 'coques') {
      this._updateChoixCoque(dt);
      return;
    }
    if (this.paused) return;
    // Le pas de temps est arrondi dès l'entrée, en partie comme en relecture. Deux
    // simulations qui ne partagent pas exactement leurs pas de temps divergent en
    // quelques secondes, et le replay finirait par raconter une autre partie.
    dt = dtDepuis(quantifieDt(dt));

    if (this.rejeu) {
      this._updateRejeu(dt);
      return;
    }

    if (this.state === 'cinematic') {
      this.cameraOverride = this.cinematic.update(dt, this.camera);
      return;
    }

    // L'arrivée en escale tient la caméra de la même façon que la cinématique :
    // `main.js` repose le cadrage à chaque image, et seul `cameraOverride` le
    // laisse tranquille. Écrire dans la caméra depuis le module ne servirait à
    // rien — c'est le piège que ce branchement évite.
    if (this.state === 'arrivee') {
      this.cameraOverride = this.arrivee.update(dt);
      return;
    }
    this.cameraOverride = null;

    // Le saut avance avec le temps RÉEL : une transition d'interface ne doit pas
    // s'étirer parce qu'un ralenti d'esquive traînait encore.
    if (this.state === 'jump') {
      this.jump.update(this.fx.timeScale ? dt / this.fx.timeScale : dt);
      return;
    }

    if (this.spectateur) {
      this._updateRegard(dt);
    } else if (this.state === 'playing') {
      // À deux, le temps ne se consomme pas de la même façon : voir _updateDuo.
      if (this.variante === 'duo') this._updateDuo(dt);
      else this._updatePlaying(dt);
    } else if (this.state === 'shop') {
      // La boutique reste vivante : les gemmes restantes finissent d'arriver.
      this.pickups.update(
        dt,
        this.player.position,
        999,
        (v, p, big) => this._collectCredit(v, p, big),
        true
      );
    }
  }

  _updatePlaying(dt) {
    // En partie : on lit les entrées, on les arrondit, on les note. En relecture :
    // la commande est déjà posée par le lecteur, on n'y touche pas.
    // En partie : on lit les entrées, on les arrondit, on les note. En relecture :
    // la commande est déjà posée par le lecteur. À deux, c'est `_updateDuo` qui
    // s'en est chargé avant d'appeler ici — sans quoi on lirait le clavier deux
    // fois pour la même image.
    // TROIS FAÇONS DE NE PAS LIRE LE CLAVIER, et il fallait la troisième.
    //
    // En relecture, la commande vient du fichier. À deux, `_updateDuo` l'a déjà
    // posée. Et EN SPECTATEUR, elle vient du copain qu'on regarde — sans ce
    // dernier cas, on reconstruisait sa partie en y appliquant NOS touches.
    // Mesuré : 1990 points contre 3165, et un vaisseau qui ne bouge pas puisque
    // notre propre clavier ne dit rien.
    // Le maintien du bouton d'énergie se juge AVANT de bâtir la commande : c'est
    // lui qui peut y déposer un événement d'Overdrive.
    if (!this.rejeu && !this.spectateur) this._verifieMaintien();
    if (!this.rejeu && !this.spectateur && this.variante !== 'duo') {
      this._construitCommande(dt);
      this.enregistreur.frame(this.cmd, this._controle());
      dt = this.cmd.dt;
    }
    // ON DIFFUSE À CEUX QUI REGARDENT.
    //
    // Rien de la partie ne part sur le réseau : seulement la commande de
    // l'image, quelques octets. Le spectateur possède déjà l'instantané de la
    // vague et la même graine ; il rejoue donc la partie chez lui, exactement
    // comme le fait le mode replay depuis des mois. C'est le même code.
    // Celui qui a rejoint ne REGARDE plus : il joue, et il reçoit désormais les
    // commandes par le pas verrouillé. Continuer à lui envoyer le flux du
    // spectateur ferait avancer sa simulation deux fois.
    if (this._regardeurs?.size && !this.rejeu && !this.spectateur) {
      const c = commandeVersTableau(this.cmd);
      for (const qui of this._regardeurs) {
        if (qui !== this.duo.direct) this.duo.signale(qui, 'vc', c);
      }
    }
    if (this.cmd.ev) this._executeEvenement(this.cmd.ev);

    // Overdrive : cadence accrue, balles perforantes, tirs ennemis au ralenti.
    // Le tir prend l'allure de la fureur pendant l'Overdrive, et la reprend
    // normale ensuite. On le repose à chaque image : c'est une écriture de
    // couleur, et ça évite d'avoir à guetter les deux instants où ça bascule.
    {
      const n = this.odTimer > 0 ? FUREUR.degats[this.levels.fureur | 0] || 0 : 0;
      this.bullets.habille?.(FUREUR.teintes[n] ?? FUREUR.teintes[0], FUREUR.echelles[n] ?? 1);
    }

    if (this.odTimer > 0) {
      this.odTimer -= dt;
      if (this.odTimer <= 0) {
        this.hud.setOverdrive(false);
        // ON DOIT ENTENDRE QU'IL S'ARRÊTE. Sans ce signal, le joueur continue à
        // jouer comme s'il était encore en furie — à foncer, à traverser — et il
        // meurt sans comprendre ce qui a changé.
        this.audio.overdriveFin?.();
        this.fx.burst(this.player.position, 0x8ea0c0, { count: 12, speed: 7, life: 0.4 });
      }
    }
    const odActive = this.odTimer > 0;
    if (this.bombCooldown > 0) this.bombCooldown -= dt;

    // Le directeur monte la pression tant que le joueur ne se fait pas toucher.
    this.director.update(dt);
    const tier = this.director.pollTier();
    if (tier > 0) {
      this.hud.announce(`MENACE ${romanTier(tier)}`, '', 1200);
      this.enemies.setHeat(this.director.heat);
    }

    // ON SE TAIT TANT QUE LE JOUEUR PILOTE.
    //
    // Trois portes étaient ouvertes : l'entrée en formation, la vague nettoyée et
    // le vaisseau détruit. Les deux premières laissaient parler PENDANT qu'on
    // vole — on ne se fait pas tirer dessus, mais le panneau prend quand même le
    // quart bas de l'écran, celui où l'on manœuvre. Il ne reste donc que les
    // moments où le manche ne répond plus : coque détruite, ou partie en pause.
    // Tout le reste — hangar, saut, escale, cinématique, fin de partie — passe
    // par l'autre branche, celle qui ouvre la parole dès que l'état n'est plus
    // « playing ».
    this.characters.setCalme(!this.player.alive || this.paused);

    this.timeScale = this.cmd.echelle;
    this._updateCall(dt);
    this._updateReflex(dt);
    this._updateBombFront(dt);
    this._rafraichitMicro();

    this.player.update(dt, this);
    // Le second vaisseau est simulé exactement comme le premier, avec SON poste
    // de pilotage. Les deux machines exécutent ces deux lignes dans le même
    // ordre avec les mêmes commandes : c'est tout le contrat du pas verrouillé.
    if (this.joueur2) this.joueur2.update(dt, this, this.bord2);
    // Le vaisseau détruit n'est plus en furie : l'aura suivrait sinon une épave.
    this.aura.update(dt, this, this.odTimer > 0 && this.player.alive ? 1 : 0);
    this._updateColosse(dt);
    if (this.soutien.actif) {
      this.soutien.update(dt, this);
      // MAIS L'APPEL BREF NE PROTÈGE PAS. La séquence se déroule dans les deux
      // cas — sans quoi elle ne s'achèverait jamais — seule l'invulnérabilité est
      // réservée à l'appel complet. Le vaisseau reste dans le jeu et continue
      // d'esquiver pendant que le copain passe : sans cette distinction, une bombe
      // toutes les six secondes donnerait deux secondes d'invulnérabilité gratuite
      // à chaque fois, et la bombe cesserait d'être une arme pour devenir un abri.
      //
      // L'invulnérabilité de l'appel complet est reposée à chaque image plutôt que
      // fixée une fois : un coup encaissé juste avant pourrait sinon la faire
      // expirer au milieu du bombardement, pendant que le vaisseau est en l'air et
      // que le joueur n'a plus la main.
      if (!this.soutien.bref) this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.4);
    }
    const arme = this.armes[this.coque];
    if (arme) {
      if (this.player.alive) arme.update(dt, this);
      else if (!this._armeCoupee) {
        // LE VAISSEAU EST DÉTRUIT, L'ARME AUSSI. `update` ne tourne plus quand le
        // joueur est mort — et c'était tout le problème : une arme qui n'est plus
        // mise à jour ne s'efface pas, elle se FIGE. Le rayon d'HÉLIOS restait
        // donc tendu en travers de l'écran par-dessus l'explosion, jusqu'au
        // réapparition. Il faut le couper explicitement, une seule fois.
        arme.clear();
        this._armeCoupee = true;
      }
    }
    if (this.player.alive) this._armeCoupee = false;
    this.enemies.update(dt, this);
    this.bullets.update(dt);
    this.enemyBullets.update(dt, odActive ? OVERDRIVE.odBulletSlow : 1);
    this.missiles.update(dt);
    this._updateGraze();

    // LA VAGUE EST TOMBÉE, LES BALLES AUSSI.
    //
    // Le dernier ennemi mort, ses tirs continuaient leur course et pouvaient
    // encore tuer — un joueur qui vient de nettoyer sa vague se faisait abattre
    // par un mort, pendant qu'il ramassait ses crédits et que le HUD annonçait
    // déjà la suite. Ce n'est pas une difficulté, c'est une injustice : le combat
    // est fini, le danger doit l'être aussi.
    const vacuum = this.enemies.waveCleared();
    if (vacuum && !this._cieDegage) {
      this._cieDegage = true;
      this.enemyBullets.forEachActive((b) => {
        this.fx.burst(b.mesh.position, 0xff3df0, { count: 3, speed: 5, life: 0.3 });
        this.enemyBullets.kill(b);
      });
    } else if (!vacuum) {
      this._cieDegage = false;
    }
    this.modules.update(
      dt,
      this.player.position,
      this.stats.magnetRadius,
      (id, pos) => this._prendModule(id, pos),
      vacuum
    );
    this.pickups.update(
      dt,
      this.player.position,
      this.stats.magnetRadius,
      (v, p, big) => this._collectCredit(v, p, big),
      vacuum
    );

    // Combo : la fenêtre se resserre à chaque palier, les frôlements la rallongent.
    if (this.combo.chain > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) {
        this.combo.chain = 0;
        this.combo.mult = 1;
      }
    }
    this.hud.setCombo(this.combo.mult, this.combo.timer / this._comboWindow());

    this._collisions();

    // Respawn / game over différés, par pilote.
    this._respawn(dt, this);
    if (this.joueur2) this._respawn(dt, this.bord2);
    // La fin de partie n'appartient qu'au poste local : à deux, tant que le
    // copain vole encore, on attend.
    if (!this.player.alive && this.lives <= 0 && !this._duoAttente) {
      this.gameOverTimer -= dt;
      if (this.gameOverTimer <= 0) this.showGameOver();
    }

    // Fin de vague → bonus, puis boutique (ou victoire de mission en campagne).
    if (vacuum && this.player.alive) {
      // La survie a une LIGNE D'ARRIVÉE, et c'est ce qui la distingue de l'arcade :
      // on n'y joue pas jusqu'à la mort, on y va quelque part.
      const derniereVague = this.mode === 'survie' && this.wave >= SURVIE.vagues;
      if (!this.waveBonusGiven && !derniereVague) {
        this.waveBonusGiven = true;
        this.director.onWaveCleared(this.waveDeath);
        if (this.mode === 'survie') {
          // Pas de prime en crédits : il n'y a rien à acheter. La vague nettoyée
          // rapporte des POINTS, seule monnaie du mode — c'est elle qui départage
          // deux pilotes arrivés à la même vague.
          const points = 100 + this.wave * 25;
          this.score += points;
          this.hud.setScore(this.score);
          this.hud.announce(`Vague ${this.wave} tenue`, `+${points} points`, 1200);
        } else {
          const bonus = 25 + this.wave * 10;
          this.credits += bonus;
          this.hud.setCredits(this.credits);
          this.hud.announce('Vague nettoyée', `+${bonus} cr de prime`, 1800);
        }
      }
      this.waveEndTimer += dt;
      // On attend que le butin soit rentré — mais en survie on n'attend rien
      // d'autre : ni saut, ni boutique, ni choix de route. Cent vagues coupées cent
      // fois ne seraient pas un marathon, seulement cent petites parties.
      const butin = this.pickups.activeCount() + this.modules.activeCount();
      const attente = this.mode === 'survie' ? 0.55 : 1.2;
      if (this.waveEndTimer > attente && butin === 0) {
        if (derniereVague) this.showVictoire();
        else if (this.mode === 'survie') this.startWave(this.wave + 1);
        // Le niveau bis ne mène pas au suivant : il mène à celui qu'il a retardé.
        else if (this.bis) this._quitteEscale();
        else this._startJump();
      }
    }
  }

  // Réflexe Chrono : le ralenti de la dernière chance.
  //
  // On ne déclenche PAS sur « une balle est proche » — ce serait le frôlement, qui
  // rapporte déjà de l'énergie. On déclenche sur « cette balle va toucher » :
  // approche la plus courte calculée dans le repère de la balle, et déclenchement
  // seulement si cette approche passe sous le rayon de collision.
  _updateReflex(dt) {
    if (this.reflexCooldown > 0) this.reflexCooldown -= dt;
    const duration = this.stats.reflexDuration;
    if (!duration || this.reflexCooldown > 0 || !this.player.alive) return;
    if (this.player.invulnTimer > 0 || this.player.shieldUp) return; // rien à sauver

    const p = this.player.position;
    const threat = PLAYER.radius + REFLEX.hitPad;
    let found = null;
    this.enemyBullets.forEachActive((b) => {
      if (found) return;
      const v = b.vel;
      const dx = b.mesh.position.x - p.x;
      const dz = b.mesh.position.z - p.z;
      const vv = v.x * v.x + v.z * v.z;
      if (vv < 1e-4) return;
      // Instant de l'approche minimale : dérivée nulle de la distance au carré.
      const tca = -(dx * v.x + dz * v.z) / vv;
      if (tca <= 0 || tca > REFLEX.lookahead) return; // déjà passée, ou pas encore le moment
      const mx = dx + v.x * tca;
      const mz = dz + v.z * tca;
      if (mx * mx + mz * mz <= threat * threat) found = b;
    });
    if (!found) return;

    this.reflexCooldown = this.stats.reflexCooldown;
    this.fx.slowmo(duration, REFLEX.scale);
    this.fx.shockwave(p, 0xffd166, 5, { faceCamera: true, camera: this.camera });
    this.audio.reflexIn();
    setTimeout(() => this.audio.reflexOut(), duration * 1000 * REFLEX.scale * 3);
    this.hud.announce('RÉFLEXE', '', 700);
    this.characters.teachOnce('reflexFirst');
  }

  // Front de la Nova Bomb : une couronne qui s'éloigne du vaisseau et détruit ce
  // qu'elle traverse. L'ancienne version frappait tout instantanément dans un rayon
  // fixe — donc jamais la formation en haut de l'écran, et jamais le boss.
  _updateBombFront(dt) {
    const f = this.bombFront;
    if (!f) return;
    const prev = f.radius;
    f.radius += OVERDRIVE.bombFrontSpeed * dt;
    if (prev > OVERDRIVE.bombFrontMax) {
      this.bombFront = null;
      return;
    }
    const inner = Math.max(0, f.radius - OVERDRIVE.bombFrontThickness);
    for (const e of [...this.enemies.list]) {
      if (!e.alive || f.hit.has(e.id)) continue;
      const d = e.group.position.distanceTo(f.origin);
      if (d > f.radius || d < inner) continue;
      f.hit.add(e.id);
      this.fx.burst(e.group.position, 0x8ffbff, { count: 6, speed: 7, life: 0.35 });
      this.enemies.damage(
        e,
        e.type === 'boss' ? OVERDRIVE.bombBossDamage : OVERDRIVE.bombDamage,
        this
      );
    }
    // Le front efface aussi les projectiles qu'il rattrape : la bombe reste un
    // bouton panique du début à la fin de son parcours, pas seulement à l'allumage.
    this.enemyBullets.forEachActive((b) => {
      const d = b.mesh.position.distanceTo(f.origin);
      if (d > f.radius || d < inner) return;
      this.fx.burst(b.mesh.position, 0xff3df0, { count: 2, speed: 4, life: 0.25 });
      this.enemyBullets.kill(b);
    });
    // Une onde visible toutes les deux étapes : le front doit se VOIR avancer,
    // sinon les ennemis lointains meurent sans cause apparente.
    f.ringTimer -= dt;
    if (f.ringTimer <= 0) {
      f.ringTimer = 0.16;
      this.fx.shockwave(f.origin, 0x8ffbff, f.radius * 0.9);
    }
  }

  _comboWindow() {
    return COMBO.windows[Math.min(this.combo.mult, COMBO.windows.length - 1)];
  }

  // Frôlement : on mémorise la distance minimale de chaque balle ennemie et on
  // crédite quand elle DÉPASSE le joueur — jamais avant, sinon une balle qui touche
  // rapporterait un graze la frame d'avant.
  _updateGraze() {
    if (!this.player.alive) return;
    // LE FRÔLEMENT APPARTIENT À ORION. Partagé par les trois coques, il les aurait
    // fait jouer pareil malgré leurs armes : le joueur se serait approché des balles
    // dans les trois cas, et le choix de coque n'aurait plus porté que sur la façon
    // de tirer. Chaque coque a donc sa propre source d'énergie — la chauffe pour
    // HÉLIOS, la salve pour VULCAIN — et chacune récompense exactement son verbe.
    if ((this.coque || 'orion') !== 'orion') return;
    const p = this.player.position;
    const grazeRR = (GRAZE.radius + this.enemyBullets.radius) ** 2;
    this.enemyBullets.forEachActive((b) => {
      const d = b.mesh.position.distanceToSquared(p);
      if (d < b.minDistSq) b.minDistSq = d;
      if (!b.grazed && b.mesh.position.z > p.z + 0.6) {
        b.grazed = true;
        if (b.minDistSq < grazeRR) this._onGraze(b.mesh.position);
      }
    });
  }

  _onGraze(pos) {
    this.waveGrazes++;
    this.characters.teachOnce('grazeFirst');
    this.score += GRAZE.score * this.combo.mult * (this.odTimer > 0 ? OVERDRIVE.odScoreMul : 1);
    this.hud.setScore(this.score);
    this._addEnergy(GRAZE.energy);
    // Sursis de combo : c'est ce qui rend les paliers ×6-×8 tenables.
    if (this.combo.chain > 0) {
      this.combo.timer = Math.min(this._comboWindow(), this.combo.timer + GRAZE.comboRefill);
    }
    // Le bouclier se recharge au RISQUE, pas seulement à l'horloge.
    if (this.player.shieldRechargeTimer > 0) {
      this.player.shieldRechargeTimer -= GRAZE.shieldRecharge;
    }

    // Retour franc : sans lui, personne ne comprend comment remplir la jauge.
    this.player.grazeFlash = 1;
    this.fx.burst(pos, 0x8ffbff, { count: 10, speed: 9, life: 0.4, spread: 0.5 });
    this.fx.shockwave(pos, 0x8ffbff, 2.4);
    this.audio.graze(Math.min(6, this.waveGrazes));
    this.hud.pulseEnergy();
    this._tmp.copy(pos).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.hud.grazePop(
      (this._tmp.x * 0.5 + 0.5) * rect.width,
      (-this._tmp.y * 0.5 + 0.5) * rect.height
    );
  }

  _collisions() {
    const enemies = this.enemies.list;

    // Tirs du joueur → ennemis (perforants pendant l'Overdrive).
    //
    // LE COUP AU CENTRE COMPTE DOUBLE. Toucher un ennemi n'importe où faisait le
    // même dégât : viser n'existait pas comme geste, il n'y avait qu'à arroser la
    // colonne. Le cœur de la cible — le tiers central de son rayon — inflige
    // maintenant le double, et le dit franchement, sinon personne ne remarquerait
    // jamais qu'il y a quelque chose à viser.
    const pierceMax = this.odTimer > 0 ? OVERDRIVE.odPierce : 1;
    // UNE MINE SE TIRE. C'est ce qui la sépare d'un obstacle : elle pose une
    // question — la dégager maintenant, ou la contourner et garder son tir — et
    // une question à laquelle on ne peut pas répondre n'est qu'une gêne.
    this.bullets.forEachActive((b) => {
      const mine = this.enemies.mineSous(b.mesh.position, this.bullets.radius);
      if (mine) {
        this.enemies.amorceMine(mine, this);
        this.bullets.kill(b);
        this.score += MINE.score * this.combo.mult;
      }
    });
    this.bullets.forEachActive((b) => {
      for (const e of enemies) {
        if (!e.alive || b.hitIds.includes(e.id)) continue;
        const rr = e.def.radius + this.bullets.radius;
        const d2 = b.mesh.position.distanceToSquared(e.group.position);
        if (d2 < rr * rr) {
          b.hitIds.push(e.id);
          b.pierce++;
          if (b.pierce >= pierceMax) this.bullets.kill(b);
          // L'ÉCART LATÉRAL, PAS LA DISTANCE. Mesurée en trois dimensions, la
          // précision ne se déclenchait JAMAIS — zéro coup au centre sur dix-huit
          // touches, mesuré. C'est mécanique : la collision est détectée à la
          // première image où la balle entre dans le disque, donc toujours par le
          // BORD, et jamais au moment où elle passe au plus près du centre.
          //
          // Ce qui compte est d'ailleurs l'écart de côté, et rien d'autre : une
          // balle qui monte droit vers un ennemi est bien visée si elle arrive
          // dans son axe. C'est aussi ce que le joueur croit faire quand il aligne
          // son vaisseau — la règle rejoint enfin le geste.
          //
          // Le seuil se mesure sur le rayon de l'ENNEMI seul, pas sur la somme des
          // deux : sinon une grosse balle serait critique en effleurant un petit
          // ennemi, et la précision récompenserait le calibre au lieu de la visée.
          const coeur = e.def.radius * PRECISION.part;
          const dx = b.mesh.position.x - e.group.position.x;
          const dy = b.mesh.position.y - e.group.position.y;
          const critique = dx * dx + dy * dy < coeur * coeur;
          if (critique) this._marquePrecision(b.mesh.position, e);
          // LA FUREUR. Elle ne vaut que pendant l'Overdrive, et elle s'ajoute au
          // coup critique plutôt que de le remplacer : bien viser en pleine furie
          // doit rester le meilleur moment du jeu.
          const fureur = this.odTimer > 0 ? FUREUR.degats[this.levels.fureur | 0] || 0 : 0;
          const degats = (critique ? PRECISION.degats : 1) + fureur;
          if (this.enemies.damage(e, degats, this))
            this._onEnemyKilled(e, critique ? 'precision' : 'cannon');
          if (b.pierce >= pierceMax) break;
        }
      }
    });

    // Missiles → ennemis (dégâts lourds).
    this.missiles.forEachActive((m) => {
      for (const e of enemies) {
        if (!e.alive) continue;
        const rr = e.def.radius + this.missiles.radius;
        if (m.mesh.position.distanceToSquared(e.group.position) < rr * rr) {
          this.missiles.kill(m);
          this.fx.explosionSmall(m.mesh.position, 0xffc857);
          if (this.enemies.damage(e, 3, this)) this._onEnemyKilled(e, 'missile');
          break;
        }
      }
    });

    // CHAQUE PILOTE A SES PROPRES COLLISIONS. À deux, un tir ne touche pas « le
    // joueur » : il touche l'un des deux, et l'autre continue. Les tirs des
    // JOUEURS, eux, restent communs — il n'y a qu'une arène et qu'un tas
    // d'ennemis.
    this._collisionsPilote(this, enemies);
    if (this.joueur2) this._collisionsPilote(this.bord2, enemies);
  }

  // `bord` désigne le poste de pilotage : le jeu lui-même pour le premier joueur,
  // `bord2` pour le second. Les vaisseaux ne se gênent pas entre eux — ni
  // collision, ni tir fratricide — parce qu'à deux on se serre, et qu'un jeu où
  // l'on se bouscule punit la coopération qu'il vient d'inventer.
  _collisionsPilote(bord, enemies) {
    const qui = bord === this ? this.player : this.joueur2;
    if (!qui?.alive) return;
    const pPos = qui.position;

    // LE RAYON DU LANCIER, ET LA MINE.
    //
    // Ces deux-là ne sont pas des balles : ils occupent une ZONE, pas un point,
    // et ils frappent donc avant la boucle des projectiles. Le tonneau ne les
    // renvoie pas — on ne renvoie pas une colonne de lumière, et une mine qu'on
    // traverse en tournant reste une mine. Le tonneau garde son invulnérabilité,
    // rien de plus : c'est ce qui empêche la pirouette de devenir la réponse à
    // tout.
    if (!qui.rolling && qui.invulnTimer <= 0) {
      if (this.enemies.rayonTouche(pPos)) {
        this._playerHit(bord);
        return;
      }
      if (this.enemies.souffleTouche(pPos)) {
        this._playerHit(bord);
        return;
      }
      const mine = this.enemies.mineHeurte(pPos, PLAYER.radius);
      if (mine) {
        this.enemies.amorceMine(mine, this);
        this._playerHit(bord);
        return;
      }
    }

    // Tirs ennemis → joueur. Pendant un tonneau, la balle est RENVOYÉE.
    //
    // Elle était simplement détruite : on voyait qu'on l'avait esquivée, ce qui
    // suffisait à lire l'invincibilité, mais la manœuvre ne rapportait rien
    // d'autre. La renvoyer change la nature du geste — le tonneau cesse d'être
    // une fuite pour devenir une réponse, et il faut le tenter au bon moment
    // plutôt que par précaution. Ça reste payé : neuf points d'énergie, un
    // demi-seconde de rechargement, et il faut être là où la balle arrive.
    this.enemyBullets.forEachActive((b) => {
      const rr = PLAYER.radius + this.enemyBullets.radius;
      if (b.mesh.position.distanceToSquared(pPos) >= rr * rr) return;
      if (qui.rolling) {
        this.fx.burst(b.mesh.position, 0x8ffbff, { count: 6, speed: 8, life: 0.28 });
        this.enemyBullets.kill(b);
        // Elle repart d'où elle vient, plus vite qu'elle n'est arrivée : un
        // renvoi mou se ferait rattraper par la formation qui descend, et on ne
        // verrait jamais ce qu'on a réussi.
        this._renvoie(b);
        this._addEnergy(GRAZE.energy * 0.35); // une balle traversée reste un risque pris
        return;
      }
      this.enemyBullets.kill(b);
      this._playerHit(bord);
    });

    // Collision de plein fouet avec un ennemi (plongée).
    for (const e of enemies) {
      if (!e.alive) continue;
      const rr = PLAYER.radius + e.def.radius;
      if (e.group.position.distanceToSquared(pPos) < rr * rr) {
        if (e.type !== 'boss') {
          if (this.enemies.damage(e, 99, this)) this._onEnemyKilled(e, 'ram');
        }
        this._playerHit(bord);
        break;
      }
    }
  }

  // Le retour en vol d'un pilote. Chacun a son compte à rebours : à deux, l'un
  // peut revenir pendant que l'autre se bat.
  _respawn(dt, bord) {
    const qui = bord === this ? this.player : this.joueur2;
    if (!qui || qui.alive || bord.lives <= 0) return;
    bord.respawnTimer -= dt;
    // On repart sans bouclier : son timer redémarre à plein.
    if (bord.respawnTimer <= 0) {
      qui.reset({ keepUpgrades: false, shieldRecharge: bord.stats.shieldRecharge });
    }
  }

  // Ce qu'on voit d'un coup au centre. Un dégât doublé qui ne se voit pas n'est
  // pas une récompense, c'est un hasard : il faut que le joueur SACHE qu'il vient
  // de bien viser, à l'instant même, sans avoir à compter des points de vie.
  _marquePrecision(pos, e) {
    this.fx.burst(pos, 0xfff3d0, { count: 10, speed: 11, life: 0.28, spread: 0.5 });
    this.fx.shockwave(pos, 0xffc857, e.def.radius * 2.2);
    this.audio.comboUp?.(3);
    this.hud.grazePop?.(...this._versEcran(pos));
  }

  // Un point du monde vers les coordonnées de l'écran, pour les repères du HUD.
  _versEcran(pos) {
    this._tmp.copy(pos).project(this.camera);
    return [
      ((this._tmp.x + 1) / 2) * window.innerWidth,
      ((1 - this._tmp.y) / 2) * window.innerHeight,
    ];
  }

  // Le renvoi : la balle ennemie devient un projectile du joueur, à la place et
  // dans la direction opposée. On ne réutilise pas l'objet — les deux pools ont
  // des tailles, des rayons et des matières différents, et faire voyager une
  // entrée de l'un à l'autre reviendrait à les mélanger pour économiser une
  // allocation qui n'existe pas, puisque tout est préalloué des deux côtés.
  _renvoie(b) {
    const v = this._tmp.copy(b.vel);
    const vitesse = Math.max(PLAYER.bulletSpeed * 0.9, v.length() * 1.6);
    v.set(-b.vel.x, 0, -Math.abs(b.vel.z) || -1)
      .normalize()
      .multiplyScalar(vitesse);
    this.bullets.spawn(b.mesh.position, v);
    this.audio.shoot?.();
  }

  // Mourir coûte désormais six choses lisibles au lieu d'une : la vie, le combo,
  // toute l'énergie, l'Overdrive en cours, le bouclier et la prime de vague.
  _playerHit(bord = this) {
    // LE FANTÔME S'EN SORT TOUJOURS, ET C'EST ASSUMÉ.
    //
    // J'ai d'abord essayé de le faire jouer assez bien pour tenir la minute
    // demandée : anticipation des trajectoires, évaluation de vingt et une
    // positions, pénalisation du trajet, recul en profondeur. Chaque version a
    // gagné quelques secondes, aucune n'a passé la barre — mesuré, il tenait
    // entre quatre et trente-trois secondes selon la vague, sans régularité.
    // Écrire une IA qui survit vraiment à une vague 13 est un projet en soi, et
    // ce n'est pas ce qu'on demande à un écran d'accueil.
    //
    // Alors il esquive AU DERNIER MOMENT. Le coup qui devait le toucher déclenche
    // une pirouette et une invulnérabilité brève : on voit un pilote qui s'en
    // sort de justesse, ce qui est plus beau qu'un pilote qui ne risque rien — et
    // c'est exactement ce que faisaient les bornes d'arcade, qui ne jouaient pas
    // non plus. Rien de tout cela n'existe en partie réelle.
    if (this.demo) {
      if (!this.player.rolling) this.player.startRoll?.(this.player.position.x > 0 ? -1 : 1);
      this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.9);
      this.fx.burst(this.player.position, 0x8ffbff, { count: 8, speed: 9, life: 0.3 });
      return;
    }

    // `bord` est le poste touché : le jeu lui-même pour le premier pilote, le
    // second bord pour l'autre. `moi` dit si c'est CE joueur-ci — le HUD, les
    // répliques et la secousse ne concernent que lui.
    const moi = bord === this;
    const qui = moi ? this.player : this.joueur2;
    const result = qui.takeHit(this, bord);
    if (result === 'shield') {
      if (moi) {
        this.characters.onShieldLost();
        this.director.onShieldBroken();
      }
      return;
    }
    if (result !== 'hit') return;
    bord.lives--;
    bord.energy = 0;
    bord.odTimer = 0;
    if (moi) {
      this.hud.setLives(this.lives);
      this.combo = { chain: 0, mult: 1, timer: 0 };
      this.hud.setEnergy(0);
      this.hud.setOverdrive(false);
      this.bombCooldown = 0;
      this.waveDeath = true;
      this.director.onDeath();
    }
    qui.die(this);
    if (bord.lives > 0) {
      // LA RENAISSANCE EST PROPRE À CHACUN. À deux, l'un peut être en train de
      // revenir pendant que l'autre se bat : un seul compteur les ferait
      // réapparaître ensemble, ce qui n'a aucun sens.
      bord.respawnTimer = 1.3;
      if (moi) this.characters.onLifeLost();
    } else if (moi) {
      // LA PARTIE NE FINIT PAS PARCE QUE J'AI PERDU. À deux, on attend que
      // l'autre tombe aussi — c'est la règle du jeu, et c'est ce qui rend la
      // dernière vie du copain intéressante à regarder.
      if (!this.joueur2 || this.bord2.lives <= 0) this.gameOverTimer = 1.8;
      else this._duoAttente = true;
    } else if (this.lives <= 0) {
      // L'autre vient de tomber alors que j'étais déjà à terre : c'est fini.
      this._duoAttente = false;
      this.gameOverTimer = 1.8;
    }
  }

  // source : 'cannon' | 'missile' | 'ram' | 'bomb'. Seuls les kills au canon
  // rechargent l'énergie (sinon les missiles automatiques la rempliraient tout seuls).
  _onEnemyKilled(e, source = 'cannon') {
    // Combo.
    this.combo.chain++;
    this.combo.timer = this._comboWindow();
    const newMult = Math.min(
      1 + Math.floor(this.combo.chain / COMBO.killsPerTier),
      COMBO.maxMultiplier
    );
    if (newMult > this.combo.mult) {
      this.combo.mult = newMult;
      this.audio.comboUp(newMult);
      this.hud.pulseCombo();
      this.hud.announce(`Combo ×${newMult}`, '', 800);
      this.characters.onComboUp(newMult);
      // Un palier n'est payé qu'à sa PREMIÈRE atteinte dans la vague : sinon
      // casser et refaire sa chaîne finançait la prochaine bombe.
      if (newMult > this.waveBestTier) {
        this.waveBestTier = newMult;
        this._addEnergy(OVERDRIVE.energyPerComboTier);
      }
    }
    if (source === 'cannon' && e.state === 'diving') {
      this._addEnergy(OVERDRIVE.energyPerDiverKill); // abattre une menace récompense
    }
    // Et la chaîne elle-même nourrit la furie, à chaque kill, proportionnellement
    // au multiplicateur : la jauge cesse d'être alimentée par le seul frôlement.
    // Deux façons de la charger, donc deux styles de jeu qui se valent.
    if (this.combo.mult > 1) {
      this._addEnergy(OVERDRIVE.energyPerComboHit * this.combo.mult);
    }

    // Score.
    const odMul = this.odTimer > 0 ? OVERDRIVE.odScoreMul : 1;
    this.score += e.def.score * this.combo.mult * odMul;
    this.hud.setScore(this.score);
    if (this.mode === 'arcade' && this.score > this.hiscore) this.hud.setHiscore(this.score);

    this._dropCredits(e);
  }

  _dropCredits(e) {
    // EN SURVIE, PAS D'ARGENT. Il n'y a rien à acheter : ce qui tombe, ce sont les
    // améliorations elles-mêmes. Le boss en lâche plusieurs — il vaut dix vagues.
    if (this.mode === 'survie') {
      const combien =
        e.type === 'boss' ? SURVIE.modulesParBoss : alea() < SURVIE.chanceModule ? 1 : 0;
      for (let i = 0; i < combien; i++) {
        const id = this._tireModule();
        if (!id) break;
        const p = e.group.position.clone();
        p.x += (i - (combien - 1) / 2) * 2.4;
        this.modules.lache(p, id);
      }
      return;
    }
    const creditMul = this.enemies.mods?.credits ?? 1;
    this.pickups.dropFrom(
      e.group.position,
      e.def.credits * creditMul * PICKUPS.gemValueScale,
      e.def.gemCount
    );
    // Enchaîner peut faire tomber une GROSSE pièce. La chance monte avec le
    // multiplicateur, et elle est nulle sans combo : c'est le seul endroit du jeu
    // où l'on VOIT qu'un enchaînement a payé.
    const mult = this.combo.mult;
    if (mult < 2) return;
    const chance = Math.min(PICKUPS.bigChanceMax, PICKUPS.bigChancePerTier * (mult - 1));
    if (alea() < chance) this.pickups.dropBig(e.group.position);
  }

  _collectCredit(value, pos3d, big = false) {
    // Le score grimpe jusqu'à ×8 mais les crédits plafonnent à ×3 : le combo
    // récompense le panache sans emballer l'économie.
    // Le bonus de combo sur les crédits se mérite : il faut avoir frôlé dans la vague.
    // La grosse pièce, elle, échappe au multiplicateur : elle EST déjà la
    // récompense du combo, et le « +10 » annoncé doit être celui qu'on encaisse.
    const cap = this.waveGrazes >= COMBO.grazesForCreditBonus ? COMBO.creditCap : 1;
    const gain = big ? value : Math.round(value * Math.min(this.combo.mult, cap));
    this.credits += gain;
    this.hud.setCredits(this.credits);
    if (big) this.audio.bigPickup();
    else this.audio.pickup(this.combo.mult);
    this.fx.burst(
      pos3d,
      0xffc857,
      big ? { count: 14, speed: 8, life: 0.5 } : { count: 3, speed: 3, life: 0.3 }
    );

    // Projection 3D → écran pour le petit "+N".
    this._tmp.copy(pos3d).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.hud.creditPop(
      (this._tmp.x * 0.5 + 0.5) * rect.width,
      (-this._tmp.y * 0.5 + 0.5) * rect.height,
      `+${gain}`,
      big
    );
  }
}
