// L'API du panthéon partagé.
//
// Elle vit sous /api, derrière le même nom de domaine que le jeu : pas de CORS à
// desserrer, pas de second certificat, pas de second déploiement à surveiller.
// Node nu, sans cadre applicatif — il y a six routes, et un routeur générique
// coûterait plus de lignes à auditer que les six réunies.
//
// Ce que le serveur refuse est aussi important que ce qu'il accepte : une requête
// trop grosse, un champ d'un mauvais type, un score invraisemblable, un client
// trop bavard. Le tableau est public et personne ne le surveille.

import { createServer } from 'node:http';
import { Base } from './base.js';

const PORT = Number(process.env.PORT || 8081);
const CHEMIN_BASE = process.env.DB_PATH || '/data/hypernova.db';

// Un replay de partie longue pèse une dizaine de kilo-octets ; les instantanés de
// vague, un peu plus. Deux cent cinquante kilo-octets laissent une marge large et
// ferment la porte à qui voudrait remplir le disque.
const TAILLE_MAX = 256 * 1024;

// Garde-fous de vraisemblance. Ils n'empêchent pas la triche — seul un rejeu
// vérifié le ferait — mais ils écartent le score absurde tapé à la main, qui est
// ce qui décourage vraiment les autres joueurs.
const SCORE_MAX = 10_000_000;
const VAGUE_MAX = 999;

const base = new Base(CHEMIN_BASE);

// --- Limitation de débit ----------------------------------------------------
// En mémoire : le service tourne en un seul exemplaire, et une limite approximative
// qui s'oublie au redémarrage vaut mieux qu'une dépendance à Redis pour ça.
const seau = new Map();
const LIMITE = 90; // requêtes par minute et par adresse
function tropBavard(ip) {
  const minute = Math.floor(Date.now() / 60000);
  const cle = `${ip}:${minute}`;
  const n = (seau.get(cle) || 0) + 1;
  seau.set(cle, n);
  if (seau.size > 5000) for (const k of seau.keys()) if (!k.endsWith(`:${minute}`)) seau.delete(k);
  return n > LIMITE;
}

// --- Utilitaires ------------------------------------------------------------

function repond(res, code, corps) {
  const texte = JSON.stringify(corps);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(texte);
}

function lisCorps(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const morceaux = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > TAILLE_MAX) {
        // On met la lecture en pause au lieu de couper la connexion : couper
        // empêche la réponse de partir, et le client ne voit alors qu'une erreur
        // réseau au lieu d'apprendre que son envoi était trop gros.
        req.pause();
        reject(new Error('trop-gros'));
        return;
      }
      morceaux.push(c);
    });
    req.on('end', () => {
      if (!morceaux.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(morceaux).toString('utf8')));
      } catch {
        reject(new Error('json'));
      }
    });
    req.on('error', reject);
  });
}

// Le pseudo est normalisé exactement comme dans le jeu : sans quoi « Louis » et
// « LOUIS » seraient deux pilotes, et le second n'aurait pas le code du premier.
function nomPropre(brut) {
  return String(brut || '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ\-. ]/g, '')
    .trim()
    .slice(0, 10);
}

function codePropre(brut) {
  return /^\d{4}$/.test(String(brut || '')) ? String(brut) : null;
}

// Validation volontairement pauvre : on vérifie la forme, pas l'existence. Vérifier
// vraiment demanderait d'envoyer un message et d'attendre un clic — donc un serveur
// de courrier, que ce homelab n'a pas.
function emailPropre(brut) {
  const e = String(brut || '')
    .trim()
    .slice(0, 120);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

function entier(v, max) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.floor(n) : null;
}

function jetonDe(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

// --- Routes -----------------------------------------------------------------

async function route(req, res, chemin) {
  // POST /pilotes — réclamer un pseudo, ou revenir dessus avec son code.
  if (req.method === 'POST' && chemin === '/pilotes') {
    const corps = await lisCorps(req);
    const nom = nomPropre(corps.nom);
    const code = codePropre(corps.code);
    const email = emailPropre(corps.email);
    if (!nom) return repond(res, 400, { erreur: 'nom' });
    if (!code) return repond(res, 400, { erreur: 'code-format' });

    const connu = base.pilote(nom);
    // À la création seulement : sans adresse, un code oublié rendrait le pseudo
    // définitivement inaccessible — et sur ce tableau, un pseudo perdu est un
    // enfant qui ne peut plus publier ses scores.
    if (!connu && !email) return repond(res, 400, { erreur: 'email-requis' });

    const r = base.reclame(nom, code, { livree: corps.livree, carene: corps.carene }, email);
    if (!r.ok) return repond(res, 403, { erreur: r.erreur });
    return repond(res, connu ? 200 : 201, { nom, jeton: r.jeton, nouveau: r.nouveau });
  }

  // POST /parties — publier une partie terminée.
  if (req.method === 'POST' && chemin === '/parties') {
    const pilote = base.parJeton(jetonDe(req));
    if (!pilote) return repond(res, 401, { erreur: 'jeton' });
    const corps = await lisCorps(req);
    const score = entier(corps.score, SCORE_MAX);
    const vague = entier(corps.vague, VAGUE_MAX);
    if (score === null || vague === null) return repond(res, 400, { erreur: 'partie' });
    // Le replay est stocké tel quel : c'est une chaîne opaque produite par le jeu,
    // que le serveur ne lit jamais. Il en vérifie la taille et le type, rien de plus.
    const flux = typeof corps.flux === 'string' && corps.flux.length < 200_000 ? corps.flux : null;
    const id = base.ajoutePartie(pilote.nom, {
      mode: corps.mode === 'survie' ? 'survie' : 'arcade',
      score,
      vague,
      duree: entier(corps.duree, 86400) ?? 0,
      jouee_le: typeof corps.jouee_le === 'string' ? corps.jouee_le.slice(0, 40) : undefined,
      version: entier(corps.version, 999) ?? 0,
      seed: entier(corps.seed, 2 ** 31) ?? 0,
      flux,
      etats: flux && Array.isArray(corps.etats) ? corps.etats : null,
      controles: flux && Array.isArray(corps.controles) ? corps.controles : null,
    });
    return repond(res, 201, { id });
  }

  // GET /classement — le tableau, sans rien de personnel.
  if (req.method === 'GET' && chemin === '/classement') {
    const url = new URL(req.url, 'http://x');
    const limite = entier(url.searchParams.get('limite'), 100) ?? 20;
    const mode = url.searchParams.get('mode') === 'survie' ? 'survie' : 'arcade';
    return repond(res, 200, { mode, classement: base.classement(limite, mode) });
  }

  // GET /parties/:id — l'enregistrement complet d'une partie.
  if (req.method === 'GET' && chemin.startsWith('/parties/')) {
    const p = base.partie(chemin.slice('/parties/'.length));
    if (!p) return repond(res, 404, { erreur: 'inconnue' });
    return repond(res, 200, { partie: p });
  }

  if (req.method === 'GET' && (chemin === '/sante' || chemin === '/')) {
    return repond(res, 200, { ok: true, ...base.chiffres() });
  }

  return repond(res, 404, { erreur: 'route' });
}

const serveur = createServer(async (req, res) => {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '?';
  if (tropBavard(ip)) return repond(res, 429, { erreur: 'trop-de-requetes' });

  // Le préfixe /api peut être retiré par le routeur d'entrée ou non, selon la
  // façon dont on branche la route. On accepte les deux plutôt que de dépendre
  // d'un réglage d'infrastructure qui se change ailleurs que dans ce fichier.
  let chemin = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/';
  if (chemin.startsWith('/api')) chemin = chemin.slice(4) || '/';

  try {
    await route(req, res, chemin);
  } catch (e) {
    const m = String(e?.message || e);
    if (m === 'trop-gros') {
      res.setHeader('connection', 'close');
      return repond(res, 413, { erreur: 'trop-gros' });
    }
    if (m === 'json') return repond(res, 400, { erreur: 'json' });
    console.error('[api]', m);
    if (!res.headersSent) repond(res, 500, { erreur: 'interne' });
  }
});

serveur.listen(PORT, () => {
  const c = base.chiffres();
  console.log(`[api] écoute sur ${PORT} — ${c.pilotes} pilotes, ${c.parties} parties`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log('[api] arrêt');
    serveur.close(() => process.exit(0));
  });
}
