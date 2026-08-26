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
      return { ok: true, jeton, nouveau: true };
    }

    // Comparaison à temps constant : sans elle, le temps de réponse trahirait le
    // nombre de caractères justes.
    const attendu = Buffer.from(existant.code_hash, 'hex');
    const fourni = Buffer.from(this._hacheCode(code, existant.sel), 'hex');
    if (attendu.length !== fourni.length || !timingSafeEqual(attendu, fourni)) {
      return { ok: false, erreur: 'code' };
    }
    this.db
      .prepare(
        `UPDATE pilotes SET jeton_hash = ?, vu_le = ?, email = COALESCE(email, ?) WHERE nom = ?`
      )
      .run(this._hacheJeton(jeton), maintenant, email, nom);
    return { ok: true, jeton, nouveau: false };
  }

  // Le pilote derrière un jeton, ou null.
  parJeton(jeton) {
    if (!jeton) return null;
    return (
      this.db.prepare('SELECT * FROM pilotes WHERE jeton_hash = ?').get(this._hacheJeton(jeton)) ||
      null
    );
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
        p.mode === 'survie' ? 'survie' : 'arcade',
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
    this._elague(pilote, p.mode === 'survie' ? 'survie' : 'arcade');
    return id;
  }

  // On ne supprime pas les scores, on relâche les enregistrements : une partie
  // reste au tableau même quand son replay a cédé la place.
  // L'élagage est par pilote ET par mode : un marathon de survie ne doit pas
  // chasser les enregistrements d'arcade, ce sont deux collections distinctes.
  _elague(pilote, mode) {
    this.db
      .prepare(
        `UPDATE parties SET flux = NULL, etats = NULL, controles = NULL
         WHERE pilote = ? AND mode = ? AND flux IS NOT NULL AND id NOT IN (
           SELECT id FROM parties WHERE pilote = ? AND mode = ? AND flux IS NOT NULL
           ORDER BY score DESC, vague DESC LIMIT ?
         )`
      )
      .run(pilote, mode, pilote, mode, MAX_REPLAYS_PAR_PILOTE);
    this.db
      .prepare(
        `DELETE FROM parties WHERE pilote = ? AND mode = ? AND id NOT IN (
           SELECT id FROM parties WHERE pilote = ? AND mode = ? ORDER BY score DESC, vague DESC LIMIT ?
         )`
      )
      .run(pilote, mode, pilote, mode, MAX_PARTIES_PAR_PILOTE);
  }

  // L'arcade se classe au score : c'est une course au panache. La survie se classe
  // à la VAGUE atteinte, le score ne départageant qu'à égalité — parce que la
  // question qu'on s'y pose est « jusqu'où es-tu allé ? », pas « combien as-tu
  // marqué en chemin ? ».
  classement(limite = 20, mode = 'arcade') {
    const m = mode === 'survie' ? 'survie' : 'arcade';
    const ordre = m === 'survie' ? 'vague DESC, score DESC' : 'score DESC, vague DESC';
    return this.db
      .prepare(
        `SELECT id, pilote AS nom, mode, score, vague, duree, jouee_le,
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

  // Les identifiants déjà connus du serveur, pour que le client sache quoi
  // envoyer — et n'envoie pas deux fois la même partie.
  chiffres() {
    const p = this.db.prepare('SELECT COUNT(*) AS n FROM parties').get();
    const pi = this.db.prepare('SELECT COUNT(*) AS n FROM pilotes').get();
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM parties WHERE flux IS NOT NULL').get();
    return { parties: p.n, pilotes: pi.n, replays: r.n };
  }
}
