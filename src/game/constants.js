// Tout le tuning gameplay est centralisé ici : une seule source de vérité pour l'équilibrage.

export const ARENA = {
  playerZ: 13,
  playerXMax: 14.5,
  // Profondeur jouable. Rester cloué sur une ligne réduisait l'esquive à un seul
  // axe : avancer permet d'aller chercher les crédits et de raccourcir la portée
  // du tir, reculer donne du temps de réaction. Les deux se paient.
  //
  // Avancer beaucoup plus loin qu'avant : la zone était trop courte pour aller
  // récupérer les gemmes, qui tombent depuis la formation.
  playerZMin: 0, // en avant : au contact, on touche vite et on ramasse
  // La borne arrière est CALCULÉE au lancement à partir du cadrage réel (voir
  // fitPlayZone) : à 17,5 en dur, le vaisseau passait sous le bord bas de l'écran,
  // qui tombe à z = 16,3 en 16/9. Une limite de jeu qu'on ne voit pas est un bug.
  playerZMax: 14, // valeur de repli, écrasée dès le premier cadrage
  playerZMargin: 2.2, // recul gardé sur le bord bas : longueur de coque + confort
  playerZSpeedMul: 0.8, // l'axe de profondeur reste un peu plus lent que le latéral
  // Le bord n'est pas visible : buter contre un mur invisible se ressent comme un
  // bug. On boucle donc l'arène — sortir par la gauche fait rentrer par la droite.
  // C'est aussi une échappatoire tactique : la fuite devient une option.
  wrap: true,
  wrapGhostZone: 4.5, // distance au bord où l'on affiche le double de l'autre côté
  bulletCullZMin: -34,
  bulletCullZMax: 26,
  bulletCullXMax: 26,
};

export const PLAYER = {
  baseSpeed: 16,
  baseFireRate: 3.4, // tirs / seconde
  bulletSpeed: 34,
  radius: 0.9,
  respawnInvuln: 2.4, // secondes d'invulnérabilité après une mort
  baseLives: 3,
  maxLives: 5,
  respawnInvulnAfterDeath: 1.6,
};

// Directeur de menace : la difficulté ne dépend plus seulement du numéro de vague.
// Tant que le joueur ne meurt pas, la pression monte ; une mort la fait retomber.
export const DIRECTOR = {
  heatPerSecond: 0.05,
  cleanStreakSeconds: 8, // il faut être indemne depuis N secondes pour chauffer
  heatPerCleanWave: 0.5,
  heatPerDeath: -1.0,
  heatPerShield: -0.4,
  fireBoost: 0.09,
  fireFloor: 0.3,
  diveBoost: 0.1,
  diveFloor: 0.6,
  bulletBoost: 0.04,
  bulletCeil: 34,
  diversPerHeat: 2.5,
  diversMax: 3,
  leadBoost: 0.02,
  leadBoostMax: 0.15,
};

// `shot` = signature de tir du type, appliquée aux volées visées et aux plongées.
// C'est ce qui donne un rôle tactique à chaque ennemi sans lui ajouter de PV.
export const ENEMY_TYPES = {
  drone: {
    hp: 1,
    radius: 0.72,
    score: 50,
    credits: 8,
    gemCount: 1,
    fireChance: 0.05,
    shot: { shots: 1, spread: 0.07, speedMul: 1.0 }, // le piqueur : une balle sèche
  },
  wasp: {
    hp: 1,
    radius: 0.78,
    score: 80,
    credits: 14,
    gemCount: 2,
    fireChance: 0.1,
    shot: { shots: 2, spread: 0.05, gap: 0.14, speedMul: 1.15 }, // double coup : le même couloir se referme
  },
  brute: {
    hp: 3,
    radius: 1.05,
    score: 150,
    credits: 26,
    gemCount: 3,
    fireChance: 0.08,
    shot: { shots: 3, spread: 0.26, speedMul: 0.8 }, // nappe large et lente : déni de zone
  },
  // L'amiral mesurait 4,6 unités de large sur une arène qui en fait 29 — soit à
  // peine plus qu'un chasseur, et cinq pour cent de la largeur de l'écran. On
  // l'annonce comme un dévoreur de mondes et l'on touchait une mouche. Doublé, il
  // occupe un tiers de l'arène : assez pour être frappé, pas assez pour boucher
  // le champ (il patrouille jusqu'à x=8,5, donc son flanc s'arrête à 13,2 sur
  // 14,5 — il ne sort jamais du cadre).
  boss: { hp: 50, radius: 5.2, score: 1500, credits: 220, gemCount: 16, fireChance: 0 },
};

export const ENEMY = {
  // Un ennemi ne tire pas si sa balle atteindrait le joueur en moins de ce délai.
  // Sans cette règle, un plongeur arrivé à bout portant tirait une balle qui
  // apparaissait déjà sur la coque : rien à lire, rien à esquiver, juste une perte
  // de vie annoncée. La menace du piqué reste entière — c'est la COLLISION qui
  // doit faire peur de près, pas un tir impossible à voir partir.
  minReactionTime: 0.42,
  // Distance minimale DEVANT le vaisseau pour qu'un tir soit permis. En deçà —
  // c'est-à-dire à hauteur du joueur ou derrière lui — l'ennemi ne tire pas.
  noFireBehind: 2.5,
  // Pente minimale d'un tir : |dz| / |dx|. En dessous, la balle rase l'écran et
  // n'est pas esquivable — on ne la tire pas.
  minShotSlope: 0.6,
  // Vitesse des projectiles, abaissée d'environ 12 %. Elle décide seule du temps
  // de lecture : à 13 de base, une balle traversait l'arène plus vite que l'œil
  // ne la suivait. Le budget de balles empêche de son côté la saturation, donc
  // ralentir ne rend pas la vague plus facile — seulement plus lisible.
  bulletSpeedBase: 11.5,
  bulletSpeedPerWave: 0.48,
  bulletSpeedMax: 23.5,
  formationFireIntervalBase: 2.6, // secondes entre tirs venant de la formation
  formationFireIntervalMin: 0.65,

  // --- Visée prédictive ---
  // Une balle met 1,2 à 1,6 s à traverser l'arène : viser la position ACTUELLE du
  // joueur, c'est viser où il n'est déjà plus. On vise donc où il SERA, avec une
  // anticipation qui monte avec les vagues.
  leadBase: 0.22,
  leadPerWave: 0.05,
  leadMax: 1.0,
  leadJitter: 1.2, // bruit en unités : laisse une chance à celui qui zigzague
  aimSpread: 0.07,
  // Les tireurs d'une même volée se répartissent l'anticipation : l'un vise loin
  // devant, l'autre juste devant, un autre sur place (pour cueillir qui freine).
  volleyRoles: [1.0, 0.55, 0.0, 1.3, 0.75],
  diveRole: 0.85,

  // --- Volées de formation ---
  shootersPerVolley: 6, // 1 tireur de plus tous les 6 vivants éligibles
  shootersMaxBase: 2,
  shootersMaxCap: 5,
  wallCountEarly: 3,
  wallCountMid: 4,
  wallCountLate: 5,
  crossAngles: [0.22, 0.46],
  telegraphTime: 0.28, // préavis avant le départ d'une balle

  // Plafond de projectiles simultanés : garantit qu'aucun motif ne peut fermer
  // l'arène. C'est le bouton de réglage global de la difficulté.
  bulletBudgetBase: 7,
  bulletBudgetPerWave: 1.3,
  bulletBudgetMax: 34,

  // --- Plongées ---
  diveLead: 0.35, // anticipation au lancement
  diveTrackBase: 8, // guidage latéral (u/s), toujours < vitesse du joueur
  diveTrackPerWave: 0.25,
  diveTrackMax: 13,
  // Scaling des PV en fin de partie : +1 PV toutes les N vagues au-delà de hpScaleStartWave,
  // pour que le late-game résiste à un build complet (~33 dps).
  hpScaleStartWave: 6,
  hpEveryWavesSmall: 5,
  hpEveryWavesBrute: 3,
  diveIntervalBase: 3.4,
  diveIntervalMin: 1.1,
  diveSpeedBase: 0.42, // progression de t par seconde sur la courbe de plongée
  diveSpeedPerWave: 0.012,
  entryDuration: 1.7, // durée du trajet d'entrée en formation
  returnSpeed: 14,
  bulletColorAimed: 0xff3df0, // rose = balle visée, elle te suit
  bulletColorStraight: 0xffa23d, // ambre = balle droite, trouve le trou
};

// Trajectoires de plongée. Les instants de tir sont tirés au hasard dans une plage
// à chaque plongée : l'esquive apprise par cœur redevient de la lecture.
export const DIVES = {
  // Le plongeur corrige sa trajectoire entre trackFrom et trackUntil, puis la fige :
  // il pousse le joueur hors d'une zone sans jamais le « coller » au dernier instant.
  trackFrom: 0.35,
  trackUntil: 0.8,
  sweep: { speedMul: 1, shots: 2, t1: [0.25, 0.4], t2: [0.5, 0.7], spread: 0.05 },
  strafe: {
    speedMul: 0.85,
    shots: 3,
    t1: [0.25, 0.35],
    t2: [0.45, 0.6],
    t3: [0.65, 0.8],
    spread: 0,
  },
  squad: { speedMul: 1, shots: 1, t1: [0.35, 0.45], spread: 0.05, count: 3, offsets: [-3, 0, 3] },
};

// LES TROIS PHASES DE L'AMIRAL.
//
// Un boss à deux vitesses — normal, puis « enragé » sous 60 % — se comprend en dix
// secondes et ne surprend plus jamais. Trois phases, oui, mais à condition qu'elles
// demandent trois choses DIFFÉRENTES : un combat dont seule la cadence augmente
// n'est pas un combat en trois actes, c'est le même combat joué trois fois.
//
//   I  — L'AMIRAL. Il patrouille de long en large et pose des nappes larges. On
//        apprend à lire l'éventail, on cherche le couloir. Le joueur a le temps.
//   II — LA MEUTE. Il ne patrouille plus : il BONDIT d'un point à l'autre et se
//        fige. Ses nappes partent en biais depuis l'endroit où il vient d'arriver,
//        donc le couloir appris à la phase I ne vaut plus rien — il faut suivre
//        le boss des yeux au lieu de suivre les balles.
//   III — LA GUEULE. Il descend et colle le joueur en x. Le duel devient un
//        corps-à-corps où l'espace manque : les nappes sont serrées, mais courtes,
//        et c'est la POSITION qui tue, plus la lecture.
export const BOSS_PHASES = [
  {
    nom: 'AMIRAL',
    // Ce que l'annonce dit au moment de la bascule. Pas « phase 2 » — ce qui
    // CHANGE, en cinq mots : le joueur doit savoir quoi regarder, pas quel numéro
    // il vient d'atteindre.
    dit: 'Il ouvre le feu',
    // Sous quelle fraction de points de vie la phase commence.
    seuil: 1,
    // Déplacement : balancement large et lent, la lecture est possible.
    style: 'patrouille',
    vitesse: 1,
    // Cadence des nappes et des rafales visées, en multiplicateur d'intervalle :
    // au-dessus de 1, il tire moins souvent qu'au réglage de base.
    fanMul: 1,
    burstMul: 1,
    // Nappes simultanées, et écart entre les branches (au plan du joueur).
    nappes: 1,
    ecartMul: 1,
    // Balles de la rafale visée : chacune avec sa propre anticipation.
    roles: [1.0, 0.6, 0.2],
  },
  {
    nom: 'MEUTE',
    dit: 'Il ne patrouille plus — il bondit',
    seuil: 0.66,
    style: 'bonds',
    vitesse: 1.35,
    fanMul: 0.78,
    burstMul: 0.8,
    nappes: 2, // la seconde part décalée d'un demi-pas, un instant plus tard
    ecartMul: 1.1,
    roles: [1.0, 0.75, 0.45, 0.15],
  },
  {
    nom: 'GUEULE',
    dit: 'Il descend sur vous',
    seuil: 0.33,
    style: 'traque',
    vitesse: 1.7,
    fanMul: 0.62,
    burstMul: 0.62,
    nappes: 2,
    // Maille resserrée : l'éventail devient un mur, mais il est plus court —
    // sinon la phase finale serait injouable plutôt que difficile.
    ecartMul: 0.78,
    portee: 0.72,
    roles: [1.0, 0.8, 0.55, 0.3, 0.05],
  },
];

// Le temps que dure la bascule d'une phase à l'autre : le boss se cabre, ne tire
// pas, et le décor bascule. C'est la respiration qui rend le passage lisible — et
// la récompense d'avoir entamé un tiers de sa coque.
export const BOSS_BASCULE = 1.35;

export const BOSS = {
  // Facteur appliqué à la carène. Le rayon de collision ci-dessus suit le même
  // rapport : un boss qu'on voit plus gros mais qu'on touche pareil serait un
  // mensonge visuel, et le joueur le sentirait sans savoir le nommer.
  echelle: 2,
  hpPerWave: 13,
  fanInterval: 2.1,
  aimedBurstInterval: 3.4,
  // Éventail MÉTRIQUE : l'écart entre branches est mesuré au plan du joueur, pas en
  // radians. Un écart angulaire fixe envoyait toutes les branches sauf une hors écran.
  fanSpacingU: 4.2,
  // Le premier amiral (vague 4) doit rester un moment de bravoure, pas un mur :
  // 3 branches, puis l'éventail s'élargit franchement avec les vagues.
  fanSpanBase: 6,
  fanSpanPerWave: 0.9,
  fanSpanMax: 29,
  fanCountMax: 9,
  fanSecondDelay: 0.35, // en phase enragée, la seconde nappe arrive décalée dans le temps
  enragedFromWave: 8, // la double nappe n'apparaît qu'à partir du deuxième amiral
  burstRoles: [1.0, 0.6, 0.2],
};

export const COMBO = {
  killsPerTier: 6,
  maxMultiplier: 8,
  creditCap: 2, // et seulement si le joueur a frôlé : le bonus se mérite
  grazesForCreditBonus: 8,
  // Fenêtre d'enchaînement par palier (index = multiplicateur) : de plus en plus
  // serrée, tenable seulement en frôlant les balles (chaque graze rallonge).
  windows: [2.5, 2.5, 2.3, 2.1, 1.9, 1.7, 1.6, 1.5, 1.5],
};

// Frôlement : passer près d'une balle ennemie sans la toucher rapporte points,
// énergie et un sursis de combo. Crédité quand la balle DÉPASSE le joueur.
export const GRAZE = {
  // Rayon élargi : à 2.0 il fallait viser la balle au pixel près pour créditer un
  // frôlement, et la mécanique centrale du jeu restait hors de portée.
  radius: 2.7,
  score: 25,
  energy: 9, // le frôlement est désormais la principale source d'énergie
  comboRefill: 0.4,
  shieldRecharge: 1.0, // secondes gagnées sur la recharge du bouclier
};

// Une seule touche, deux dépenses : tap = bombe de panique, maintien = Overdrive.
export const OVERDRIVE = {
  max: 100,
  bombCost: 75, // un seul stock possible : la bombe redevient un choix, pas un réflexe
  odCost: 100,
  holdTime: 0.35, // maintien au-delà duquel on déclenche l'Overdrive
  odDuration: 4,
  odFireMul: 1.5,
  odPierce: 2,
  odBulletSlow: 0.6,
  odScoreMul: 2,
  bombDamage: 2,
  bombBossDamage: 8,
  bombCooldown: 6,
  bombRadius: 11, // rayon de l'effacement IMMÉDIAT des projectiles
  // La détonation n'est plus instantanée : un front part du vaisseau et balaie
  // l'arène en un peu moins d'une seconde. Sans lui, la bombe ne touchait que ce
  // qui était déjà descendu — donc jamais la formation, et jamais le boss.
  bombFrontSpeed: 62, // unités/seconde : traverse l'arène en ~0,9 s
  bombFrontMax: 58, // portée finale : couvre la formation la plus haute et le boss
  bombFrontThickness: 5.5, // épaisseur de la couronne active
  energyPerDiverKill: 3, // uniquement les kills au canon (pas les missiles)
  energyPerComboTier: 4, // prime au premier passage d'un palier dans la vague
  // …et un gain à CHAQUE kill tant que la chaîne tient, proportionnel au
  // multiplicateur. La jauge cesse d'être alimentée uniquement par le frôlement :
  // bien jouer la remplit aussi, ce qui donne deux façons de la charger et donc
  // deux styles de jeu.
  energyPerComboHit: 0.9,
};

export const PICKUPS = {
  gemValueScale: 0.58, // multiplié par ENEMY_TYPES[type].credits / gemCount
  collectRadius: 1.8,
  baseMagnetRadius: 4.2,
  magnetRadiusPerLevel: 2.2,
  magnetPull: 46,
  // Les gemmes DESCENDENT vers le joueur, elles ne flottent plus sur place.
  // Ancienne physique : friction 2,2 contre une accélération de 1,5, soit une
  // vitesse limite de 0,7 u/s. Depuis la formation, il leur fallait quarante
  // secondes pour atteindre le vaisseau — pour une durée de vie de neuf. Elles
  // n'arrivaient donc JAMAIS : elles expiraient en chemin.
  fallAccel: 10, // vitesse limite ≈ 4,5 u/s : l'arène est traversée en six secondes
  lifetime: 11,

  // L'APPEL. Une impulsion qui rabat vers le vaisseau tout l'argent qu'elle
  // touche. Ce n'est pas un aimant plus fort : c'est une DÉCISION.
  //
  // Les gemmes tombent et finissent par sortir du champ. L'aimant passif n'attrape
  // que ce qui passe à portée ; l'Appel va chercher le reste. Le joueur choisit
  // donc quand le dépenser — tout de suite pour trois gemmes, ou dans deux secondes
  // pour la grappe entière, en pariant qu'il sera encore en vie.
  //
  // Il ne coûte PAS d'énergie : l'énergie est la ressource de combat, et mélanger
  // les deux économies ferait de la collecte un choix de survie. Le seul prix est
  // le temps de recharge, et l'attention qu'on ne porte pas aux balles pendant ce
  // temps-là.
  // UNE SEULE CHARGE PAR VAGUE. Un temps de recharge n'aurait été qu'un rythme à
  // subir : on rappuie dès que c'est vert, et la question « quand ? » disparaît.
  // Avec une charge unique, chaque vague pose la même question et elle est
  // intéressante — maintenant pour ces trois gemmes, ou plus tard pour la grappe
  // qu'on espère ? On ne le saura qu'après.
  // PORTÉE. Neuf unités ne couvraient qu'un tiers du champ : les gemmes tombent
  // depuis la formation, à vingt-cinq unités du vaisseau, et l'onde ne les
  // atteignait tout simplement jamais. Mesuré : au-delà de vingt unités, l'Appel
  // ne rapportait plus rien du tout — d'où l'impression, juste, qu'il ne marchait
  // pas. Dix-huit couvrent l'essentiel de ce qui est encore rattrapable.
  callRadiusBase: 18,
  callRadiusPerLevel: 6, // l'Aimant tracteur élargit l'onde
  callChargeAtLevel: 4, // …et au dernier niveau, il en donne une seconde
  callPull: 70,
  callSweep: 0.42, // secondes que met l'onde à atteindre sa portée

  // LA GROSSE PIÈCE. Le multiplicateur de combo ne double les crédits qu'au
  // plafond, et surtout il est INVISIBLE : deux gemmes identiques ne disent pas au
  // joueur qu'il vient de bien enchaîner. Celle-ci, il la voit tomber.
  //
  // Elle vaut dix crédits fixes — environ deux ennemis — et elle ne passe PAS par
  // le multiplicateur : le « +10 » écrit à l'écran doit être vrai.
  bigValue: 10,
  bigChancePerTier: 0.08, // × (multiplicateur − 1) : ×3 → 16 %, ×6 → 40 %
  bigChanceMax: 0.5,
  bigScale: 2.1,
};

export const WAVES = {
  bossEvery: 4,
  // La vague arrive en deux assauts au lieu d'un compte-gouttes : sans ça, la
  // formation ne se remplit jamais et tous les leviers de menace restent éteints.
  assaultGap: 2.8,
  entryStagger: 0.08,
  twoAssaultsFromWave: 5, // les 4 premières vagues restent une montée en douceur
  colsBase: 6,
  colsMax: 10,
  colSpacing: 2.35,
  rowSpacing: 2.3,
  formationZTop: -17,
  swayAmpX: 2.1,
  swaySpeed: 0.55,
  breathAmp: 0.045,
  breathSpeed: 0.9,
};

export const FX = {
  hitStopScale: 0.15,
  hitStopDuration: 0.07,
  shakeDecay: 2.6,
};

// Réflexe : le ralenti d'esquive de la dernière chance.
//
// Le monde ralentit, le vaisseau NON — sa vitesse est divisée par la même échelle,
// donc il garde sa vitesse à l'écran. C'est toute l'astuce : ralentir tout le monde
// ne donnerait aucune chance de plus, seulement la même scène en plus lent.
// La pirouette. Un tonneau qui rend invincible AUX TIRS le temps de la manœuvre —
// pas aux collisions : se jeter dans un ennemi doit rester mortel, sinon la
// pirouette devient une touche « annuler le danger » et le jeu s'éteint.
//
// Elle se paie sur la jauge de furie, un petit peu. C'est ce qui la relie au reste
// de l'économie : la même ressource sert à esquiver et à frapper, donc chaque
// tonneau est une bombe qu'on n'aura pas.
// LE TIR DE PRÉCISION. Toucher le cœur d'un ennemi compte double.
//
// Un tiers du rayon, pas la moitié : à la moitié, une balle sur deux serait
// critique et le coup cesserait d'être un exploit pour devenir la norme — après
// quoi il n'y aurait plus qu'à rebaisser les dégâts de base, et on aurait fait un
// tour pour rien. À un tiers, la surface du cœur vaut un neuvième du disque : ça
// se cherche, et ça se fête.
export const PRECISION = {
  part: 0.34,
  degats: 2,
};

export const ROLL = {
  doubleTapWindow: 0.28, // secondes entre les deux appuis
  // Tactile : appuyer trop près du vaisseau ne désigne aucun côté. Sous cet écart
  // (en unités de jeu, l'arène en fait 29 de large) l'appui ne compte pas — mieux
  // vaut ne rien déclencher qu'un tonneau dans le mauvais sens.
  tapDeadzone: 1.8,
  duration: 0.42,
  cost: 9, // sur cent : environ un neuvième de bombe
  push: 13, // dérive latérale pendant la manœuvre
  cooldown: 0.55, // empêche d'enchaîner deux tonneaux sans reprendre le contrôle
};

export const REFLEX = {
  lookahead: 0.34, // on ne regarde que les tirs qui touchent dans moins de 0,34 s
  hitPad: 0.55, // marge autour du rayon de collision : on déclenche sur « ça va toucher »
  scale: 0.3, // le monde tourne à 30 % — en dessous, le ralenti se lit comme un gel
  duration: [0, 0.45, 0.6, 0.78], // par niveau d'amélioration
  cooldown: [0, 9, 7, 5.5],
};

// LES TROIS COQUES.
//
// Elles ne changent pas les règles du jeu : elles changent le VERBE du joueur. Le
// test qu'une coque devait passer — si on l'échange en pleine partie sans prévenir,
// les MAINS doivent faire autre chose — se joue sur trois points seulement : ce
// qu'elle tire, ce qui remplit sa jauge, et ce que les modules y deviennent.
//
// Aucune n'a été construite pour se battre : les Élides fuyaient, ils ont emporté
// des outils. Le détail est dans docs/classes.md, et il n'est pas décoratif — c'est
// lui qui a dicté les trois mécaniques.
export const COQUES = [
  {
    id: 'orion',
    nom: 'ORION',
    carene: 'dague',
    titre: 'Le chasseur',
    phrase: 'Elle frappe où elle regarde.',
    arme: 'Flux droit et missiles à tête chercheuse',
    // La jauge se remplit en frôlant les balles — la mécanique fondatrice du jeu,
    // sur la coque qu'on prend pour apprendre.
    jauge: 'frolement',
    resume: 'Passe au plus près sans te faire toucher.',
  },
  {
    id: 'helios',
    nom: 'HÉLIOS',
    carene: 'faucon',
    titre: 'Le soleil qui traverse',
    phrase: 'Elle ne sait pas faire deux choses à la fois.',
    arme: 'Rayon continu sur toute la colonne, satellites en orbite',
    jauge: 'chauffe',
    resume: 'Tiens ton rayon sur la même cible.',
  },
  {
    id: 'vulcain',
    nom: 'VULCAIN',
    carene: 'enclume',
    titre: 'La forge sous le volcan',
    phrase: 'Elle a creusé, de ses propres bras, le métal dont KORN est fait.',
    arme: 'Charges lentes qui explosent en sphère',
    jauge: 'salve',
    resume: 'Ne tire pas tout de suite. Attends qu’ils se resserrent.',
  },
];

export function coqueParId(id) {
  return COQUES.find((c) => c.id === id) || COQUES[0];
}

// LE MODE SURVIE. Cent vagues, une ligne d'arrivée, et un classement qui répond à
// « jusqu'où es-tu allé ? » plutôt qu'à « combien as-tu marqué ? ».
//
// La difficulté y monte deux fois moins vite qu'en arcade : sans cette pente
// adoucie, tout serait saturé dès la vingtième vague et les quatre-vingts
// suivantes se ressembleraient. Une vague 100 de survie vaut donc à peu près une
// vague 45 d'arcade — atteignable, mais au bout d'une heure de vol sans faute.
//
// Et des boss tous les dix seulement : au rythme de l'arcade, un marathon en
// compterait vingt-cinq, ce qui n'en ferait plus des événements.
// Les modificateurs d'une vague : multiplicateurs de points de vie, de cadence de
// tir, de plongées et de crédits. Ils venaient des missions de campagne ; ils
// servent aujourd'hui au risque choisi sur une route.
export const DEFAULT_MODS = { hp: 1, fire: 1, dive: 1, credits: 1 };

export const SURVIE = {
  vagues: 100,
  bossTousLes: 10,
  pente: 0.45,

  // NI BOUTIQUE NI CRÉDITS. En arcade, on interrompt l'action pour acheter ; ici on
  // ne s'arrête jamais — les améliorations TOMBENT des ennemis et se ramassent en
  // vol. C'est la même progression, mais elle se gagne dans le mouvement au lieu de
  // se choisir dans un menu, et cent vagues d'affilée ne supportaient pas cent
  // arrêts.
  //
  // Chance qu'un ennemi détruit lâche un module. Le compte : environ quinze ennemis
  // par vague, trente-deux améliorations à récolter en tout (huit modules, de deux à
  // six niveaux chacun). À quatre pour cent, le vaisseau est au maximum vers la
  // cinquantième vague — assez tôt pour en profiter, assez tard pour que chaque
  // trouvaille compte.
  chanceModule: 0.04,
  // Un boss vaut plusieurs vagues : il lâche sa récompense à coup sûr.
  modulesParBoss: 3,

  // LA SURCHARGE. Mesuré : le vaisseau est entièrement amélioré vers la
  // vingt-neuvième vague — soit soixante-dix vagues, les deux tiers du marathon,
  // sans plus rien à gagner. Une montée en puissance qui s'arrête aux deux tiers
  // n'est pas une montée en puissance, c'est un plateau avec une rampe devant.
  //
  // Quand tous les modules sont au maximum, ce sont donc des surcharges qui
  // tombent : un gain modeste, cumulable, sur la seule cadence de tir. Modeste,
  // parce que la difficulté, elle, continue de monter — et parce qu'un vaisseau
  // qui balaie l'écran tout seul n'a plus besoin de pilote.
  //
  // Réglage mesuré : à 3 % et quarante paliers, le plafond tombait dès la
  // quarante-deuxième vague — la cadence sextuplait à mi-parcours et les cinquante
  // vagues suivantes n'apportaient plus rien. À 2 % sur soixante paliers, la
  // progression court jusqu'aux environs de la soixantième, et le vaisseau finit
  // fort sans jamais jouer à la place du pilote.
  surchargeGain: 0.02,
  surchargeMax: 60,
};

// LA RARETÉ D'UN MODULE SUIT SA PUISSANCE, à l'envers : ce qui change le plus la
// partie se trouve le moins souvent. On ne réinvente pas l'échelle — le prix en
// boutique la porte déjà, et deux barèmes qui divergeraient seraient un piège pour
// le prochain qui touchera au jeu. Le poids est donc l'inverse du prix de base.
//
// Concrètement : la cadence de tir (70 crédits) tombe six fois plus souvent que les
// missiles (460). Un module au maximum sort du tirage — la montée s'arrête d'elle-
// même quand il n'y a plus rien à gagner, sans qu'aucun compteur ne le décide.
export const MODULE_RARETE = {
  firerate: 1 / 70,
  engine: 1 / 90,
  magnet: 1 / 80,
  shield: 1 / 300,
  reflex: 1 / 340,
  cannons: 1 / 380,
  hull: 1 / 420,
  missiles: 1 / 460,
};

// Ce qui reste sur l'appareil : deux PRÉFÉRENCES, et rien d'autre. Les pilotes,
// les scores et les records vivent sur le serveur — c'est lui qui fait qu'un enfant
// retrouve ses parties depuis n'importe quel écran de la maison.
export const STORAGE_KEYS = {
  muted: 'novaswarm.muted',
  introSeen: 'novaswarm.introseen',
};
