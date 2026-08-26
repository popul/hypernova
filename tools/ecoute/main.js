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
let courant = null;
let debloque = false;

const el = (t, cls, txt) => {
  const n = document.createElement(t);
  if (cls) n.className = cls;
  if (txt) n.textContent = txt;
  return n;
};

function construis() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(el('h1', 'titre', 'HYPERNOVA — les thèmes'));
  app.appendChild(
    el(
      'p',
      'note',
      'Chaque thème est synthétisé en direct par le moteur du jeu : ce que vous entendez ici est exactement ce qui joue en partie.'
    )
  );

  const liste = el('div', 'liste');
  for (const t of THEMES) {
    const carte = el('button', 'carte');
    carte.dataset.id = t.id;
    carte.appendChild(el('span', 'nom', t.nom || t.id));
    carte.appendChild(el('span', 'quand', t.quand || ''));
    carte.appendChild(el('span', 'desc', t.caractere || ''));
    carte.appendChild(el('span', 'etat', 'Écouter'));
    carte.addEventListener('click', () => bascule(t.id));
    liste.appendChild(carte);
  }
  app.appendChild(liste);

  const barre = el('div', 'barre');
  const mode = el('select', 'mode');
  for (const [v, n] of [
    ['play', 'En partie'],
    ['boss', 'Combat de boss'],
    ['title', 'Écran-titre'],
    ['shop', 'Entre deux vagues'],
  ]) {
    const o = el('option', null, n);
    o.value = v;
    mode.appendChild(o);
  }
  mode.addEventListener('change', () => {
    if (courant) audio.setMode(mode.value);
  });
  barre.appendChild(el('span', 'label', 'Arrangement'));
  barre.appendChild(mode);
  const stop = el('button', 'stop', '■ Arrêter');
  stop.addEventListener('click', () => arrete());
  barre.appendChild(stop);
  app.appendChild(barre);
  window.__mode = mode;
}

function arrete() {
  audio.setMode('off');
  courant = null;
  for (const c of document.querySelectorAll('.carte')) {
    c.classList.remove('joue');
    c.querySelector('.etat').textContent = 'Écouter';
  }
}

async function bascule(id) {
  if (!debloque) {
    await audio.unlock();
    debloque = true;
  }
  if (courant === id) return arrete();
  arrete();
  courant = id;
  audio.setTheme?.(id);
  audio.setMode(window.__mode?.value || 'play');
  const c = document.querySelector(`.carte[data-id="${id}"]`);
  if (c) {
    c.classList.add('joue');
    c.querySelector('.etat').textContent = '❚❚ En lecture';
  }
}

construis();
