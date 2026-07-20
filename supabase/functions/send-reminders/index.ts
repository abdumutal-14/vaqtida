// Vaqtida — "send-reminders" Edge Function (Deno)
// pg_cron har daqiqada chaqiradi. Doza vaqti kelgan bemorlarga Web Push yuboradi.
// Faqat owner=null (bemorga ochiq) qatorlar bilan ishlaydi → anon/publishable kalit yetarli.
import webpush from 'npm:web-push@3.6.7';
import { localWall, dueDoses, addDays, missed3Count } from './reminders.js';

// Ilova faqat O'zbekiston uchun mo'ljallangan — DST yo'q, doim UTC+5.
// Shifokor push obunasida o'z tzOffsetMin'i bor, lekin bemorning o'zi push
// yoqmagan bo'lishi ham mumkin (xavfli holat aniqlash buni talab qilmaydi),
// shu bois shifokor ogohlantirishlari uchun sobit qiymat ishlatamiz.
const TASHKENT_TZ_MIN = -300;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SB_PUBLISHABLE_KEY')!;
const SERVICE_ROLE = Deno.env.get('SB_SERVICE_ROLE_KEY') || '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@vaqtida.app';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Bu funksiya faqat "x-cron-secret" to'g'ri kelsagina bajariladi (ishonchli,
// serverlararo chaqiruv) — shu bois service-role kalit bilan ishlaymiz. Bu
// ham bemorga ochiq (owner=null), ham shifokorga xos (owner=uid, masalan
// "patients:{doctorId}", "push:doctor:{doctorId}") yozuvlarni o'qish/yozish
// imkonini beradi, RLS'ni chetlab o'tib.
const SR = SERVICE_ROLE ? { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } : { apikey: ANON, Authorization: `Bearer ${ANON}` };
const H = { ...SR, 'Content-Type': 'application/json' };
const rest = (p: string) => `${SUPABASE_URL}/rest/v1/${p}`;

async function kvGet(key: string) {
  const r = await fetch(rest(`kv_store?key=eq.${encodeURIComponent(key)}&select=value`), { headers: H });
  const rows = await r.json();
  return rows[0]?.value ?? null;
}
async function kvSet(key: string, value: unknown, owner: string | null = null) {
  await fetch(rest('kv_store'), {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value, owner }),
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
    if (code.startsWith('doctor:')) continue; // shifokor obunasi — pastda alohida ishlanadi
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

  // Shifokorlarga "diqqat talab qiladi" ogohlantirishi: bemor so'nggi 3 kunda
  // 3+ dozani o'tkazib yuborgan bo'lsa, unga bog'liq HAMMA shifokorga (bemor
  // bir nechta shifokorga ulangan bo'lishi mumkin) push yuboriladi — kunda
  // faqat bir marta (doctoralert:{code}:{date} orqali takrorlanmaydi).
  let doctorAlerts = 0;
  const doctorPushRows = await kvList('push:doctor:');
  if (doctorPushRows.length > 0) {
    const patientListRows = await kvList('patients:');
    const codeToDoctors = new Map<string, Set<string>>();
    for (const row of patientListRows) {
      const doctorId = row.key.slice('patients:'.length);
      const list = Array.isArray(row.value) ? row.value : [];
      for (const p of list) {
        if (!p?.code) continue;
        if (!codeToDoctors.has(p.code)) codeToDoctors.set(p.code, new Set());
        codeToDoctors.get(p.code)!.add(doctorId);
      }
    }

    const { date: todayDate, minutes: nowMinutes } = localWall(nowMs, TASHKENT_TZ_MIN);

    for (const [code, doctorIds] of codeToDoctors) {
      const alreadyAlerted = await kvGet(`doctoralert:${code}:${todayDate}`);
      if (alreadyAlerted) continue;

      const rx = (await kvGet(`rx:${code}`)) || { medicines: [] };
      const days = [todayDate, addDays(todayDate, -1), addDays(todayDate, -2)];
      const logsByDate: Record<string, string[]> = {};
      for (const d of days) logsByDate[d] = (await kvGet(`log:${code}:${d}`)) || [];
      const missed = missed3Count(rx, logsByDate, todayDate, nowMinutes);
      if (missed < 3) continue;

      const patient = await kvGet(`patient:${code}`);
      const payload = JSON.stringify({
        title: 'Vaqtida — diqqat talab qiladi',
        body: `${patient?.name || 'Bemor'}: so'nggi 3 kunda ${missed} ta doza o'tkazib yuborilgan.`,
        url: '/',
        tag: `vaqtida-danger-${code}`,
      });

      for (const doctorId of doctorIds) {
        const subs: any[] = (await kvGet(`push:doctor:${doctorId}`)) || [];
        if (subs.length === 0) continue;
        const alive: any[] = [];
        for (const s of subs) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
            doctorAlerts++;
            alive.push(s);
          } catch (e: any) {
            const code2 = e?.statusCode;
            if (code2 !== 404 && code2 !== 410) alive.push(s);
          }
        }
        if (alive.length !== subs.length) await kvSet(`push:doctor:${doctorId}`, alive, doctorId);
      }
      await kvSet(`doctoralert:${code}:${todayDate}`, true);
    }
  }

  return new Response(JSON.stringify({ ok: true, patients, sent, pruned, doctorAlerts, at: new Date(nowMs).toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
