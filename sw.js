Content is user-generated and unverified.
// ============================================================
// FermaPro Service Worker – Sistem Notificări Unificat
// Versiune: 3.0 – fără VAPID, funcționează cu ecranul blocat
// pe Android Chrome când aplicația e instalată ca PWA
// ============================================================

const SW_VERSION = '3.0';
const CACHE_NAME = 'ferma-pro-v3';

// ── Instalare ──
self.addEventListener('install', event => {
  console.log('[SW] Instalat versiunea', SW_VERSION);
  self.skipWaiting();
});

// ── Activare ──
self.addEventListener('activate', event => {
  console.log('[SW] Activat versiunea', SW_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Stocaj intern pentru timere programate ──
const _timere = new Map(); // tag -> timeoutId

// ── Gestionare mesaje de la aplicație (index.html) ──
self.addEventListener('message', event => {
  const { tip, titlu, body, tag, icon, msDelay } = event.data || {};

  if (tip === 'ARATA_NOTIFICARE') {
    // Afișează imediat
    afiseazaNotificare({ titlu, body, tag, icon });
    return;
  }

  if (tip === 'PROGRAMEAZA_NOTIFICARE') {
    // Programează cu delay
    const delay = msDelay || 0;
    if (delay <= 0) {
      afiseazaNotificare({ titlu, body, tag, icon });
      return;
    }
    // Anulează orice timer anterior cu același tag
    if (_timere.has(tag)) {
      clearTimeout(_timere.get(tag));
    }
    const tid = setTimeout(() => {
      afiseazaNotificare({ titlu, body, tag, icon });
      _timere.delete(tag);
    }, delay);
    _timere.set(tag, tid);
    console.log(`[SW] Notificare programată: "${titlu}" peste ${Math.round(delay/60000)} min`);
    return;
  }

  if (tip === 'ANULEAZA_NOTIFICARE') {
    if (tag && _timere.has(tag)) {
      clearTimeout(_timere.get(tag));
      _timere.delete(tag);
    }
    return;
  }
});

// ── Afișează o notificare în bara sistemului ──
function afiseazaNotificare({ titlu, body, tag, icon }) {
  const optiuni = {
    body: body || '',
    tag: tag || 'ferma-notif',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    silent: false,
    requireInteraction: false,
    data: { tag, url: '/' },
    // Vibrație: 200ms pornit, 100ms oprit, 200ms pornit
    vibrate: [200, 100, 200],
    actions: [
      { action: 'deschide', title: '📋 Deschide aplicația' },
      { action: 'ok', title: '✓ OK' }
    ]
  };

  return self.registration.showNotification(titlu || 'FermaPro', optiuni)
    .then(() => console.log('[SW] Notificare afișată:', titlu))
    .catch(err => console.error('[SW] Eroare afișare notificare:', err));
}

// ── Click pe notificare ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action = event.action;
  if (action === 'ok') return; // Utilizatorul a apăsat OK, nu face nimic

  // Deschide sau focusează aplicația
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Dacă aplicația e deja deschisă, focusează
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.postMessage({ tip: 'NOTIFICARE_CLICK', tag: event.notification.tag });
            return;
          }
        }
        // Altfel, deschide o nouă fereastră
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});

// ── Închidere notificare (fără click) ──
self.addEventListener('notificationclose', event => {
  console.log('[SW] Notificare închisă fără click:', event.notification.tag);
});

// ── Fetch (necesar pentru PWA) ──
self.addEventListener('fetch', event => {
  // Lăsăm toate cererile să meargă la rețea
  event.respondWith(fetch(event.request).catch(() => {
    // Dacă e offline și e o cerere de navigare, returnăm pagina din cache
    if (event.request.mode === 'navigate') {
      return caches.match('/') || Response.error();
    }
    return Response.error();
  }));
});
