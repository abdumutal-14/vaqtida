/* Push eslatma mantig'i — sof JS (Deno Edge Function ham, Node testi ham ishlatadi).
   Mijozdagi doza mantig'ining server-tomon nusxasi. */

export const pad = (n) => String(n).padStart(2, '0');

/* UTC "now" va tzOffsetMin (JS getTimezoneOffset: UTC+5 => -300) dan
   foydalanuvchining mahalliy sanasi va daqiqasini hisoblaydi. */
export function localWall(nowMs, tzOffsetMin) {
  const d = new Date(nowMs - tzOffsetMin * 60000);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return { date, minutes };
}

export function addDays(ds, n) {
  const d = new Date(ds + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function medActiveOn(med, ds) {
  if (!med.startDate) return true;
  if (med.startDate > ds) return false;
  if (!med.durationDays) return true;
  const end = addDays(med.startDate, Number(med.durationDays) - 1);
  return ds <= end;
}

export const timeToMin = (hhmm) => parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10);
export const doseKey = (medId, hhmm) => `${medId}__${hhmm}`;

/* Hozir "yuborilishi kerak" bo'lgan dozalar:
   - dori shu mahalliy kunda faol
   - doza vaqti o'tgan, lekin windowMin daqiqadan oshmagan
   - hali qabul qilinmagan (log) va hali push yuborilmagan (pushed)
*/
export function dueDoses(rx, todayLog, pushedToday, localDate, localMinutes, windowMin = 10) {
  const out = [];
  const meds = (rx && rx.medicines) || [];
  for (const m of meds) {
    if (!medActiveOn(m, localDate)) continue;
    for (const t of m.times || []) {
      const key = doseKey(m.id, t);
      const diff = localMinutes - timeToMin(t);
      if (diff >= 0 && diff <= windowMin && !todayLog.includes(key) && !pushedToday.includes(key)) {
        out.push({ key, name: m.name, dosage: m.dosage, time: t });
      }
    }
  }
  return out;
}

/* Bitta dozaning holati — mijozdagi doseStatus() ning server-tomon nusxasi
   (daqiqa aniqligida, soniya emas — bu maqsad uchun yetarli). */
export function doseStatusSrv(ds, hhmm, taken, todayDate, nowMinutes) {
  if (taken) return 'taken';
  if (ds < todayDate) return 'missed';
  if (ds > todayDate) return 'upcoming';
  const diff = nowMinutes - timeToMin(hhmm);
  if (diff < 0) return 'upcoming';
  if (diff <= 60) return 'due';
  return 'missed';
}

/* So'nggi 3 kunda (bugun, kecha, indinga) nechta doza o'tkazib yuborilgan —
   shifokorga "diqqat talab qiladi" ogohlantirishi shu asosida yuboriladi. */
export function missed3Count(rx, logsByDate, todayDate, nowMinutes) {
  const meds = (rx && rx.medicines) || [];
  const days = [todayDate, addDays(todayDate, -1), addDays(todayDate, -2)];
  let missed = 0;
  for (const d of days) {
    const log = logsByDate[d] || [];
    for (const m of meds) {
      if (!medActiveOn(m, d)) continue;
      for (const t of m.times || []) {
        const taken = log.includes(doseKey(m.id, t));
        if (doseStatusSrv(d, t, taken, todayDate, nowMinutes) === 'missed') missed++;
      }
    }
  }
  return missed;
}
