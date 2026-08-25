// Visage animé de NOVA : états émotionnels, regard vivant, bouche articulée,
// cheveux à inertie.
//
// L'ancienne version était figée dans un sourire, animait la bouche par un simple
// étirement vertical et n'avait ni regard ni chevelure. Ici, tout est piloté image
// par image en JS : les CSS keyframes ne savent pas produire des saccades oculaires
// irrégulières ni une articulation qui suit le texte.

const EMOTIONS = {
  neutre: { brow: 0, browTilt: 0, lid: 0, mouth: 'ligne', tint: '#4ff2ff', pupil: 1 },
  alerte: { brow: -2.6, browTilt: 0.1, lid: -1.2, mouth: 'o', tint: '#7ff0ff', pupil: 1.25 },
  content: { brow: -1, browTilt: -0.14, lid: 1.6, mouth: 'sourire', tint: '#6dfbd0', pupil: 1 },
  inquiet: { brow: 1.8, browTilt: 0.3, lid: 0.6, mouth: 'moue', tint: '#9fd8ff', pupil: 1.15 },
  determine: { brow: -3.2, browTilt: -0.26, lid: -2, mouth: 'serre', tint: '#ffd166', pupil: 0.85 },
  triste: { brow: 2.4, browTilt: 0.34, lid: 2.4, mouth: 'moue', tint: '#8fb8ff', pupil: 1.1 },
};

// Formes de bouche. Une articulation crédible alterne des formes distinctes
// (ouvert / arrondi / étiré), pas une seule qui grandit et rétrécit.
const VISEMES = {
  ferme: 'M26 47 Q32 48.5 38 47',
  ligne: 'M26.5 47 L37.5 47',
  a: 'M26 45.5 Q32 53 38 45.5 Q32 49.5 26 45.5',
  o: 'M28.6 46.6 Q32 43.6 35.4 46.6 Q32 51.4 28.6 46.6',
  e: 'M25.6 46.4 Q32 50.4 38.4 46.4 Q32 48.4 25.6 46.4',
  sourire: 'M25.4 45.4 Q32 51.6 38.6 45.4',
  moue: 'M27 48.2 Q32 45.4 37 48.2',
  serre: 'M26.6 47.2 L37.4 47.2',
};

const TALK_CYCLE = ['a', 'e', 'o', 'a', 'ferme', 'e', 'a', 'o'];

export const NOVA_SVG = `
<svg viewBox="0 0 64 70" aria-hidden="true" class="face face-nova">
  <defs>
    <radialGradient id="nova-skin" cx="38%" cy="28%" r="78%">
      <stop offset="0%" stop-color="#e8ffff"/>
      <stop offset="52%" stop-color="#5fd8f2"/>
      <stop offset="100%" stop-color="#0d4d68"/>
    </radialGradient>
    <linearGradient id="nova-hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7ef7ff"/>
      <stop offset="100%" stop-color="#1b6f96"/>
    </linearGradient>
  </defs>

  <!-- Chevelure arrière : les mèches oscillent avec un retard sur la tête -->
  <g class="hair hair-back">
    <path class="strand" d="M14 26 Q8 42 13 58 Q18 46 18 32 Z" fill="url(#nova-hair)" opacity="0.85"/>
    <path class="strand" d="M50 26 Q56 42 51 58 Q46 46 46 32 Z" fill="url(#nova-hair)" opacity="0.85"/>
  </g>

  <!-- Tête -->
  <path class="head" d="M32 8 C44 8 50 17 50 27 C50 40 43 50 32 50 C21 50 14 40 14 27 C14 17 20 8 32 8 Z"
        fill="url(#nova-skin)"/>

  <!-- Frange : deux mèches indépendantes, animées séparément -->
  <g class="hair hair-front">
    <path class="strand" d="M15 24 Q18 8 34 8 Q24 13 21 27 Z" fill="url(#nova-hair)"/>
    <path class="strand" d="M49 24 Q47 9 32 8 Q41 12 44 27 Z" fill="url(#nova-hair)"/>
  </g>

  <!-- Sourcils : porteurs de l'émotion -->
  <g class="brows">
    <rect class="brow brow-l" x="20" y="22" width="10" height="1.9" rx="0.95" fill="#0a3b52"/>
    <rect class="brow brow-r" x="34" y="22" width="10" height="1.9" rx="0.95" fill="#0a3b52"/>
  </g>

  <!-- Yeux : le globe est fixe, l'iris se déplace, la paupière se ferme -->
  <g class="eyes">
    <g class="eye eye-l">
      <ellipse class="sclera" cx="25" cy="31" rx="5.6" ry="4.4" fill="#f2fdff"/>
      <g class="iris-wrap">
        <circle class="iris" cx="25" cy="31" r="2.9" fill="#0e6c8c"/>
        <circle class="pupil" cx="25" cy="31" r="1.5" fill="#04222f"/>
        <circle class="glint" cx="23.9" cy="29.8" r="0.85" fill="#ffffff"/>
      </g>
      <path class="lid" d="M19.4 31 A5.6 4.4 0 0 1 30.6 31 Z" fill="url(#nova-skin)"/>
    </g>
    <g class="eye eye-r">
      <ellipse class="sclera" cx="39" cy="31" rx="5.6" ry="4.4" fill="#f2fdff"/>
      <g class="iris-wrap">
        <circle class="iris" cx="39" cy="31" r="2.9" fill="#0e6c8c"/>
        <circle class="pupil" cx="39" cy="31" r="1.5" fill="#04222f"/>
        <circle class="glint" cx="37.9" cy="29.8" r="0.85" fill="#ffffff"/>
      </g>
      <path class="lid" d="M33.4 31 A5.6 4.4 0 0 1 44.6 31 Z" fill="url(#nova-skin)"/>
    </g>
  </g>

  <!-- Bouche articulée -->
  <path class="mouth" d="M26.5 47 L37.5 47" fill="#06303f" stroke="#06303f" stroke-width="1.5"
        stroke-linecap="round"/>

  <!-- Casque / oreillette : ce n'est pas une mascotte, c'est une pilote -->
  <path class="rig" d="M13 27 Q11 20 16 15" stroke="#8ffbff" stroke-width="1.4" fill="none" opacity="0.9"/>
  <circle class="rig-led" cx="13" cy="30" r="1.9" fill="#8ffbff"/>
  <path d="M50 26 Q53 20 48 15" stroke="#8ffbff" stroke-width="1.4" fill="none" opacity="0.55"/>
</svg>`;

export const VORAX_SVG = `
<svg viewBox="0 0 64 70" aria-hidden="true" class="face face-vorax">
  <defs>
    <radialGradient id="vorax-shell" cx="46%" cy="30%" r="82%">
      <stop offset="0%" stop-color="#9c2f4a"/>
      <stop offset="58%" stop-color="#4d0f22"/>
      <stop offset="100%" stop-color="#160309"/>
    </radialGradient>
  </defs>

  <!-- Antennes : elles ploient quand il est contrarié -->
  <g class="antennae">
    <path class="ant ant-l" d="M17 14 Q10 6 6 2" stroke="#ff4757" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path class="ant ant-r" d="M47 14 Q54 6 58 2" stroke="#ff4757" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </g>

  <!-- Carapace -->
  <path class="head" d="M32 6 L54 22 L49 50 L15 50 L10 22 Z" fill="url(#vorax-shell)"
        stroke="#ff4757" stroke-width="1.4"/>
  <path d="M32 6 L32 50" stroke="rgba(255,71,87,0.35)" stroke-width="0.8"/>

  <!-- Sourcils chitineux -->
  <g class="brows">
    <path class="brow brow-l" d="M18 24 L29 27" stroke="#12040a" stroke-width="2.6" stroke-linecap="round"/>
    <path class="brow brow-r" d="M46 24 L35 27" stroke="#12040a" stroke-width="2.6" stroke-linecap="round"/>
  </g>

  <!-- Œil composé unique : l'iris balaie, la fente se contracte -->
  <g class="eyes">
    <g class="eye eye-c">
      <ellipse class="sclera" cx="32" cy="33" rx="11.5" ry="8.6" fill="#ffd24a"/>
      <g class="iris-wrap">
        <ellipse class="iris" cx="32" cy="33" rx="3.6" ry="7.4" fill="#2a0410"/>
        <ellipse class="pupil" cx="32" cy="33" rx="1.5" ry="5.4" fill="#000"/>
        <circle class="glint" cx="29.6" cy="30.2" r="1.5" fill="#fff8e0"/>
      </g>
      <path class="lid" d="M20.5 33 A11.5 8.6 0 0 1 43.5 33 Z" fill="url(#vorax-shell)"/>
    </g>
  </g>

  <!-- Mandibules articulées, à la place d'une bouche -->
  <g class="mandibles">
    <path class="mand mand-l" d="M22 46 Q26 57 32 50" stroke="#ff9f43" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path class="mand mand-r" d="M42 46 Q38 57 32 50" stroke="#ff9f43" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

// -------------------------------------------------------------------- Animateur

// Pilote un portrait SVG image par image. Un seul animateur pour les deux
// personnages : ils partagent la même grammaire (yeux, paupières, bouche, appendices).
export class FaceRig {
  constructor(el, { kind = 'nova' } = {}) {
    this.el = el;
    this.kind = kind;
    this.q = (s) => el.querySelector(s);
    this.qa = (s) => Array.from(el.querySelectorAll(s));

    // Chaque œil se dilate autour de SON centre : mettre à l'échelle autour d'un
    // centre commun écarterait les yeux à chaque dilatation de pupille.
    this.irises = this.qa('.iris-wrap').map((wrap) => {
      const iris = wrap.querySelector('.iris');
      return {
        el: wrap,
        cx: parseFloat(iris?.getAttribute('cx') ?? 32),
        cy: parseFloat(iris?.getAttribute('cy') ?? 31),
      };
    });
    this.lids = this.qa('.lid');
    this.brows = this.qa('.brow');
    this.strands = this.qa('.strand');
    this.mouth = this.q('.mouth');
    this.mandibles = this.qa('.mand');
    this.antennae = this.qa('.ant');
    this.head = this.q('.head');

    this.t = 0;
    this.emotion = EMOTIONS.neutre;
    this.emotionName = 'neutre';

    // Regard : cible courante + position lissée. Les saccades sont brusques,
    // le suivi est doux — c'est ce contraste qui fait « vivant ».
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
    this.blink = { t: 1.4, closing: 0 };
    this.talk = { level: 0, phase: 0, viseme: 0 };
    this.hair = { x: 0, v: 0 };
    this.headBob = 0;
  }

  setEmotion(name) {
    this.emotion = EMOTIONS[name] || EMOTIONS.neutre;
    this.emotionName = name;
    this.el.style.setProperty('--face-tint', this.emotion.tint);
  }

  // Appelé au début d'une réplique : `intensity` module l'amplitude d'articulation.
  startTalking(durationMs, intensity = 1) {
    this.talk.level = intensity;
    this.talk.until = performance.now() + durationMs;
  }

  stopTalking() {
    this.talk.until = 0;
  }

  update(dt) {
    this.t += dt;
    const now = performance.now();
    const talking = this.talk.until > now;

    // --- Regard : saccades irrégulières, avec des retours au centre ---
    this.gaze.next -= dt;
    if (this.gaze.next <= 0) {
      // Une saccade sur trois revient au centre : un regard qui erre sans jamais
      // se poser paraît absent.
      const centered = Math.random() < 0.34;
      this.gaze.tx = centered ? 0 : (Math.random() - 0.5) * 2.6;
      this.gaze.ty = centered ? 0 : (Math.random() - 0.5) * 1.5;
      this.gaze.next = talking ? 0.5 + Math.random() * 0.9 : 1.1 + Math.random() * 2.2;
    }
    // Approche rapide puis stabilisation : profil d'une vraie saccade.
    this.gaze.x += (this.gaze.tx - this.gaze.x) * Math.min(1, 16 * dt);
    this.gaze.y += (this.gaze.ty - this.gaze.y) * Math.min(1, 16 * dt);

    // --- Clignement : intervalle irrégulier, fermeture bien plus rapide que l'ouverture ---
    this.blink.t -= dt;
    if (this.blink.t <= 0) {
      this.blink.closing = 0.14;
      this.blink.t = 1.8 + Math.random() * 3.4;
    }
    let lidClose = 0;
    if (this.blink.closing > 0) {
      this.blink.closing -= dt;
      const k = 1 - Math.max(0, this.blink.closing) / 0.14;
      lidClose = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; // ferme vite, rouvre lentement
    }
    // La paupière porte aussi l'émotion (regard mi-clos, yeux écarquillés).
    const lidBase = THREE_clamp(this.emotion.lid / 6, -0.4, 0.5);
    const lid = THREE_clamp(lidClose + Math.max(0, lidBase), 0, 1);

    // --- Bouche : cycle de formes tant qu'on parle, forme de repos sinon ---
    if (talking) {
      this.talk.phase += dt * (9 + Math.random() * 3);
      if (this.talk.phase >= 1) {
        this.talk.phase = 0;
        this.talk.viseme = (this.talk.viseme + 1 + ((Math.random() * 2) | 0)) % TALK_CYCLE.length;
      }
    }
    const shape = talking ? TALK_CYCLE[this.talk.viseme] : this.emotion.mouth;

    // --- Cheveux : ressort amorti derrière le mouvement de la tête ---
    this.headBob = Math.sin(this.t * 1.7) * 1.1 + (talking ? Math.sin(this.t * 9) * 0.35 : 0);
    const target = -this.headBob * 0.9;
    this.hair.v += (target - this.hair.x) * 34 * dt;
    this.hair.v *= Math.pow(0.02, dt); // amortissement
    this.hair.x += this.hair.v * dt;

    this._apply(lid, shape, talking);
  }

  _apply(lid, shape, talking) {
    const gx = this.gaze.x;
    const gy = this.gaze.y;
    const pupilScale = this.emotion.pupil;

    for (const { el, cx, cy } of this.irises) {
      // scale() est relatif à l'origine du viewBox : la contre-translation ramène
      // la dilatation autour du centre de l'œil concerné.
      const tx = gx + cx * (1 - pupilScale);
      const ty = gy + cy * (1 - pupilScale);
      el.setAttribute(
        'transform',
        `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${pupilScale.toFixed(2)})`
      );
    }

    // Paupières : elles descendent sur le globe.
    for (const l of this.lids) {
      l.setAttribute('transform', `translate(0 ${(lid * 9 - 9).toFixed(2)})`);
    }

    // Sourcils : hauteur + inclinaison portent l'essentiel de l'expression.
    this.brows.forEach((b, i) => {
      const dir = i === 0 ? 1 : -1;
      const tilt = this.emotion.browTilt * dir * 12;
      b.setAttribute(
        'transform',
        `translate(${(gx * 0.25).toFixed(2)} ${(this.emotion.brow + this.headBob * 0.25).toFixed(2)}) rotate(${tilt.toFixed(1)} ${i === 0 ? 25 : 39} 23)`
      );
    });

    // Bouche ou mandibules.
    if (this.mouth) {
      this.mouth.setAttribute('d', VISEMES[shape] || VISEMES.ligne);
    }
    if (this.mandibles.length) {
      const open = talking ? 0.5 + Math.sin(this.t * 24) * 0.5 : 0.1;
      this.mandibles.forEach((m, i) => {
        m.setAttribute(
          'transform',
          `rotate(${((i === 0 ? -1 : 1) * open * 16).toFixed(1)} ${i === 0 ? 22 : 42} 46)`
        );
      });
    }

    // Antennes de VORAX : elles ploient selon l'humeur.
    if (this.antennae.length) {
      const droop = this.emotionName === 'triste' || this.emotionName === 'inquiet' ? 10 : 0;
      this.antennae.forEach((a, i) => {
        a.setAttribute(
          'transform',
          `rotate(${((i === 0 ? 1 : -1) * (droop + Math.sin(this.t * 2.4 + i) * 3)).toFixed(1)} ${i === 0 ? 17 : 47} 14)`
        );
      });
    }

    // Cheveux : chaque mèche traîne un peu plus que la précédente.
    this.strands.forEach((s, i) => {
      const lag = 1 - i * 0.18;
      s.setAttribute(
        'transform',
        `rotate(${(this.hair.x * lag).toFixed(2)} 32 ${i < 2 ? 26 : 20})`
      );
    });

    // Léger balancement de la tête : sans lui, tout le reste paraît collé.
    if (this.head) {
      this.head.setAttribute('transform', `rotate(${(this.headBob * 0.35).toFixed(2)} 32 40)`);
    }
  }
}

function THREE_clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export { EMOTIONS };
