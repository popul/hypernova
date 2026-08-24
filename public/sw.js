/* Service worker NOVA SWARM :
   - cache hors-ligne (network-first pour les navigations et les campagnes,
     stale-while-revalidate pour les assets) ;
   - vérification périodique des nouvelles campagnes (Periodic Background Sync,
     Chrome/Android PWA installée) avec notification locale. */

// VERSION est réécrit à chaque build par le plugin de vite.config.js : chaque
// déploiement installe un nouveau SW dont l'activation purge l'ancien cache d'app.
const VERSION = 'nova-v1';
const APP_CACHE = `${VERSION}-app`;
const META_CACHE = 'nova-meta'; // hors version : les campagnes vues survivent aux déploiements
const KNOWN_KEY = '/__meta/known-campaigns';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('nova-v') && k !== APP_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigations et données de campagne : le réseau d'abord, le cache en secours.
  // On ne met jamais en cache une réponse d'erreur (404 de déploiement, 500 transitoire,
  // page de portail captif) : elle écraserait une copie saine servie hors-ligne.
  const cacheIfOk = (res) => {
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return res;
  };

  if (event.request.mode === 'navigate' || url.pathname.startsWith('/campaigns/')) {
    event.respondWith(
      fetch(event.request)
        .then(cacheIfOk)
        .catch(() =>
          caches
            .match(event.request)
            .then((hit) => hit || (event.request.mode === 'navigate' ? caches.match('/') : hit))
        )
    );
    return;
  }

  // Assets : cache d'abord, rafraîchi en arrière-plan.
  event.respondWith(
    caches.match(event.request).then((hit) => {
      const refresh = fetch(event.request)
        .then(cacheIfOk)
        .catch(() => hit);
      return hit || refresh;
    })
  );
});

// ---- Détection de nouvelles campagnes ----

async function readKnownIds() {
  const cache = await caches.open(META_CACHE);
  const hit = await cache.match(KNOWN_KEY);
  if (!hit) return [];
  try {
    return await hit.json();
  } catch {
    return [];
  }
}

async function writeKnownIds(ids) {
  const cache = await caches.open(META_CACHE);
  await cache.put(KNOWN_KEY, new Response(JSON.stringify(ids)));
}

async function checkForNewCampaigns() {
  const res = await fetch('/campaigns/index.json', { cache: 'no-store' });
  if (!res.ok) return;
  const index = await res.json();
  const ids = (index.campaigns || []).map((c) => c.id).filter(Boolean);
  const known = new Set(await readKnownIds());
  const fresh = ids.filter((id) => !known.has(id));
  if (fresh.length && known.size > 0) {
    const first = (index.campaigns || []).find((c) => c.id === fresh[0]);
    await self.registration.showNotification('NOVA SWARM — nouvelle campagne !', {
      body: first?.title
        ? `« ${first.title} » vient d’arriver. Ouvrez la carte de la galaxie !`
        : 'Une nouvelle campagne vous attend dans la Voie lactée.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'nova-campaign',
    });
  }
  await writeKnownIds([...new Set([...known, ...ids])]);
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'campaign-check') event.waitUntil(checkForNewCampaigns());
});

// La page signale les campagnes déjà vues (évite de notifier ce qui est déjà connu).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'campaigns-seen' && Array.isArray(event.data.ids)) {
    event.waitUntil(
      readKnownIds().then((known) => writeKnownIds([...new Set([...known, ...event.data.ids])]))
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins[0];
      if (win) return win.focus();
      return self.clients.openWindow('/');
    })
  );
});
