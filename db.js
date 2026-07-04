import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------------------------
   Ma'lumot qatlami — "store" (get/set, shared) + "auth"
   - shared: true  → Supabase (bulut), sozlangan bo'lsa; aks holda localStorage.
   - shared: false → doim localStorage (qurilmaga xos, masalan "settings").

   Egalik (RLS):
   - "patients:{uid}" va "templates:{uid}" kalitlari shifokorga xos → owner=uid.
   - Boshqa shared kalitlar (patient:, rx:, log:) → owner=null (bemorga kod orqali ochiq).
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
const OWNED_PREFIXES = ['patients:', 'templates:'];
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

  /* Real-time (ixtiyoriy). Backend yo'q bo'lsa — no-op. */
  subscribe(onChange) {
    if (!sb) return () => {};
    const ch = sb
      .channel('kv_store_changes')
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
