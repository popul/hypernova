// L'API du panthéon partagé.
//
// Elle vit sous /api, derrière le même nom de domaine que le jeu : pas de CORS à
// desserrer, pas de second certificat, pas de second déploiement à surveiller.
// Node nu, sans cadre applicatif — il y a neuf routes, et un routeur générique
// coûterait plus de lignes à auditer que les neuf réunies.
//
// Ce que le serveur refuse est aussi important que ce qu'il accepte : une requête
// trop grosse, un champ d'un mauvais type, un score invraisemblable, un client
// trop bavard. Le tableau est public et personne ne le surveille.
//
// L'administration vit à part, dans admin.js, derrière son propre secret. Elle
// est branchée ici en une ligne et le reste du fichier ne sait rien d'elle : ce
// qui peut effacer le panthéon de tout le monde ne doit pas se lire au milieu de
// ce qui le remplit.

import { createServer } from 'node:http';
import { Base } from './base.js';
import { routeAdmin, administrable } from './admin.js';

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

// Copie des identifiants de src/game/ships.js. Le serveur ne peut pas importer ce
// module — il tire Three.js avec lui, et on ne charge pas un moteur de rendu dans
// une API. Deux listes de mots à tenir à jour à la main est le prix de l'absence de
// dépendance ; si la flotte s'agrandit, c'est ici qu'il faut repasser.
const LIVREES = ['flotte', 'braise', 'menthe', 'orage', 'or', 'sang'];
const CARENES = ['dague', 'faucon', 'enclume'];

// Une valeur inconnue est ignorée, jamais refusée : le client peut être plus vieux
// ou plus neuf que le serveur, et lui rendre une erreur pour une teinte lui ferait
// perdre le reste de sa requête. Le filtre sert surtout à l'autre bout — ces deux
// chaînes ressortent sur une route publique, et rien d'arbitraire ne doit y entrer.
function livreePropre(v) {
  return LIVREES.includes(v) ? v : null;
}

function carenePropre(v) {
  return CARENES.includes(v) ? v : null;
}

// Le client reconstruit un vaisseau à partir de cette paire : il lui faut deux
// identifiants valides, jamais un champ absent. Un pilote d'avant la boutique n'a
// rien en base — il vole en livrée de flotte, sur une dague, comme dans le jeu.
function apparenceDe(p) {
  return { livree: p?.livree || LIVREES[0], carene: p?.carene || CARENES[0] };
}

function entier(v, max) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.floor(n) : null;
}

function jetonDe(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

// Ce que l'administration emprunte au serveur public : répondre, lire un corps,
// nettoyer un pseudo, valider un code. Les mêmes fonctions, pas des jumelles —
// un pseudo normalisé différemment de deux côtés donnerait un pilote qu'on ne
// pourrait plus ni retrouver ni supprimer.
const aideAdmin = { repond, lisCorps, nomPropre, codePropre, jetonDe };

// --- Routes -----------------------------------------------------------------

async function route(req, res, chemin) {
  // L'administration d'abord, et à part : elle a son propre secret, ses propres
  // règles, et le serveur public ne doit rien savoir d'elle au-delà de cet appel.
  // Elle rend `true` quand elle a répondu — y compris pour un 401 ou un 404.
  if (await routeAdmin(req, res, chemin, base, aideAdmin)) return;

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

    const apparence = { livree: livreePropre(corps.livree), carene: carenePropre(corps.carene) };
    const r = base.reclame(nom, code, apparence, email);
    if (!r.ok) return repond(res, 403, { erreur: r.erreur });
    // L'apparence part avec le jeton : c'est la seule occasion où le client apprend
    // à quoi ressemble son vaisseau sans avoir encore de quoi appeler /moi. Sur un
    // appareil qu'il n'a jamais utilisé, il n'a rien d'autre pour le redessiner.
    return repond(res, connu ? 200 : 201, {
      nom,
      jeton: r.jeton,
      nouveau: r.nouveau,
      ...apparenceDe(r),
    });
  }

  // GET /pilotes — qui vole en ce moment, pour l'écran « Qui pilote ? ».
  //
  // Public et sans jeton, parce que cet écran s'affiche AVANT qu'on sache qui est
  // devant la machine : sur la tablette partagée d'une fratrie, c'est lui qui sert à
  // choisir. Donc rien de personnel n'en sort — voir base.pilotes(), qui nomme ses
  // colonnes une par une pour que ça reste vrai après la prochaine migration.
  if (req.method === 'GET' && chemin === '/pilotes') {
    const url = new URL(req.url, 'http://x');
    // Le paramètre absent est écarté AVANT entier() : Number(null) vaut zéro, et un
    // zéro traverse ses garde-fous sans rien déclencher. Sans ce test, une requête
    // sans `limite` demanderait zéro pilote et l'écran n'afficherait qu'un nom.
    const brut = url.searchParams.get('limite');
    const limite = brut === null ? 24 : (entier(brut, 60) ?? 24);
    const pilotes = base.pilotes(limite).map((p) => ({
      nom: p.nom,
      ...apparenceDe(p),
      parties: p.parties,
      meilleur: p.meilleur,
    }));
    return repond(res, 200, { pilotes });
  }

  // GET /moi — la fiche du porteur du jeton : de quoi redessiner son vaisseau, et
  // ses records pour le « Record » du HUD.
  //
  // Les records viennent d'ici et non plus du navigateur : c'est tout l'objet du
  // déplacement. Un enfant qui rejoue sur la tablette de son frère doit y retrouver
  // son propre record, et non celui que le localStorage de l'appareil aurait gardé.
  //
  // L'adresse électronique, elle, reste en base même pour son propriétaire : un
  // jeton se perd avec un téléphone, et il ne doit alors rien apprendre de plus que
  // ce qui est déjà affiché au tableau.
  if (req.method === 'GET' && chemin === '/moi') {
    const pilote = base.parJeton(jetonDe(req));
    if (!pilote) return repond(res, 401, { erreur: 'jeton' });
    return repond(res, 200, {
      nom: pilote.nom,
      ...apparenceDe(pilote),
      ...base.records(pilote.nom),
    });
  }

  // PATCH /moi — repeindre son vaisseau. PATCH et non PUT : le client envoie ce
  // qu'il vient de changer, pas la fiche entière, et deux réglages modifiés depuis
  // deux écrans différents ne s'effacent pas l'un l'autre.
  if (req.method === 'PATCH' && chemin === '/moi') {
    const pilote = base.parJeton(jetonDe(req));
    if (!pilote) return repond(res, 401, { erreur: 'jeton' });
    const corps = await lisCorps(req);
    const fiche = base.majApparence(pilote.nom, {
      livree: livreePropre(corps.livree),
      carene: carenePropre(corps.carene),
    });
    return repond(res, 200, { ok: true, nom: pilote.nom, ...apparenceDe(fiche) });
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
    // `Number(null)` vaut zéro, pas NaN : sans ce test, un paramètre absent
    // demandait zéro ligne — ramenée à une par le plancher. Le défaut annoncé de
    // vingt n'a jamais servi, et un client qui oubliait `limite` recevait un
    // classement d'une seule ligne sans que rien ne le signale.
    const brut = url.searchParams.get('limite');
    const limite = (brut === null ? null : entier(brut, 100)) ?? 20;
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
  console.log(
    administrable
      ? '[api] administration ouverte sous /admin (ADMIN_TOKEN posé)'
      : '[api] administration fermée — poser ADMIN_TOKEN pour /admin'
  );
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log('[api] arrêt');
    serveur.close(() => process.exit(0));
  });
}
