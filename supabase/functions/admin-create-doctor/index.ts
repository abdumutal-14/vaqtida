// Vaqtida — "admin-create-doctor" Edge Function (Deno)
// Ochiq ro'yxatdan o'tish yo'q: faqat admin (dastur egasi) litsenziyani qo'lda
// tekshirib bo'lgach, shifokor uchun hisob yaratadi. Service-role kalit bilan
// ishlaydi — bu funksiya faqat "x-admin-secret" to'g'ri kelsagina bajariladi.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SB_SERVICE_ROLE_KEY')!;
const ADMIN_SECRET = Deno.env.get('ADMIN_SECRET') || '';

const adminH = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  'Content-Type': 'application/json',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!ADMIN_SECRET || req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return json({ error: "Admin kodi noto'g'ri." }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Noto'g'ri so'rov." }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const fullName = String(body.fullName || '').trim();
  const licenseNumber = String(body.licenseNumber || '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "To'g'ri email kiriting." }, 400);
  if (password.length < 6) return json({ error: 'Parol kamida 6 belgi.' }, 400);
  if (!fullName) return json({ error: 'F.I.Sh. kiriting.' }, 400);
  if (!licenseNumber) return json({ error: 'Litsenziya raqamini kiriting.' }, 400);

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    const msg = String(created?.msg || created?.message || '');
    if (/already been registered|already exists/i.test(msg)) {
      return json({ error: "Bu email allaqachon ro'yxatdan o'tgan." }, 409);
    }
    return json({ error: msg || "Hisob yaratib bo'lmadi." }, 500);
  }

  const uid = created.id;
  const profile = { uid, email, fullName, licenseNumber, createdAt: Date.now(), createdByAdmin: true };
  const kvRes = await fetch(`${SUPABASE_URL}/rest/v1/kv_store`, {
    method: 'POST',
    headers: { ...adminH, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: `doctor:${uid}`, value: profile, owner: uid }),
  });
  if (!kvRes.ok) {
    return json({ error: "Hisob yaratildi, lekin profil saqlanmadi. Qaytadan urinib ko'ring." }, 500);
  }

  return json({ ok: true, uid, email, fullName, licenseNumber });
});
