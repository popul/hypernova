/* Service worker HYPERNOVA :
   - cache hors-ligne (network-first pour les navigations,
     stale-while-revalidate pour les assets) ;
   - vérification périodique des nouvelles campagnes (Periodic Background Sync,
     Chrome/Android PWA installée) avec notification locale. */

// VERSION est réécrit à chaque build par le plugin de vite.config.js : chaque
// déploiement installe un nouveau SW dont l'activation purge l'ancien cache d'app.
const VERSION = 'nova-v1';
const APP_CACHE = `${VERSION}-app`;

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

  // Le panthéon partagé ne passe JAMAIS par le cache. Un classement servi depuis le
  // disque afficherait des scores d'hier sans le dire — et le joueur croirait que
  // son record n'est pas monté. Hors ligne, l'appel échoue et le jeu retombe sur le
  // panthéon local : c'est le comportement voulu, pas une panne.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations : le réseau d'abord, le cache en secours.
  // On ne met jamais en cache une réponse d'erreur (404 de déploiement, 500 transitoire,
  // page de portail captif) : elle écraserait une copie saine servie hors-ligne.
  const cacheIfOk = (res) => {
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return res;
  };

  if (event.request.mode === 'navigate') {
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
