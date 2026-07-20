// Vaqtida — "admin-create-doctor" Edge Function (Deno)
// Ochiq ro'yxatdan o'tish yo'q: faqat admin (dastur egasi) shifokor
// hisoblarini boshqaradi — yaratish, ro'yxat, parol tiklash, bloklash.
// Service-role kalit bilan ishlaydi — faqat "x-admin-secret" to'g'ri
// kelsagina bajariladi.
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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Doim bloklaydi deb aytish uchun uzoq (o'nlab yillik) muddat — GoTrue'da
// "abadiy" degan alohida qiymat yo'q, shuning uchun juda uzoq muddat bilan
// simulyatsiya qilinadi. Blokdan chiqarish uchun 'none' beriladi.
const BLOCK_DURATION = '876000h'; // ~100 yil

async function createDoctor(body: any) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const fullName = String(body.fullName || '').trim();
  const licenseNumber = String(body.licenseNumber || '').trim();

  if (!EMAIL_RE.test(email)) return json({ error: "To'g'ri email kiriting." }, 400);
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
}

async function listDoctors() {
  const kvRes = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?key=like.doctor:*&select=key,value`, { headers: adminH });
  const rows = await kvRes.json();
  const profiles = new Map<string, any>();
  for (const row of rows) {
    const uid = row.key.slice('doctor:'.length);
    profiles.set(uid, row.value);
  }

  // GoTrue admin foydalanuvchilar ro'yxati — bloklanganlik holatini olish uchun
  const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminH });
  const usersData = await usersRes.json();
  const users: any[] = Array.isArray(usersData?.users) ? usersData.users : [];

  const doctors = users
    .filter((u) => profiles.has(u.id))
    .map((u) => {
      const p = profiles.get(u.id);
      const bannedUntil = u.banned_until ? new Date(u.banned_until) : null;
      const blocked = bannedUntil ? bannedUntil.getTime() > Date.now() : false;
      return {
        uid: u.id,
        email: u.email,
        fullName: p?.fullName || null,
        licenseNumber: p?.licenseNumber || null,
        createdAt: p?.createdAt || null,
        blocked,
      };
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return json({ ok: true, doctors });
}

async function resetPassword(body: any) {
  const uid = String(body.uid || '');
  const newPassword = String(body.newPassword || '');
  if (!uid) return json({ error: 'uid kerak.' }, 400);
  if (newPassword.length < 6) return json({ error: 'Parol kamida 6 belgi.' }, 400);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: adminH,
    body: JSON.stringify({ password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return json({ error: data?.msg || data?.message || "Parolni tiklab bo'lmadi." }, 500);
  }
  return json({ ok: true });
}

async function setBlocked(body: any) {
  const uid = String(body.uid || '');
  const blocked = Boolean(body.blocked);
  if (!uid) return json({ error: 'uid kerak.' }, 400);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: adminH,
    body: JSON.stringify({ ban_duration: blocked ? BLOCK_DURATION : 'none' }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return json({ error: data?.msg || data?.message || "Holatni o'zgartirib bo'lmadi." }, 500);
  }
  return json({ ok: true, blocked });
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

  const action = String(body.action || 'create');
  switch (action) {
    case 'create': return createDoctor(body);
    case 'list': return listDoctors();
    case 'reset-password': return resetPassword(body);
    case 'set-blocked': return setBlocked(body);
    default: return json({ error: "Noma'lum amal." }, 400);
  }
});
