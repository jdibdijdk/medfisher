// Função agendada do Netlify: a cada 5 minutos envia os avisos que venceram para os aparelhos cadastrados.
// Sem dependências externas (usa apenas fetch e node:crypto).
import { createPrivateKey, sign } from 'node:crypto';

const PROJECT = process.env.FB_PROJECT || 'site-pessoal-b4b19';
const API_KEY = process.env.FB_API_KEY || 'AIzaSyBU4owCJwloUlcfTP-cOeHjEo5hyzMH2tU';
const FB_KEY = process.env.FB_KEY || 'hRM2z3YEF6yPtTwKQyFMIAQs551d6Jwh';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || 'BJtVT5ExeKLoPBxb_mq8wY6YBCpLKJeyo1BlvviTAfXzmy1X2RwK-DBTtwgGYvmTzjK14vat8R0Z5KjIqSku-oI';
const VAPID_D = process.env.VAPID_PRIVATE || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:luiswgustavo15@gmail.com';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/rotina/';
const WINDOW_MS = 3 * 3600 * 1000; // avisos mais velhos que isso são descartados

const b64 = (b) => Buffer.from(b).toString('base64url');
function vapidHeader(endpoint) {
  const pub = Buffer.from(VAPID_PUBLIC, 'base64url');
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64(pub.subarray(1, 33)), y: b64(pub.subarray(33, 65)), d: VAPID_D }, format: 'jwk' });
  const head = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const sig = sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64(sig) + ', k=' + VAPID_PUBLIC;
}
const docUrl = (name, extra = '') => BASE + FB_KEY + '_' + name + '?key=' + API_KEY + extra;
async function getDoc(name) {
  const r = await fetch(docUrl(name));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Firestore ' + r.status);
  return r.json();
}
const str = (d, f) => (d && d.fields && d.fields[f] && d.fields[f].stringValue) || '';
async function patch(name, fields) {
  const mask = Object.keys(fields).map((f) => '&updateMask.fieldPaths=' + f).join('');
  const r = await fetch(docUrl(name, mask), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])) }) });
  if (!r.ok) throw new Error('Firestore PATCH ' + r.status);
}

export async function run(now = Date.now()) {
  const log = [];
  if (!VAPID_D) { log.push('VAPID_PRIVATE não configurada'); return log; }
  const idx = await getDoc('pushidx');
  const ids = JSON.parse(str(idx, 'ids') || '[]');
  for (const id of ids) {
    try {
      const name = 'push_' + id, d = await getDoc(name);
      if (!d) continue;
      const cfg = JSON.parse(str(d, 'json') || '{}'), sent = JSON.parse(str(d, 'sent') || '{}');
      const pend = JSON.parse(str(d, 'pending') || '[]');
      Object.keys(sent).forEach((k) => { if (now - sent[k] > 4 * 864e5) delete sent[k]; });
      const due = (cfg.items || []).filter((it) => it.a <= now && now - it.a <= WINDOW_MS && !sent[it.k]);
      if (!due.length) continue;
      due.forEach((it) => { sent[it.k] = now; pend.push({ k: it.k, t: it.t, b: it.b }); });
      await patch(name, { pending: JSON.stringify(pend.slice(-30)), sent: JSON.stringify(sent) });
      const r = await fetch(cfg.sub.endpoint, { method: 'POST', headers: { Authorization: vapidHeader(cfg.sub.endpoint), TTL: '3600', Urgency: 'high', 'Content-Length': '0' } });
      log.push(id + ': ' + due.length + ' aviso(s), HTTP ' + r.status);
      if (r.status === 404 || r.status === 410) { await patch(name, { json: JSON.stringify({ items: [], sub: cfg.sub }) }); }
    } catch (e) { log.push(id + ': ' + e.message); }
  }
  return log;
}
export default async () => { const log = await run(); console.log(log.join('\n') || 'Nada a enviar.'); return new Response(log.join('\n') || 'ok'); };
export const config = { schedule: '*/5 * * * *' };
