// Service worker da Rotina de Estudos: mostra os avisos enviados pelo servidor (Web Push) e abre o site ao clicar.
const PROJECT = 'site-pessoal-b4b19';
const API_KEY = 'AIzaSyBU4owCJwloUlcfTP-cOeHjEo5hyzMH2tU';
const FB_KEY = 'hRM2z3YEF6yPtTwKQyFMIAQs551d6Jwh';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/rotina/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function sha(text) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

self.addEventListener('push', (e) => e.waitUntil((async () => {
  let shown = 0;
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const url = BASE + FB_KEY + '_push_' + (await sha(sub.endpoint)) + '?key=' + API_KEY;
    const d = await (await fetch(url)).json();
    const pend = JSON.parse((d.fields && d.fields.pending && d.fields.pending.stringValue) || '[]');
    for (const it of pend) { await self.registration.showNotification(it.t, { body: it.b, tag: it.k }); shown++; }
    if (pend.length) {
      await fetch(url + '&updateMask.fieldPaths=pending', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { pending: { stringValue: '[]' } } }) });
    }
  } catch (err) { /* sem rede: cai no aviso genérico */ }
  if (!shown) {
    await self.registration.showNotification('Rotina de Estudos', { body: 'Você tem avisos pendentes.', tag: 'geral' });
  }
})()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => {
    for (const c of l) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
