// LA RÉGIE — l'administration du panthéon.
//
// « Reset le tableau des scores », c'était la demande. En cherchant ce qu'une
// telle page devrait offrir d'autre, un besoin s'est détaché des autres : LE
// CODE OUBLIÉ. Le jeu n'a pas de serveur de courrier ; un pseudo dont on a perdu
// les quatre chiffres est perdu pour toujours, avec tous ses scores. C'est le
// seul endroit du jeu où quelque chose casse définitivement, et c'est donc la
// première chose que cette page sait réparer.
//
// Le reste suit la même règle : n'ajouter un bouton que pour un problème qu'on
// aurait vraiment un jour. Vider un tableau, retirer un score absurde sans punir
// les autres, fermer les appareils d'un pilote, supprimer un pseudo malheureux,
// libérer les enregistrements d'anciennes règles qui ne se rejouent plus, et
// emporter une sauvegarde AVANT de faire tout ça.
//
// TROIS PARTIS PRIS.
//
// Le secret ne s'enregistre pas. Il vit dans `sessionStorage` : fermer l'onglet
// l'oublie. Une console qui reste ouverte sur un ordinateur familial est
// exactement le genre de commodité dont on se félicite jusqu'au jour où.
//
// Rien d'irréversible sans écrire un mot. Pas une case à cocher, pas un
// « êtes-vous sûr ? » qu'on clique sans lire : le nom de ce qu'on va détruire,
// tapé à la main. C'est deux secondes de plus, et ça n'arrive jamais par erreur.
//
// Chaque action dit COMBIEN. « Fait » ne se vérifie pas ; « 47 parties effacées »
// se compare à ce qu'on croyait effacer.

import './admin.css';
import { VERSION } from '../game/rejeu/format.js';

const CLE = 'hypernova.regie';
const el = document.getElementById('regie');

let secret = sessionStorage.getItem(CLE) || '';

// --- Réseau -----------------------------------------------------------------

async function api(chemin, options = {}) {
  const r = await fetch(`/api/admin${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (r.status === 401) {
    secret = '';
    sessionStorage.removeItem(CLE);
    montrePorte('Secret refusé.');
    throw new Error('secret');
  }
  if (options.brut) return r;
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corps.erreur || `erreur ${r.status}`);
  return corps;
}

// --- Journal ----------------------------------------------------------------

function note(message, ok = true) {
  const j = document.getElementById('journal');
  if (!j) return;
  const p = document.createElement('p');
  p.className = ok ? 'ok' : 'mal';
  const t = document.createElement('time');
  t.textContent = new Date().toLocaleTimeString('fr-FR');
  p.append(t, document.createTextNode(message));
  j.append(p);
}

// --- Demander quelque chose -------------------------------------------------
//
// `window.prompt` aurait suffi et tenait en une ligne. Trois raisons de ne pas
// s'en servir : il fige tout l'onglet, il est illisible sur un téléphone, et
// plusieurs navigateurs laissent l'utilisateur le désactiver définitivement —
// auquel cas la moitié de cette page cesse de fonctionner sans rien dire.
//
// Un <dialog> natif fait le même travail en restant dans le document : il se
// ferme au clavier, il piège le focus tout seul, et il se voit.

const boite = document.createElement('dialog');
boite.id = 'boite';
boite.innerHTML = `
  <h3></h3>
  <p></p>
  <input type="text" autocomplete="off" />
  <div class="rangee" style="justify-content:flex-end">
    <button type="button" class="petit" data-non>Annuler</button>
    <button type="button" class="petit" data-oui>Confirmer</button>
  </div>
`;
document.body.append(boite);

// PAS DE <form method="dialog">, ET PAS D'ÉVÉNEMENT `close`.
//
// La version courte utilisait un formulaire de dialogue et attendait l'événement
// `close` pour rendre la saisie. Mesuré dans un vrai navigateur, avec de vrais
// clics : le dialogue se fermait, `returnValue` valait bien « ok », et
// l'événement `close` n'arrivait jamais. Le code oublié n'était donc jamais
// reposé, sans la moindre erreur pour le dire — le pire des échecs, celui qui
// n'a l'air de rien.
//
// Les deux boutons rendent donc leur réponse eux-mêmes, et `cancel` couvre la
// touche Échap. Trois lignes de plus, aucune promesse suspendue dans le vide.
let rendsReponse = null;

function ferme(reponse) {
  if (!rendsReponse) return;
  const rendre = rendsReponse;
  rendsReponse = null;
  boite.close();
  rendre(reponse);
}

boite.querySelector('[data-oui]').addEventListener('click', () => {
  ferme(boite.querySelector('input').value.trim());
});
boite.querySelector('[data-non]').addEventListener('click', () => ferme(null));
// Échap ferme le dialogue sans passer par nos boutons : sans ceci, la promesse
// resterait en attente pour toujours et le bouton suivant ne répondrait plus.
boite.addEventListener('cancel', () => ferme(null));

// Rend ce qui a été tapé, ou null si l'on renonce. `valide` grise le bouton tant
// que la saisie ne convient pas : c'est plus honnête qu'un refus après coup.
function demande(
  titre,
  detail,
  { valeur = '', indice = '', valide = (v) => v.trim() !== '' } = {}
) {
  boite.querySelector('h3').textContent = titre;
  boite.querySelector('p').textContent = detail;
  const champ = boite.querySelector('input');
  const oui = boite.querySelector('[data-oui]');
  champ.value = valeur;
  champ.placeholder = indice;
  const juge = () => {
    oui.disabled = !valide(champ.value);
  };
  champ.oninput = juge;
  // Entrée vaut « Confirmer » : c'est le geste qu'on fait après avoir tapé.
  champ.onkeydown = (e) => {
    if (e.key === 'Enter' && !oui.disabled) ferme(champ.value.trim());
  };
  juge();
  boite.showModal();
  champ.focus();
  champ.select();
  return new Promise((resolve) => {
    rendsReponse = resolve;
  });
}

// Un « êtes-vous sûr ? » se clique sans le lire. Recopier le mot, non : deux
// secondes de plus, et ça n'arrive jamais par erreur.
async function confirmeEnEcrivant(mot, quoi) {
  // Pas de `indice` : afficher le mot attendu en filigrane dans le champ donne
  // l'impression qu'il est déjà rempli, et c'est exactement le réflexe qu'on
  // cherchait à empêcher. Il est écrit au-dessus, à recopier.
  const saisi = await demande(quoi, `Pour confirmer, écrivez : ${mot}`, {
    valide: (v) => v.trim().toUpperCase() === mot,
  });
  return saisi !== null && saisi.toUpperCase() === mot;
}

// --- Petites aides ----------------------------------------------------------

function octets(n) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Kio`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mio`;
}

function jour(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

// Tout ce qui vient de la base traverse ici avant d'atteindre le document. Un
// pseudo est saisi par un joueur : il ne compose jamais de balise.
function texte(v) {
  const s = document.createElement('span');
  s.textContent = v ?? '';
  return s;
}

function cellule(contenu, classe = '') {
  const td = document.createElement('td');
  if (classe) td.className = classe;
  td.append(typeof contenu === 'string' || typeof contenu === 'number' ? texte(contenu) : contenu);
  return td;
}

function bouton(libelle, onClick, classes = 'petit') {
  const b = document.createElement('button');
  b.className = classes;
  b.textContent = libelle;
  b.addEventListener('click', onClick);
  return b;
}

// --- La porte ---------------------------------------------------------------

function montrePorte(message = '') {
  el.innerHTML = '';
  const porte = document.createElement('section');
  porte.className = 'porte';
  porte.innerHTML = `
    <h1>Régie HYPERNOVA</h1>
    <p class="chapeau">
      Cette console peut effacer le panthéon de tout le monde. Elle demande le
      secret du serveur, et l'oublie dès que l'onglet se ferme.
    </p>
    <div class="rangee">
      <input type="password" id="secret" placeholder="Secret" autocomplete="off" style="flex:1" />
      <button id="entrer">Entrer</button>
    </div>
    <p class="note" id="porte-message"></p>
  `;
  el.append(porte);
  document.getElementById('porte-message').textContent = message;
  const champ = document.getElementById('secret');
  const entre = async () => {
    secret = champ.value.trim();
    if (!secret) return;
    try {
      await api('/etat');
      sessionStorage.setItem(CLE, secret);
      await montreRegie();
    } catch (e) {
      // Un 401 a déjà remis la porte avec son message. Le 404, lui, veut dire
      // que le serveur n'a pas de secret du tout — et sans ce cas, la porte
      // restait muette en refusant un secret qui n'était pas en cause.
      if (e.message === 'route') {
        document.getElementById('porte-message').textContent =
          "Ce serveur n'a pas d'administration : il lui manque ADMIN_TOKEN.";
      }
    }
  };
  document.getElementById('entrer').addEventListener('click', entre);
  champ.addEventListener('keydown', (e) => e.key === 'Enter' && entre());
  champ.focus();
}

// --- La régie ---------------------------------------------------------------

async function montreRegie() {
  const [etat, { pilotes }] = await Promise.all([api('/etat'), api('/pilotes')]);

  el.innerHTML = '';
  const titre = document.createElement('div');
  titre.innerHTML = `
    <h1>Régie HYPERNOVA</h1>
    <p class="chapeau">
      Le panthéon partagé, ses pilotes et leurs parties. Rien de ce qui suit ne
      se défait : la sauvegarde est en bas, et elle se prend avant, pas après.
    </p>
  `;
  el.append(titre, sectionEtat(etat), sectionBord(), sectionPilotes(pilotes), sectionParties(etat));
  el.append(sectionReplays(etat), sectionJournal());
  chargeBord().catch(() => {});
  note(`Régie ouverte — ${etat.pilotes} pilotes, ${etat.parties} parties.`);
}

function sectionEtat(etat) {
  const s = document.createElement('section');
  s.innerHTML = '<h2>État</h2>';
  const grille = document.createElement('div');
  grille.className = 'chiffres';
  const cases = [
    ['Pilotes', etat.pilotes],
    ['Parties', etat.parties],
    ['Enregistrements', etat.replays],
    ['Appareils connectés', etat.sessions],
    ['Base', octets(etat.octets)],
  ];
  for (const [nom, valeur] of cases) grille.append(chiffre(nom, valeur));
  s.append(grille);
  return s;
}

// --- Pilotes ----------------------------------------------------------------

function sectionPilotes(pilotes) {
  const s = document.createElement('section');
  s.innerHTML = `
    <h2>Pilotes</h2>
    <p class="note">
      L'adresse ne sort nulle part ailleurs : elle est ici pour reconnaître
      l'enfant qui a oublié ses quatre chiffres avant de lui en poser d'autres.
      Reposer un code ferme du même coup tous ses appareils.
    </p>
  `;
  const box = document.createElement('div');
  box.className = 'defile';
  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr>
      <th>Pilote</th><th>Adresse</th>
      <th class="nombre">Parties</th><th class="nombre">Record</th>
      <th class="nombre">Appareils</th><th>Vu le</th><th></th>
    </tr></thead>
  `;
  const corps = document.createElement('tbody');
  for (const p of pilotes) corps.append(lignePilote(p));
  table.append(corps);
  box.append(table);
  s.append(box);
  return s;
}

function lignePilote(p) {
  const tr = document.createElement('tr');
  const actes = document.createElement('div');
  actes.className = 'rangee';
  actes.style.justifyContent = 'flex-end';

  actes.append(
    bouton('Code', async () => {
      const code = await demande(
        `Nouveau code pour ${p.nom}`,
        'Quatre chiffres. Tous ses appareils seront déconnectés.',
        { indice: '0000', valide: (v) => /^\d{4}$/.test(v.trim()) }
      );
      if (code === null) return;
      try {
        const r = await api(`/pilotes/${encodeURIComponent(p.nom)}/code`, {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        note(`${p.nom} : code reposé, ${r.sessions} appareil(s) déconnecté(s).`);
      } catch (e) {
        note(`${p.nom} : ${e.message}`, false);
      }
    })
  );

  actes.append(
    bouton('Déconnecter', async () => {
      try {
        const r = await api(`/pilotes/${encodeURIComponent(p.nom)}/sessions`, { method: 'POST' });
        note(`${p.nom} : ${r.sessions} appareil(s) déconnecté(s).`);
        p.sessions = 0;
        tr.replaceWith(lignePilote(p));
      } catch (e) {
        note(`${p.nom} : ${e.message}`, false);
      }
    })
  );

  actes.append(
    bouton(
      'Supprimer',
      async () => {
        const feu = await confirmeEnEcrivant(
          p.nom,
          `Supprimer ${p.nom} et ses ${p.parties} partie(s).`
        );
        if (!feu) return;
        try {
          const r = await api(`/pilotes/${encodeURIComponent(p.nom)}`, { method: 'DELETE' });
          note(`${p.nom} supprimé avec ${r.parties} partie(s).`);
          tr.remove();
        } catch (e) {
          note(`${p.nom} : ${e.message}`, false);
        }
      },
      'petit rouge'
    )
  );

  tr.append(
    cellule(p.nom, 'nom'),
    cellule(p.email || '—', 'mail'),
    cellule(p.parties, 'nombre'),
    cellule(p.meilleur, 'nombre'),
    cellule(p.sessions, 'nombre'),
    cellule(jour(p.vu_le)),
    cellule(actes, 'actes')
  );
  return tr;
}

// --- Parties ----------------------------------------------------------------

function sectionParties(etat) {
  const s = document.createElement('section');
  s.className = 'danger';
  s.innerHTML = `
    <h2>Tableaux des scores</h2>
    <p class="note">
      Vider un tableau efface les parties de tous les pilotes dans ce mode — les
      pilotes eux-mêmes restent, avec leur pseudo et leur code. Pour retirer un
      seul score absurde, l'identifiant se lit dans le classement du jeu.
    </p>
  `;

  const box = document.createElement('div');
  box.className = 'defile';
  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr>
      <th>Mode</th><th class="nombre">Parties</th><th class="nombre">Record</th>
      <th>De</th><th>À</th><th></th>
    </tr></thead>
  `;
  const corps = document.createElement('tbody');
  for (const m of etat.modes) {
    const tr = document.createElement('tr');
    const acte = bouton(
      'Vider',
      async () => {
        const feu = await confirmeEnEcrivant(
          m.mode.toUpperCase(),
          `Effacer les ${m.parties} parties du mode ${m.mode}.`
        );
        if (!feu) return;
        try {
          const r = await api('/vide-classement', {
            method: 'POST',
            body: JSON.stringify({ mode: m.mode }),
          });
          note(`Tableau ${m.mode} vidé : ${r.parties} partie(s) effacée(s).`);
          tr.remove();
        } catch (e) {
          note(e.message, false);
        }
      },
      'petit rouge'
    );
    tr.append(
      cellule(m.mode),
      cellule(m.parties, 'nombre'),
      cellule(m.record, 'nombre'),
      cellule(jour(m.depuis)),
      cellule(jour(m.jusqua)),
      cellule(acte, 'actes')
    );
    corps.append(tr);
  }
  table.append(corps);
  box.append(table);

  const outils = document.createElement('div');
  outils.className = 'rangee';
  outils.style.marginTop = '16px';

  const champId = document.createElement('input');
  champId.type = 'text';
  champId.placeholder = 'Identifiant de partie';
  outils.append(
    champId,
    bouton(
      'Retirer cette partie',
      async () => {
        const id = champId.value.trim();
        if (!id) return;
        try {
          await api(`/parties/${encodeURIComponent(id)}`, { method: 'DELETE' });
          note(`Partie ${id} retirée.`);
          champId.value = '';
        } catch (e) {
          note(`Partie ${id} : ${e.message}`, false);
        }
      },
      'rouge'
    ),
    bouton(
      'Tout effacer',
      async () => {
        const feu = await confirmeEnEcrivant(
          'EFFACER TOUT',
          `Effacer les ${etat.parties} parties, tous modes.`
        );
        if (!feu) return;
        try {
          const r = await api('/vide-classement', { method: 'POST', body: JSON.stringify({}) });
          note(`Panthéon vidé : ${r.parties} partie(s) effacée(s).`);
          corps.innerHTML = '';
        } catch (e) {
          note(e.message, false);
        }
      },
      'rouge'
    )
  );

  s.append(box, outils);
  return s;
}

// --- Enregistrements et sauvegarde ------------------------------------------

function sectionReplays(etat) {
  const s = document.createElement('section');
  s.innerHTML = `
    <h2>Enregistrements</h2>
    <p class="note">
      Un enregistrement produit sous d'anciennes règles ne se rejoue plus : il
      raconterait une autre partie que celle qu'il prétend. Le jeu en est à la
      version ${VERSION} — les lignes en rouge occupent de la place sans être
      regardables. Les libérer laisse les scores au tableau, on ne peut
      simplement plus les revoir.
    </p>
  `;
  const box = document.createElement('div');
  box.className = 'defile';
  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr>
      <th>Version des règles</th><th class="nombre">Parties</th>
      <th class="nombre">Enregistrements</th><th class="nombre">Poids</th>
    </tr></thead>
  `;
  const corps = document.createElement('tbody');
  for (const v of etat.versions) {
    const tr = document.createElement('tr');
    if (v.version !== VERSION) tr.className = 'perimee';
    tr.append(
      cellule(v.version === VERSION ? `${v.version} (actuelle)` : v.version),
      cellule(v.parties, 'nombre'),
      cellule(v.replays, 'nombre'),
      cellule(octets(v.octets), 'nombre')
    );
    corps.append(tr);
  }
  table.append(corps);
  box.append(table);

  const outils = document.createElement('div');
  outils.className = 'rangee';
  outils.style.marginTop = '16px';
  outils.append(
    bouton(
      `Libérer les versions antérieures à ${VERSION}`,
      async () => {
        try {
          const r = await api('/purge-replays', {
            method: 'POST',
            body: JSON.stringify({ versionMax: VERSION - 1 }),
          });
          note(`${r.replays} enregistrement(s) périmé(s) libéré(s).`);
        } catch (e) {
          note(e.message, false);
        }
      },
      ''
    ),
    bouton('Télécharger la sauvegarde', telechargeSauvegarde, '')
  );

  s.append(box, outils);
  return s;
}

// Le fichier arrive derrière le secret : un simple lien ne porterait pas
// l'en-tête d'autorisation. On le récupère donc en mémoire avant de le rendre au
// navigateur — la base d'un homelab pèse quelques centaines de kilo-octets, et le
// serveur refuse de son côté au-delà de douze mégaoctets.
async function telechargeSauvegarde() {
  try {
    const r = await api('/sauvegarde', { brut: true });
    if (!r.ok) {
      const c = await r.json().catch(() => ({}));
      throw new Error(
        c.erreur === 'trop-grosse' ? 'base trop grosse pour /tmp' : `erreur ${r.status}`
      );
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hypernova-${new Date().toISOString().slice(0, 10)}.db`;
    a.click();
    URL.revokeObjectURL(url);
    note(`Sauvegarde téléchargée (${octets(blob.size)}).`);
  } catch (e) {
    note(`Sauvegarde : ${e.message}`, false);
  }
}

// LE JOURNAL DE BORD — ce que les parties racontent quand elles déraillent.
//
// C'est l'écran qu'on ouvre quand quelqu'un dit « ça a déraillé ». Un défaut de
// synchronisation ne laisse aucune trace : les deux machines continuent de
// tourner, chacune persuadée d'avoir raison. Ici on voit ce qui a divergé, entre
// qui, à quelle vague et de combien.
// Une tuile de chiffre, la même que celle de l'état : deux endroits qui les
// dessinaient différemment se seraient mis à diverger au premier réglage de style.
function chiffre(nom, valeur) {
  const d = document.createElement('div');
  d.className = 'chiffre';
  const b = document.createElement('b');
  b.textContent = valeur;
  const sp = document.createElement('span');
  sp.textContent = nom;
  d.append(b, sp);
  return d;
}

function sectionBord() {
  const s = document.createElement('section');
  s.innerHTML = `
    <h2>Journal de bord</h2>
    <p class="aide">
      Ce que les parties signalent d'elles-mêmes : désynchronisations mesurées,
      erreurs non rattrapées, et le contexte de chacune. Rien de personnel n'y
      figure — un pseudo, une version, la forme de l'écran.
    </p>
    <div class="chiffres" id="bord-resume"></div>
    <div class="rangee" id="bord-filtres"></div>
    <div id="bord-liste">Chargement…</div>`;
  return s;
}

const TYPES = [
  ['', 'Tout'],
  ['desynchro', 'Désynchros'],
  ['erreur', 'Erreurs'],
  ['promesse', 'Rejets'],
  ['partie', 'Parties'],
];

async function chargeBord(type = '') {
  const liste = document.getElementById('bord-liste');
  const filtres = document.getElementById('bord-filtres');
  if (!liste) return;

  if (filtres && !filtres.children.length) {
    for (const [valeur, nom] of TYPES) {
      const b = document.createElement('button');
      b.className = 'btn-ghost petit';
      b.textContent = nom;
      b.addEventListener('click', () => chargeBord(valeur));
      filtres.append(b);
    }
    const r = document.createElement('button');
    r.className = 'btn-ghost petit';
    r.textContent = '⟳';
    r.addEventListener('click', () => chargeBord(type));
    filtres.append(r);
  }

  const d = await api(`/journal?limite=150${type ? `&type=${encodeURIComponent(type)}` : ''}`);
  const resume = document.getElementById('bord-resume');
  if (resume) {
    resume.innerHTML = '';
    if (!d.resume.length) resume.append(chiffre('Rien en 24 h', '—'));
    for (const r of d.resume) resume.append(chiffre(r.type, r.n));
  }

  liste.innerHTML = '';
  if (!d.evenements.length) {
    liste.textContent = 'Rien à signaler.';
    return;
  }
  const table = document.createElement('table');
  table.className = 'table';
  table.innerHTML =
    '<thead><tr><th>Quand</th><th>Type</th><th>Pilote</th><th>Version</th><th>Écran</th><th>Ce qui s’est passé</th></tr></thead>';
  const corps = document.createElement('tbody');
  for (const e of d.evenements) {
    const tr = document.createElement('tr');
    if (e.type === 'desynchro' || e.type === 'erreur') tr.className = 'mal';
    tr.append(
      cellule(new Date(e.quand).toLocaleString('fr-FR')),
      cellule(e.type),
      cellule(e.pilote || '—'),
      cellule(e.version || '—'),
      cellule(e.ecran || '—'),
      cellule(raconte(e))
    );
    corps.append(tr);
  }
  table.append(corps);
  liste.append(table);
}

// Une ligne de journal, dite en français plutôt qu'en JSON. C'est ce qui décide
// si l'écran sert à quelque chose : une table de JSON brut ne se lit pas.
function raconte(e) {
  const d = e.detail || {};
  if (e.type === 'desynchro') {
    const parts = Object.entries(d.ecarts || {}).map(
      ([cle, v]) => `${cle} ${v.moi} au lieu de ${v.lui}`
    );
    return `avec ${d.avec || '?'} · ${d.ou || ''} · ${parts.join(', ') || d.quoi || ''}`;
  }
  if (e.type === 'erreur' || e.type === 'promesse') {
    return `${d.quoi || ''}${d.ou ? ` (${d.ou})` : ''}`;
  }
  if (e.type === 'partie')
    return `${d.mode || ''} ${d.variante || ''} ${d.coque || ''} · ${d.ou || ''}`;
  return JSON.stringify(d).slice(0, 160);
}

function sectionJournal() {
  const s = document.createElement('section');
  s.innerHTML = '<h2>Ce qui a été fait</h2><div id="journal"></div>';
  return s;
}

// --- Démarrage --------------------------------------------------------------

if (secret) {
  montreRegie().catch(() => montrePorte('Secret refusé.'));
} else {
  montrePorte();
}
