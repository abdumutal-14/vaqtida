import { store } from './db.js';

/* -------------------------------------------------------------------------
   Web Push obunasi. 1-bosqich: obunani yaratib Supabase'ga saqlaymiz.
   2-bosqichda server (Edge Function + pg_cron) shu obunalarga push yuboradi.
   Obunalar: push:{code} (shared, owner=null) → [{endpoint, keys, tzOffsetMin}]
   ------------------------------------------------------------------------- */
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export const pushSupported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  Boolean(VAPID_PUBLIC);

function urlB64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/* Joriy qurilma allaqachon obuna bo'lganmi? */
export async function getPushState() {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch (e) {
    return false;
  }
}

/* Obuna bo'lish + Supabase'ga saqlash. Muvaffaqiyatda entry qaytadi. */
export async function subscribeToPush(code) {
  if (!pushSupported()) throw new Error('Push qo\'llab-quvvatlanmaydi');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const json = sub.toJSON();
  const entry = { endpoint: json.endpoint, keys: json.keys, tzOffsetMin: new Date().getTimezoneOffset() };
  const list = (await store.get(`push:${code}`, true)) || [];
  const next = [...list.filter((e) => e.endpoint !== entry.endpoint), entry];
  await store.set(`push:${code}`, next, true);
  return entry;
}
