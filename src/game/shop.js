// Le hangar, entre deux vagues.
//
// L'ancienne version affichait les huit améliorations, toujours les mêmes, dans le
// même ordre, à chaque visite. C'est un tableau de prix, pas une boutique : le
// joueur y refait le même achat qu'à la partie précédente parce que rien ne l'en
// empêche, et deux parties se ressemblent.
//
// Ici, TROIS offres tirées au sort, et une seule décision : laquelle. Le tirage est
// pondéré par ce qu'on peut réellement s'offrir à ce moment-là — proposer un module
// à mille crédits quand on en a soixante ne donne pas un objectif, ça donne une
// carte morte.
//
// Et une relance payante, dont le prix monte à chaque usage DE LA PARTIE : c'est
// ce qui empêche de rouler jusqu'à obtenir l'objet voulu. On peut forcer le
// destin une fois, deux à la rigueur, jamais indéfiniment.
//
// Il montait d'abord par visite, et repartait de vingt crédits à chaque niveau.
// Sur le papier c'était « une pression par visite » ; en jeu, ça ne pressait
// rien du tout — il suffisait d'attendre le hangar suivant pour relancer trois
// fois de plus au prix de départ. La montée ne coûtait donc jamais assez pour
// faire hésiter, ce qui était pourtant sa seule raison d'être.

import { UPGRADES, priceOf } from './upgrades.js';
import { alea } from '../core/rng.js';

// Le prix de la relance est MULTIPLIÉ par 1,5 à chaque clic dans la même visite,
// et non augmenté d'un palier fixe. La différence n'est pas cosmétique : une
// progression additive reste abordable indéfiniment — au dixième clic on paie dix
// fois la mise, ce qui n'arrête personne. Une progression géométrique double le
// prix tous les deux clics et devient très vite dissuasive.
//
//   additif  20 · 40 · 60 · 80 · 100 · 120 …
//   ×1,5     20 · 30 · 45 · 68 · 101 · 152 · 228 …
//
// Les deux premières relances restent bon marché — on a le droit de ne pas aimer
// son tirage — mais la cinquième coûte le prix d'une amélioration, et c'est là que
// la question devient intéressante : relancer, ou acheter ce qu'on a sous les yeux ?
const RELANCE_BASE = 20;
const RELANCE_FACTEUR = 1.5;

export class Shop {
  constructor(overlayRoot, { onBuy, onLaunch }) {
    this.root = overlayRoot;
    this.onBuy = onBuy;
    this.onLaunch = onLaunch;
    this.panel = null;
    this._keyHandler = null;
    this.offers = [];
    this.rerolls = 0;
  }

  // Les améliorations encore achetables, avec leur prochain niveau et son prix.
  _eligible(state) {
    return UPGRADES.filter((u) => {
      const lvl = state.levels[u.id];
      if (lvl >= u.maxLevel) return false;
      if (u.id === 'hull' && state.lives >= 5) return false;
      return true;
    }).map((u) => ({
      id: u.id,
      upgrade: u,
      level: state.levels[u.id],
      prix: priceOf(u, state.levels[u.id]),
    }));
  }

  // Tirage pondéré. Le poids chute quand le prix dépasse largement la bourse, sans
  // jamais s'annuler : il faut qu'un objet trop cher puisse sortir de temps en
  // temps, parce que c'est lui qui donne envie de garder son argent.
  _tirer(state, n = 3) {
    const pool = this._eligible(state);
    const choisis = [];
    const budget = Math.max(60, state.credits);
    while (choisis.length < n && pool.length) {
      const poids = pool.map((o) => {
        const ratio = o.prix / budget;
        if (ratio <= 1) return 1;
        if (ratio <= 1.8) return 0.55;
        if (ratio <= 3) return 0.2;
        return 0.06;
      });
      const total = poids.reduce((a, b) => a + b, 0);
      let r = alea() * total;
      let i = 0;
      while (i < pool.length - 1 && (r -= poids[i]) > 0) i++;
      choisis.push(pool[i]);
      pool.splice(i, 1);
    }
    return choisis;
  }

  get prixRelance() {
    // Arrondi au multiple de cinq, comme tous les prix du jeu : un « 67 cr » au
    // milieu de prix ronds se lit comme un bug d'affichage.
    const brut = RELANCE_BASE * Math.pow(RELANCE_FACTEUR, this.rerolls);
    return Math.round(brut / 5) * 5;
  }

  // Le compteur de relances ne se remet à zéro qu'au début d'une PARTIE, jamais
  // à l'ouverture du hangar : c'est ce qui donne son poids au renchérissement.
  reinitialise() {
    this.rerolls = 0;
  }

  open(state) {
    this.close();
    this.offers = this._tirer(state);
    this.panel = document.createElement('div');
    this.panel.className = 'screen shop';
    this.panel.innerHTML = `
      <div class="shop-head">
        <h2 class="shop-title">Hangar d'armement</h2>
        <div class="shop-credits">Crédits <span class="gold" id="shop-credits">${state.credits}</span></div>
      </div>
      <div class="shop-scroll"><div class="shop-grid" id="shop-grid"></div></div>
      <div class="shop-foot">
        <button class="btn-reroll" id="btn-reroll">
          <span class="reroll-ico">⟳</span> Autres pièces
          <span class="reroll-price" id="reroll-price"></span>
        </button>
        <button class="btn-launch" id="btn-launch">
          Lancer la vague ${state.wave} <span class="key-hint">Entrée</span>
        </button>
      </div>
    `;
    this.root.appendChild(this.panel);
    this.panel.querySelector('#btn-launch').addEventListener('click', () => this.onLaunch());
    this.panel.querySelector('#btn-reroll').addEventListener('click', () => this.onReroll?.());
    this.refresh(state);

    this._keyHandler = (e) => {
      if (e.repeat) return; // l'autorepeat clavier ne doit pas acheter en rafale
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        // Entrée sur une carte focus = achat (activation native du bouton).
        if (e.target instanceof Element && e.target.closest('.card')) return;
        this.onLaunch();
      } else if (/^Digit[1-3]$/.test(e.code)) {
        const o = this.offers[Number(e.code.slice(5)) - 1];
        if (o) this.onBuy(o.id);
      } else if (e.code === 'KeyR') {
        this.onReroll?.();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  // Relance : nouveau tirage, prix qui monte.
  reroll(state) {
    this.rerolls++;
    this.offers = this._tirer(state);
    this.refresh(state);
  }

  // Une offre achetée laisse un emplacement VIDE plutôt que de se recharger : sans
  // ça, on rachèterait le même module trois fois de suite et le tirage ne servirait
  // plus à rien.
  markBought(id) {
    const i = this.offers.findIndex((o) => o && o.id === id);
    if (i >= 0) this.offers[i] = null;
  }

  refresh(state) {
    if (!this.panel) return;
    this.panel.querySelector('#shop-credits').textContent = state.credits;
    const rr = this.panel.querySelector('#btn-reroll');
    const prix = this.prixRelance;
    this.panel.querySelector('#reroll-price').textContent = `${prix} cr`;
    rr.classList.toggle('locked', state.credits < prix);

    const grid = this.panel.querySelector('#shop-grid');
    const focusedIdx = Array.prototype.indexOf.call(grid.children, document.activeElement);
    grid.innerHTML = '';

    this.offers.forEach((o, i) => {
      if (!o) {
        const vide = document.createElement('div');
        vide.className = 'card empty';
        vide.innerHTML =
          '<span class="card-empty-mark">✓</span><span class="card-name">Embarqué</span>';
        grid.appendChild(vide);
        return;
      }
      const u = o.upgrade;
      const prixOffre = priceOf(u, state.levels[u.id]);
      const affordable = state.credits >= prixOffre;
      const card = document.createElement('button');
      card.className = `card${affordable ? '' : ' locked'}`;
      card.style.setProperty('--stagger', `${i * 70}ms`);
      card.innerHTML = `
        <span class="card-key">${i + 1}</span>
        <span class="card-icon">${u.art || u.icon}</span>
        <span class="card-name">${u.name}</span>
        <span class="card-pips">${Array.from(
          { length: u.maxLevel },
          (_, p) => `<i class="pip${p < state.levels[u.id] ? ' on' : ''}"></i>`
        ).join('')}</span>
        <span class="card-desc">${u.desc}</span>
        <span class="card-price">${prixOffre} cr</span>
      `;
      if (!affordable) card.setAttribute('aria-disabled', 'true'); // cliquable → son « refus »
      card.addEventListener('click', () => this.onBuy(u.id));
      grid.appendChild(card);
    });
    if (focusedIdx >= 0) grid.children[focusedIdx]?.focus();
  }

  close() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
