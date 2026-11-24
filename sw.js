// Service worker minimal : rend l'appli installable et l'ouvre même sans réseau.
// Réseau d'abord (pour toujours avoir la dernière version), cache en secours.
const CACHE = 'fredon-v59';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const SHELL = ['./', 'index.html', 'styles.css', 'store.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => caches.open(CACHE).then(c => c.add(LIB)).catch(() => {})) // pour démarrer aussi sans réseau
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const isLib = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!sameOrigin && !isLib) return; // Supabase : jamais en cache
  e.respondWith(
    (sameOrigin ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request)) // sans passer par le cache du navigateur
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
