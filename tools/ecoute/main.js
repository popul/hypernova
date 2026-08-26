// La salle d'écoute : les thèmes du jeu, hors du jeu.
//
// Rien n'est enregistré dans ce projet — toute la musique est synthétisée à la
// volée. Pour la faire écouter, il ne suffit donc pas d'exporter un fichier : il
// faut emporter le moteur. Cette page embarque le vrai AudioEngine du jeu et les
// vraies partitions, et les joue exactement comme la partie les jouerait.
//
// C'est aussi ce qui la rend utile pour travailler : ce qu'on entend ici EST ce
// qu'on entendra en jeu, à la note près.

import { AudioEngine } from '../../src/core/audio.js';
import { THEMES } from '../../src/core/themes.js';

const audio = new AudioEngine();

// Ce qu'il faut savoir de chaque thème pour l'écouter, et qui ne se lit pas dans
// les données : où on l'entend, et à quoi tendre l'oreille.
// L'ostinato tourne huit fois par mesure du début à la fin d'une partie : c'est le
// son le plus entendu du jeu. Il était joué au même orgue sur les quatre thèmes,
// et c'est ce qui a fini par lasser — pas le motif, le timbre invariable. Chaque
// thème a maintenant sa matière.
const MATIERE = {
  pincee: 'harpe pincée',
  metal: 'métal frappé',
  cristal: 'celesta',
  souffle: 'corde grave',
};

const NOTES = {
  depart: {
    ou: 'Orbite terrestre · Lagrange · Transit',
    mode: 'ré mineur naturel',
    ecoute:
      'Le thème que le jeu joue déjà. La phrase monte au fa de la cinquième mesure — une seule fois — puis redescend se poser sur un ré tenu par-dessus l’accord de do : c’est l’accord qui bouge dessous, et c’est ce qui rend la boucle invisible.',
  },
  ceinture: {
    ou: 'Mars · la Ceinture · Jupiter',
    mode: 'ré dorien',
    ecoute:
      'Même tonique, mais le si devient bécarre : la route se durcit sans qu’on change de pays. L’ostinato d’orgue boite volontairement — six notes dans huit croches, donc 3+3+2 — et l’horloge bégaie avec lui.',
  },
  froid: {
    ou: 'Saturne · Neptune · Kuiper',
    mode: 'quartes empilées',
    ecoute:
      'Quinze notes en deux minutes. La mélodie est une octave au-dessus des accords et le milieu du spectre est vide : c’est le VIDE ENTRE LES DEUX qui fait le froid, pas les notes. Un temps dure exactement une seconde.',
  },
  dehors: {
    ou: 'Héliopause · Interstellaire',
    mode: 'tonique sans tierce',
    ecoute:
      'L’accord de départ n’a pas de tierce — ré, la, ré, la — donc il n’est ni majeur ni mineur : c’est la mélodie, seule, qui décide. L’harmonie glisse d’un demi-ton et revient. L’horloge ne frappe plus qu’une fois par mesure.',
  },
};

let courant = null;
let debloque = false;
let barreTimer = null;

const el = (t, cls, txt) => {
  const n = document.createElement(t);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

// --- Le moteur --------------------------------------------------------------

async function debloqueAudio() {
  if (debloque) return;
  await audio.unlock();
  if (audio.muted) audio.toggleMute();
  debloque = true;
}

async function joue(id) {
  await debloqueAudio();
  if (courant === id) return arrete();
  courant = id;
  audio.setTheme(id);
  // 'play' est le mode de combat : tout l'orchestre, la forme complète. C'est
  // celui qu'on veut juger — 'menu' n'en donne que la moitié.
  audio.setMode('play');
  rafraichis();
}

function arrete() {
  courant = null;
  audio.setMode('off');
  rafraichis();
}

function modeBoss(actif) {
  audio.setMode(actif ? 'boss' : 'play');
  rafraichis();
}

// --- L'interface ------------------------------------------------------------

function carte(theme) {
  const n = NOTES[theme.id] || {};
  const c = el('article', 'theme');
  c.dataset.id = theme.id;

  const tete = el('header', 'theme-tete');
  const num = el('span', 'theme-num', String(THEMES.indexOf(theme) + 1).padStart(2, '0'));
  const noms = el('div', 'theme-noms');
  noms.appendChild(el('h2', 'theme-nom', theme.nom));
  noms.appendChild(el('p', 'theme-ou', n.ou || ''));
  tete.append(num, noms);

  const meta = el('dl', 'theme-meta');
  for (const [k, v] of [
    ['Tempo', `${theme.tempo} BPM`],
    ['Mode', n.mode || '—'],
    ['Ostinato', MATIERE[theme.timbre] || theme.timbre || '—'],
    ['Tour', `${Math.round((32 * 16 * 60) / theme.tempo / 4)} s`],
  ]) {
    meta.appendChild(el('dt', null, k));
    meta.appendChild(el('dd', null, v));
  }

  const ecoute = el('p', 'theme-ecoute', n.ecoute || '');

  const barre = el('div', 'theme-barre');
  barre.appendChild(el('i', 'theme-jauge'));

  const bouton = el('button', 'theme-play');
  bouton.append(el('span', 'theme-play-icone'), el('span', 'theme-play-txt', 'Écouter'));
  bouton.addEventListener('click', () => joue(theme.id));

  c.append(tete, meta, ecoute, barre, bouton);
  return c;
}

function construis() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const entete = el('header', 'entete');
  entete.appendChild(el('p', 'sur-titre', 'Hypernova'));
  entete.appendChild(el('h1', 'titre', 'Les quatre thèmes'));
  entete.appendChild(
    el(
      'p',
      'chapo',
      'Rien n’est enregistré : tout est synthétisé au moment où vous appuyez. Cette page embarque le moteur audio du jeu et ses partitions, donc ce que vous entendez ici est exactement ce que le jeu joue. Le thème suit le voyage — il change quatre fois entre l’orbite terrestre et l’espace interstellaire, et depuis peu la MATIÈRE change avec lui : l’ostinato n’est plus joué au même orgue d’un bout à l’autre, mais à la harpe, au métal, au celesta, puis à la corde grave.'
    )
  );
  app.appendChild(entete);

  const grille = el('div', 'grille');
  for (const t of THEMES) grille.appendChild(carte(t));
  app.appendChild(grille);

  const pied = el('footer', 'pied');
  const bBoss = el('button', 'lien', 'Passer en mode boss');
  let boss = false;
  bBoss.addEventListener('click', () => {
    if (!courant) return;
    boss = !boss;
    modeBoss(boss);
    bBoss.textContent = boss ? 'Revenir au mode normal' : 'Passer en mode boss';
  });
  const bStop = el('button', 'lien', 'Tout arrêter');
  bStop.addEventListener('click', () => {
    boss = false;
    bBoss.textContent = 'Passer en mode boss';
    arrete();
  });
  pied.append(bBoss, bStop);
  pied.appendChild(
    el(
      'p',
      'pied-note',
      'Le mode boss n’est pas une autre musique : c’est la même, dont certains degrés sont abaissés d’un demi-ton. Chaque thème s’assombrit donc à sa façon.'
    )
  );
  app.appendChild(pied);
}

function rafraichis() {
  for (const c of document.querySelectorAll('.theme')) {
    const actif = c.dataset.id === courant;
    c.classList.toggle('joue', actif);
    c.querySelector('.theme-play-txt').textContent = actif ? 'Arrêter' : 'Écouter';
  }
  cancelAnimationFrame(barreTimer);
  if (!courant) {
    for (const j of document.querySelectorAll('.theme-jauge')) j.style.width = '0%';
    return;
  }
  // La forme fait 32 mesures de 16 pas : la jauge montre où l'on en est dans le
  // tour, ce qui aide à repérer le sommet et la respiration.
  const theme = THEMES.find((t) => t.id === courant);
  const tour = (32 * 16 * 60) / theme.tempo / 4;
  const t0 = performance.now();
  const jauge = document.querySelector(`.theme[data-id="${courant}"] .theme-jauge`);
  const avance = () => {
    if (!courant || !jauge) return;
    jauge.style.width = `${((((performance.now() - t0) / 1000) % tour) / tour) * 100}%`;
    barreTimer = requestAnimationFrame(avance);
  };
  avance();
}

construis();

// Le clavier, pour comparer vite : 1-4 lancent un thème, Espace arrête.
window.addEventListener('keydown', (e) => {
  const i = '1234'.indexOf(e.key);
  if (i >= 0 && THEMES[i]) joue(THEMES[i].id);
  else if (e.key === ' ') {
    e.preventDefault();
    arrete();
  }
});
