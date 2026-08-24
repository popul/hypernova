// Carte de la Voie lactée : spirale SVG avec les systèmes d'une campagne en nœuds
// (terminé ✔ / en cours / verrouillé). Tap ou clic sur un système accessible → détail
// de mission → décollage. Plusieurs campagnes = onglets (la plus récente d'abord).

import { loadProgress, currentSystemIndex } from './campaign.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Position des systèmes le long d'un bras spiral (coordonnées viewBox 0-100).
function nodePosition(i, count) {
  const t = count > 1 ? i / (count - 1) : 0;
  const angle = 2.9 + t * 2.9;
  const r = 14 + t * 24;
  return {
    x: 50 + Math.cos(angle) * r * 1.05,
    y: 51 + Math.sin(angle) * r * 0.78,
  };
}

function starsSvg(n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * 100).toFixed(1);
    const y = (Math.random() * 100).toFixed(1);
    const r = (0.15 + Math.random() * 0.4).toFixed(2);
    const o = (0.15 + Math.random() * 0.5).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#bfe8ff" opacity="${o}"/>`;
  }
  return out;
}

export class GalaxyMap {
  constructor(overlayRoot, { onLaunch, onBack, onEnableAlerts, audio }) {
    this.root = overlayRoot;
    this.onLaunch = onLaunch;
    this.onBack = onBack;
    this.onEnableAlerts = onEnableAlerts;
    this.audio = audio;
    this.panel = null;
  }

  open({ campaigns, unseenIds, selectedId = null }) {
    this.close();
    this.campaigns = campaigns;
    this.unseenIds = unseenIds;
    this.panel = document.createElement('div');
    this.panel.className = 'screen galaxy';
    this.root.appendChild(this.panel);
    const idx = selectedId ? campaigns.findIndex((c) => c.id === selectedId) : 0;
    this._renderCampaign(idx === -1 ? 0 : idx);
  }

  _renderCampaign(campaignIdx) {
    const campaign = this.campaigns[campaignIdx];
    const progress = loadProgress(campaign.id);
    const currentIdx = currentSystemIndex(campaign, progress);
    const done = progress.completed.length;
    const total = campaign.systems.length;
    const finished = done >= total;

    const tabs = this.campaigns
      .map(
        (c, i) => `
        <button class="galaxy-tab${i === campaignIdx ? ' active' : ''}" data-tab="${i}">
          ${esc(c.title)}
          ${this.unseenIds.includes(c.id) ? '<span class="badge-new">Nouveau</span>' : ''}
        </button>`
      )
      .join('');

    const nodes = campaign.systems
      .map((s, i) => {
        const p = nodePosition(i, total);
        const state = progress.completed.includes(s.id)
          ? 'done'
          : i === currentIdx && !finished
            ? 'current'
            : i <= currentIdx
              ? 'open'
              : 'locked';
        // Étiquettes alternées haut/bas et ancrées selon le bord pour éviter les collisions ;
        // les systèmes verrouillés gardent le mystère.
        const labelY = i % 2 === 0 ? -3.6 : 5.6;
        const anchor = p.x > 72 ? 'end' : p.x < 28 ? 'start' : 'middle';
        const label = state === 'locked' ? '???' : s.name;
        return `
          <g class="sys sys-${state}" data-sys="${i}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
            <circle class="sys-halo" r="4.2"/>
            <circle class="sys-dot" r="1.9"/>
            ${state === 'done' ? '<text class="sys-check" y="0.9" text-anchor="middle">✔</text>' : ''}
            <text class="sys-name" y="${labelY}" text-anchor="${anchor}">${esc(label)}</text>
          </g>`;
      })
      .join('');

    const path = campaign.systems
      .map((s, i) => {
        const p = nodePosition(i, total);
        return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join(' ');

    this.panel.innerHTML = `
      <div class="galaxy-head">
        <button class="btn-ghost" id="galaxy-back">← Retour</button>
        <div class="galaxy-tabs">${tabs}</div>
        <button class="btn-ghost" id="galaxy-alerts">🔔 Alertes</button>
      </div>
      <div class="galaxy-title">
        <h2>${esc(campaign.title)}</h2>
        <div class="galaxy-sub">${esc(campaign.subtitle || '')} · ${done}/${total} systèmes libérés${
          finished ? ' · <span class="gold">Campagne terminée ★</span>' : ''
        }</div>
      </div>
      <div class="galaxy-body">
        <svg class="galaxy-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carte de la campagne">
          <defs>
            <radialGradient id="core" cx="50%" cy="52%" r="50%">
              <stop offset="0%" stop-color="rgba(255,220,180,0.5)"/>
              <stop offset="18%" stop-color="rgba(160,110,200,0.18)"/>
              <stop offset="60%" stop-color="rgba(60,40,120,0.10)"/>
              <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill="url(#core)"/>
          <g class="galaxy-arms">
            <ellipse cx="50" cy="52" rx="44" ry="30" />
            <ellipse cx="50" cy="52" rx="32" ry="20" />
            <ellipse cx="50" cy="52" rx="18" ry="11" />
          </g>
          ${starsSvg(90)}
          <path class="galaxy-route" d="${path}"/>
          ${nodes}
        </svg>
        <aside class="galaxy-detail" id="galaxy-detail">
          <div class="detail-hint">Choisissez un système accessible pour voir la mission.</div>
        </aside>
      </div>
    `;

    this.panel.querySelector('#galaxy-back').addEventListener('click', () => this.onBack());
    this.panel.querySelector('#galaxy-alerts').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const result = await this.onEnableAlerts();
      btn.textContent =
        result === 'periodic'
          ? '🔔 Alertes actives'
          : result === 'on-open'
            ? '🔔 Alertes à l’ouverture'
            : result === 'denied'
              ? '🔕 Refusées'
              : '🔕 Non supportées';
    });
    this.panel.querySelectorAll('.galaxy-tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        this.audio.uiTick();
        this._renderCampaign(Number(tab.dataset.tab));
      })
    );
    this.panel.querySelectorAll('.sys').forEach((node) =>
      node.addEventListener('click', () => {
        const idx = Number(node.dataset.sys);
        if (node.classList.contains('sys-locked')) {
          this.audio.deny();
          return;
        }
        this.audio.uiTick();
        this._renderDetail(campaign, progress, idx);
      })
    );

    // Ouvre directement la mission en cours (ou la dernière si campagne finie).
    if (total > 0) this._renderDetail(campaign, progress, Math.max(0, currentIdx));
  }

  _renderDetail(campaign, progress, idx) {
    const s = campaign.systems[idx];
    const best = progress.bestScores[s.id];
    const detail = this.panel.querySelector('#galaxy-detail');
    detail.innerHTML = `
      <div class="detail-name">${esc(s.name)}</div>
      <div class="detail-desc">${esc(s.desc || '')}</div>
      <div class="detail-meta">
        <span>${s.waves} vague${s.waves > 1 ? 's' : ''}</span>
        ${s.bossFinal ? '<span class="detail-boss">⚠ VORAX</span>' : ''}
        ${best ? `<span>Record <b class="gold">${best}</b></span>` : ''}
      </div>
      <button class="btn-launch" id="mission-launch">Décoller</button>
    `;
    detail
      .querySelector('#mission-launch')
      .addEventListener('click', () => this.onLaunch(campaign, idx));
  }

  close() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
