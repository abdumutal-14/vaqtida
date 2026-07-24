import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------------------------
   Ma'lumot qatlami — "store" (get/set, shared) + "auth"
   - shared: true  → Supabase (bulut), sozlangan bo'lsa; aks holda localStorage.
   - shared: false → doim localStorage (qurilmaga xos, masalan "settings").

   Egalik (RLS):
   - "patients:{uid}", "templates:{uid}", "doctor:{uid}", "push:doctor:{uid}"
     kalitlari shifokorga xos → owner=uid (faqat o'zi yozadi — boshqa
     shifokor yoki anon foydalanuvchi ustidan yozib yubora olmaydi).
   - Boshqa shared kalitlar (patient:, rx:, log:, audit:, push:{code}) →
     owner=null (bemorga/dorixonaga kod orqali ochiq, autentifikatsiyasiz
     o'qiladi).
   ------------------------------------------------------------------------- */
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasBackend = Boolean(URL && KEY);
const sb = hasBackend ? createClient(URL, KEY) : null;
const TABLE = 'kv_store';

/* Joriy autentifikatsiyalangan foydalanuvchi (shifokor) — owner uchun */
let currentUser = null;
if (sb) {
  sb.auth.getSession().then(({ data }) => { currentUser = data.session?.user || null; });
  sb.auth.onAuthStateChange((_e, session) => { currentUser = session?.user || null; });
}

/* Kalit shifokorga xosmi (owner=uid) yoki bemorga ochiqmi (owner=null)? */
const OWNED_PREFIXES = ['patients:', 'templates:', 'doctor:', 'push:doctor:'];
const isOwned = (key) => OWNED_PREFIXES.some((p) => key.startsWith(p));

export const store = {
  async get(key, shared) {
    if (shared && sb) {
      const { data, error } = await sb.from(TABLE).select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      return data ? data.value : null;
    }
    const raw = localStorage.getItem((shared ? 's::' : 'p::') + key);
    return raw ? JSON.parse(raw) : null;
  },

  async set(key, value, shared) {
    if (shared && sb) {
      if (value === null || value === undefined) {
        const { error } = await sb.from(TABLE).delete().eq('key', key);
        if (error) throw error;
        return;
      }
      const owner = isOwned(key) ? (currentUser?.id || null) : null;
      const { error } = await sb.from(TABLE).upsert({ key, value, owner }, { onConflict: 'key' });
      if (error) throw error;
      return;
    }
    const storageKey = (shared ? 's::' : 'p::') + key;
    if (value === null || value === undefined) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(value));
  },

  /* Kalit prefiksiga mos HAMMA yozuvlarni o'chiradi (masalan "log:{code}:").
     Bemor o'chirilganda barcha kunlik jurnallarni tozalash uchun kerak. */
  async removePrefixed(prefix) {
    if (sb) {
      const { error } = await sb.from(TABLE).delete().like('key', `${prefix}%`);
      if (error) throw error;
      return;
    }
    const full = 's::' + prefix;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(full)) localStorage.removeItem(k);
    }
  },

  /* Real-time (ixtiyoriy). Backend yo'q bo'lsa — no-op.
     Har obuna uchun NOYOB kanal nomi — bir nechta komponent bir vaqtda
     obuna bo'lganda (masalan DoctorApp + DoctorPatient) to'qnashmasin. */
  subscribe(onChange) {
    if (!sb) return () => {};
    const name = `kv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ch = sb
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => onChange(payload))
      .subscribe();
    return () => sb.removeChannel(ch);
  },
};

/* ------------------------------- Auth (shifokor) ------------------------------- */
export const auth = {
  available: hasBackend,

  async signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    currentUser = data.user || null;
    // "Confirm email" o'chirilgan bo'lsa session darrov keladi
    return { user: data.user, session: data.session };
  },

  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user || null;
    return data.user;
  },

  async signOut() {
    if (sb) await sb.auth.signOut();
    currentUser = null;
  },

  async getUser() {
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    currentUser = data.user || null;
    return currentUser;
  },

  onChange(cb) {
    if (!sb) return () => {};
    const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session?.user || null));
    return () => data.subscription.unsubscribe();
  },
};

/* -------------------------------------------------------------------------
   Oflayn navbat: internet uzilganda bemorning "doza qabul qilindi" belgisi
   yo'qolib qolmasin. Har bir kalit uchun FAQAT eng oxirgi qiymat saqlanadi
   (localStorage'da) — internet qaytganda avtomatik yuboriladi.
   ------------------------------------------------------------------------- */
const QUEUE_KEY = 'vaqtida_offline_queue';

const readQueue = () => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || {}; } catch (e) { return {}; }
};
const writeQueue = (map) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(map)); } catch (e) { /* joy yo'q bo'lsa ham davom etamiz */ }
};

export const offlineQueue = {
  size() { return Object.keys(readQueue()).length; },

  /* Shared (bulut) yozuvni darrov yuborishga urinadi; muvaffaqiyatsiz
     bo'lsa (masalan oflayn) — navbatga qo'yadi va keyinroq avtomatik
     qayta urinadi. Qaytaradi: true = darrov saqlandi, false = navbatda. */
  async setQueued(key, value) {
    const map = readQueue();
    map[key] = value;
    writeQueue(map);
    try {
      await store.set(key, value, true);
      const after = readQueue();
      delete after[key];
      writeQueue(after);
      return true;
    } catch (e) {
      return false;
    }
  },

  /* Navbatdagi hammasini yuborishga urinadi. Birinchi muvaffaqiyatsizlikda
     to'xtaydi (hali ham oflayn bo'lishi mumkin) — qolganlar soni qaytadi. */
  async flush() {
    const map = readQueue();
    for (const key of Object.keys(map)) {
      try {
        await store.set(key, map[key], true);
        const after = readQueue();
        delete after[key];
        writeQueue(after);
      } catch (e) {
        break;
      }
    }
    return Object.keys(readQueue()).length;
  },
};

/* Faqat admin: shifokor hisoblarini boshqarish (yaratish, ro'yxat, parol
   tiklash, bloklash). Server (Edge Function) "x-admin-secret" ni o'zi
   tekshiradi — mijozda hech qanday maxfiy kalit saqlanmaydi. */
async function adminCall(adminSecret, body) {
  const res = await fetch(`${URL}/functions/v1/admin-create-doctor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Amalni bajarib bo'lmadi.");
  return data;
}

export async function adminCreateDoctor(adminSecret, { email, password, fullName, licenseNumber }) {
  return adminCall(adminSecret, { action: 'create', email, password, fullName, licenseNumber });
}

export async function adminListDoctors(adminSecret) {
  const data = await adminCall(adminSecret, { action: 'list' });
  return data.doctors || [];
}

export async function adminResetDoctorPassword(adminSecret, uid, newPassword) {
  return adminCall(adminSecret, { action: 'reset-password', uid, newPassword });
}

export async function adminSetDoctorBlocked(adminSecret, uid, blocked) {
  return adminCall(adminSecret, { action: 'set-blocked', uid, blocked });
}

/* Yangi xabar yozilganda qarama-qarshi tomonga (push yoqilgan bo'lsa)
   darhol bildirishnoma yuborilishini so'raydi. Bu — qulaylik uchun,
   xabarning o'zi bundan oldin allaqachon saqlangan bo'lishi kerak —
   shu sabab xato bo'lsa ham jimgina o'tkazib yuboriladi. */
export async function notifyNewMessage({ code, from, text, doctorName }) {
  if (!hasBackend) return;
  try {
    await fetch(`${URL}/functions/v1/send-message-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, from, text, doctorName }),
    });
  } catch (e) { /* bildirishnoma yetib bormasa ham xabar saqlangan */ }
}
