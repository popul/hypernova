// LE SERVEUR QUI RESTE DEBOUT.
//
// Toutes les autres épreuves du dossier appellent des fonctions. Celle-ci démarre
// le vrai serveur dans un vrai processus et lui envoie de vrais octets, parce que
// le défaut qu'elle défend ne se voit QUE là : une exception jetée dans un
// gestionnaire d'événement ne remonte à aucun appelant, elle remonte à
// `uncaughtException`, et Node arrête le processus. Depuis une fonction, on ne
// verrait qu'une exception attrapable ; depuis un processus, on voit ce que le
// joueur voit — la partie coupée.
//
// `new URL(req.url, 'http://x')` jette sur une cible de requête malformée. Elle
// était écrite hors de toute protection sur les deux chemins d'entrée, le HTTP
// ordinaire et la montée WebSocket. « GET //[ HTTP/1.1 », envoyé par n'importe
// qui, sans compte : le serveur mourait, et tous les pilotes connectés tombaient
// avec lui. Mesuré avant correction — il mourait bien.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Un port libre : on en ouvre un au hasard, on note lequel, on le rend.
function portLibre() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

// Le serveur, démarré pour de bon, sur sa propre base jetable.
async function demarre(t) {
  const port = await portLibre();
  const dossier = mkdtempSync(join(tmpdir(), 'hypernova-serveur-'));
  const fils = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: join(dossier, 'h.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let journal = '';
  fils.stdout.on('data', (d) => (journal += d));
  fils.stderr.on('data', (d) => (journal += d));
  t.after(() => {
    fils.kill('SIGKILL');
    rmSync(dossier, { recursive: true, force: true });
  });

  await new Promise((res, rej) => {
    const t0 = setTimeout(() => rej(new Error(`le serveur n'a pas démarré :\n${journal}`)), 10_000);
    const guette = setInterval(() => {
      if (/écoute sur/.test(journal)) {
        clearInterval(guette);
        clearTimeout(t0);
        res();
      }
    }, 50);
  });
  return { port, fils, journal: () => journal };
}

// Une requête écrite à la main : `fetch` refuserait d'envoyer une adresse
// invalide, et c'est précisément ce qu'on veut envoyer.
function brut(port, texte) {
  return new Promise((res) => {
    let recu = '';
    let fini = false;
    const rends = () => {
      if (fini) return;
      fini = true;
      s.destroy();
      res(recu);
    };
    const s = connect(port, '127.0.0.1', () => s.write(texte));
    // La connexion est maintenue en vie : attendre sa fermeture, c'est attendre
    // le délai d'inactivité à chaque requête. On rend la main dès que les
    // en-têtes sont complets, et le court délai ne sert plus qu'aux cas où le
    // serveur ne répond rien du tout — une socket refermée sans un mot.
    s.setTimeout(800, rends);
    s.on('data', (d) => {
      recu += d;
      if (recu.includes('\r\n\r\n')) rends();
    });
    s.on('close', rends);
    s.on('error', rends);
  });
}

const vivant = async (port) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/sante`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.status;
  } catch {
    return null;
  }
};

test('une adresse malformée sur le chemin HTTP ne tue pas le serveur', async (t) => {
  const { port } = await demarre(t);
  assert.equal(await vivant(port), 200, 'le serveur n’a pas démarré correctement');

  const reponse = await brut(port, 'GET //[ HTTP/1.1\r\nHost: x\r\n\r\n');
  assert.match(reponse, /^HTTP\/1\.1 400 /, 'une adresse illisible mérite un 400, pas une coupure');

  assert.equal(await vivant(port), 200, 'LE SERVEUR EST MORT : tous les joueurs sont tombés');
});

test('une adresse malformée sur la montée WebSocket ne tue pas le serveur', async (t) => {
  const { port } = await demarre(t);
  assert.equal(await vivant(port), 200);

  await brut(
    port,
    'GET //[ HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'
  );

  assert.equal(await vivant(port), 200, 'LE SERVEUR EST MORT sur la montée WebSocket');
});

test('les autres adresses tordues passent sans émouvoir personne', async (t) => {
  const { port } = await demarre(t);
  // Un échantillon de ce qu'un scanner envoie en une soirée sur une adresse
  // publique. Aucune ne doit rien faire d'autre que recevoir une réponse.
  for (const cible of ['//[', '/%', '/%zz', '/../..', '/\\', '/////', '/api/%c0%ae']) {
    await brut(port, `GET ${cible} HTTP/1.1\r\nHost: x\r\n\r\n`);
    assert.equal(await vivant(port), 200, `le serveur est tombé sur « ${cible} »`);
  }
});

// --- Deviner un code à quatre chiffres ----------------------------------------
//
// Dix mille possibilités. La limite générale du service laisse passer quatre-vingt
// -dix requêtes par minute : les dix mille codes tiennent en moins de deux heures
// depuis une seule adresse. Elle protège la MACHINE contre la charge, pas les
// COMPTES contre la patience — et ici, un compte pris, c'est un enfant dont un
// autre publie les scores sous son nom.

const poste = (port, corps) =>
  fetch(`http://127.0.0.1:${port}/api/pilotes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(3000),
  });

test('les essais de code ratés finissent par être refusés', async (t) => {
  const { port } = await demarre(t);

  const creation = await poste(port, { nom: 'ZOÉ', code: '1234', email: 'z@e.fr' });
  assert.equal(creation.status, 201, 'le pseudo n’a pas été créé');

  // On essaie des codes faux, comme le ferait celui qui veut le pseudo.
  const codes = [];
  for (let i = 0; i < 8; i++)
    codes.push((await poste(port, { nom: 'ZOÉ', code: `900${i}` })).status);

  assert.ok(codes.includes(429), `aucun essai n’a été refusé : ${codes.join(', ')}`);
  assert.ok(
    codes.indexOf(429) <= 5,
    `il a fallu ${codes.indexOf(429)} essais avant le premier refus`
  );

  // ET LE VRAI CODE EST REFUSÉ AUSSI, tant que la fenêtre court : c'est ce qui
  // fait qu'essayer ne sert plus à rien.
  assert.equal((await poste(port, { nom: 'ZOÉ', code: '1234' })).status, 429);
});

test('se tromper deux fois puis se souvenir ne coûte rien', async (t) => {
  const { port } = await demarre(t);
  await poste(port, { nom: 'MAX', code: '4321', email: 'm@e.fr' });

  assert.equal((await poste(port, { nom: 'MAX', code: '0000' })).status, 403);
  assert.equal((await poste(port, { nom: 'MAX', code: '1111' })).status, 403);
  // Le bon code passe : la garde ne doit jamais gêner celui à qui le pseudo est.
  assert.equal((await poste(port, { nom: 'MAX', code: '4321' })).status, 200);

  // Et l'ardoise est effacée : il a droit à toute sa marge de nouveau.
  for (let i = 0; i < 4; i++) {
    assert.equal((await poste(port, { nom: 'MAX', code: `800${i}` })).status, 403);
  }
});

test('un pseudo libre s’attrape sans que la garde s’en mêle', async (t) => {
  const { port } = await demarre(t);
  // Sur un pseudo que personne n'a pris, il n'y a pas de code à deviner : compter
  // les essais empêcherait seulement une fratrie de s'inscrire l'une après
  // l'autre depuis la même adresse.
  for (let i = 0; i < 8; i++) {
    const r = await poste(port, { nom: `PILOTE${i}`, code: '1234', email: `p${i}@e.fr` });
    assert.equal(r.status, 201, `le pilote ${i} n’a pas pu s’inscrire`);
  }
});
