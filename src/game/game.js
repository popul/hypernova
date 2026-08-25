// Chef d'orchestre : machine à états (titre → jeu → boutique → game over, carte de
// campagne, victoire de mission), collisions, score, combo, économie, persistance.

import * as THREE from 'three';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { PlayerBullets, EnemyBullets, Missiles } from './bullets.js';
import { Pickups } from './pickups.js';
import { Hud } from './hud.js';
import { Shop } from './shop.js';
import { GalaxyMap } from './galaxymap.js';
import { Cinematic } from './cinematic.js';
import { makeWave, dailySeed } from './waves.js';
import { UPGRADES, priceOf, emptyLevels, computeStats } from './upgrades.js';
import { COMBO, PLAYER, STORAGE_KEYS, GRAZE, OVERDRIVE, PICKUPS, REFLEX } from './constants.js';
import { Jump } from './jump.js';
import { biomeForWave, stageForWave, STAGES } from './space/biomes.js';
import { routesForStage, palierDeCoque, fragmentsAvantPalierSuivant } from './routes.js';
import { loadScores, saveScore, challengeText } from './leaderboard.js';
import {
  loadCampaigns,
  unseenCampaigns,
  markCampaignsSeen,
  saveMissionResult,
  loadProgress,
  enableAlerts,
  notifyNewCampaigns,
  DEFAULT_MODS,
} from './campaign.js';
import {
  listPilots,
  activePilot,
  setActivePilot,
  createPilot,
  hasPin,
  verifyPin,
  sanitizeName,
} from './pilots.js';
import { CARENES, LIVREES } from './ships.js';
import { Characters } from './characters.js';
import { Director, romanTier } from './director.js';
import { isTouchDevice } from '../core/input.js';

const IS_TOUCH = isTouchDevice();

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
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
    this.galaxyMap = new GalaxyMap(overlayRoot, {
      onLaunch: (campaign, systemIdx) => this.startRun('campaign', { campaign, systemIdx }),
      onBack: () => this.showTitle(),
      onEnableAlerts: () => enableAlerts(),
      audio,
    });
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

    this.state = 'title';
    this.mode = 'arcade';
    this.mission = null; // { campaign, systemIdx, system } en mode campagne
    this.paused = false;
    this.hiscore = Number(localStorage.getItem(STORAGE_KEYS.hiscore)) || 0;
    this.bestWave = Number(localStorage.getItem(STORAGE_KEYS.bestWave)) || 0;
    this._tmp = new THREE.Vector3();

    // Campagnes : chargées en tâche de fond (réseau + fallback embarqué).
    this.campaigns = [];
    this.unseenIds = [];
    loadCampaigns().then((campaigns) => {
      this.campaigns = campaigns;
      const fresh = unseenCampaigns(campaigns);
      this.unseenIds = fresh.map((c) => c.id);
      if (fresh.length) notifyNewCampaigns(fresh);
      if (this.state === 'title') this.showTitle(); // rafraîchit le badge « nouveau »
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
      else if (this.state === 'gameover' || this.state === 'mission-complete') this._replay();
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
    this.galaxyMap.close();
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
    if (held >= OVERDRIVE.holdTime) this._tryOverdrive();
    else this._tryBomb();
  }

  _addEnergy(amount) {
    if (this.odTimer > 0) return; // gain gelé pendant l'Overdrive : pas de boucle infinie
    this.energy = Math.min(OVERDRIVE.max, this.energy + amount);
    this.hud.setEnergy(this.energy / OVERDRIVE.max);
    // NOVA explique la bombe et l'Overdrive à la première occasion réelle de s'en servir.
    if (this.energy >= OVERDRIVE.odCost) this.characters.teachOnce('odReady', IS_TOUCH);
    else if (this.energy >= OVERDRIVE.bombCost) this.characters.teachOnce('bombReady', IS_TOUCH);
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
    this.galaxyMap.close();
    this.overlayRoot.innerHTML = '';
    const div = document.createElement('div');
    div.innerHTML = html;
    const el = div.firstElementChild;
    this.overlayRoot.appendChild(el);
    return el;
  }

  _leaderboardHtml(scores, highlightRank = -1) {
    if (!scores.length) {
      return '<div class="lb-empty">Aucun pilote au panthéon — soyez le premier !</div>';
    }
    return `<ol class="lb-list">${scores
      .map(
        (s, i) => `
        <li class="lb-row${i + 1 === highlightRank ? ' me' : ''}${i === 0 ? ' first' : ''}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${esc(s.name)}</span>
          <span class="lb-wave">v.${s.wave}</span>
          <span class="lb-score">${s.score}</span>
        </li>`
      )
      .join('')}</ol>`;
  }

  showTitle() {
    this.state = 'title';
    this.mission = null;
    this.audio.setMode('title');
    this.hud.root.classList.add('hidden');
    const scores = loadScores().slice(0, 5);
    const hasNew = this.unseenIds.length > 0;
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
          <button class="btn-secondary" id="btn-campaign">
            Campagne · Voie lactée
            ${hasNew ? '<span class="badge-new">Nouveau</span>' : ''}
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
            ? `<div class="title-lb"><div class="lb-title">— Meilleurs pilotes —</div>${this._leaderboardHtml(scores)}</div>`
            : ''
        }
      </div>
    `);
    el.querySelector('#btn-arcade').addEventListener('click', () => this.startRun('arcade'));
    el.querySelector('#btn-campaign').addEventListener('click', () => this.showGalaxy());
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
            <button class="pilot-card" data-pilot="${i}">
              <span class="pilot-avatar big">${esc(p.name[0])}</span>
              <span class="pilot-card-name">${esc(p.name)}${hasPin(p) ? ' <span class="pin-lock">🔒</span>' : ''}</span>
            </button>`
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

    el.querySelector('#pilot-new').addEventListener('click', () => {
      // On choisit son nom ET son vaisseau du même geste. Faire le tour du hangar
      // avant de décoller fait partie du plaisir, et un vaisseau qu'on a choisi
      // soi-même n'est plus le vaisseau du jeu : c'est le sien.
      const choix = { livree: 'flotte', carene: 'dague' };
      zone.innerHTML = `
        <form class="lb-form pilot-create" id="create-form">
          <input id="new-name" type="text" maxlength="10" placeholder="TON NOM" autocomplete="off" aria-label="Nom du pilote" />
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
          </div>
          <input id="new-pin" type="password" inputmode="numeric" maxlength="4"
                 placeholder="Code secret (option)" autocomplete="off" aria-label="Code secret optionnel" />
          <button class="btn-launch" type="submit">C'est moi !</button>
          <div class="pilot-error" id="pilot-error"></div>
        </form>`;
      const nameInput = zone.querySelector('#new-name');
      nameInput.focus();
      // Le vaisseau se reconstruit à chaque clic : on voit ce qu'on choisit.
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
      zone.querySelector('#create-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const result = createPilot(nameInput.value, zone.querySelector('#new-pin').value, choix);
        if (result.ok) {
          this.audio.buy();
          done();
        } else {
          this.audio.deny();
          zone.querySelector('#pilot-error').textContent =
            result.error === 'exists'
              ? 'Ce nom est déjà pris sur cet appareil.'
              : result.error === 'full'
                ? 'Trop de pilotes ! Supprime-en un (à venir).'
                : 'Choisis un nom (lettres et chiffres).';
        }
      });
    });
  }

  showGalaxy() {
    if (!this.campaigns.length) return; // chargement pas terminé (rare : clic immédiat)
    this.state = 'galaxy';
    this.audio.setMode('title');
    this.hud.root.classList.add('hidden');
    this.overlayRoot.innerHTML = '';
    this.galaxyMap.open({
      campaigns: this.campaigns,
      unseenIds: this.unseenIds,
      selectedId: this.mission?.campaign.id ?? null,
    });
    markCampaignsSeen(this.campaigns);
  }

  _replay() {
    if (this.mode === 'campaign' && this.mission) {
      const next =
        this.state === 'mission-complete' &&
        this.mission.systemIdx + 1 < this.mission.campaign.systems.length
          ? this.mission.systemIdx + 1
          : this.mission.systemIdx;
      this.startRun('campaign', { campaign: this.mission.campaign, systemIdx: next });
    } else {
      this.startRun('arcade');
    }
  }

  showGameOver() {
    this.state = 'gameover';
    this.audio.setMode('title');
    this.audio.gameOver();
    this.hud.root.classList.add('hidden');

    if (this.mode === 'campaign') {
      const el = this._screen(`
        <div class="screen gameover">
          <div class="go-title">Mission échouée</div>
          <div class="go-stats">
            <div><span class="hud-label">Système</span><b>${esc(this.mission.system.name)}</b></div>
            <div><span class="hud-label">Score</span><b>${this.score}</b></div>
          </div>
          <div class="title-menu">
            <button class="btn-launch" id="btn-retry">Réessayer${IS_TOUCH ? '' : ' <span class="key-hint">Espace</span>'}</button>
            <button class="btn-secondary" id="btn-map">Carte de la galaxie</button>
          </div>
        </div>
      `);
      el.querySelector('#btn-retry').addEventListener('click', () => this._replay());
      el.querySelector('#btn-map').addEventListener('click', () => this.showGalaxy());
      return;
    }

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
    const pilot = activePilot();
    let rank = -1;
    let scores;
    if (this.score > 0 && pilot) {
      ({ rank, scores } = saveScore(pilot.name, this.score, this.wave));
    } else {
      scores = loadScores();
    }
    const pilotLine =
      this.score > 0 && pilot
        ? rank > 0
          ? `<div class="go-pilot">${esc(pilot.name)} — inscrit au panthéon <b class="gold">n°${rank}</b></div>`
          : `<div class="go-pilot">${esc(pilot.name)} — pas encore dans le top 10, retente !</div>`
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
          <div class="lb-title">— Panthéon —</div>
          ${this._leaderboardHtml(scores, rank)}
        </div>
        <div class="title-menu">
          <button class="btn-secondary" id="btn-share">📣 Défier les copains</button>
          <button class="btn-launch" id="btn-replay">Rejouer${IS_TOUCH ? '' : ' <span class="key-hint">Espace</span>'}</button>
        </div>
      </div>
    `);
    this.characters.onGameOver();
    el.querySelector('#btn-share').addEventListener('click', () => {
      this._share(challengeText(pilot?.name || 'Un pilote', this.score, this.wave));
    });
    el.querySelector('#btn-replay').addEventListener('click', () => this._replay());
  }

  showMissionComplete() {
    this.state = 'mission-complete';
    this.audio.setMode('shop');
    this.audio.waveStart();
    this.hud.root.classList.add('hidden');
    const { campaign, systemIdx, system } = this.mission;
    saveMissionResult(campaign.id, system.id, this.score, this.levels, this.credits);
    this.characters.onMissionWon();
    const isLast = systemIdx + 1 >= campaign.systems.length;
    const next = isLast ? null : campaign.systems[systemIdx + 1];
    const el = this._screen(`
      <div class="screen mission-won">
        <div class="announce-title">Système libéré</div>
        <div class="mw-name">${esc(system.name)}</div>
        ${isLast ? '<div class="go-record">★ Campagne terminée — la galaxie est libre ! ★</div>' : ''}
        <div class="go-stats">
          <div><span class="hud-label">Score</span><b>${this.score}</b></div>
          <div><span class="hud-label">Vagues</span><b>${system.waves}</b></div>
        </div>
        <div class="title-menu">
          ${
            next
              ? `<button class="btn-launch" id="btn-next">Cap sur ${esc(next.name)}${IS_TOUCH ? '' : ' <span class="key-hint">Espace</span>'}</button>`
              : ''
          }
          <button class="btn-secondary" id="btn-map">Carte de la galaxie</button>
          <button class="btn-secondary" id="btn-share">📣 Défier les copains</button>
        </div>
      </div>
    `);
    el.querySelector('#btn-next')?.addEventListener('click', () => this._replay());
    el.querySelector('#btn-map').addEventListener('click', () => this.showGalaxy());
    el.querySelector('#btn-share').addEventListener('click', () => {
      this._share(
        `🚀 ${activePilot()?.name || 'Un pilote'} a libéré ${system.name} (${this.score} points) dans la campagne « ${campaign.title} » d’HYPERNOVA ! À ton tour !`
      );
    });
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

  startRun(mode = 'arcade', missionRef = null) {
    // En arcade, chaque partie appartient à un pilote (panthéon automatique).
    if (mode === 'arcade' && !activePilot()) {
      this.showPilotSelect(() => this.startRun('arcade'));
      return;
    }
    this.mode = mode;
    this.mission = missionRef
      ? {
          campaign: missionRef.campaign,
          systemIdx: missionRef.systemIdx,
          system: missionRef.campaign.systems[missionRef.systemIdx],
        }
      : null;

    this.galaxyMap.close();
    this.shop.close();
    this.overlayRoot.innerHTML = '';
    this.hud.root.classList.remove('hidden');

    this.score = 0;
    this.wave = 0;
    if (this.mode === 'campaign') {
      // Le vaisseau se construit au fil de la campagne : améliorations et crédits persistés.
      const progress = loadProgress(this.mission.campaign.id);
      this.levels = { ...emptyLevels(), ...(progress.levels || {}) };
      this.credits = progress.credits || 0;
      this.lives = Math.min(PLAYER.maxLives, PLAYER.baseLives + (this.levels.hull || 0));
    } else {
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
    this.waveBonusGiven = false;
    this.waveGrazes = 0;
    this.energy = 0;
    this.odTimer = 0;
    this.reflexCooldown = 0;
    this.bombFront = null;
    this.fragments = 0; // morceaux du Registre récupérés sur les routes longues
    this.routeMods = null; // risque choisi, appliqué à la vague suivante seulement
    this.bombCooldown = 0;
    this.waveDeath = false;
    this.waveBestTier = 1;
    this._energyPressStart = 0;
    this.director.reset();
    // Graine de la partie : en arcade, celle du jour (mêmes vagues pour tous les
    // copains) ; en campagne, celle de la mission si elle en définit une.
    this.seed = this.mode === 'campaign' ? (this.mission.campaign.seed ?? 1) : dailySeed();
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
      systeme: this.mission?.system?.name || 'Ce secteur',
    });
    this.startWave(1);
    this.characters.onRunStart(this.mode === 'campaign');
  }

  startWave(n) {
    this.wave = n;
    this.state = 'playing';
    this.audio.setMode('play');
    this.waveEndTimer = 0;
    this.waveBonusGiven = false;
    this.waveGrazes = 0;
    this.waveDeath = false;
    this.waveBestTier = 1;

    let def;
    if (this.mode === 'campaign') {
      const { system } = this.mission;
      const diffWave = system.baseWave + n - 1;
      def = makeWave(diffWave, {
        forceBoss: !!system.bossFinal && n === system.waves,
        noBoss: true,
        seed: this.seed + this.mission.systemIdx * 131,
      });
      this.enemies.startWave(
        def,
        diffWave,
        { ...DEFAULT_MODS, ...system.mods },
        this.director.heat
      );
      this.hud.setWave(`${n}/${system.waves}`);
      if (n === 1) {
        this.hud.announce(system.name, this.mission.campaign.title, 2600);
      } else {
        this.hud.announce(`Vague ${n}/${system.waves}`, def.boss ? '⚠ KORN ⚠' : '');
      }
    } else {
      def = makeWave(n, { seed: this.seed });
      // Le risque choisi sur la route ne vaut que pour UNE vague : on le consomme.
      const mods = this.routeMods ? { ...DEFAULT_MODS, ...this.routeMods } : DEFAULT_MODS;
      this.routeMods = null;
      this.enemies.startWave(def, n, mods, this.director.heat);
      this.hud.setWave(n);
      this.hud.announce(`Vague ${n}`, def.boss ? '⚠ KORN en approche ⚠' : '');
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
        if (ici !== apres && this.mode !== 'campaign') this._showRouteChoice();
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
    this.state = 'route';
    this.audio.setMode('shop');
    const idx = STAGES.indexOf(stageForWave(this.wave));
    const r = routesForStage(idx, this.seed);
    const reste = fragmentsAvantPalierSuivant(this.fragments);

    const carte = (o) => `
      <button class="route" data-type="${o.type}">
        <span class="route-kind">${o.type === 'longue' ? 'Détour' : 'Direct'}</span>
        <span class="route-name">${esc(o.nom)}</span>
        <span class="route-desc">${esc(o.desc)}</span>
        <span class="route-gain">${esc(o.gain)}</span>
        ${o.credits && o.fragment ? `<span class="route-side">+${o.credits} cr</span>` : ''}
        ${o.risque ? `<span class="route-risk">⚠ ${esc(o.risque.label)}</span>` : ''}
      </button>`;

    const el = this._screen(`
      <div class="screen route-pick">
        <div class="route-head">
          <h2 class="route-title">Choix de trajectoire</h2>
          <div class="route-dest">Cap sur ${esc(r.destination.name)}</div>
        </div>
        <div class="route-grid">${carte(r.courte)}${carte(r.longue)}</div>
        <div class="route-foot">
          Fragments du Registre : <b>${this.fragments}</b>${
            reste != null ? ` · ${reste} avant le palier de coque suivant` : ' · coque au maximum'
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
      this.hud.announce('COQUE — PALIER ' + 'I'.repeat(apres + 1), 'Fragment intégré', 2600);
      this._refreshShip();
    }

    this.overlayRoot.innerHTML = '';
    this.state = 'cinematic';
    const suite = () => this.openShop();
    if (!this.cinematic.playSouvenir(stageIdx, suite)) suite();
  }

  _biomeFor(wave) {
    if (this.mode === 'campaign') {
      const { system } = this.mission;
      return biomeForWave(system.baseWave + wave - 1);
    }
    return biomeForWave(wave, wave % 4 === 0);
  }

  launchNextWave() {
    if (this.state !== 'shop') return;
    this.shop.close();
    this.startWave(this.wave + 1);
  }

  openShop() {
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
    this.shop.refresh(this._shopState());
  }

  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    // 'paused' et non 'off' : couper la musique la ferait repartir de son intro
    // à chaque reprise, et trois pauses suffiraient à user les quatre premières mesures.
    this.audio.setMode(this.paused ? 'paused' : 'play');
    if (this.paused) {
      const el = this._screen(
        `<div class="screen pause"><div class="go-title">Pause</div><div class="title-press">${
          IS_TOUCH ? 'Touchez pour reprendre' : 'P pour reprendre'
        }</div></div>`
      );
      el.addEventListener('click', () => this.togglePause());
    } else {
      this.overlayRoot.innerHTML = '';
    }
  }

  // ---- Boucle ----

  update(dt) {
    if (this.paused) return;

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
      this.pickups.update(dt, this.player.position, 999, (v, p) => this._collectCredit(v, p), true);
    }
  }

  _updatePlaying(dt) {
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

    this.timeScale = this.fx.timeScale;
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
      (v, p) => this._collectCredit(v, p),
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
      const lastMissionWave = this.mode === 'campaign' && this.wave >= this.mission.system.waves;
      if (!this.waveBonusGiven && !lastMissionWave) {
        this.waveBonusGiven = true;
        this.director.onWaveCleared(this.waveDeath);
        const bonus = 25 + this.wave * 10;
        this.credits += bonus;
        this.hud.setCredits(this.credits);
        this.hud.announce('Vague nettoyée', `+${bonus} cr de prime`, 1800);
      }
      this.waveEndTimer += dt;
      if (this.waveEndTimer > 1.2 && this.pickups.activeCount() === 0) {
        if (lastMissionWave) this.showMissionComplete();
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

    // Tirs ennemis → joueur.
    this.enemyBullets.forEachActive((b) => {
      const rr = PLAYER.radius + this.enemyBullets.radius;
      if (b.mesh.position.distanceToSquared(pPos) < rr * rr) {
        this.enemyBullets.kill(b);
        this._playerHit();
      }
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
  }

  _collectCredit(value, pos3d) {
    // Le score grimpe jusqu'à ×8 mais les crédits plafonnent à ×3 : le combo
    // récompense le panache sans emballer l'économie.
    // Le bonus de combo sur les crédits se mérite : il faut avoir frôlé dans la vague.
    const cap = this.waveGrazes >= COMBO.grazesForCreditBonus ? COMBO.creditCap : 1;
    const gain = Math.round(value * Math.min(this.combo.mult, cap));
    this.credits += gain;
    this.hud.setCredits(this.credits);
    this.audio.pickup(this.combo.mult);
    this.fx.burst(pos3d, 0xffc857, { count: 3, speed: 3, life: 0.3 });

    // Projection 3D → écran pour le petit "+N".
    this._tmp.copy(pos3d).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.hud.creditPop(
      (this._tmp.x * 0.5 + 0.5) * rect.width,
      (-this._tmp.y * 0.5 + 0.5) * rect.height,
      `+${gain}`
    );
  }
}
