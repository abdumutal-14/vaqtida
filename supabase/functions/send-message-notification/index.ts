// Vaqtida — "send-message-notification" Edge Function (Deno)
// Bemor yoki shifokor yangi xabar yozganda DARHOL chaqiriladi (client
// tomonidan, cron emas) — qarama-qarshi tomonning mavjud push obunasiga
// bildirishnoma yuboradi. Faqat owner=null va "push:doctor:{uid}"
// yozuvlarini o'qish/yozish uchun service-role ishlatadi (RLS'ni chetlab
// o'tib) — chunki bemor tomoni autentifikatsiyasiz (anon) ishlaydi.
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SB_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@vaqtida.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const H = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' };
const rest = (p: string) => `${SUPABASE_URL}/rest/v1/${p}`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function kvGet(key: string) {
  const r = await fetch(rest(`kv_store?key=eq.${encodeURIComponent(key)}&select=value`), { headers: H });
  const rows = await r.json();
  return rows[0]?.value ?? null;
}
async function kvSet(key: string, value: unknown, owner: string | null) {
  await fetch(rest('kv_store'), {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value, owner }),
  });
}

const CODE_RE = /^[A-Z0-9]{8}$/;

/* Obunalar ro'yxatiga push yuboradi; eskirganlarini (404/410) tashlab,
   qolganini qaytaradi. */
async function sendToSubs(subs: any[], payload: string) {
  let sent = 0;
  const alive: any[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
      sent++;
      alive.push(s);
    } catch (e: any) {
      const sc = e?.statusCode;
      if (sc !== 404 && sc !== 410) alive.push(s);
    }
  }
  return { sent, alive };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Noto'g'ri so'rov." }, 400);
  }

  const code = String(body.code || '').toUpperCase();
  const from = body.from === 'doctor' ? 'doctor' : body.from === 'patient' ? 'patient' : null;
  const text = String(body.text || '').trim().slice(0, 200);
  if (!CODE_RE.test(code) || !from || !text) return json({ error: "Noto'g'ri parametrlar." }, 400);

  let sent = 0;

  if (from === 'patient') {
    // Bemordan — unga ulangan BARCHA shifokorlarga yuboriladi
    const patient = await kvGet(`patient:${code}`);
    const patientName = patient?.name || 'Bemor';
    const doctorsList = (await kvGet(`doctors:${code}`)) || [];
    const payload = JSON.stringify({
      title: `Vaqtida — ${patientName}dan xabar`,
      body: text,
      url: '/',
      tag: `vaqtida-msg-${code}`,
    });
    for (const d of doctorsList) {
      if (!d?.doctorId) continue;
      const subs: any[] = (await kvGet(`push:doctor:${d.doctorId}`)) || [];
      if (subs.length === 0) continue;
      const { sent: s, alive } = await sendToSubs(subs, payload);
      sent += s;
      if (alive.length !== subs.length) await kvSet(`push:doctor:${d.doctorId}`, alive, d.doctorId);
    }
  } else {
    // Shifokordan — bemorga yuboriladi
    const subs: any[] = (await kvGet(`push:${code}`)) || [];
    if (subs.length > 0) {
      const doctorName = String(body.doctorName || 'Shifokoringiz').slice(0, 80);
      const payload = JSON.stringify({
        title: `Vaqtida — ${doctorName}dan xabar`,
        body: text,
        url: '/',
        tag: `vaqtida-msg-${code}`,
      });
      const { sent: s, alive } = await sendToSubs(subs, payload);
      sent += s;
      if (alive.length !== subs.length) await kvSet(`push:${code}`, alive, null);
    }
  }

  return json({ ok: true, sent });
});
