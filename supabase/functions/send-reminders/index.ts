// Vaqtida — "send-reminders" Edge Function (Deno)
// pg_cron har daqiqada chaqiradi. Doza vaqti kelgan bemorlarga Web Push yuboradi.
// Faqat owner=null (bemorga ochiq) qatorlar bilan ishlaydi → anon/publishable kalit yetarli.
import webpush from 'npm:web-push@3.6.7';
import { localWall, dueDoses } from './reminders.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SB_PUBLISHABLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@vaqtida.app';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
const rest = (p: string) => `${SUPABASE_URL}/rest/v1/${p}`;

async function kvGet(key: string) {
  const r = await fetch(rest(`kv_store?key=eq.${encodeURIComponent(key)}&select=value`), { headers: H });
  const rows = await r.json();
  return rows[0]?.value ?? null;
}
async function kvSet(key: string, value: unknown) {
  await fetch(rest('kv_store'), {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value, owner: null }),
  });
}
async function kvList(prefix: string) {
  const r = await fetch(rest(`kv_store?key=like.${encodeURIComponent(prefix + '%')}&select=key,value`), { headers: H });
  return (await r.json()) as { key: string; value: any }[];
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }

  const nowMs = Date.now();
  const subRows = await kvList('push:');
  let sent = 0, pruned = 0, patients = 0;

  for (const row of subRows) {
    const code = row.key.slice('push:'.length);
    const subs: any[] = Array.isArray(row.value) ? row.value : [];
    if (subs.length === 0) continue;

    const tz = Number(subs[0].tzOffsetMin || 0);
    const { date, minutes } = localWall(nowMs, tz);

    const rx = (await kvGet(`rx:${code}`)) || { medicines: [] };
    const log = (await kvGet(`log:${code}:${date}`)) || [];
    const pushed = (await kvGet(`pushlog:${code}:${date}`)) || [];

    const due = dueDoses(rx, log, pushed, date, minutes);
    if (due.length === 0) continue;
    patients++;

    const payload = JSON.stringify({
      title: 'Vaqtida — dori vaqti',
      body: due.map((d: any) => `${d.name}${d.dosage ? ' — ' + d.dosage : ''} (${d.time})`).join('\n'),
      url: '/',
      tag: `vaqtida-${code}-${date}`,
    });

    const alive: any[] = [];
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
        sent++;
        alive.push(s);
      } catch (e: any) {
        const code2 = e?.statusCode;
        if (code2 === 404 || code2 === 410) { pruned++; /* eskirgan — tashlab yuboramiz */ }
        else alive.push(s); // vaqtinchalik xato — obunani saqlaymiz
      }
    }

    // Takror yubormaslik: bugun push yuborilgan dozalarni belgilaymiz
    await kvSet(`pushlog:${code}:${date}`, Array.from(new Set([...pushed, ...due.map((d: any) => d.key)])));
    // Eskirgan obunalarni tozalaymiz
    if (alive.length !== subs.length) await kvSet(`push:${code}`, alive);
  }

  return new Response(JSON.stringify({ ok: true, patients, sent, pruned, at: new Date(nowMs).toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
