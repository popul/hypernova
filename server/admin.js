// L'ADMINISTRATION DU PANTHÉON.
//
// « Reset le tableau des scores » est la demande d'origine, et c'est une bonne
// porte d'entrée : elle oblige à décider comment on protège une route qui, d'un
// clic, efface le travail de tout le monde.
//
// LE SECRET, ET RIEN D'AUTRE. Pas de compte administrateur, pas de deuxième
// table, pas de rôle sur les pilotes : une variable d'environnement, comparée à
// temps constant. C'est la seule forme d'authentification qui ne demande rien à
// personne et dont on peut vérifier la solidité en la lisant.
//
// ET SANS SECRET, RIEN N'EXISTE. Si ADMIN_TOKEN n'est pas posé, ces routes
// répondent 404 comme n'importe quelle adresse inventée — pas 401, pas « non
// configuré ». Une installation neuve n'expose donc pas une porte ouverte en
// attendant qu'on pense à la fermer, et ne signale même pas qu'il y a une porte.
//
// CE QU'ON PEUT FAIRE, ET POURQUOI CHAQUE CHOSE EST LÀ.
//
//   — vider un tableau : la demande d'origine, par mode ou en entier ;
//   — supprimer UNE partie : un score absurde se retire sans punir les autres ;
//   — reposer le code d'un pilote : le seul blocage réel du jeu, quatre chiffres
//     oubliés rendant un pseudo et tous ses scores inaccessibles à jamais ;
//   — fermer les sessions d'un pilote : un appareil prêté, perdu, revendu ;
//   — supprimer un pilote : un pseudo malheureux, un doublon ;
//   — purger les enregistrements : ceux d'anciennes règles ne se rejouent plus
//     et occupent la place de ceux qui se rejoueraient ;
//   — sauvegarder : à faire AVANT tout le reste, et c'est pour ça que la page
//     le propose en premier.

import { timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECRET = process.env.ADMIN_TOKEN || '';

// Le pod tourne avec une racine en lecture seule et un /tmp de seize mégaoctets.
// Une base plus grosse que ça ne peut pas être copiée là ; on préfère le dire
// que produire un fichier tronqué qui aurait l'air d'une sauvegarde.
const SAUVEGARDE_MAX = 12 * 1024 * 1024;

export const administrable = SECRET.length > 0;

// Comparaison à temps constant, et sur des empreintes de même longueur : comparer
// directement deux chaînes de tailles différentes trahirait la longueur du secret
// avant même d'en trahir le contenu.
function secretJuste(fourni) {
  if (!administrable || !fourni) return false;
  const a = Buffer.from(String(fourni));
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) {
    // On compare quand même, contre un tampon de la bonne taille : sortir tout de
    // suite rendrait la longueur mesurable au chronomètre.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

// `aide` porte ce que le serveur principal sait déjà faire — répondre, lire un
// corps, nettoyer un pseudo — pour ne pas en avoir deux versions.
export async function routeAdmin(req, res, chemin, base, aide) {
  const { repond, lisCorps, nomPropre, codePropre, jetonDe } = aide;

  // Sans secret configuré, ces adresses n'existent pas.
  if (!administrable) return false;
  if (!chemin.startsWith('/admin')) return false;

  if (!secretJuste(jetonDe(req))) {
    repond(res, 401, { erreur: 'secret' });
    return true;
  }

  const reste = chemin.slice('/admin'.length) || '/';

  // GET /admin/etat — de quoi décider avant d'effacer quoi que ce soit.
  if (req.method === 'GET' && (reste === '/' || reste === '/etat')) {
    repond(res, 200, base.etat());
    return true;
  }

  // GET /admin/pilotes — la liste complète, adresse comprise.
  // GET /admin/journal — le journal de bord, éventuellement filtré par type.
  // C'est l'écran qu'on ouvre quand quelqu'un dit « ça a déraillé ».
  if (req.method === 'GET' && reste === '/journal') {
    const url = new URL(req.url, 'http://x');
    return repond(res, 200, {
      resume: base.resumeJournal(),
      evenements: base.journal({
        type: url.searchParams.get('type'),
        limite: url.searchParams.get('limite'),
      }),
    });
  }

  if (req.method === 'GET' && reste === '/pilotes') {
    repond(res, 200, { pilotes: base.pilotesAdmin() });
    return true;
  }

  // GET /admin/sauvegarde — un instantané cohérent de la base, à télécharger.
  if (req.method === 'GET' && reste === '/sauvegarde') {
    const vers = join(tmpdir(), `hypernova-${randomBytes(6).toString('hex')}.db`);
    try {
      base.sauvegarde(vers);
      const { size } = statSync(vers);
      if (size > SAUVEGARDE_MAX) {
        repond(res, 507, { erreur: 'trop-grosse', octets: size, max: SAUVEGARDE_MAX });
        return true;
      }
      const corps = readFileSync(vers);
      const jour = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        'content-type': 'application/vnd.sqlite3',
        'content-length': corps.length,
        'content-disposition': `attachment; filename="hypernova-${jour}.db"`,
        'cache-control': 'no-store',
      });
      res.end(corps);
    } finally {
      // Le fichier part avec la réponse ; le laisser traîner remplirait le /tmp
      // du pod au bout de quelques sauvegardes.
      try {
        unlinkSync(vers);
      } catch {
        // Déjà parti, ou jamais écrit : il n'y a rien à réparer ici.
      }
    }
    return true;
  }

  // POST /admin/vide-classement — la demande d'origine.
  if (req.method === 'POST' && reste === '/vide-classement') {
    const corps = await lisCorps(req);
    const mode = corps.mode === 'arcade' || corps.mode === 'survie' ? corps.mode : 'tout';
    const parties = base.videClassement(mode);
    repond(res, 200, { ok: true, mode, parties });
    return true;
  }

  // POST /admin/purge-replays — libère la place sans toucher aux scores.
  if (req.method === 'POST' && reste === '/purge-replays') {
    const corps = await lisCorps(req);
    const v = Number(corps.versionMax);
    const versionMax = Number.isInteger(v) && v >= 0 && v <= 999 ? v : null;
    repond(res, 200, { ok: true, versionMax, replays: base.purgeReplays(versionMax) });
    return true;
  }

  // DELETE /admin/parties/:id — un score de trop.
  if (req.method === 'DELETE' && reste.startsWith('/parties/')) {
    const n = base.supprimePartie(reste.slice('/parties/'.length));
    repond(res, n ? 200 : 404, n ? { ok: true, parties: n } : { erreur: 'inconnue' });
    return true;
  }

  // DELETE /admin/pilotes/:nom — le pilote et tout ce qui est à lui.
  if (req.method === 'DELETE' && reste.startsWith('/pilotes/')) {
    const nom = nomPropre(decodeURIComponent(reste.slice('/pilotes/'.length)));
    const r = base.supprimePilote(nom);
    repond(res, r.pilote ? 200 : 404, r.pilote ? { ok: true, ...r } : { erreur: 'inconnu' });
    return true;
  }

  // POST /admin/pilotes/:nom/code — le code oublié.
  // POST /admin/pilotes/:nom/sessions — fermer les appareils connectés.
  if (req.method === 'POST' && reste.startsWith('/pilotes/')) {
    const bout = reste.slice('/pilotes/'.length);
    const coupe = bout.lastIndexOf('/');
    const nom = nomPropre(decodeURIComponent(bout.slice(0, coupe)));
    const action = bout.slice(coupe + 1);

    if (action === 'code') {
      const corps = await lisCorps(req);
      const code = codePropre(corps.code);
      if (!code) {
        repond(res, 400, { erreur: 'code-format' });
        return true;
      }
      const r = base.reposeCode(nom, code);
      repond(res, r ? 200 : 404, r ? { ok: true, nom, ...r } : { erreur: 'inconnu' });
      return true;
    }
    if (action === 'sessions') {
      repond(res, 200, { ok: true, nom, sessions: base.fermeSessions(nom) });
      return true;
    }
  }

  repond(res, 404, { erreur: 'route' });
  return true;
}
