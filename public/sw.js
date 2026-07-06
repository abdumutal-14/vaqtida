/* Vaqtida — Service Worker (PWA + Web Push + oflayn keshlash) */
const VERSION = 'vaqtida-v2';
const RUNTIME_CACHE = `${VERSION}-runtime`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Eski versiyalarning keshini tozalaymiz
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== RUNTIME_CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// Ilova qobig'ini (HTML/JS/CSS/rasm) oflayn ishlashi uchun keshlaymiz:
// internet bor bo'lsa — tarmoqdan olib, keshga yozamiz; internet yo'q bo'lsa
// — keshdan beramiz. Shu tufayli ilova avval kamida bir marta onlayn ochilgan
// bo'lsa, keyinchalik signal yo'q joyda ham ochiladi.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('/');
        return Response.error();
      })
  );
});

// Push kelganda bildirishnoma ko'rsatamiz (server 2-bosqichda yuboradi)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Vaqtida — dori vaqti';
  const options = {
    body: data.body || 'Dori qabul qilish vaqti keldi.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'vaqtida-dose',
    renotify: true,
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Bildirishnoma bosilганда ilovani ochamiz/fokuslaymiz
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
