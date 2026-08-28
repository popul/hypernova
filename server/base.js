// Le panthéon partagé, sur disque.
//
// SQLite plutôt qu'une base séparée : quelques milliers de lignes, un seul
// processus qui écrit, et une sauvegarde qui tient dans une copie de fichier. Une
// instance Postgres pour ça créerait une dépendance entre deux applications sans
// rapport — le jour où elle tombe, le jeu perdrait son tableau.
//
// Aucune dépendance npm : `node:sqlite` fait partie de Node. Une image de
// quarante mégaoctets, rien à auditer, rien à mettre à jour en urgence.

import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Combien de parties on garde par pilote, et combien portent leur enregistrement.
// Un score pèse cent octets, le replay qui va avec en pèse quelques milliers :
// les deux ne se conservent pas au même rythme.
const MAX_PARTIES_PAR_PILOTE = 100;
const MAX_REPLAYS_PAR_PILOTE = 12;
// Combien d'appareils un même pilote peut garder connectés en même temps. Une
// famille en a deux ou trois ; huit laissent de la marge sans laisser traîner des
// jetons oubliés pendant des mois.
const MAX_SESSIONS = 8;

// LES QUATRE TABLEAUX.
//
// Le jeu à deux a son propre classement, et c'est la seule réponse honnête :
// comparer un score fait à deux à un score fait seul n'a pas de sens — la
// difficulté monte, mais on est deux à tirer et l'un couvre l'autre.
//
// On l'écrit comme un MODE plutôt que comme une colonne à part. Toute la
// mécanique existante — les index, l'élagage par mode qui empêche un marathon
// de chasser les enregistrements d'arcade — s'applique alors sans une ligne de
// plus. Un suffixe, et le duo hérite de tout.
const MODES = ['arcade', 'survie', 'arcade2', 'survie2'];

export function modePropre(v) {
  return MODES.includes(v) ? v : 'arcade';
}

export class Base {
  constructor(chemin) {
    mkdirSync(dirname(chemin), { recursive: true });
    this.db = new DatabaseSync(chemin);
    // WAL : les lectures ne bloquent plus l'écriture. Sur un tableau que dix
    // enfants consultent pendant qu'un onzième publie, ça compte.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA busy_timeout = 4000');
    this._schema();
  }

  _schema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pilotes (
        nom        TEXT PRIMARY KEY,
        sel        TEXT NOT NULL,
        code_hash  TEXT NOT NULL,
        jeton_hash TEXT,
        -- L'adresse sert à retrouver un code oublié, et à rien d'autre. Elle ne
        -- sort JAMAIS dans le classement : un tableau des scores consultable par
        -- tout le monde n'a aucune raison de publier les adresses d'enfants.
        email      TEXT,
        livree     TEXT,
        carene     TEXT,
        cree_le    TEXT NOT NULL,
        vu_le      TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS parties (
        id        TEXT PRIMARY KEY,
        pilote    TEXT NOT NULL REFERENCES pilotes(nom) ON DELETE CASCADE,
        -- Chaque mode a son tableau : comparer un score d'arcade à une vague de
        -- survie n'aurait aucun sens, ce ne sont pas les mêmes parties.
        mode      TEXT NOT NULL DEFAULT 'arcade',
        score     INTEGER NOT NULL,
        vague     INTEGER NOT NULL,
        duree     INTEGER NOT NULL DEFAULT 0,
        jouee_le  TEXT NOT NULL,
        version   INTEGER NOT NULL DEFAULT 0,
        seed      INTEGER NOT NULL DEFAULT 0,
        flux      TEXT,
        etats     TEXT,
        controles TEXT
      );
      -- UNE SESSION PAR APPAREIL. Le jeton vivait dans la ligne du pilote : s'y
      -- connecter depuis la tablette révoquait le téléphone, et l'enfant se
      -- retrouvait déconnecté sans comprendre pourquoi. Une famille joue sur
      -- plusieurs écrans — c'est même tout l'intérêt d'un panthéon commun.
      CREATE TABLE IF NOT EXISTS sessions (
        jeton_hash TEXT PRIMARY KEY,
        pilote     TEXT NOT NULL REFERENCES pilotes(nom) ON DELETE CASCADE,
        cree_le    TEXT NOT NULL
      );
      -- LES AMIS. Une seule ligne par lien, jamais deux.
      --
      -- Le réflexe serait d'écrire une ligne « A suit B » et une « B suit A »,
      -- et de les tenir synchronisées. C'est deux fois plus de lignes et une
      -- occasion permanente d'en avoir une sans l'autre — auquel cas l'un des
      -- deux voit son ami en ligne et l'autre non, sans que rien ne le signale.
      --
      -- On stocke donc UNE ligne, avec les deux pseudos rangés dans l'ordre
      -- alphabétique. La clé primaire interdit alors le doublon par
      -- construction, et « sommes-nous amis ? » est une seule lecture.
      CREATE TABLE IF NOT EXISTS amis (
        a       TEXT NOT NULL REFERENCES pilotes(nom) ON DELETE CASCADE,
        b       TEXT NOT NULL REFERENCES pilotes(nom) ON DELETE CASCADE,
        depuis  TEXT NOT NULL,
        PRIMARY KEY (a, b),
        CHECK (a < b)
      );
      -- Les demandes en attente. Elles ont un sens, elles : « de » a demandé à
      -- « vers », et c'est « vers » qui répond.
      CREATE TABLE IF NOT EXISTS demandes (
        de      TEXT NOT NULL REFERENCES pilotes(nom) ON DELETE CASCADE,
        vers    TEXT NOT NULL REFERENCES pilotes(nom) ON DELETE CASCADE,
        faite_le TEXT NOT NULL,
        PRIMARY KEY (de, vers)
      );
      -- LE LIEN D'INVITATION. Un code court, propre à un pilote, qu'on colle dans
      -- un message. Il vaut mieux qu'un pseudo à retaper : « JEANNE » se tape de
      -- travers, un lien se touche.
      --
      -- Il est RÉUTILISABLE et sans échéance, à dessein : on le partage dans le
      -- groupe de la classe, et chacun le touche quand il veut. C'est un choix,
      -- pas un oubli — quiconque a le lien devient ami. En échange il se
      -- régénère d'un geste, ce qui invalide l'ancien.
      -- LE JOURNAL DE BORD. Ce que les parties racontent quand elles déraillent.
      --
      -- Un défaut de synchronisation ne laisse aucune trace : les deux machines
      -- continuent de tourner, chacune persuadée d'avoir raison. Sans cette
      -- table, tout ce qu'on peut en dire est « ça a déraillé » — ce qui est vrai
      -- et intenable à corriger.
      --
      -- Elle ne garde RIEN de personnel : un pseudo, une version, la forme de
      -- l'écran. Ce qu'on cherche, ce sont des défauts, pas des joueurs.
      CREATE TABLE IF NOT EXISTS journal (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        quand   TEXT NOT NULL,
        type    TEXT NOT NULL,
        pilote  TEXT,
        version TEXT,
        ecran   TEXT,
        detail  TEXT
      );
      CREATE INDEX IF NOT EXISTS journal_quand ON journal(quand DESC);
      CREATE INDEX IF NOT EXISTS journal_type ON journal(type, quand DESC);

      CREATE TABLE IF NOT EXISTS invitations (
        code    TEXT PRIMARY KEY,
        pilote  TEXT NOT NULL UNIQUE REFERENCES pilotes(nom) ON DELETE CASCADE,
        cree_le TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS amis_b ON amis(b);
      CREATE INDEX IF NOT EXISTS demandes_vers ON demandes(vers);
      CREATE INDEX IF NOT EXISTS sessions_pilote ON sessions(pilote);
      CREATE INDEX IF NOT EXISTS parties_score  ON parties(mode, score DESC, vague DESC);
      CREATE INDEX IF NOT EXISTS parties_vague  ON parties(mode, vague DESC, score DESC);
      CREATE INDEX IF NOT EXISTS parties_pilote ON parties(pilote, mode, score DESC);
    `);
  }

  // --- Pilotes ---------------------------------------------------------------

  // scrypt et non un simple sha : un code à quatre chiffres n'a que dix mille
  // valeurs, une fonction rapide les épuiserait en une seconde. Le sel empêche de
  // traiter tous les pilotes d'un coup.
  _hacheCode(code, sel) {
    return scryptSync(String(code), sel, 32).toString('hex');
  }

  _hacheJeton(jeton) {
    return createHash('sha256').update(jeton).digest('hex');
  }

  pilote(nom) {
    return this.db.prepare('SELECT * FROM pilotes WHERE nom = ?').get(nom) || null;
  }

  // Réclame un pseudo. S'il est libre, il devient celui du demandeur ; s'il est
  // pris, il faut le code. Renvoie { ok, jeton } ou { ok: false, erreur }.
  reclame(nom, code, apparence = {}, email = null) {
    const existant = this.pilote(nom);
    const jeton = randomBytes(24).toString('base64url');
    const maintenant = new Date().toISOString();

    if (!existant) {
      const sel = randomBytes(16).toString('hex');
      this.db
        .prepare(
          `INSERT INTO pilotes (nom, sel, code_hash, jeton_hash, email, livree, carene, cree_le, vu_le)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          nom,
          sel,
          this._hacheCode(code, sel),
          this._hacheJeton(jeton),
          email,
          apparence.livree || null,
          apparence.carene || null,
          maintenant,
          maintenant
        );
      this._ouvreSession(nom, jeton, maintenant);
      return {
        ok: true,
        jeton,
        nouveau: true,
        livree: apparence.livree || null,
        carene: apparence.carene || null,
      };
    }

    // Comparaison à temps constant : sans elle, le temps de réponse trahirait le
    // nombre de caractères justes.
    const attendu = Buffer.from(existant.code_hash, 'hex');
    const fourni = Buffer.from(this._hacheCode(code, existant.sel), 'hex');
    if (attendu.length !== fourni.length || !timingSafeEqual(attendu, fourni)) {
      return { ok: false, erreur: 'code' };
    }
    this.db
      .prepare(`UPDATE pilotes SET vu_le = ?, email = COALESCE(email, ?) WHERE nom = ?`)
      .run(maintenant, email, nom);
    this._ouvreSession(nom, jeton, maintenant);
    // La reconnexion ne touche pas à l'apparence, et la renvoie : c'est le serveur
    // qui détient le vaisseau, pas l'appareil. Un téléphone neuf qui arrive avec sa
    // fiche vide effacerait sinon la livrée choisie sur la tablette du salon.
    return { ok: true, jeton, nouveau: false, livree: existant.livree, carene: existant.carene };
  }

  // Change la livrée et/ou la carène. Les deux champs sont facultatifs, d'où le
  // COALESCE : il laisse en place ce que l'appelant n'a pas fourni sans qu'on ait à
  // relire la ligne d'abord, donc sans qu'une écriture concurrente puisse se glisser
  // entre la lecture et l'écriture. Renvoie la fiche telle qu'elle est désormais.
  majApparence(nom, apparence = {}) {
    this.db
      .prepare(
        'UPDATE pilotes SET livree = COALESCE(?, livree), carene = COALESCE(?, carene) WHERE nom = ?'
      )
      .run(apparence.livree ?? null, apparence.carene ?? null, nom);
    return (
      this.db.prepare('SELECT nom, livree, carene FROM pilotes WHERE nom = ?').get(nom) || null
    );
  }

  // Qui vole en ce moment, du plus récemment vu au plus ancien : l'écran « Qui
  // pilote ? » sert à se reconnaître, et on se reconnaît en haut de la liste.
  //
  // Les colonnes sont énumérées une par une, et surtout pas SELECT * comme dans
  // pilote() : cette table porte un sel, une empreinte de code et une adresse
  // électronique. Avec une étoile ici, la prochaine colonne ajoutée au schéma
  // partirait sans bruit sur une route que tout le monde peut appeler.
  pilotes(limite = 24) {
    return this.db
      .prepare(
        `SELECT p.nom, p.livree, p.carene,
                (SELECT COUNT(*) FROM parties WHERE pilote = p.nom) AS parties,
                (SELECT COALESCE(MAX(score), 0) FROM parties
                   WHERE pilote = p.nom AND mode = 'arcade') AS meilleur
         FROM pilotes p ORDER BY p.vu_le DESC LIMIT ?`
      )
      .all(Math.max(1, Math.min(60, limite)));
  }

  // Les records personnels d'un pilote, pour le « Record » du HUD.
  //
  // Une requête par mode, et non quatre : le même relevé donne le meilleur score et
  // la meilleure vague en un seul balayage de l'index (pilote, mode, score). Les
  // deux maxima sont indépendants — on peut avoir marqué son record de points dans
  // une partie et poussé sa meilleure vague dans une autre, et c'est bien de la
  // meilleure vague ATTEINTE qu'il s'agit, pas de celle du meilleur score.
  //
  // COALESCE parce que MAX() sur zéro ligne rend NULL, et que le HUD affiche la
  // valeur telle quelle : un pilote qui n'a jamais joué doit y lire 0, pas « null ».
  records(nom) {
    const releve = this.db.prepare(
      `SELECT COALESCE(MAX(score), 0) AS score, COALESCE(MAX(vague), 0) AS vague
       FROM parties WHERE pilote = ? AND mode = ?`
    );
    const arcade = releve.get(nom, 'arcade');
    const survie = releve.get(nom, 'survie');
    return {
      meilleur: arcade.score,
      meilleureVague: arcade.vague,
      meilleurSurvie: survie.score,
      meilleureVagueSurvie: survie.vague,
    };
  }

  // Une session de plus pour ce pilote. On en garde un nombre borné, les plus
  // récentes : sans plafond, un appareil qui se reconnecte chaque jour laisserait
  // derrière lui une traînée de jetons valides pour toujours.
  _ouvreSession(nom, jeton, maintenant) {
    this.db
      .prepare('INSERT OR REPLACE INTO sessions (jeton_hash, pilote, cree_le) VALUES (?, ?, ?)')
      .run(this._hacheJeton(jeton), nom, maintenant);
    this.db
      .prepare(
        `DELETE FROM sessions WHERE pilote = ? AND jeton_hash NOT IN (
           SELECT jeton_hash FROM sessions WHERE pilote = ? ORDER BY cree_le DESC LIMIT ?
         )`
      )
      .run(nom, nom, MAX_SESSIONS);
  }

  // Le pilote derrière un jeton, ou null.
  parJeton(jeton) {
    if (!jeton) return null;
    const h = this._hacheJeton(jeton);
    const s = this.db.prepare('SELECT pilote FROM sessions WHERE jeton_hash = ?').get(h);
    if (s) return this.pilote(s.pilote);
    // Repli sur l'ancien emplacement : les jetons émis avant l'arrivée des
    // sessions vivaient dans la ligne du pilote. Sans ce repli, une mise à jour du
    // serveur déconnecterait tout le monde d'un coup.
    return this.db.prepare('SELECT * FROM pilotes WHERE jeton_hash = ?').get(h) || null;
  }

  // --- Amis --------------------------------------------------------------------
  //
  // Le lien est SYMÉTRIQUE et rangé : on trie les deux pseudos avant d'écrire ou
  // de lire, ce qui rend le doublon impossible et la question « sommes-nous
  // amis ? » réductible à une seule lecture.

  _paire(x, y) {
    return x < y ? [x, y] : [y, x];
  }

  amis(nom) {
    return this.db
      .prepare(
        `SELECT CASE WHEN a = ? THEN b ELSE a END AS nom, depuis
         FROM amis WHERE a = ? OR b = ? ORDER BY depuis DESC`
      )
      .all(nom, nom, nom);
  }

  sontAmis(x, y) {
    const [a, b] = this._paire(x, y);
    return !!this.db.prepare('SELECT 1 FROM amis WHERE a = ? AND b = ?').get(a, b);
  }

  // Demander en ami. Trois cas, et le troisième est celui qui compte : si l'autre
  // avait DÉJÀ demandé, la demande vaut acceptation. Sans ça, deux personnes qui
  // s'ajoutent en même temps se retrouvent avec deux demandes en attente et
  // personne d'ami.
  demande(de, vers) {
    if (de === vers) return { ok: false, erreur: 'soi-meme' };
    if (!this.pilote(vers)) return { ok: false, erreur: 'inconnu' };
    if (this.sontAmis(de, vers)) return { ok: true, deja: true };
    const inverse = this.db
      .prepare('SELECT 1 FROM demandes WHERE de = ? AND vers = ?')
      .get(vers, de);
    if (inverse) {
      this.accepte(de, vers);
      return { ok: true, accepte: true };
    }
    this.db
      .prepare('INSERT OR IGNORE INTO demandes (de, vers, faite_le) VALUES (?, ?, ?)')
      .run(de, vers, new Date().toISOString());
    return { ok: true, enAttente: true };
  }

  // `qui` accepte la demande de `de`.
  accepte(qui, de) {
    const enAttente = this.db
      .prepare('SELECT 1 FROM demandes WHERE de = ? AND vers = ?')
      .get(de, qui);
    if (!enAttente && !this.sontAmis(qui, de)) return { ok: false, erreur: 'aucune-demande' };
    const [a, b] = this._paire(qui, de);
    this.db
      .prepare('INSERT OR IGNORE INTO amis (a, b, depuis) VALUES (?, ?, ?)')
      .run(a, b, new Date().toISOString());
    // Les deux sens sont effacés : une demande croisée ne doit pas survivre au
    // lien qu'elle vient de créer.
    this.db
      .prepare('DELETE FROM demandes WHERE (de = ? AND vers = ?) OR (de = ? AND vers = ?)')
      .run(de, qui, qui, de);
    return { ok: true };
  }

  refuse(qui, de) {
    const n = this.db
      .prepare('DELETE FROM demandes WHERE de = ? AND vers = ?')
      .run(de, qui).changes;
    return { ok: true, refusees: Number(n) };
  }

  // Se défaire d'un ami efface aussi toute demande qui traînerait : sinon on
  // redeviendrait ami au prochain clic sans l'avoir demandé.
  oublie(qui, autre) {
    const [a, b] = this._paire(qui, autre);
    const n = this.db.prepare('DELETE FROM amis WHERE a = ? AND b = ?').run(a, b).changes;
    this.db
      .prepare('DELETE FROM demandes WHERE (de = ? AND vers = ?) OR (de = ? AND vers = ?)')
      .run(a, b, b, a);
    return { ok: true, oublies: Number(n) };
  }

  // Le code d'invitation d'un pilote, créé au premier appel. Huit caractères
  // tirés au sort : assez pour qu'on ne tombe pas dessus par hasard, assez court
  // pour tenir dans un message sans le couper.
  invitation(nom) {
    const connu = this.db.prepare('SELECT code FROM invitations WHERE pilote = ?').get(nom);
    if (connu) return connu.code;
    return this.regenereInvitation(nom);
  }

  regenereInvitation(nom) {
    const code = randomBytes(6).toString('base64url').slice(0, 8);
    this.db
      .prepare(
        `INSERT INTO invitations (code, pilote, cree_le) VALUES (?, ?, ?)
         ON CONFLICT(pilote) DO UPDATE SET code = excluded.code, cree_le = excluded.cree_le`
      )
      .run(code, nom, new Date().toISOString());
    return code;
  }

  parInvitation(code) {
    if (!code) return null;
    const r = this.db.prepare('SELECT pilote FROM invitations WHERE code = ?').get(String(code));
    return r ? r.pilote : null;
  }

  // Ouvrir le lien de quelqu'un, c'est devenir son ami TOUT DE SUITE. Il a
  // partagé ce lien pour ça ; lui demander de confirmer ensuite serait une étape
  // qui n'apprend rien à personne. Le lien EST le consentement.
  parLien(qui, code) {
    const autre = this.parInvitation(code);
    if (!autre) return { ok: false, erreur: 'lien-inconnu' };
    if (autre === qui) return { ok: false, erreur: 'soi-meme' };
    if (this.sontAmis(qui, autre)) return { ok: true, deja: true, nom: autre };
    const [a, b] = this._paire(qui, autre);
    this.db
      .prepare('INSERT OR IGNORE INTO amis (a, b, depuis) VALUES (?, ?, ?)')
      .run(a, b, new Date().toISOString());
    this.db
      .prepare('DELETE FROM demandes WHERE (de = ? AND vers = ?) OR (de = ? AND vers = ?)')
      .run(a, b, b, a);
    return { ok: true, nom: autre };
  }

  demandesRecues(nom) {
    return this.db
      .prepare('SELECT de AS nom, faite_le FROM demandes WHERE vers = ? ORDER BY faite_le DESC')
      .all(nom);
  }

  demandesEnvoyees(nom) {
    return this.db
      .prepare('SELECT vers AS nom, faite_le FROM demandes WHERE de = ? ORDER BY faite_le DESC')
      .all(nom);
  }

  // --- Parties ---------------------------------------------------------------

  ajoutePartie(pilote, p) {
    const id = `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
    this.db
      .prepare(
        `INSERT INTO parties (id, pilote, mode, score, vague, duree, jouee_le, version, seed, flux, etats, controles)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        pilote,
        modePropre(p.mode),
        p.score,
        p.vague,
        p.duree || 0,
        p.jouee_le || new Date().toISOString(),
        p.version || 0,
        p.seed || 0,
        p.flux || null,
        p.etats ? JSON.stringify(p.etats) : null,
        p.controles ? JSON.stringify(p.controles) : null
      );
    this._elague(pilote, modePropre(p.mode));
    return id;
  }

  // ---- LE JOURNAL DE BORD ---------------------------------------------------

  // Combien d'événements on garde. Au-delà, les plus vieux tombent : ce journal
  // sert à comprendre ce qui vient de se passer, pas à tenir des archives.
  static JOURNAL_MAX = 4000;

  ajouteAuJournal(evenements) {
    if (!Array.isArray(evenements) || !evenements.length) return 0;
    const ins = this.db.prepare(
      `INSERT INTO journal (quand, type, pilote, version, ecran, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    let n = 0;
    // Une transaction : cinquante insertions une par une coûteraient cinquante
    // synchronisations disque pour quelques centaines d'octets.
    this.db.exec('BEGIN');
    try {
      for (const e of evenements.slice(0, 40)) {
        const type = String(e?.type || '').slice(0, 32);
        if (!type) continue;
        ins.run(
          String(e.quand || new Date().toISOString()).slice(0, 32),
          type,
          e.pilote ? String(e.pilote).slice(0, 16) : null,
          e.version ? String(e.version).slice(0, 24) : null,
          e.ecran ? String(e.ecran).slice(0, 16) : null,
          // Borné à deux kilo-octets : une pile d'appels suffit largement, et un
          // client qui enverrait un mégaoctet ne doit pas remplir la base.
          e.detail ? JSON.stringify(e.detail).slice(0, 2048) : null
        );
        n++;
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this._elagueJournal();
    return n;
  }

  _elagueJournal() {
    this.db
      .prepare(
        `DELETE FROM journal WHERE id NOT IN (
           SELECT id FROM journal ORDER BY id DESC LIMIT ?
         )`
      )
      .run(Base.JOURNAL_MAX);
  }

  journal({ type = null, limite = 120 } = {}) {
    const n = Math.max(1, Math.min(500, Number(limite) || 120));
    const lignes = type
      ? this.db
          .prepare(
            `SELECT id, quand, type, pilote, version, ecran, detail FROM journal
             WHERE type = ? ORDER BY id DESC LIMIT ?`
          )
          .all(String(type).slice(0, 32), n)
      : this.db
          .prepare(
            `SELECT id, quand, type, pilote, version, ecran, detail FROM journal
             ORDER BY id DESC LIMIT ?`
          )
          .all(n);
    return lignes.map((l) => ({ ...l, detail: l.detail ? JSON.parse(l.detail) : null }));
  }

  // Ce que le journal dit en un coup d'œil : combien de quoi, sur les dernières
  // vingt-quatre heures. C'est cette ligne-là qu'on regarde en premier.
  resumeJournal() {
    const depuis = new Date(Date.now() - 24 * 3600_000).toISOString();
    return this.db
      .prepare(
        `SELECT type, COUNT(*) AS n FROM journal WHERE quand >= ?
         GROUP BY type ORDER BY n DESC`
      )
      .all(depuis);
  }

  // On ne supprime pas les scores, on relâche les enregistrements : une partie
  // reste au tableau même quand son replay a cédé la place.
  // L'élagage est par pilote ET par mode : un marathon de survie ne doit pas
  // chasser les enregistrements d'arcade, ce sont deux collections distinctes.
  //
  // ET IL GARDE CE QUE LE CLASSEMENT MONTRE. Il triait au score dans les deux
  // modes, alors que la survie se classe à la VAGUE — voir classement() juste en
  // dessous. Une course allée très loin en marquant peu était donc effacée alors
  // qu'elle était en tête du tableau : le meilleur run pouvait disparaître, et
  // son replay avec. On emprunte désormais le MÊME ordre que l'affichage, parce
  // que garder autre chose que ce qu'on montre n'a aucun sens.
  _elague(pilote, mode) {
    const ordre = this._ordre(mode);
    this.db
      .prepare(
        `UPDATE parties SET flux = NULL, etats = NULL, controles = NULL
         WHERE pilote = ? AND mode = ? AND flux IS NOT NULL AND id NOT IN (
           SELECT id FROM parties WHERE pilote = ? AND mode = ? AND flux IS NOT NULL
           ORDER BY ${ordre} LIMIT ?
         )`
      )
      .run(pilote, mode, pilote, mode, MAX_REPLAYS_PAR_PILOTE);
    this.db
      .prepare(
        `DELETE FROM parties WHERE pilote = ? AND mode = ? AND id NOT IN (
           SELECT id FROM parties WHERE pilote = ? AND mode = ? ORDER BY ${ordre} LIMIT ?
         )`
      )
      .run(pilote, mode, pilote, mode, MAX_PARTIES_PAR_PILOTE);
  }

  // L'arcade se classe au score : c'est une course au panache. La survie se classe
  // à la VAGUE atteinte, le score ne départageant qu'à égalité — parce que la
  // question qu'on s'y pose est « jusqu'où es-tu allé ? », pas « combien as-tu
  // marqué en chemin ? ».
  // La survie se classe à la vague atteinte, l'arcade au score — à deux comme en
  // solo, puisque c'est la QUESTION qui change, pas le nombre de pilotes. Cet
  // ordre sert à AFFICHER le tableau et à choisir ce qu'on GARDE : les deux
  // doivent répondre pareil, sinon on efface le haut du classement.
  _ordre(mode) {
    return modePropre(mode).startsWith('survie')
      ? 'vague DESC, score DESC'
      : 'score DESC, vague DESC';
  }

  classement(limite = 20, mode = 'arcade') {
    const m = modePropre(mode);
    const ordre = this._ordre(m);
    return this.db
      .prepare(
        // LA VERSION PART AVEC LA LIGNE. Sans elle, le client ne peut pas savoir
        // qu'un enregistrement a été fait sous d'autres règles : il propose un
        // bouton « revoir », le joueur clique, et rien ne se passe. Le serveur,
        // lui, ne sait pas quelle version le client sait lire — c'est donc au
        // client de comparer, et il lui faut le nombre.
        `SELECT id, pilote AS nom, mode, score, vague, duree, jouee_le, version,
                (flux IS NOT NULL) AS a_replay
         FROM parties WHERE mode = ? ORDER BY ${ordre} LIMIT ?`
      )
      .all(m, Math.max(1, Math.min(100, limite)));
  }

  partie(id) {
    const p = this.db.prepare('SELECT * FROM parties WHERE id = ?').get(id);
    if (!p) return null;
    return {
      id: p.id,
      nom: p.pilote,
      mode: p.mode,
      score: p.score,
      vague: p.vague,
      duree: p.duree,
      jouee_le: p.jouee_le,
      version: p.version,
      seed: p.seed,
      flux: p.flux,
      etats: p.etats ? JSON.parse(p.etats) : null,
      controles: p.controles ? JSON.parse(p.controles) : null,
    };
  }

  // --- Administration --------------------------------------------------------
  //
  // Tout ce qui suit n'est appelé que par une route protégée par un secret, et
  // rien de tout ça n'est réversible. Deux règles s'y appliquent partout :
  //
  //   — chaque méthode RENVOIE COMBIEN DE LIGNES elle a touchées, parce qu'une
  //     interface d'administration qui dit « fait » sans dire combien ne permet
  //     pas de vérifier qu'on a effacé ce qu'on croyait effacer ;
  //   — aucune ne supprime en cascade sans le dire. `supprimePilote` emporte les
  //     parties du pilote parce que la clé étrangère l'impose, et la méthode
  //     compte donc les parties AVANT de supprimer, pour pouvoir l'annoncer.

  // L'état de la base, tel qu'on veut le lire avant de décider quoi que ce soit.
  // La taille sur disque vient de SQLite lui-même et non d'un `stat` : le fichier
  // principal ne dit rien du journal WAL qui l'accompagne, et c'est justement
  // quand il gonfle qu'on regarde.
  etat() {
    const un = (sql, ...args) => this.db.prepare(sql).get(...args);
    const pages = un('PRAGMA page_count');
    const taille = un('PRAGMA page_size');
    return {
      ...this.chiffres(),
      sessions: un('SELECT COUNT(*) AS n FROM sessions').n,
      octets: (pages?.page_count || 0) * (taille?.page_size || 0),
      // Par mode : c'est la granularité à laquelle on vide un tableau.
      modes: this.db
        .prepare(
          `SELECT mode, COUNT(*) AS parties, COALESCE(MAX(score), 0) AS record,
                  MIN(jouee_le) AS depuis, MAX(jouee_le) AS jusqua
           FROM parties GROUP BY mode ORDER BY mode`
        )
        .all(),
      // Par version de règles. C'est le chiffre le moins évident et le plus utile :
      // un enregistrement produit sous d'anciennes règles ne se rejoue plus, et
      // occupe pourtant la place d'un qui se rejouerait.
      versions: this.db
        .prepare(
          `SELECT version, COUNT(*) AS parties,
                  SUM(flux IS NOT NULL) AS replays,
                  COALESCE(SUM(LENGTH(flux) + LENGTH(COALESCE(etats, '')) +
                               LENGTH(COALESCE(controles, ''))), 0) AS octets
           FROM parties GROUP BY version ORDER BY version DESC`
        )
        .all(),
    };
  }

  // La liste complète, adresse comprise — c'est la seule route qui la montre, et
  // c'est sa raison d'être : sans serveur de courrier, un code oublié se règle en
  // reconnaissant l'enfant à son adresse avant de lui en poser un nouveau.
  pilotesAdmin() {
    return this.db
      .prepare(
        `SELECT p.nom, p.email, p.livree, p.carene, p.cree_le, p.vu_le,
                (SELECT COUNT(*) FROM parties  WHERE pilote = p.nom) AS parties,
                (SELECT COUNT(*) FROM sessions WHERE pilote = p.nom) AS sessions,
                (SELECT COALESCE(MAX(score), 0) FROM parties WHERE pilote = p.nom) AS meilleur
         FROM pilotes p ORDER BY p.vu_le DESC`
      )
      .all();
  }

  // Vide un tableau. `mode` vaut 'arcade', 'survie', ou n'importe quoi d'autre
  // pour les deux — l'appelant a déjà validé, on ne redevine pas ici.
  videClassement(mode) {
    const req =
      mode === 'arcade' || mode === 'survie'
        ? this.db.prepare('DELETE FROM parties WHERE mode = ?').run(mode)
        : this.db.prepare('DELETE FROM parties').run();
    return Number(req.changes);
  }

  supprimePartie(id) {
    return Number(this.db.prepare('DELETE FROM parties WHERE id = ?').run(id).changes);
  }

  // Le pilote s'en va avec ses parties et ses sessions : c'est la cascade des
  // clés étrangères qui s'en charge, mais on compte d'abord pour pouvoir le dire.
  supprimePilote(nom) {
    const n = this.db.prepare('SELECT COUNT(*) AS n FROM parties WHERE pilote = ?').get(nom).n;
    const fait = this.db.prepare('DELETE FROM pilotes WHERE nom = ?').run(nom).changes;
    return { pilote: Number(fait), parties: fait ? n : 0 };
  }

  // LE CODE OUBLIÉ. C'est le seul cas où le jeu se bloque vraiment : quatre
  // chiffres perdus, et le pseudo avec tous ses scores devient inaccessible pour
  // toujours. Un nouveau code, un nouveau sel, et toutes les sessions fermées —
  // parce qu'on ne pose pas un code neuf en laissant ouvertes les portes qu'on
  // soupçonnait justement d'être de trop.
  reposeCode(nom, code) {
    if (!this.pilote(nom)) return null;
    const sel = randomBytes(16).toString('hex');
    this.db
      .prepare('UPDATE pilotes SET sel = ?, code_hash = ?, jeton_hash = NULL WHERE nom = ?')
      .run(sel, this._hacheCode(code, sel), nom);
    return { sessions: this.fermeSessions(nom) };
  }

  fermeSessions(nom) {
    const n = this.db.prepare('DELETE FROM sessions WHERE pilote = ?').run(nom).changes;
    // Le jeton d'avant les sessions vit dans la ligne du pilote : l'oublier ici
    // laisserait un appareil ancien connecté après qu'on a tout fermé.
    this.db.prepare('UPDATE pilotes SET jeton_hash = NULL WHERE nom = ?').run(nom);
    return Number(n);
  }

  // Relâche les enregistrements sans toucher aux scores : la partie reste au
  // tableau, on ne peut simplement plus la regarder. `versionMax` permet de ne
  // libérer que ce qui ne se rejoue plus — un flux enregistré sous des règles
  // périmées ne raconte plus la partie qu'il prétend raconter.
  purgeReplays(versionMax = null) {
    const sql = `UPDATE parties SET flux = NULL, etats = NULL, controles = NULL
                 WHERE flux IS NOT NULL`;
    const r =
      versionMax === null
        ? this.db.prepare(sql).run()
        : this.db.prepare(`${sql} AND version <= ?`).run(versionMax);
    return Number(r.changes);
  }

  // Une copie cohérente de la base, écrite d'un bloc. VACUUM INTO plutôt qu'une
  // copie de fichier : il prend un instantané transactionnel, alors que copier
  // hypernova.db pendant qu'on écrit dedans donne une base à moitié à jour, sans
  // son journal, donc inutilisable au moment précis où l'on en aurait besoin.
  sauvegarde(vers) {
    this.db.prepare('VACUUM INTO ?').run(vers);
  }

  // Les identifiants déjà connus du serveur, pour que le client sache quoi
  // envoyer — et n'envoie pas deux fois la même partie.
  chiffres() {
    const p = this.db.prepare('SELECT COUNT(*) AS n FROM parties').get();
    const pi = this.db.prepare('SELECT COUNT(*) AS n FROM pilotes').get();
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM parties WHERE flux IS NOT NULL').get();
    return { parties: p.n, pilotes: pi.n, replays: r.n };
  }
}
