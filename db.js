import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------------------------
   Ma'lumot qatlami — "store" (get/set, shared) + "auth"
   - shared: true  → Supabase (bulut), sozlangan bo'lsa; aks holda localStorage.
   - shared: false → doim localStorage (qurilmaga xos, masalan "settings").

   Egalik (RLS):
   - "patients:{uid}", "templates:{uid}", "doctor:{uid}" kalitlari shifokorga
     xos → owner=uid (faqat o'zi o'qiydi/yozadi).
   - Boshqa shared kalitlar (patient:, rx:, log:, audit:, push:) → owner=null
     (bemorga/dorixonaga kod orqali ochiq, autentifikatsiyasiz o'qiladi).
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
const OWNED_PREFIXES = ['patients:', 'templates:', 'doctor:'];
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
    localStorage.setItem((shared ? 's::' : 'p::') + key, JSON.stringify(value));
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

/* Faqat admin: litsenziya tekshirilgach shifokor hisobini yaratadi.
   Server (Edge Function) "x-admin-secret" ni o'zi tekshiradi — mijozda
   hech qanday maxfiy kalit saqlanmaydi. */
export async function adminCreateDoctor(adminSecret, { email, password, fullName, licenseNumber }) {
  const res = await fetch(`${URL}/functions/v1/admin-create-doctor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
    body: JSON.stringify({ email, password, fullName, licenseNumber }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Hisob yaratib bo'lmadi.");
  return data;
}
