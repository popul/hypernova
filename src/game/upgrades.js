// Définitions data-driven des améliorations : prix, niveaux, effets.
// `computeStats` transforme les niveaux possédés en stats concrètes du vaisseau.

import { PLAYER, PICKUPS, REFLEX, SURVIE } from './constants.js';
import { UPGRADE_ART } from './upgradeart.js';

export const UPGRADES = [
  {
    id: 'firerate',
    name: 'Surcadenceur',
    icon: '⚡',
    maxLevel: 6,
    basePrice: 70,
    priceMul: 1.6,
    desc: '+18 % de cadence de tir par niveau.',
  },
  {
    id: 'cannons',
    name: 'Canons jumelés',
    icon: '⋔',
    maxLevel: 2,
    basePrice: 380,
    priceMul: 2.9,
    desc: 'Un flux de tir supplémentaire (jusqu’à 3 canons).',
  },
  {
    id: 'missiles',
    name: 'Missiles Nova',
    icon: '✦',
    maxLevel: 3,
    basePrice: 460,
    priceMul: 2.1,
    desc: 'Missiles à tête chercheuse automatiques. Niveaux : plus de missiles, plus vite.',
  },
  {
    id: 'shield',
    name: 'Bouclier à ions',
    icon: '◍',
    maxLevel: 3,
    basePrice: 300,
    priceMul: 1.8,
    desc: 'Absorbe un impact, puis se recharge. Niveaux : recharge plus rapide.',
  },
  {
    id: 'engine',
    name: 'Propulseurs',
    icon: '≫',
    maxLevel: 4,
    basePrice: 90,
    priceMul: 1.6,
    desc: '+13 % de vitesse latérale par niveau.',
  },
  {
    id: 'magnet',
    name: 'Aimant tracteur',
    icon: '◉',
    maxLevel: 4,
    basePrice: 80,
    priceMul: 1.6,
    desc: 'Attire les crédits de plus loin, et élargit l’Appel. Au dernier niveau, un Appel de plus par vague.',
  },
  {
    id: 'reflex',
    name: 'Réflexe Chrono',
    icon: '◷',
    maxLevel: 3,
    basePrice: 340,
    priceMul: 2.0,
    desc: 'Quand un tir va vous toucher, le temps ralentit — mais pas vous. Niveaux : ralenti plus long, recharge plus courte.',
  },
  {
    id: 'hull',
    name: 'Coque renforcée',
    icon: '♥',
    maxLevel: PLAYER.maxLives - PLAYER.baseLives,
    basePrice: 420,
    priceMul: 2.2,
    desc: '+1 vie (5 max).',
  },
];

// Chaque amélioration porte son illustration. Le glyphe reste en secours, mais
// aucun ne devrait s'afficher : la table d'art couvre toute la liste.
for (const u of UPGRADES) u.art = UPGRADE_ART[u.id] || null;

export function priceOf(upgrade, level) {
  return Math.round((upgrade.basePrice * Math.pow(upgrade.priceMul, level)) / 5) * 5;
}

export function emptyLevels() {
  return Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
}

// Secondes par niveau. Volontairement lent : chaque frôlement en retire 1 s, donc le
// bouclier avance au risque pris, pas au temps qui passe.
const SHIELD_RECHARGE = [0, 20, 14, 9];

export function computeStats(levels, surcharge = 0) {
  return {
    speed: PLAYER.baseSpeed * Math.pow(1.13, levels.engine),
    // La surcharge du mode Survie s'ajoute par-dessus les niveaux : elle n'existe
    // que là, et vaut zéro partout ailleurs.
    fireRate:
      PLAYER.baseFireRate *
      Math.pow(1.18, levels.firerate) *
      (1 + surcharge * SURVIE.surchargeGain),
    streams: 1 + levels.cannons,
    missileCount: levels.missiles === 0 ? 0 : levels.missiles >= 2 ? 2 : 1,
    missileInterval: levels.missiles >= 3 ? 1.0 : 1.7,
    shieldMax: levels.shield > 0 ? 1 : 0,
    shieldRecharge: SHIELD_RECHARGE[levels.shield] ?? 5,
    magnetRadius: PICKUPS.baseMagnetRadius + levels.magnet * PICKUPS.magnetRadiusPerLevel,
    callRadius: PICKUPS.callRadiusBase + levels.magnet * PICKUPS.callRadiusPerLevel,
    callCharges: levels.magnet >= PICKUPS.callChargeAtLevel ? 2 : 1,
    reflexDuration: REFLEX.duration[levels.reflex] ?? 0,
    reflexCooldown: REFLEX.cooldown[levels.reflex] ?? 0,
  };
}
