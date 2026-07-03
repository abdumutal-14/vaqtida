import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------------------------
   Ma'lumot qatlami — "store" (get/set, shared)
   - shared: true  → Supabase (bulut) da saqlanadi, agar sozlangan bo'lsa;
                     aks holda localStorage'ga tushadi.
   - shared: false → doim localStorage (qurilmaga xos, masalan "settings").
   Kalitlar Vite muhit o'zgaruvchilaridan olinadi (.env fayli).
   ------------------------------------------------------------------------- */
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasBackend = Boolean(URL && KEY);
const sb = hasBackend ? createClient(URL, KEY) : null;
const TABLE = 'kv_store';

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
      // null/undefined = o'chirish
      if (value === null || value === undefined) {
        const { error } = await sb.from(TABLE).delete().eq('key', key);
        if (error) throw error;
        return;
      }
      const { error } = await sb.from(TABLE).upsert({ key, value }, { onConflict: 'key' });
      if (error) throw error;
      return;
    }
    localStorage.setItem((shared ? 's::' : 'p::') + key, JSON.stringify(value));
  },

  /* Real-time: shared kalitlar o'zgarsa qayta yuklash uchun (ixtiyoriy).
     unsubscribe funksiyasini qaytaradi. Backend yo'q bo'lsa — no-op. */
  subscribe(onChange) {
    if (!sb) return () => {};
    const ch = sb
      .channel('kv_store_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        onChange(payload);
      })
      .subscribe();
    return () => sb.removeChannel(ch);
  },
};
