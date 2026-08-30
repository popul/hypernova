// L'INTERFACE A DES INVARIANTS, ET ILS SE SONT DÉJÀ CASSÉS EN SILENCE.
//
// Ces épreuves lisent le CSS et le code comme des DONNÉES. C'est inhabituel, et
// il faut dire pourquoi c'est légitime ici : le défaut qu'elles épinglent ne se
// voit dans AUCUN test fonctionnel. Un bouton privé de pointeur répond
// parfaitement à element.click() — seul un doigt réel le traverse. Le banc
// d'essai a validé un flux entier dont le bouton central était intouchable, et
// le bug est parti en production : « impossible d'accepter une demande pour
// rejoindre la partie de son ami ».
//
// La paire d'invariants est indivisible :
//   · #overlay est en pointer-events: none — les doigts doivent traverser les
//     écrans de menu pour atteindre le canevas de pilotage ;
//   · .voix-barre rétablit pointer-events: auto — les bandeaux d'appel et
//     d'acceptation doivent, eux, recevoir le doigt, où qu'ils soient posés.
// Retirer l'un OU l'autre casse quelque chose d'invisible aux tests. Les deux
// se surveillent donc ensemble.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const jeu = readFileSync(new URL('../src/game/game.js', import.meta.url), 'utf8');

// Le bloc CSS d'un sélecteur, accolades comprises. Naïf, mais suffisant pour un
// fichier qui passe Prettier : un sélecteur ouvre son bloc sur la même ligne.
function bloc(selecteur) {
  const i = css.indexOf(`${selecteur} {`);
  assert.ok(i >= 0, `le sélecteur ${selecteur} a disparu du CSS`);
  return css.slice(i, css.indexOf('}', i));
}

test('les doigts traversent les menus, mais jamais les bandeaux', () => {
  assert.match(
    bloc('#overlay'),
    /pointer-events:\s*none/,
    '#overlay doit laisser passer le doigt vers le pilotage'
  );
  assert.match(
    bloc('.voix-barre'),
    /pointer-events:\s*auto/,
    'un bandeau sans pointeur a des boutons que le doigt traverse — le banc ne le voit pas, .click() non plus'
  );
});

test('aucun bandeau ne se pose dans l’overlay', () => {
  // Poser un bandeau dans #overlay, c'est compter sur la CSS pour le sauver.
  // Elle le fait — mais quatre bandeaux au même endroit, c'est une règle qu'on
  // relit d'un coup d'œil, et un cas particulier de moins à connaître.
  assert.ok(
    !/overlayRoot\.append\(barre\)/.test(jeu),
    'un bandeau .voix-barre est posé dans #overlay au lieu de document.body'
  );
});

test('le HUD reste hors de portée du doigt, sauf ses boutons', () => {
  // Le HUD couvre l'écran de jeu entier : s'il prenait le pointeur, on ne
  // pourrait plus piloter à travers. Ses boutons, eux, le réactivent un par un.
  assert.match(bloc('#hud'), /pointer-events:\s*none/);
});
