// Campagnes : des fichiers JSON dans public/campaigns/, publiables sans toucher au code.
// Une campagne = une traversée de la Voie lactée, système par système, chaque système
// étant une mission courte (N vagues) avec ses modificateurs de difficulté.
//
// Publication hebdomadaire : ajouter un fichier <id>.json + une entrée dans index.json,
// déployer. Le jeu détecte les ids inconnus → badge « nouvelle campagne » + notification.

const SEEN_KEY = 'novaswarm.campaigns.seen';
const PROGRESS_PREFIX = 'novaswarm.campaign.';

// Campagne inaugurale embarquée : le jeu reste jouable hors-ligne et sans réseau.
export const BUILTIN_CAMPAIGN = {
  id: 'orion-2026-w35',
  title: 'Le Bras d’Orion',
  subtitle: 'Campagne inaugurale — semaine 35',
  publishedAt: '2026-08-24',
  systems: [
    {
      id: 'sol',
      name: 'Sol — Terre',
      desc: 'L’essaim frappe aux portes de la Terre. Repoussez l’avant-garde.',
      waves: 3,
      baseWave: 1,
      mods: { hp: 1, fire: 0.85, dive: 0.85, credits: 1 },
    },
    {
      id: 'proxima',
      name: 'Proxima du Centaure',
      desc: 'L’étoile la plus proche est déjà encerclée. Les guêpes y sont nerveuses.',
      waves: 3,
      baseWave: 2,
      mods: { hp: 1, fire: 1, dive: 1.1, credits: 1.1 },
    },
    {
      id: 'sirius',
      name: 'Sirius',
      desc: 'Le chien de garde du ciel austral. Blindés en nombre.',
      waves: 3,
      baseWave: 3,
      mods: { hp: 1.25, fire: 1, dive: 1, credits: 1.15 },
    },
    {
      id: 'pleiades',
      name: 'Les Pléiades',
      desc: 'Sept sœurs, sept nuées d’ennemis. Les plongées pleuvent.',
      waves: 3,
      baseWave: 4,
      mods: { hp: 1, fire: 1.15, dive: 1.35, credits: 1.2 },
    },
    {
      id: 'betelgeuse',
      name: 'Bételgeuse',
      desc: 'Le cuirassé de VORAX rôde près de la supergéante rouge. Détruisez-le.',
      waves: 3,
      baseWave: 5,
      bossFinal: true,
      mods: { hp: 1.2, fire: 1.1, dive: 1.1, credits: 1.3 },
    },
    {
      id: 'carina',
      name: 'Nébuleuse de la Carène',
      desc: 'Les nuées se reforment dans la poussière d’étoiles. Tempête de tirs.',
      waves: 4,
      baseWave: 7,
      mods: { hp: 1.3, fire: 1.3, dive: 1.2, credits: 1.4 },
    },
    {
      id: 'sgrA',
      name: 'Sagittarius A★',
      desc: 'Le cœur noir de la galaxie. VORAX, le Dévoreur d’Étoiles, vous y attend.',
      waves: 4,
      baseWave: 9,
      bossFinal: true,
      mods: { hp: 1.5, fire: 1.3, dive: 1.3, credits: 1.6 },
    },
  ],
};

export const DEFAULT_MODS = { hp: 1, fire: 1, dive: 1, credits: 1 };

// ---- Chargement (réseau + fallback embarqué) ----

// Valide et normalise une campagne (les JSON publiés sont de la donnée externe : un fichier
// malformé doit être ignoré ou réparé, jamais casser la carte ni produire des vagues NaN).
function normalizeCampaign(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id || !Array.isArray(raw.systems)) return null;
  const systems = raw.systems
    .filter((s) => s && s.id && s.name)
    .map((s) => ({
      ...s,
      waves: Number.isInteger(s.waves) && s.waves >= 1 ? s.waves : 3,
      baseWave: Number.isInteger(s.baseWave) && s.baseWave >= 1 ? s.baseWave : 1,
      mods: { ...DEFAULT_MODS, ...(s.mods || {}) },
    }));
  if (systems.length === 0) return null;
  return { ...raw, systems };
}

export async function loadCampaigns() {
  const campaigns = new Map([[BUILTIN_CAMPAIGN.id, normalizeCampaign(BUILTIN_CAMPAIGN)]]);
  try {
    const index = await fetch('/campaigns/index.json', { cache: 'no-store' }).then((r) =>
      r.ok ? r.json() : null
    );
    if (index?.campaigns) {
      const files = await Promise.allSettled(
        index.campaigns.map((c) =>
          fetch(`/campaigns/${c.file}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
        )
      );
      for (const f of files) {
        const campaign = f.status === 'fulfilled' ? normalizeCampaign(f.value) : null;
        if (campaign) campaigns.set(campaign.id, campaign);
      }
    }
  } catch {
    // Hors-ligne : la campagne embarquée (et celles en cache SW) suffisent.
  }
  return [...campaigns.values()].sort((a, b) =>
    (b.publishedAt || '').localeCompare(a.publishedAt || '')
  );
}

// ---- Nouveautés ----

function seenIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function unseenCampaigns(campaigns) {
  const seen = new Set(seenIds());
  return campaigns.filter((c) => !seen.has(c.id));
}

export function markCampaignsSeen(campaigns) {
  const merged = new Set([...seenIds(), ...campaigns.map((c) => c.id)]);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...merged]));
  // Synchronise le service worker pour qu'il ne notifie pas ce qui est déjà vu.
  navigator.serviceWorker?.controller?.postMessage({ type: 'campaigns-seen', ids: [...merged] });
}

// ---- Progression ----

const EMPTY_PROGRESS = () => ({ completed: [], bestScores: {}, levels: null, credits: 0 });

export function loadProgress(campaignId) {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_PREFIX + campaignId));
    return raw && typeof raw === 'object'
      ? {
          completed: raw.completed || [],
          bestScores: raw.bestScores || {},
          levels: raw.levels || null,
          credits: Number(raw.credits) || 0,
        }
      : EMPTY_PROGRESS();
  } catch {
    return EMPTY_PROGRESS();
  }
}

// Le vaisseau se construit au fil de la campagne : les améliorations et les crédits
// restants sont persistés avec la progression (roguelite assumé — refaire une mission
// avec un gros vaisseau est un plaisir, pas un bug).
export function saveMissionResult(campaignId, systemId, score, levels = null, credits = 0) {
  const progress = loadProgress(campaignId);
  if (!progress.completed.includes(systemId)) progress.completed.push(systemId);
  progress.bestScores[systemId] = Math.max(progress.bestScores[systemId] || 0, score);
  if (levels) progress.levels = { ...levels };
  progress.credits = Math.max(0, Math.round(credits));
  localStorage.setItem(PROGRESS_PREFIX + campaignId, JSON.stringify(progress));
  return progress;
}

// Index du premier système non terminé (= mission « en cours »).
export function currentSystemIndex(campaign, progress) {
  const idx = campaign.systems.findIndex((s) => !progress.completed.includes(s.id));
  return idx === -1 ? campaign.systems.length - 1 : idx;
}

// ---- Alertes (notifications locales + periodic background sync si disponible) ----

export async function enableAlerts() {
  if (!('Notification' in window)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
    // getRegistration() résout immédiatement (undefined sans SW), contrairement à
    // serviceWorker.ready qui pendrait pour toujours en dev ou si register a échoué.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg && 'periodicSync' in reg) {
      await reg.periodicSync.register('campaign-check', { minInterval: 12 * 60 * 60 * 1000 });
      return 'periodic';
    }
  } catch {
    // periodicSync indisponible (iOS, Firefox…) : on retombe sur l'alerte à l'ouverture.
  }
  return 'on-open';
}

export async function notifyNewCampaigns(fresh) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !fresh.length) return;
  const c = fresh[0];
  const title = 'HYPERNOVA — nouvelle campagne !';
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.active) {
      await reg.showNotification(title, {
        body: `« ${c.title} » vient d’arriver. ${c.systems.length} systèmes à libérer.`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'nova-campaign',
      });
    } else {
      // Sans SW actif (dev) : notification directe. Peut jeter sur Chrome Android.
      new Notification(title, { body: `« ${c.title} » vient d’arriver.` });
    }
  } catch {
    // Meilleure-effort : jamais bloquant.
  }
}
