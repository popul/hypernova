// Les illustrations des améliorations.
//
// C'étaient des glyphes Unicode de 24 pixels : ⚡ ⋔ ✦ ◍ ≫ ◉ ◷ ♥. Muets, minuscules,
// et surtout identiques à ce qu'on trouve dans n'importe quel menu — donc incapables
// de donner envie. Or la boutique est le seul endroit du jeu où l'on projette : on
// n'y achète pas une statistique, on y achète ce que le vaisseau va DEVENIR.
//
// Chaque dessin montre donc une SCÈNE, pas un symbole : le vaisseau et l'effet en
// action. Le vaisseau est toujours le même triangle à la même place, ce qui fait de
// la grille une planche comparative — d'un coup d'œil on voit ce qui change.
//
// Contraintes de dessin :
//  · un carré de 64, traits de 2, angles nets (le jeu est bas-poly, pas arrondi) ;
//  · `currentColor` partout, pour que la carte reste cyan et passe en or au niveau
//    maximum sans qu'on ait à toucher aux dessins ;
//  · l'accent chaud (--gold) est réservé à CE QUE L'AMÉLIORATION AJOUTE, jamais à
//    la coque : l'œil trouve ainsi la nouveauté avant d'avoir lu le titre.

const SHIP = `<path d="M32 40 L26 52 L32 49 L38 52 Z" fill="currentColor" opacity=".9"/>
  <path d="M32 40 L22 50 M32 40 L42 50" stroke="currentColor" stroke-width="1.5" opacity=".45"/>`;

const wrap = (inner) =>
  `<svg viewBox="0 0 64 64" class="art" aria-hidden="true" fill="none"
     stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const UPGRADE_ART = {
  // Surcadenceur — la même trajectoire répétée de plus en plus serré : c'est
  // l'ESPACEMENT qui dit la cadence, pas le nombre de traits.
  firerate: wrap(`
    ${SHIP}
    <g stroke="var(--gold)" stroke-width="3">
      <path d="M32 34 L32 28" opacity=".95"/>
      <path d="M32 24 L32 19" opacity=".75"/>
      <path d="M32 16 L32 12" opacity=".5"/>
      <path d="M32 9 L32 6" opacity=".28"/>
    </g>
    <path d="M20 30 L24 26 M44 30 L40 26" stroke="currentColor" stroke-width="1.5" opacity=".5"/>
  `),

  // Canons jumelés — trois flux qui s'écartent, et deux bouches ajoutées sur les
  // ailes. On voit d'où sortent les nouveaux tirs.
  cannons: wrap(`
    ${SHIP}
    <g stroke="var(--gold)" stroke-width="2.6">
      <path d="M32 36 L32 8"/>
      <path d="M24 42 L17 12" opacity=".85"/>
      <path d="M40 42 L47 12" opacity=".85"/>
    </g>
    <rect x="21" y="42" width="6" height="4" fill="var(--gold)" opacity=".9"/>
    <rect x="37" y="42" width="6" height="4" fill="var(--gold)" opacity=".9"/>
  `),

  // Missiles Nova — la trajectoire COURBE est tout le message : elle dit « ça suit
  // la cible », ce qu'aucune ligne droite ne pourrait dire.
  missiles: wrap(`
    ${SHIP}
    <circle cx="46" cy="16" r="8" stroke="currentColor" stroke-width="1.6" opacity=".55"/>
    <path d="M46 5 L46 10 M46 22 L46 27 M35 16 L40 16 M52 16 L57 16"
          stroke="currentColor" stroke-width="1.6" opacity=".55"/>
    <path d="M28 42 C20 30 30 20 42 17" stroke="var(--gold)" stroke-width="2.4"
          stroke-dasharray="1 5" opacity=".8"/>
    <path d="M40 21 L47 15 L44 24 Z" fill="var(--gold)"/>
    <circle cx="46" cy="16" r="2.4" fill="var(--gold)"/>
  `),

  // Bouclier à ions — une coupole hexagonale, et un impact qui vient MOURIR dessus.
  // Le tir arrêté net vaut mieux que n'importe quelle bulle vide.
  shield: wrap(`
    ${SHIP}
    <path d="M32 14 L50 24 L50 40 L32 52 L14 40 L14 24 Z"
          stroke="currentColor" stroke-width="2" opacity=".85"/>
    <path d="M32 20 L44 27 L44 38 L32 46 L20 38 L20 27 Z"
          stroke="currentColor" stroke-width="1" opacity=".3"/>
    <path d="M50 10 L44 20" stroke="var(--gold)" stroke-width="2.6" opacity=".9"/>
    <g stroke="var(--gold)" stroke-width="1.8" opacity=".85">
      <path d="M44 20 L49 22 M44 20 L42 25 M44 20 L38 19"/>
    </g>
  `),

  // Propulseurs — la coque penchée dans son élan, et les traînées qui s'allongent
  // derrière. On lit une vitesse, pas une flèche.
  engine: wrap(`
    <g transform="rotate(-9 32 34)">
      <path d="M32 24 L26 38 L32 35 L38 38 Z" fill="currentColor" opacity=".9"/>
      <path d="M32 24 L22 36 M32 24 L42 36" stroke="currentColor" stroke-width="1.5" opacity=".45"/>
    </g>
    <g stroke="var(--gold)" stroke-width="3" opacity=".9">
      <path d="M27 42 L23 58"/>
      <path d="M37 42 L41 58"/>
    </g>
    <g stroke="var(--gold)" stroke-width="1.6" opacity=".45">
      <path d="M17 44 L14 56 M47 44 L50 56 M32 46 L32 60"/>
    </g>
  `),

  // Aimant tracteur — les gemmes s'incurvent vers la coque. Le rayon d'attraction
  // est tracé en pointillé : la portée est justement ce que l'amélioration achète.
  magnet: wrap(`
    ${SHIP}
    <circle cx="32" cy="44" r="20" stroke="currentColor" stroke-width="1.3"
            stroke-dasharray="3 4" opacity=".45"/>
    <g fill="var(--gold)">
      <path d="M13 20 L16 24 L13 28 L10 24 Z"/>
      <path d="M50 14 L53 18 L50 22 L47 18 Z" opacity=".85"/>
      <path d="M33 8 L36 12 L33 16 L30 12 Z" opacity=".7"/>
    </g>
    <g stroke="var(--gold)" stroke-width="1.8" stroke-dasharray="2 3" opacity=".8">
      <path d="M15 28 C20 36 24 40 29 43"/>
      <path d="M49 23 C44 32 39 38 35 43"/>
      <path d="M33 17 C33 26 33 34 32 41"/>
    </g>
  `),

  // Réflexe Chrono — une balle ARRÊTÉE à un cheveu de la coque, ses images
  // rémanentes derrière elle, dans un cadran. Le danger figé, pas le temps qui passe.
  reflex: wrap(`
    ${SHIP}
    <circle cx="32" cy="30" r="21" stroke="currentColor" stroke-width="1.6" opacity=".5"/>
    <g stroke="currentColor" stroke-width="2" opacity=".6">
      <path d="M32 9 L32 13 M53 30 L49 30 M32 51 L32 47 M11 30 L15 30"/>
    </g>
    <g fill="var(--gold)">
      <circle cx="32" cy="34" r="3.4"/>
      <circle cx="32" cy="24" r="2.2" opacity=".45"/>
      <circle cx="32" cy="16" r="1.5" opacity=".22"/>
    </g>
    <path d="M24 34 L20 34 M40 34 L44 34" stroke="var(--gold)" stroke-width="1.6" opacity=".55"/>
  `),

  // Coque renforcée — des plaques qui se superposent sur la coque. On compte les
  // épaisseurs, donc on comprend qu'on achète des vies.
  hull: wrap(`
    <path d="M32 34 L24 50 L32 46 L40 50 Z" fill="currentColor" opacity=".9"/>
    <g stroke="var(--gold)" stroke-width="2.4">
      <path d="M32 26 L18 34 L18 46 L32 56 L46 46 L46 34 Z" opacity=".95"/>
    </g>
    <g stroke="var(--gold)" stroke-width="1.6" opacity=".5">
      <path d="M32 18 L11 30 L11 48"/>
      <path d="M32 18 L53 30 L53 48"/>
    </g>
    <path d="M32 34 L32 46" stroke="currentColor" stroke-width="1.4" opacity=".4"/>
  `),
};
