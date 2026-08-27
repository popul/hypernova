// Définitions data-driven des améliorations : prix, niveaux, effets.
//
// L'ÉCONOMIE VISE DEUX À TROIS ACHATS PAR NIVEAU.
//
// Mesurée, elle en donnait un et demi — et ZÉRO au premier hangar, ce qui est le
// pire moment pour n'avoir rien à acheter : la vague 1 rapporte trente-sept
// crédits et le module le moins cher en coûtait soixante-dix. Le joueur passait
// donc son premier passage en boutique à regarder.
//
// La correction n'est pas de baisser les prix — cela rendrait le vaisseau plus
// fort, ce qu'on ne veut pas. C'est d'étaler LA MÊME PUISSANCE sur plus de
// paliers moins chers : le Surcadenceur passe de six niveaux à dix-huit pour cent
// à neuf niveaux à onze et demi, ce qui donne exactement le même ×2,7 au bout,
// pour trois fois plus d'occasions d'acheter. Même chose pour les Propulseurs.
//
// Les modules à effet de seuil — canons, missiles, bouclier, réflexe — ne peuvent
// pas se découper ainsi : un demi-canon n'existe pas. Leur premier palier baisse
// simplement assez pour être atteignable après deux vagues, et le reste de leur
// courbe ne bouge pas.
// `computeStats` transforme les niveaux possédés en stats concrètes du vaisseau.

import { PLAYER, PICKUPS, REFLEX, SURVIE } from './constants.js';
import { UPGRADE_ART } from './upgradeart.js';

export const UPGRADES = [
  {
    id: 'firerate',
    name: 'Surcadenceur',
    icon: '⚡',
    maxLevel: 9,
    basePrice: 30,
    priceMul: 1.35,
    desc: '+18 % de cadence par niveau. ORION tire plus vite, HÉLIOS pousse son rayon, VULCAIN forge plus souvent.',
  },
  {
    id: 'cannons',
    name: 'Canons jumelés',
    icon: '⋔',
    maxLevel: 2,
    basePrice: 260,
    priceMul: 2.9,
    desc: 'ORION : un flux de tir de plus. HÉLIOS : un rayon plus large. VULCAIN : une charge de plus par salve.',
  },
  {
    id: 'missiles',
    name: 'Missiles Nova',
    icon: '✦',
    maxLevel: 3,
    basePrice: 300,
    priceMul: 2.1,
    desc: 'ORION : des missiles à tête chercheuse. HÉLIOS : des orbes qui amplifient le rayon. VULCAIN : un souffle plus large.',
  },
  {
    id: 'shield',
    name: 'Bouclier à ions',
    icon: '◍',
    maxLevel: 3,
    basePrice: 210,
    priceMul: 1.8,
    desc: 'Absorbe un impact, puis se recharge. Niveaux : recharge plus rapide.',
  },
  {
    id: 'engine',
    name: 'Propulseurs',
    icon: '≫',
    maxLevel: 9,
    basePrice: 35,
    priceMul: 1.34,
    desc: '+13 % de vitesse latérale par niveau.',
  },
  {
    id: 'magnet',
    name: 'Aimant tracteur',
    icon: '◉',
    maxLevel: 5,
    basePrice: 45,
    priceMul: 1.42,
    desc: 'Attire les crédits de plus loin, et élargit l’Appel. Au dernier niveau, un Appel de plus par vague.',
  },
  {
    id: 'reflex',
    name: 'Réflexe Chrono',
    icon: '◷',
    maxLevel: 3,
    basePrice: 230,
    priceMul: 2.0,
    desc: 'Quand un tir va vous toucher, le temps ralentit — mais pas vous. Niveaux : ralenti plus long, recharge plus courte.',
  },
  {
    // LE MODULE DE LA FURIE. Il ne fait rien tant qu'on n'est pas en Overdrive —
    // c'est délibéré : un module qui n'agit qu'à un moment précis pousse à
    // provoquer ce moment, et l'Overdrive était jusqu'ici une récompense passive
    // qu'on déclenchait quand la jauge était pleine, sans y penser.
    id: 'fureur',
    name: 'Chambre de fureur',
    icon: '☲',
    maxLevel: 3,
    basePrice: 150,
    priceMul: 1.9,
    desc: 'Pendant l’Overdrive seulement : vos tirs frappent plus fort, et changent de couleur à chaque niveau. Vaut pour les trois coques.',
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

// L'ÉQUIPEMENT D'UN JOUEUR ARRIVÉ À LA VAGUE N.
//
// Le mode entraînement laisse commencer à la vague qu'on veut, et il serait
// absurde d'y arriver le vaisseau nu : la vague 20 sans modules n'est pas la
// vague 20, c'est un mur. Il faut donc répondre à « à quoi ressemble un vaisseau
// à la vingtième vague ».
//
// On ne l'estime pas, on le REJOUE. La mesure faite sur l'économie donne deux
// achats et demi par niveau pour un joueur qui dépense tout ce qu'il peut, et le
// même joueur achète TOUJOURS le module le moins cher disponible — c'est ce
// comportement-là qui a servi à calibrer les prix. On refait donc exactement ça :
// on distribue le nombre de paliers correspondant, du moins cher au plus cher.
// Le résultat n'est pas une jolie courbe, c'est la panoplie qu'on aurait
// vraiment.

// Le total des paliers achetables, tous modules confondus.
const PALIERS_TOTAL = UPGRADES.reduce((n, u) => n + u.maxLevel, 0);
// Achats par vague, mesurés sur les trois coques : 2,60 / 2,30 / 2,30.
const ACHATS_PAR_VAGUE = 2.4;

// Quelle part de la panoplie complète on possède en arrivant à cette vague.
// Plafonnée à un : au-delà d'une quinzaine de vagues, tout est acheté.
export function equipementPourVague(vague) {
  return Math.min(1, (ACHATS_PAR_VAGUE * Math.max(0, vague - 1)) / PALIERS_TOTAL);
}

// La panoplie correspondant à une part donnée. `part` vaut 0 (vaisseau nu) à 1
// (tout au maximum) ; entre les deux, on achète le moins cher d'abord.
export function niveauxPourPart(part) {
  const niveaux = emptyLevels();
  let reste = Math.round(Math.max(0, Math.min(1, part)) * PALIERS_TOTAL);
  while (reste > 0) {
    let choix = null;
    let mieux = Infinity;
    for (const u of UPGRADES) {
      if (niveaux[u.id] >= u.maxLevel) continue;
      const prix = priceOf(u, niveaux[u.id]);
      if (prix < mieux) {
        mieux = prix;
        choix = u;
      }
    }
    if (!choix) break; // tout est au maximum
    niveaux[choix.id]++;
    reste--;
  }
  return niveaux;
}

export function emptyLevels() {
  return Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
}

// Secondes par niveau. Volontairement lent : chaque frôlement en retire 1 s, donc le
// bouclier avance au risque pris, pas au temps qui passe.
const SHIELD_RECHARGE = [0, 20, 14, 9];

export function computeStats(levels, surcharge = 0) {
  return {
    speed: PLAYER.baseSpeed * Math.pow(1.085, levels.engine),
    // La surcharge du mode Survie s'ajoute par-dessus les niveaux : elle n'existe
    // que là, et vaut zéro partout ailleurs.
    fireRate:
      PLAYER.baseFireRate *
      Math.pow(1.116, levels.firerate) *
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
