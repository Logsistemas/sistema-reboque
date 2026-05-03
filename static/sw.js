
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}

  const title = data.title || '🚨 Novo serviço recebido';
  const options = {
    body: data.body || 'Abra a Área do Motorista para ver o serviço.',
    icon: '/static/icon-192.png',
    badge: '/static/icon-192.png',
    vibrate: [700, 250, 700, 250, 700],
    requireInteraction: true,
    data: { url: data.url || '/motorista/login' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/motorista/login';
  event.waitUntil(clients.openWindow(url));
});
