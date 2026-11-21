/* eslint-disable no-restricted-globals */
/**
 * estuda.gov.br — Service Worker Push & Daily Goal Notification Handler
 * Loaded automatically by vite-plugin-pwa (workbox.importScripts) in production
 * and registered directly in development preview without intercepting fetch requests.
 */

const DEFAULT_ICON = '/pwa-192x192.png';
const DEFAULT_BADGE = '/pwa-192x192.png';

self.addEventListener('install', () => {
  if (typeof self.skipWaiting === 'function') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  if (self.clients && typeof self.clients.claim === 'function') {
    event.waitUntil(self.clients.claim());
  }
});

function buildNotificationOptions(payload) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const targetPage = typeof safe.page === 'string' ? safe.page : 'Página Inicial';
  const defaultActions = [
    { action: 'open-training', title: 'Iniciar Treino' },
    { action: 'snooze-30m', title: 'Adiar 30min' },
  ];

  return {
    body:
      typeof safe.body === 'string' && safe.body.trim()
        ? safe.body.trim()
        : 'Confira suas metas diárias de horas e questões no portal estuda.gov.br.',
    icon: typeof safe.icon === 'string' ? safe.icon : DEFAULT_ICON,
    badge: typeof safe.badge === 'string' ? safe.badge : DEFAULT_BADGE,
    tag: typeof safe.tag === 'string' ? safe.tag : 'estuda-daily-goal',
    renotify: Boolean(safe.renotify ?? true),
    requireInteraction: Boolean(safe.requireInteraction ?? false),
    vibrate: Array.isArray(safe.vibrate) ? safe.vibrate : [160, 80, 160],
    actions: Array.isArray(safe.actions) ? safe.actions : defaultActions,
    data: {
      url: typeof safe.url === 'string' ? safe.url : '/',
      page: targetPage,
      title: typeof safe.title === 'string' ? safe.title : 'estuda.gov.br · Meta Diária',
      body: typeof safe.body === 'string' ? safe.body : '',
      tag: typeof safe.tag === 'string' ? safe.tag : 'estuda-daily-goal',
      createdAt: Date.now(),
    },
  };
}

// 1. Real Web Push event handler (VAPID / server-triggered push messages)
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : 'estuda.gov.br · Alerta de Meta Diária';

  event.waitUntil(
    self.registration.showNotification(title, buildNotificationOptions(payload)),
  );
});

// 2. Notification click & quick-action buttons handler
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action || '';
  const data = (notification && notification.data) || {};

  notification.close();

  if (action === 'snooze-30m') {
    event.waitUntil(
      (async () => {
        const allClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        const snoozeUntil = Date.now() + 30 * 60 * 1000;
        allClients.forEach((client) => {
          client.postMessage({
            type: 'STUDY_NOTIFICATION_SNOOZED',
            snoozeUntil,
            payload: {
              title: data.title || 'Lembrete adiado · estuda.gov.br',
              body: data.body || 'Hora de retomar suas metas diárias de estudo!',
              page: data.page || 'Página Inicial',
              tag: 'estuda-daily-goal-snooze',
            },
          });
        });
      })(),
    );
    return;
  }

  let targetPage = typeof data.page === 'string' ? data.page : 'Página Inicial';
  if (action === 'open-training') {
    targetPage = 'Treino Diário';
  } else if (action === 'open-schedule') {
    targetPage = 'Cronograma';
  } else if (action === 'open-errors') {
    targetPage = 'Caderno de Erros';
  }

  const targetUrl = typeof data.url === 'string' && data.url ? data.url : '/';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'STUDY_NOTIFICATION_NAVIGATE',
            page: targetPage,
          });
          return;
        }
      }

      if (self.clients && typeof self.clients.openWindow === 'function') {
        const opened = await self.clients.openWindow(targetUrl);
        if (opened) {
          setTimeout(() => {
            opened.postMessage({
              type: 'STUDY_NOTIFICATION_NAVIGATE',
              page: targetPage,
            });
          }, 800);
        }
      }
    })(),
  );
});

// 3. Client-to-SW message bridge for showing persistent SW notifications
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'SKIP_WAITING' && typeof self.skipWaiting === 'function') {
    self.skipWaiting();
    return;
  }

  if (msg.type === 'SHOW_STUDY_NOTIFICATION' && msg.payload) {
    const title =
      typeof msg.payload.title === 'string' && msg.payload.title.trim()
        ? msg.payload.title.trim()
        : 'estuda.gov.br · Alerta de Meta Diária';
    event.waitUntil(
      self.registration.showNotification(title, buildNotificationOptions(msg.payload)),
    );
  }
});
