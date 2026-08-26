// Chef d'orchestre : machine à états (titre → jeu → boutique → game over, carte de
// survie, victoire), collisions, score, combo, économie, persistance.

import * as THREE from 'three';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { PlayerBullets, EnemyBullets, Missiles } from './bullets.js';
import { Pickups } from './pickups.js';
import { Hud } from './hud.js';
import { Shop } from './shop.js';
import { Cinematic } from './cinematic.js';
import { makeWave, dailySeed } from './waves.js';
import { UPGRADES, priceOf, emptyLevels, computeStats } from './upgrades.js';
import {
  COMBO,
  PLAYER,
  STORAGE_KEYS,
  GRAZE,
  OVERDRIVE,
  PICKUPS,
  REFLEX,
  ROLL,
} from './constants.js';
import { Jump } from './jump.js';
import { biomeForWave, stageForWave, STAGES } from './space/biomes.js';
import {
  routesForStage,
  palierDeCoque,
  fragmentsAvantPalierSuivant,
  prochainPalier,
  PALIERS,
} from './routes.js';
import { classement, enregistrePartie, partieParId, challengeText } from './parties.js';
import * as reseau from './reseau.js';

import {
  listPilots,
  activePilot,
  setActivePilot,
  createPilot,
  majPilote,
  hasPin,
  verifyPin,
  sanitizeName,
} from './pilots.js';
import { CARENES, LIVREES } from './ships.js';
// En namespace : l'habillage des phases du boss vit dans ships.js, et cet appel ne
// doit pas empêcher le jeu de démarrer si la fonction n'y est pas encore.
import * as Ships from './ships.js';
import { Characters } from './characters.js';
import { Director, romanTier } from './director.js';
import { SURVIE, DEFAULT_MODS, BOSS_PHASES } from './constants.js';
import { alea, semer } from '../core/rng.js';
import { commandeVide, lireEntrees, EV, quantifieDt, dtDepuis } from './rejeu/commandes.js';
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
    this.cmd = commandeVide();
    this._demandes = []; // pirouettes, bombes, appels : un par frame, dans l'ordre
    this.enregistreur = new Enregistreur();
    this.rejeu = null; // { lecteur, vitesse, fini } quand on regarde une partie

    this.state = 'title';
    this.mode = 'arcade';
    this.paused = false;
    this.hiscore = Number(localStorage.getItem(STORAGE_KEYS.hiscore)) || 0;
    this.bestWave = Number(localStorage.getItem(STORAGE_KEYS.bestWave)) || 0;
    this._tmp = new THREE.Vector3();

    // Les parties en attente d'envoi partent dès l'ouverture : une session hors
    // ligne se rattrape au démarrage suivant, sans que le joueur ait rien à faire.
    reseau.pousse();

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
      const name = sanitizeName(input.value);
      if (name && !listPilots().some((p) => p.name === name)) createPilot(name, '');
      else if (name) setActivePilot(name);
      this.playCinematic({ handoff: true });
    });
  }

  // handoff : depuis l'écran-porte, la cinématique se plie sur la pose de jeu et
  // enchaîne directement sur la première vague. Depuis « Histoire », elle revient
  // au titre — sinon rejouer l'intro lancerait une partie non désirée.
  playCinematic({ handoff = false } = {}) {
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

  _releaseEnergyButton() {
    if (!this._energyPressStart) return;
    const held = (performance.now() - this._energyPressStart) / 1000;
    this._energyPressStart = 0;
    if (this.state !== 'playing' || this.paused || !this.player.alive) return;
    this._demande(held >= OVERDRIVE.holdTime ? EV.OVERDRIVE : EV.BOMBE);
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
    this.fx.shockwave(w.origin, 0xffc857, w.radius * 0.5);
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

  _tryOverdrive() {
    if (this.energy < OVERDRIVE.odCost) {
      this.audio.deny(); // ne déclenche PAS la bombe par erreur : le maintien est un choix
      return;
    }
    this.energy = 0;
    this.hud.setEnergy(0);
    this.odTimer = OVERDRIVE.odDuration;
    this.hud.setOverdrive(true);
    this.fx.shockwave(this.player.position, 0xffc857, 8);
    this.audio.comboUp(4);
    this.hud.announce('OVERDRIVE', 'score ×2', 1400);
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
    if (!scores.length) {
      return '<div class="lb-empty">Aucun pilote au panthéon — soyez le premier !</div>';
    }
    return `<ol class="lb-list">${scores
      .map((s, i) => {
        const revoyable = !!s.flux;
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
            <span class="lb-play">${revoyable ? '▶' : ''}</span>
          </${balise}>
        </li>`;
      })
      .join('')}</ol>`;
  }

  // Le tableau commun. Le classement du serveur remplace le local dès qu'il
  // arrive — jamais avant : un écran qui s'affiche vide en attendant le réseau est
  // pire qu'un écran qui montre ce qu'on a sous la main.
  async _rafraichitPantheon(el, selecteur = '#go-lb', mode = 'arcade') {
    const cible = el?.querySelector?.(selecteur);
    if (!cible) return;
    const distant = await reseau.classementDistant(10, mode);
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

  async _lanceRejeu(id) {
    let partie = partieParId(id);
    // Une ligne venue du serveur ne porte qu'un marqueur : le replay lui-même ne
    // se télécharge qu'au moment où on le demande. Charger douze enregistrements
    // pour en regarder un seul serait payer douze fois trop.
    if (!partie || !partie.flux || partie.flux === 'distant') {
      this.hud.announce('Chargement…', '', 1200);
      partie = await reseau.partieDistante(id);
    }
    if (!partie || !partie.flux) {
      this.hud.announce('Enregistrement indisponible', '', 1800);
      return;
    }
    const ok = await this.regarde(partie);
    if (ok === 'obsolete') {
      this.hud.announce('Partie trop ancienne', 'Les règles ont changé depuis', 2400);
      return;
    }
    if (!ok) {
      this.hud.announce('Enregistrement illisible', '', 1800);
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
        <div class="rejeu-piste"><i id="rejeu-avance"></i></div>
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

  showTitle() {
    this.state = 'title';
    // Quel tableau on regardait la dernière fois : revenir au menu ne doit pas
    // ramener systématiquement sur l'arcade quand on enchaîne les survies.
    const mode = this._modeTableau || 'arcade';
    this.audio.setMode('title');
    this.hud.root.classList.add('hidden');
    const scores = classement(5, this._modeTableau || 'arcade');
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
            Partie rapide${IS_TOUCH ? '' : ' <span class="key-hint">Espace</span>'}
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
      </div>
    `);
    this._brancheRejeux(el); // le panthéon du menu est cliquable, comme celui de fin
    this._rafraichitPantheon(el, '#title-lb', mode);
    for (const b of el.querySelectorAll('.lb-onglet')) {
      b.addEventListener('click', () => {
        this._modeTableau = b.dataset.mode;
        this.audio.uiTick();
        this.showTitle();
      });
    }
    el.querySelector('#btn-arcade').addEventListener('click', () => this.startRun('arcade'));
    el.querySelector('#btn-survie').addEventListener('click', () => this.startRun('survie'));
    el.querySelector('#btn-story').addEventListener('click', () => this.playCinematic());
    el.querySelector('#btn-pilot').addEventListener('click', () => this.showPilotSelect());
  }

  // Sélecteur de profils : chaque copain a son badge ; un code secret optionnel (4 chiffres)
  // dissuade l'emprunt de pseudo sur un appareil partagé.
  showPilotSelect(onDone = null) {
    this.state = 'pilots';
    this.hud.root.classList.add('hidden');
    const done = () => (onDone ? onDone() : this.showTitle());
    const pilots = listPilots();
    const el = this._screen(`
      <div class="screen pilots">
        <h2 class="shop-title">Qui pilote ?</h2>
        <div class="pilot-grid">
          ${pilots
            .map(
              (p, i) => `
            <div class="pilot-case">
              <button class="pilot-card" data-pilot="${i}">
                <span class="pilot-avatar big">${esc(p.name[0])}</span>
                <span class="pilot-card-name">${esc(p.name)}${hasPin(p) ? ' <span class="pin-lock">🔒</span>' : ''}</span>
              </button>
              <button class="pilot-edit" data-edit="${i}" title="Modifier le vaisseau de ${esc(p.name)}" aria-label="Modifier le vaisseau de ${esc(p.name)}">✎</button>
            </div>`
            )
            .join('')}
          <button class="pilot-card new" id="pilot-new">
            <span class="pilot-avatar big">+</span>
            <span class="pilot-card-name">Nouveau pilote</span>
          </button>
        </div>
        <div class="pilot-form-zone" id="pilot-form-zone"></div>
        <button class="btn-ghost" id="pilots-back">← Retour</button>
      </div>
    `);
    const zone = el.querySelector('#pilot-form-zone');
    el.querySelector('#pilots-back').addEventListener('click', () => this.showTitle());

    el.querySelectorAll('.pilot-card[data-pilot]').forEach((card) =>
      card.addEventListener('click', () => {
        const pilot = pilots[Number(card.dataset.pilot)];
        if (!hasPin(pilot)) {
          setActivePilot(pilot.name);
          this.audio.buy();
          done();
          return;
        }
        zone.innerHTML = `
          <form class="lb-form" id="pin-form">
            <input id="pin-input" type="password" inputmode="numeric" maxlength="4"
                   placeholder="Code de ${esc(pilot.name)}" autocomplete="off" aria-label="Code secret" />
            <button class="btn-launch" type="submit">OK</button>
          </form>`;
        const input = zone.querySelector('#pin-input');
        input.focus();
        zone.querySelector('#pin-form').addEventListener('submit', (e) => {
          e.preventDefault();
          if (verifyPin(pilot, input.value)) {
            setActivePilot(pilot.name);
            this.audio.buy();
            done();
          } else {
            this.audio.deny();
            input.value = '';
            input.placeholder = 'Mauvais code…';
          }
        });
      })
    );

    // Le hangar, après coup. L'apparence appartient au pilote et non à la partie :
    // il faut donc pouvoir la reprendre plus tard, sinon un choix fait en trois
    // secondes le jour de l'inscription est définitif.
    //
    // C'est aussi ici qu'un pilote créé avant l'arrivée du panthéon commun peut
    // s'inscrire en ligne : il lui manque un code et une adresse, rien d'autre.
    el.querySelectorAll('.pilot-edit').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const pilot = pilots[Number(b.dataset.edit)];
        const choix = { livree: pilot.livree || 'flotte', carene: pilot.carene || 'dague' };
        const enLigne = reseau.estInscrit(pilot.name);
        zone.innerHTML = `
          <form class="lb-form pilot-create" id="edit-form">
            <div class="pilot-note">Le vaisseau de <b>${esc(pilot.name)}</b></div>
            ${this._pimpHtml(choix)}
            ${
              enLigne
                ? '<div class="pilot-note">Ce pilote publie déjà ses scores en ligne.</div>'
                : `<input id="edit-pin" type="password" inputmode="numeric" maxlength="4"
                          placeholder="Code à 4 chiffres" autocomplete="off" aria-label="Code secret" />
                   <input id="edit-mail" type="email" maxlength="120" placeholder="Adresse d'un parent"
                          autocomplete="email" aria-label="Adresse électronique" />
                   <div class="pilot-note">Renseigne-les pour publier tes scores au panthéon commun.</div>`
            }
            <button class="btn-launch" type="submit">Enregistrer</button>
            <div class="pilot-error" id="pilot-error"></div>
          </form>`;
        this._branchePimp(zone, choix);
        zone.querySelector('#edit-form').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const erreur = zone.querySelector('#pilot-error');
          const code = zone.querySelector('#edit-pin')?.value || '';
          const mail = zone.querySelector('#edit-mail')?.value || '';
          majPilote(pilot.name, { ...choix, pin: code });
          setActivePilot(pilot.name);
          this._refreshShip();
          this.audio.buy();
          if (!enLigne && /^\d{4}$/.test(code) && mail.trim()) {
            erreur.textContent = 'Inscription…';
            const r = await reseau.inscris(pilot.name, code, mail.trim());
            if (!r.ok) {
              erreur.textContent =
                r.erreur === 'code'
                  ? 'Ce nom est déjà pris en ligne par quelqu’un d’autre.'
                  : 'Pas de réseau : tes scores monteront plus tard.';
              if (r.erreur === 'code') return;
            }
          }
          done();
        });
      })
    );

    el.querySelector('#pilot-new').addEventListener('click', () => {
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
            Le code et l'adresse servent à publier tes scores en ligne — et à
            retrouver ton pilote si tu oublies le code. Sans eux, tu joues quand
            même : tes parties restent sur cet appareil.
          </div>
          <button class="btn-launch" type="submit">C'est moi !</button>
          <div class="pilot-error" id="pilot-error"></div>
        </form>`;
      const nameInput = zone.querySelector('#new-name');
      nameInput.focus();
      this._branchePimp(zone, choix);
      zone.querySelector('#create-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = zone.querySelector('#new-pin').value;
        const mail = zone.querySelector('#new-mail').value;
        const erreur = zone.querySelector('#pilot-error');
        const result = createPilot(nameInput.value, code, choix);
        if (!result.ok) {
          this.audio.deny();
          erreur.textContent =
            result.error === 'exists'
              ? 'Ce nom est déjà pris sur cet appareil.'
              : result.error === 'full'
                ? 'Trop de pilotes ! Supprime-en un (à venir).'
                : 'Choisis un nom (lettres et chiffres).';
          return;
        }
        // Le pilote existe déjà sur l'appareil : on peut jouer. L'inscription en
        // ligne se tente ensuite, et son échec ne coûte que le panthéon commun —
        // jamais la partie.
        this.audio.buy();
        if (/^\d{4}$/.test(code) && mail.trim()) {
          erreur.textContent = 'Inscription…';
          const r = await reseau.inscris(result.name, code, mail.trim());
          if (!r.ok) {
            erreur.textContent =
              r.erreur === 'code'
                ? 'Ce nom est déjà pris en ligne, par quelqu’un qui a un autre code. Choisis-en un autre.'
                : r.erreur === 'email-requis'
                  ? 'Il manque une adresse valable pour publier en ligne.'
                  : 'Pas de réseau : tu joues, et tes scores monteront plus tard.';
            // Un pseudo déjà pris en ligne est le seul cas où l'on ne passe pas :
            // il faudrait publier sous un nom qui n'est pas le sien.
            if (r.erreur === 'code') return;
          }
        }
        done();
      });
    });
  }

  // « Rejouer » relance le mode qu'on vient de jouer : celui qui enchaîne les
  // survies ne veut pas se retrouver en arcade parce qu'il a appuyé trop vite.
  // Le sélecteur de vaisseau, partagé par la création et la modification. En
  // double, il aurait fini par diverger — et un joueur qui voit six livrées à la
  // création et cinq à la modification pense à juste titre que le jeu ment.
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
          this.player.group.visible = true;
          this.audio.uiTick();
        })
      );
    }
    this.player.rebuild(choix);
    this.player.group.visible = true;
  }

  _replay() {
    this.startRun(this.mode === 'survie' ? 'survie' : 'arcade');
  }

  showGameOver() {
    if (this.rejeu) return; // on regarde une partie : elle est déjà finie
    this.state = 'gameover';
    this.audio.setMode('title');
    this.audio.gameOver();
    this.hud.root.classList.add('hidden');

    // Arcade : records + inscription au panthéon local.
    const newRecord = this.score > 0 && this.score >= this.hiscore;
    if (this.score > this.hiscore) {
      this.hiscore = this.score;
      localStorage.setItem(STORAGE_KEYS.hiscore, String(this.hiscore));
    }
    if (this.wave > this.bestWave) {
      this.bestWave = this.wave;
      localStorage.setItem(STORAGE_KEYS.bestWave, String(this.bestWave));
    }
    // Inscription automatique au panthéon sous le pilote actif : zéro friction.
    // L'enregistrement de la partie, lui, se compresse — donc il s'écrit APRÈS
    // l'affichage. On ne fait pas attendre un écran de fin pour un gzip.
    const pilot = activePilot();
    const scores = classement(10, this.mode);
    const pilotLine =
      this.score > 0 && pilot
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
          <div class="lb-title">${this.mode === 'survie' ? '— Survie —' : '— Panthéon —'}</div>
          <div id="go-lb">${this._leaderboardHtml(scores, -1, this.mode)}</div>
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
    if (this.score > 0 && pilot) this._archive(el, pilot);
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
      mode: this.mode,
      replay,
    });
    // Le local d'abord, le serveur ensuite : la partie est déjà en sûreté sur
    // l'appareil quand on tente de la publier, donc une panne réseau ne coûte rien.
    reseau.enFile(partieParId(id));
    reseau.pousse().then(() => this._rafraichitPantheon(el, '#go-lb', this.mode));

    if (!el.isConnected) return;
    const ligne = el.querySelector('#go-pilot');
    if (ligne) {
      ligne.innerHTML =
        rang > 0
          ? `${esc(pilot.name)} — inscrit au panthéon <b class="gold">n°${rang}</b>`
          : `${esc(pilot.name)} — pas encore dans le top 10, retente !`;
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
    if (this.score > this.hiscore) {
      this.hiscore = this.score;
      localStorage.setItem(STORAGE_KEYS.hiscore, String(this.hiscore));
    }
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
          <div id="go-lb">${this._leaderboardHtml(classement(10, 'survie'))}</div>
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

  startRun(mode = 'arcade') {
    // Toute partie appartient à un pilote : c'est lui qui la publie au panthéon.
    if (!activePilot()) {
      this.showPilotSelect(() => this.startRun(mode));
      return;
    }
    this.mode = mode === 'survie' ? 'survie' : 'arcade';

    this.shop.close();
    this.overlayRoot.innerHTML = '';
    this.hud.root.classList.remove('hidden');

    this.score = 0;
    this.wave = 0;
    {
      this.levels = emptyLevels();
      this.credits = 0;
      this.lives = PLAYER.baseLives;
    }
    this.stats = computeStats(this.levels);
    this.fragments = 0;
    this._refreshShip(); // la coque repart de la livrée et de la carène du pilote
    this.combo = { chain: 0, mult: 1, timer: 0 };
    this.respawnTimer = 0;
    this.gameOverTimer = 0;
    this.waveEndTimer = 0;
    // Les premières secondes d'une vague : les ennemis entrent encore en formation,
    // personne ne tire. C'est le meilleur moment pour dire quelque chose.
    this.repit = 3.5;
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
    this.seed = dailySeed() + (this.mode === 'survie' ? 613 : 0);
    this.hud.setEnergy(0);
    this.hud.setOverdrive(false);

    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.pickups.clear();
    this.enemies.clear();
    this.player.shieldUp = false;
    this.player.reset();
    this.player.invulnTimer = 0;

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
    // On n'enregistre que l'arcade. Une partie de campagne dépend d'un fichier de
    // mission chargé à distance : la rejouer supposerait de le retrouver identique
    // des semaines plus tard, ce que rien ne garantit. Mieux vaut ne pas proposer un
    // bouton qui échouerait une fois sur deux.
    if (this.mode === 'arcade') {
      this.enregistreur.demarre({
        mode: 'arcade',
        seed: this.seed,
        pilote: activePilot()?.name || null,
      });
    } else {
      this.enregistreur.actif = false;
      this.enregistreur.vagues = [];
      this.enregistreur.courante = null;
    }
    this.startWave(1);
    this.characters.onRunStart(this.mode === 'survie');
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
    if (!this.rejeu) this.enregistreur.ouvreVague(this._instantane());
    this.state = 'playing';
    this.audio.setMode('play');
    this.waveEndTimer = 0;
    // Les premières secondes d'une vague : les ennemis entrent encore en formation,
    // personne ne tire. C'est le meilleur moment pour dire quelque chose.
    this.repit = 3.5;
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
      const nDiff = survie ? Math.max(1, Math.round(n * SURVIE.pente)) : n;
      const boss = survie ? n % SURVIE.bossTousLes === 0 : undefined;
      def = makeWave(nDiff, {
        seed: this.seed + (survie ? n * 977 : 0),
        forceBoss: boss === true ? true : undefined,
        noBoss: boss === false ? true : undefined,
      });
      // Le risque choisi sur la route ne vaut que pour UNE vague : on le consomme.
      const mods = this.routeMods ? { ...DEFAULT_MODS, ...this.routeMods } : DEFAULT_MODS;
      this.routeMods = null;
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
    if (!def.boss) this.audio.waveStart();
  }

  // Entre deux vagues : on saute. La boutique s'ouvre à l'arrivée, dans le nouveau
  // secteur — donc le joueur choisit ses améliorations en regardant déjà l'endroit
  // où il va se battre, et non l'arène vide qu'il vient de nettoyer.
  _startJump() {
    if (this.rejeu) return;
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
    this.fx.cancelSlowmo();
    this.jump.start({
      dialogue,
      onSwap: () => {
        this.stage.space?.setBiome(nextBiome);
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
      carene: p?.carene,
      tier: palierDeCoque(this.fragments),
      levels: this.levels,
    };
  }

  _refreshShip() {
    this.player.rebuild(this._fiche());
  }

  // Deux routes, deux récompenses, et un vrai dilemme : s'équiper ou comprendre.
  _showRouteChoice() {
    if (this.rejeu) return;
    this.state = 'route';
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

    const carte = (o) => `
      <button class="route" data-type="${o.type}">
        <span class="route-kind">${o.type === 'longue' ? 'Détour' : 'Direct'}</span>
        <span class="route-name">${esc(o.nom)}</span>
        <span class="route-desc">${esc(o.desc)}</span>
        <span class="route-gain">${esc(o.gain)}</span>
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
    this.credits += choix.credits;
    this.hud.setCredits(this.credits);
    this.routeMods = choix.risque ? choix.risque.mods : null;
    this.audio.buy();

    if (!choix.fragment) {
      this.openShop();
      return;
    }

    // Le fragment fait DEUX choses : il ouvre un souvenir, et il compte pour la
    // coque. C'est ce qui empêche l'histoire d'être une récompense décorative.
    const avant = palierDeCoque(this.fragments);
    this.fragments++;
    const apres = palierDeCoque(this.fragments);
    if (apres > avant) {
      // Le palier n'ajoutait que des plaques visibles. Il donne maintenant ce que
      // son propre commentaire promettait depuis le début : du blindage. Sans quoi
      // le détour se payait en crédits ET en risque, contre un effet nul.
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
    }

    this.overlayRoot.innerHTML = '';
    this.state = 'cinematic';
    const suite = () => this.openShop();
    if (!this.cinematic.playSouvenir(stageIdx, suite)) suite();
  }

  _biomeFor(wave) {
    // Un boss assombrit son secteur au lieu d'en changer : en survie ils tombent
    // tous les dix, en arcade tous les quatre.
    const pas = this.mode === 'survie' ? SURVIE.bossTousLes : 4;
    return biomeForWave(wave, wave % pas === 0);
  }

  launchNextWave() {
    if (this.state !== 'shop') return;
    this.shop.close();
    this.startWave(this.wave + 1);
  }

  openShop() {
    if (this.rejeu) return;
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
    return { credits: this.credits, levels: this.levels, wave: this.wave + 1, lives: this.lives };
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
    this.stats = computeStats(this.levels);
    // Ce qu'on achète se voit sur la coque, sinon ce n'est pas un achat : c'est
    // une case cochée.
    this._refreshShip();
    this.hud.setCredits(this.credits);
    this.audio.buy();
    this.characters.onBuy();
    this.shop.markBought(id);
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
  onBossPhase(phase) {
    this.hud.setBossPhase?.(phase);
    this.stage?.space?.setBossPhase?.(phase);
    const boss = this.enemies.boss;
    if (boss) Ships.setBossPhase?.(boss.group, phase);
    if (phase <= 1) return;
    const ph = BOSS_PHASES[phase - 1];
    this.hud.announce(ph?.nom || '', ph?.dit || '', 2200, true);
    this.audio.bossAlarm();
    this.fx.shockwave(boss ? boss.group.position : this.player.position, 0xff4757, 9);
    this.fx.addShake(0.6);
    this.characters.onBossHalf?.();
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
      score: this.score,
      // L'enchaînement en cours fait partie de l'état : il ne s'arrête pas à la
      // frontière d'une vague, il expire tout seul quelques secondes plus tard.
      combo: [this.combo.chain, this.combo.mult, this.combo.timer],
      credits: this.credits,
      vies: this.lives,
      fragments: this.fragments,
      energie: this.energy,
      mods: this.routeMods ? { ...this.routeMods } : null,
      heat: this.director.heat,
      vaisseau: this.player.instantane(),
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
  _restaure(etat) {
    this.mode = etat.mode || 'arcade';
    this.seed = etat.seed;
    this.levels = { ...etat.niveaux };
    this.stats = computeStats(this.levels);
    this.score = etat.score || 0;
    this.combo = etat.combo
      ? { chain: etat.combo[0], mult: etat.combo[1], timer: etat.combo[2] }
      : { chain: 0, mult: 1, timer: 0 };
    this.credits = etat.credits;
    this.lives = etat.vies;
    this.fragments = etat.fragments;
    this.energy = etat.energie;
    this.routeMods = etat.mods ? { ...etat.mods } : null;
    this.director.reset();
    this.director.heat = etat.heat || 0;

    this.bullets.clear();
    this.enemyBullets.clear();
    this.missiles.clear();
    this.pickups.restaure(etat.gemmes);
    this.enemies.clear();
    this.bombFront = null;
    this.callWave = null;
    this.odTimer = 0;
    this.bombCooldown = 0;
    this.reflexCooldown = 0;

    this._refreshShip();
    this.player.restaure(etat.vaisseau);

    this.hud.setCredits(this.credits);
    this.hud.setLives(this.lives);
    this.hud.setScore(this.score);
    this.hud.setEnergy(this.energy / OVERDRIVE.max);
    this.startWave(etat.w);
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
      const total = r.lecteur.nbVagues || 1;
      const part = (r.lecteur.index + r.lecteur.progression) / total;
      this._rejeuAvance.style.transform = `scaleX(${Math.max(0, Math.min(1, part))})`;
    }
  }

  // ---- Boucle ----

  update(dt) {
    // Hors combat, rien ne gêne : la parole est libre.
    if (this.state !== 'playing') this.characters.setCalme(true);
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
    this.cameraOverride = null;

    // Le saut avance avec le temps RÉEL : une transition d'interface ne doit pas
    // s'étirer parce qu'un ralenti d'esquive traînait encore.
    if (this.state === 'jump') {
      this.jump.update(this.fx.timeScale ? dt / this.fx.timeScale : dt);
      return;
    }

    if (this.state === 'playing') {
      this._updatePlaying(dt);
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
    if (!this.rejeu) {
      this._construitCommande(dt);
      this.enregistreur.frame(this.cmd, this._controle());
      dt = this.cmd.dt;
    }
    if (this.cmd.ev) this._executeEvenement(this.cmd.ev);

    // Overdrive : cadence accrue, balles perforantes, tirs ennemis au ralenti.
    if (this.odTimer > 0) {
      this.odTimer -= dt;
      if (this.odTimer <= 0) this.hud.setOverdrive(false);
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

    // Les moments où l'on peut parler sans gêner : l'entrée en formation, la vague
    // nettoyée, et le vaisseau détruit. Entre les deux, on se tait — sur petit
    // écran du moins, où le panneau recouvre l'aire de pilotage.
    if (this.repit > 0) this.repit -= dt;
    this.characters.setCalme(
      this.repit > 0 || !this.player.alive || this.enemies.waveCleared() || this.paused
    );

    this.timeScale = this.cmd.echelle;
    this._updateCall(dt);
    this._updateReflex(dt);
    this._updateBombFront(dt);

    this.player.update(dt, this);
    this.enemies.update(dt, this);
    this.bullets.update(dt);
    this.enemyBullets.update(dt, odActive ? OVERDRIVE.odBulletSlow : 1);
    this.missiles.update(dt);
    this._updateGraze();

    const vacuum = this.enemies.waveCleared();
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

    // Respawn / game over différés.
    if (!this.player.alive) {
      if (this.lives > 0) {
        this.respawnTimer -= dt;
        // On repart sans bouclier : son timer redémarre à plein.
        if (this.respawnTimer <= 0) {
          this.player.reset({ keepUpgrades: false, shieldRecharge: this.stats.shieldRecharge });
        }
      } else {
        this.gameOverTimer -= dt;
        if (this.gameOverTimer <= 0) this.showGameOver();
      }
    }

    // Fin de vague → bonus, puis boutique (ou victoire de mission en campagne).
    if (vacuum && this.player.alive) {
      // La survie a une LIGNE D'ARRIVÉE, et c'est ce qui la distingue de l'arcade :
      // on n'y joue pas jusqu'à la mort, on y va quelque part.
      const derniereVague = this.mode === 'survie' && this.wave >= SURVIE.vagues;
      if (!this.waveBonusGiven && !derniereVague) {
        this.waveBonusGiven = true;
        this.director.onWaveCleared(this.waveDeath);
        const bonus = 25 + this.wave * 10;
        this.credits += bonus;
        this.hud.setCredits(this.credits);
        this.hud.announce('Vague nettoyée', `+${bonus} cr de prime`, 1800);
      }
      this.waveEndTimer += dt;
      if (this.waveEndTimer > 1.2 && this.pickups.activeCount() === 0) {
        if (derniereVague) this.showVictoire();
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
    const pierceMax = this.odTimer > 0 ? OVERDRIVE.odPierce : 1;
    this.bullets.forEachActive((b) => {
      for (const e of enemies) {
        if (!e.alive || b.hitIds.includes(e.id)) continue;
        const rr = e.def.radius + this.bullets.radius;
        if (b.mesh.position.distanceToSquared(e.group.position) < rr * rr) {
          b.hitIds.push(e.id);
          b.pierce++;
          if (b.pierce >= pierceMax) this.bullets.kill(b);
          if (this.enemies.damage(e, 1, this)) this._onEnemyKilled(e, 'cannon');
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

    if (!this.player.alive) return;
    const pPos = this.player.position;

    // Tirs ennemis → joueur. Pendant un tonneau, la balle est DÉTRUITE mais ne
    // touche pas : on doit voir qu'elle a été esquivée, sinon l'invincibilité ne
    // se lit pas et le joueur croit à un raté du jeu.
    this.enemyBullets.forEachActive((b) => {
      const rr = PLAYER.radius + this.enemyBullets.radius;
      if (b.mesh.position.distanceToSquared(pPos) >= rr * rr) return;
      if (this.player.rolling) {
        this.fx.burst(b.mesh.position, 0x8ffbff, { count: 4, speed: 6, life: 0.25 });
        this.enemyBullets.kill(b);
        this._addEnergy(GRAZE.energy * 0.35); // une balle traversée reste un risque pris
        return;
      }
      this.enemyBullets.kill(b);
      this._playerHit();
    });

    // Collision de plein fouet avec un ennemi (plongée).
    for (const e of enemies) {
      if (!e.alive) continue;
      const rr = PLAYER.radius + e.def.radius;
      if (e.group.position.distanceToSquared(pPos) < rr * rr) {
        if (e.type !== 'boss') {
          if (this.enemies.damage(e, 99, this)) this._onEnemyKilled(e, 'ram');
        }
        this._playerHit();
        break;
      }
    }
  }

  // Mourir coûte désormais six choses lisibles au lieu d'une : la vie, le combo,
  // toute l'énergie, l'Overdrive en cours, le bouclier et la prime de vague.
  _playerHit() {
    const result = this.player.takeHit(this);
    if (result === 'shield') {
      this.characters.onShieldLost();
      this.director.onShieldBroken();
    }
    if (result !== 'hit') return;
    this.lives--;
    this.hud.setLives(this.lives);
    this.combo = { chain: 0, mult: 1, timer: 0 };
    this.energy = 0;
    this.hud.setEnergy(0);
    this.odTimer = 0;
    this.hud.setOverdrive(false);
    this.bombCooldown = 0;
    this.waveDeath = true;
    this.director.onDeath();
    this.player.die(this);
    if (this.lives > 0) {
      this.respawnTimer = 1.3;
      this.characters.onLifeLost();
    } else {
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
