/* Vaqtida — Service Worker (PWA + Web Push) */
const VERSION = 'vaqtida-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// O'rnatiluvchanlik (installability) uchun fetch tinglovchisi — xatti-harakatga tegmaydi
self.addEventListener('fetch', () => {});

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
