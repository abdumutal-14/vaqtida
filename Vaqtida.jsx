import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Stethoscope, User, UserPlus, Pill, Bell, BellOff, Check, AlertTriangle,
  Trash2, Pencil, Plus, ArrowLeft, LogOut, Copy, X, ChevronRight, Clock,
  Users, ClipboardList, CalendarClock, Info, ShieldAlert, Files, Lock, Mail, CalendarDays, Phone,
} from 'lucide-react';
import { store, hasBackend, auth } from './db.js';

/* =========================================================================
   "Vaqtida" — dori qabul qilishni nazorat qiluvchi mobil-veb ilova
   Ikki rolli: Shifokor / Bemor. Bitta fayl, inline stillar.

   Kelajakda qo'shish rejalashtirilgan (hozircha kod yozilmagan):
     - Nojo'ya ta'sir (side effect) haqida bemordan shifokorga signal
     - Dori-dori o'zaro ta'sirini ogohlantirish
     - Dori zaxirasi tugash eslatmasi
     - Shifokor-bemor chat/yozishma
     - Tez-tez ishlatiladigan retsept shablonlari
     - Oila a'zosi / kuzatuvchi roli
     - Katta shrift rejimi, rus tili, ovozli eslatma
     - Har bir shifokor uchun alohida parolli hisob
     - Dorixona bilan integratsiya
   ========================================================================= */

/* ------------------------------ Palitra ------------------------------ */
const C = {
  tealDeep: '#1B3038',
  teal: '#23414A',
  paper: '#F5F2EA',
  paperSoft: '#EDE8DA',
  gold: '#E8B84B',
  sage: '#7C9A73',
  red: '#C4574A',
  ink: '#22343A',
  inkSoft: '#5B6B70',
  line: '#DAD3C4',
  white: '#FFFFFF',
};
const SERIF = "'Fraunces', Georgia, serif";
const SANS = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";

/* Ma'lumot qatlami (store) ./db.js dan import qilinadi:
   shared:true → Supabase (bulut) yoki localStorage; shared:false → localStorage. */

/* ------------------------------ Sana yordamchi ------------------------------ */
const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dateStr(new Date());
const addDays = (ds, n) => {
  const d = new Date(ds + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateStr(d);
};
const timeAsDate = (ds, hhmm) => new Date(`${ds}T${hhmm}:00`);
const doseKey = (medId, hhmm) => `${medId}__${hhmm}`;
const gen6 = () => String(Math.floor(100000 + Math.random() * 900000));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const curYear = () => new Date().getFullYear();
const validBirthYear = (y) => { const n = Number(y); return Number.isInteger(n) && n >= 1900 && n <= curYear(); };

/* Dori shu kunda amal qiladimi? (bo'sh durationDays = doimiy) */
const medActiveOn = (med, ds) => {
  if (!med.startDate) return true;
  if (med.startDate > ds) return false;
  if (!med.durationDays) return true;
  const end = addDays(med.startDate, Number(med.durationDays) - 1);
  return ds <= end;
};
const medEndDate = (med) =>
  med.durationDays ? addDays(med.startDate, Number(med.durationDays) - 1) : null;

/* Bitta dozaning holati: taken | upcoming | due | missed */
const doseStatus = (ds, hhmm, taken, now) => {
  if (taken) return 'taken';
  if (ds < todayStr()) return 'missed';
  const t = timeAsDate(ds, hhmm);
  const diff = now.getTime() - t.getTime();
  if (diff < 0) return 'upcoming';
  if (diff <= 60 * 60 * 1000) return 'due';
  return 'missed';
};

/* O'zbekcha sana (muhit lokaliga bog'liq bo'lmasin) */
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const uzDate = (d) => `${UZ_WEEKDAYS[d.getDay()]}, ${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`;

/* ------------------------------ Kichik UI ------------------------------ */
function Btn({ children, onClick, variant = 'primary', style, disabled, type = 'button', full }) {
  const base = {
    fontFamily: SANS,
    fontSize: 16,
    fontWeight: 600,
    border: 'none',
    borderRadius: 12,
    padding: '14px 18px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: full ? '100%' : undefined,
    opacity: disabled ? 0.55 : 1,
    transition: 'transform .05s ease',
  };
  const variants = {
    primary: { background: C.teal, color: C.paper },
    gold: { background: C.gold, color: C.tealDeep },
    sage: { background: C.sage, color: C.white },
    danger: { background: C.red, color: C.white },
    ghost: { background: 'transparent', color: C.teal, border: `1.5px solid ${C.line}` },
    quiet: { background: C.paperSoft, color: C.ink },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 5 }}>{hint}</div>}
    </label>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: SANS,
  fontSize: 16,
  padding: '12px 14px',
  borderRadius: 10,
  border: `1.5px solid ${C.line}`,
  background: C.white,
  color: C.ink,
  outline: 'none',
};

function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.white,
        borderRadius: 16,
        padding: 16,
        border: `1px solid ${C.line}`,
        boxShadow: '0 1px 2px rgba(27,48,56,0.04)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 10px' }}>
      {icon}
      <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: C.tealDeep, margin: 0 }}>{children}</h2>
    </div>
  );
}

/* Banner: type = info | warn | error | success */
function Banner({ type = 'info', title, children, onClose, icon }) {
  const map = {
    info: { bg: '#E9F0F1', bd: '#BFD3D6', fg: C.teal },
    warn: { bg: '#FBF1D6', bd: C.gold, fg: '#7A5A12' },
    error: { bg: '#F7E2DF', bd: C.red, fg: '#7E2F27' },
    success: { bg: '#E7F0E3', bd: C.sage, fg: '#3E5637' },
  };
  const s = map[type];
  return (
    <div
      style={{
        background: s.bg,
        border: `1.5px solid ${s.bd}`,
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 12,
      }}
    >
      <div style={{ color: s.fg, flexShrink: 0, marginTop: 1 }}>{icon}</div>
      <div style={{ flex: 1, fontFamily: SANS, fontSize: 14, color: s.fg, lineHeight: 1.45 }}>
        {title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>}
        {children}
      </div>
      {onClose && (
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.fg, padding: 2 }}>
          <X size={18} />
        </button>
      )}
    </div>
  );
}

/* --------------------------- Kun aylanasi (SVG) --------------------------- */
function DayArc({ doses, now }) {
  const W = 420, R = 150, cx = W / 2, baseY = 172, pad2 = 24;
  const H = baseY + 28;
  const pos = (h) => {
    const ang = Math.PI * (1 - h / 24);
    return { x: cx + R * Math.cos(ang), y: baseY - R * Math.sin(ang) };
  };
  const pts = [];
  for (let h = 0; h <= 24; h += 0.5) pts.push(pos(h));
  const arcPath = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const hNow = now.getHours() + now.getMinutes() / 60;
  const nowP = pos(hNow);
  const colorFor = (st) => (st === 'taken' ? C.sage : st === 'missed' ? C.red : C.gold);
  const ticks = [0, 6, 12, 18, 24];

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block', margin: '0 auto' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="skyArc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2C4E58" />
            <stop offset="100%" stopColor="#1B3038" />
          </linearGradient>
        </defs>
        {/* Ufq chizig'i */}
        <line x1={pad2} y1={baseY} x2={W - pad2} y2={baseY} stroke={C.line} strokeWidth="1.5" />
        {/* Yoy */}
        <path d={arcPath} fill="none" stroke="url(#skyArc)" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        {/* Soat belgilari */}
        {ticks.map((t) => {
          const p = pos(t);
          return (
            <g key={t}>
              <circle cx={p.x} cy={p.y} r="2" fill={C.line} />
              <text x={p.x} y={baseY + 16} fontSize="11" fill={C.inkSoft} textAnchor="middle" fontFamily={SANS}>
                {pad(t === 24 ? 0 : t)}:00
              </text>
            </g>
          );
        })}
        {/* Hozirgi vaqt — oq nuqta */}
        <g>
          <line x1={nowP.x} y1={nowP.y} x2={nowP.x} y2={baseY} stroke={C.gold} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
          <circle cx={nowP.x} cy={nowP.y} r="7" fill={C.white} stroke={C.tealDeep} strokeWidth="2" />
        </g>
        {/* Dozalar */}
        {doses.map((d, i) => {
          const p = pos(d.h);
          const col = colorFor(d.status);
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="11" fill={col} stroke={C.white} strokeWidth="2.5" />
              {d.status === 'taken' && (
                <path
                  d={`M ${p.x - 4} ${p.y} l 2.6 2.8 l 5.2 -5.6`}
                  fill="none"
                  stroke={C.white}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {d.status === 'missed' && (
                <path d={`M ${p.x - 3.5} ${p.y - 3.5} l 7 7 M ${p.x + 3.5} ${p.y - 3.5} l -7 7`} stroke={C.white} strokeWidth="2" strokeLinecap="round" />
              )}
            </g>
          );
        })}
      </svg>
      {/* Izoh (legend) */}
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        {[
          ['Kutilmoqda', C.gold],
          ['Qabul qilindi', C.sage],
          ["O'tkazib yuborildi", C.red],
        ].map(([t, c]) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 12.5, color: C.inkSoft }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: c, display: 'inline-block' }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
   Root App — rol tanlash va marshrutlash
   ========================================================================= */
export default function App() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState({ role: null, code: null });
  const [globalError, setGlobalError] = useState(null);
  const [authUser, setAuthUser] = useState(null);

  const reportError = useCallback((msg) => setGlobalError(msg), []);

  // Auth sessiyasini kuzatish (bulut rejimida)
  useEffect(() => {
    if (!hasBackend) return;
    auth.getUser().then((u) => setAuthUser(u)).catch(() => {});
    const off = auth.onChange((u) => setAuthUser(u));
    return off;
  }, []);

  useEffect(() => {
    // Shriftlarni yuklash (bir marta)
    if (!document.getElementById('vaqtida-fonts')) {
      const l = document.createElement('link');
      l.id = 'vaqtida-fonts';
      l.rel = 'stylesheet';
      l.href =
        'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
      document.head.appendChild(l);
    }
    (async () => {
      try {
        const s = await store.get('settings', false);
        if (s && s.role) setSettings(s);
      } catch (e) {
        reportError("Sozlamalarni o'qishda xatolik yuz berdi. Sahifani yangilab ko'ring.");
      } finally {
        setReady(true);
      }
    })();
  }, [reportError]);

  const persistSettings = async (s) => {
    setSettings(s);
    try {
      await store.set('settings', s, false);
    } catch (e) {
      reportError("Sozlamalarni saqlab bo'lmadi.");
    }
  };

  const logout = () => persistSettings({ role: null, code: null });

  const doctorLogout = async () => {
    try { await auth.signOut(); } catch (e) {}
    setAuthUser(null);
    persistSettings({ role: null, code: null });
  };

  const shell = (content) => (
    <div
      style={{
        minHeight: '100vh',
        background: `radial-gradient(120% 60% at 50% 0%, ${C.teal} 0%, ${C.tealDeep} 70%)`,
        display: 'flex',
        justifyContent: 'center',
        fontFamily: SANS,
      }}
    >
      <div style={{ width: '100%', maxWidth: 480, minHeight: '100vh', background: C.paper, position: 'relative', boxShadow: '0 0 40px rgba(0,0,0,0.25)' }}>
        {globalError && (
          <div style={{ padding: '12px 16px 0' }}>
            <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setGlobalError(null)} title="Xatolik">
              {globalError}
            </Banner>
          </div>
        )}
        {content}
      </div>
    </div>
  );

  if (!ready) {
    return shell(
      <div style={{ padding: 40, textAlign: 'center', color: C.inkSoft, fontFamily: SANS, marginTop: 60 }}>Yuklanmoqda…</div>
    );
  }

  if (!settings.role) return shell(<RoleSelect onPick={(role) => persistSettings({ role, code: null })} />);
  if (settings.role === 'doctor') {
    if (hasBackend && !authUser) return shell(<DoctorAuth onBack={logout} onError={reportError} />);
    const doctorId = authUser?.id || 'local';
    return shell(<DoctorApp doctorId={doctorId} email={authUser?.email} onLogout={doctorLogout} onError={reportError} />);
  }
  if (settings.role === 'patient' && !settings.code)
    return shell(<PatientLogin onLogin={(code) => persistSettings({ role: 'patient', code })} onBack={logout} onError={reportError} />);
  return shell(<PatientApp code={settings.code} onLogout={logout} onError={reportError} />);
}

/* ------------------------------ Rol tanlash ------------------------------ */
function RoleSelect({ onPick }) {
  return (
    <div style={{ padding: '56px 24px 40px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div
          style={{
            width: 72, height: 72, borderRadius: 20, background: C.teal, color: C.gold,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
          }}
        >
          <Pill size={38} />
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 40, color: C.tealDeep, margin: '0 0 6px', fontWeight: 600 }}>Vaqtida</h1>
        <p style={{ fontFamily: SANS, color: C.inkSoft, fontSize: 15.5, margin: 0, lineHeight: 1.5 }}>
          Dorini o'z vaqtida qabul qilishga yordam beruvchi hamroh
        </p>
      </div>

      <p style={{ fontFamily: SANS, fontSize: 15, color: C.ink, textAlign: 'center', marginBottom: 18 }}>Siz kimsiz?</p>

      <div style={{ display: 'grid', gap: 14 }}>
        <Card onClick={() => onPick('doctor')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#E9F0F1', color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Stethoscope size={26} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: 19, color: C.tealDeep, fontWeight: 600 }}>Men shifokorman</div>
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>Bemor qo'shaman va retsept yozaman</div>
          </div>
          <ChevronRight color={C.inkSoft} />
        </Card>

        <Card onClick={() => onPick('patient')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#FBF1D6', color: '#7A5A12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={26} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: 19, color: C.tealDeep, fontWeight: 600 }}>Men bemorman</div>
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>Shifokor bergan kod bilan kiraman</div>
          </div>
          <ChevronRight color={C.inkSoft} />
        </Card>
      </div>

      <div style={{ textAlign: 'center', margin: '16px 0 8px' }}>
        <span
          style={{
            fontFamily: SANS, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 20,
            color: hasBackend ? '#3E5637' : '#7A5A12',
            background: hasBackend ? '#E7F0E3' : '#FBF1D6',
            border: `1px solid ${hasBackend ? C.sage : C.gold}`,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 4, background: hasBackend ? C.sage : C.gold, display: 'inline-block' }} />
          {hasBackend ? "Bulutga ulangan — qurilmalar o'rtasida sinxron" : 'Mahalliy rejim — faqat shu brauzerda'}
        </span>
      </div>

      <Banner type="info" icon={<Info size={18} />}>
        {hasBackend ? (
          <><b>Eslatma:</b> Har shifokor o'z hisobi bilan kiradi va <b>faqat o'z bemorlarini</b> ko'radi. Bemorlar 6 xonali kod bilan kiradi — kodni maxfiy saqlang.</>
        ) : (
          <><b>Eslatma:</b> Bu mahalliy demo — ma'lumot faqat shu brauzerda saqlanadi va autentifikatsiyasiz ishlaydi.</>
        )}
      </Banner>
    </div>
  );
}

/* ------------------------------ Shifokor: kirish/ro'yxat ------------------------------ */
function DoctorAuth({ onBack }) {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);

  const submit = async () => {
    setErr(null);
    setInfo(null);
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setErr('To\'g\'ri email kiriting.');
    if (password.length < 6) return setErr('Parol kamida 6 belgidan iborat bo\'lishi kerak.');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { session } = await auth.signUp(em, password);
        if (!session) {
          // Email tasdiqlash yoqilgan bo'lsa
          setInfo('Hisob yaratildi. Emailingizni tasdiqlab, so\'ng kiring.');
          setMode('login');
        }
        // session bo'lsa — App auth.onChange orqali avtomatik kiradi
      } else {
        await auth.signIn(em, password);
      }
    } catch (e) {
      const m = (e && e.message) || '';
      if (/Invalid login/i.test(m)) setErr('Email yoki parol noto\'g\'ri.');
      else if (/already registered/i.test(m)) setErr('Bu email allaqachon ro\'yxatdan o\'tgan. Kiring.');
      else if (/confirm/i.test(m)) setErr('Email tasdiqlanmagan. Pochtangizni tekshiring.');
      else setErr(m || 'Kirishda xatolik yuz berdi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '40px 24px' }}>
      <button onClick={onBack} style={{ background: C.paperSoft, border: 'none', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink, marginBottom: 24 }}>
        <ArrowLeft size={20} />
      </button>

      <div style={{ width: 60, height: 60, borderRadius: 16, background: '#E9F0F1', color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Stethoscope size={30} />
      </div>
      <h1 style={{ fontFamily: SERIF, fontSize: 28, color: C.tealDeep, margin: '0 0 6px', fontWeight: 600 }}>
        {mode === 'login' ? 'Shifokor hisobiga kirish' : 'Yangi shifokor hisobi'}
      </h1>
      <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: '0 0 22px', lineHeight: 1.5 }}>
        {mode === 'login' ? 'Email va parolingiz bilan kiring.' : 'Email va parol tanlab, hisob oching.'}
      </p>

      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}
      {info && <Banner type="success" icon={<Check size={18} />} onClose={() => setInfo(null)}>{info}</Banner>}

      <Field label="Email">
        <div style={{ position: 'relative' }}>
          <Mail size={18} style={{ position: 'absolute', left: 12, top: 14, color: C.inkSoft }} />
          <input
            style={{ ...inputStyle, paddingLeft: 40 }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="shifokor@email.com"
            autoComplete="email"
          />
        </div>
      </Field>
      <Field label="Parol">
        <div style={{ position: 'relative' }}>
          <Lock size={18} style={{ position: 'absolute', left: 12, top: 14, color: C.inkSoft }} />
          <input
            style={{ ...inputStyle, paddingLeft: 40 }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Kamida 6 belgi"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
      </Field>

      <Btn variant="primary" full onClick={submit} disabled={busy} style={{ marginTop: 4 }}>
        {busy ? 'Kutilmoqda…' : mode === 'login' ? 'Kirish' : 'Hisob ochish'}
      </Btn>

      <div style={{ textAlign: 'center', marginTop: 16, fontFamily: SANS, fontSize: 14, color: C.inkSoft }}>
        {mode === 'login' ? "Hisobingiz yo'qmi? " : 'Hisobingiz bormi? '}
        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(null); setInfo(null); }}
          style={{ background: 'none', border: 'none', color: C.teal, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, fontSize: 14 }}
        >
          {mode === 'login' ? 'Hisob oching' : 'Kiring'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------ Sarlavha (header) ------------------------ */
function TopBar({ title, subtitle, onBack, right }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, background: C.paper, padding: '16px 16px 12px', borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: C.paperSoft, border: 'none', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink }}>
            <ArrowLeft size={20} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, color: C.tealDeep, fontWeight: 600, lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

/* =========================================================================
   SHIFOKOR
   ========================================================================= */
function DoctorApp({ doctorId, email, onLogout, onError }) {
  const [patients, setPatients] = useState([]);
  const [view, setView] = useState('list'); // list | patient
  const [selected, setSelected] = useState(null); // code
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // real-time qayta hisoblash uchun
  const patientsRef = useRef([]);
  useEffect(() => { patientsRef.current = patients; }, [patients]);

  const loadPatients = useCallback(async () => {
    try {
      const list = (await store.get(`patients:${doctorId}`, true)) || [];
      setPatients(list);
    } catch (e) {
      onError("Bemorlar ro'yxatini yuklab bo'lmadi.");
    } finally {
      setLoading(false);
    }
  }, [doctorId, onError]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Real-time: bemor doza belgilasa yoki ro'yxat o'zgarsa jonli yangilanadi
  useEffect(() => {
    const off = store.subscribe((payload) => {
      const key = payload?.new?.key || payload?.old?.key;
      if (!key) return;
      if (key === `patients:${doctorId}`) { loadPatients(); return; }
      const m = key.match(/^(?:log|rx|patient):(\d{6})/);
      if (m && patientsRef.current.some((p) => p.code === m[1])) setTick((t) => t + 1);
    });
    return off;
  }, [doctorId, loadPatients]);

  if (view === 'patient' && selected) {
    return (
      <DoctorPatient
        doctorId={doctorId}
        code={selected}
        onBack={() => {
          setView('list');
          setSelected(null);
          loadPatients();
        }}
        onError={onError}
        onDeletedPatient={() => {
          setView('list');
          setSelected(null);
          loadPatients();
        }}
      />
    );
  }

  return (
    <div>
      <TopBar
        title="Shifokor paneli"
        subtitle={email || 'Bemorlar va retseptlar'}
        right={
          <Btn variant="quiet" onClick={onLogout} style={{ padding: '10px 12px', fontSize: 14 }}>
            <LogOut size={16} /> Chiqish
          </Btn>
        }
      />
      <div style={{ padding: 16 }}>
        <DoctorAddPatient doctorId={doctorId} onAdded={loadPatients} onError={onError} />

        <SectionTitle icon={<Users size={18} color={C.teal} />}>Bemorlar ({patients.length})</SectionTitle>

        {loading ? (
          <div style={{ color: C.inkSoft, padding: 20, textAlign: 'center' }}>Yuklanmoqda…</div>
        ) : patients.length === 0 ? (
          <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 26 }}>Hozircha bemor yo'q. Yuqoridan yangi bemor qo'shing.</Card>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {patients
              .slice()
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
              .map((p) => (
                <PatientRow key={p.code} patient={p} tick={tick} onOpen={() => { setSelected(p.code); setView('patient'); }} onError={onError} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Yangi bemor qo'shish */
function DoctorAddPatient({ doctorId, onAdded, onError }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [newCode, setNewCode] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !diagnosis.trim()) {
      onError('Ism va tashxisni to\'ldiring.');
      return;
    }
    if (birthYear && !validBirthYear(birthYear)) {
      onError(`Tug'ilgan yil 1900–${curYear()} oralig'ida bo'lsin (yoki bo'sh qoldiring).`);
      return;
    }
    setSaving(true);
    try {
      const existing = (await store.get(`patients:${doctorId}`, true)) || [];
      let code = gen6();
      let guard = 0;
      while (existing.some((p) => p.code === code) && guard < 50) {
        code = gen6();
        guard++;
      }
      const rec = { code, name: name.trim(), diagnosis: diagnosis.trim(), phone: phone.trim(), birthYear: birthYear ? Number(birthYear) : null, createdAt: Date.now() };
      await store.set(`patient:${code}`, rec, true);
      await store.set(`rx:${code}`, { medicines: [] }, true);
      await store.set(`patients:${doctorId}`, [...existing, rec], true);
      setNewCode(code);
      setName('');
      setDiagnosis('');
      setPhone('');
      setBirthYear('');
      onAdded();
    } catch (e) {
      onError("Bemorni saqlab bo'lmadi. Qaytadan urinib ko'ring.");
    } finally {
      setSaving(false);
    }
  };

  if (newCode) {
    return (
      <Card style={{ background: C.teal, border: 'none', color: C.paper }}>
        <div style={{ fontFamily: SANS, fontSize: 14, opacity: 0.85 }}>Bemor qo'shildi. Ushbu kodni bemorga bering:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 6px' }}>
          <div style={{ fontFamily: SERIF, fontSize: 40, letterSpacing: 6, fontWeight: 700, color: C.gold }}>{newCode}</div>
          <Btn
            variant="gold"
            onClick={() => {
              try { navigator.clipboard.writeText(newCode); } catch (e) {}
            }}
            style={{ padding: '10px 12px' }}
          >
            <Copy size={16} /> Nusxa
          </Btn>
        </div>
        <Btn variant="quiet" full onClick={() => setNewCode(null)} style={{ marginTop: 8 }}>
          Yaxshi, yopish
        </Btn>
      </Card>
    );
  }

  return (
    <Card>
      {!open ? (
        <Btn variant="primary" full onClick={() => setOpen(true)}>
          <UserPlus size={18} /> Yangi bemor qo'shish
        </Btn>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: C.tealDeep, fontWeight: 600 }}>Yangi bemor</div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft }}>
              <X size={20} />
            </button>
          </div>
          <Field label="Bemor ismi">
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Karimova Dilnoza" />
          </Field>
          <Field label="Tashxis">
            <input style={inputStyle} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Masalan: Gipertoniya II daraja" />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1.4 }}>
              <Field label="Telefon" hint="Ixtiyoriy">
                <input style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Tug'ilgan yil" hint="Ixtiyoriy">
                <input style={inputStyle} value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="1985" inputMode="numeric" />
              </Field>
            </div>
          </div>
          <Btn variant="gold" full onClick={submit} disabled={saving}>
            {saving ? 'Saqlanmoqda…' : 'Qo\'shish va kod olish'}
          </Btn>
        </div>
      )}
    </Card>
  );
}

/* Bemor qatori — statistika va ogohlantirish belgisi bilan */
function PatientRow({ patient, tick, onOpen, onError }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await computeStats(patient.code);
        if (!cancelled) setStats(s);
      } catch (e) {
        onError("Statistikani hisoblab bo'lmadi.");
      }
    })();
    return () => { cancelled = true; };
  }, [patient.code, tick, onError]);

  const danger = stats && stats.missed3 >= 3;

  return (
    <Card onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${danger ? C.red : C.line}` }}>
      <div
        style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          background: danger ? '#F7E2DF' : '#E9F0F1', color: danger ? C.red : C.teal,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {danger ? <ShieldAlert size={24} /> : <User size={24} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: 700, color: C.ink }}>{patient.name}</div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patient.diagnosis}</div>
        {stats && (
          <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
            <Pill_ text={`Bugun: ${stats.takenToday}/${stats.totalToday}`} color={C.teal} />
            {danger && <Pill_ text={`3 kunda ${stats.missed3} o'tkazib yuborilgan`} color={C.red} />}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 15, letterSpacing: 2, color: C.tealDeep, fontWeight: 700 }}>{patient.code}</div>
        <ChevronRight color={C.inkSoft} style={{ marginTop: 2 }} />
      </div>
    </Card>
  );
}

function Pill_({ text, color }) {
  return (
    <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color, background: `${color}18`, padding: '3px 8px', borderRadius: 20 }}>{text}</span>
  );
}

/* Statistika: bugungi holat + so'nggi 3 kun o'tkazib yuborishlar */
async function computeStats(code) {
  const now = new Date();
  const rx = (await store.get(`rx:${code}`, true)) || { medicines: [] };
  const meds = rx.medicines || [];
  const days = [todayStr(), addDays(todayStr(), -1), addDays(todayStr(), -2)];
  const logs = {};
  for (const d of days) logs[d] = (await store.get(`log:${code}:${d}`, true)) || [];

  let takenToday = 0, totalToday = 0, missed3 = 0;
  for (const d of days) {
    const log = logs[d];
    for (const m of meds) {
      if (!medActiveOn(m, d)) continue;
      for (const t of m.times || []) {
        const taken = log.includes(doseKey(m.id, t));
        const st = doseStatus(d, t, taken, now);
        if (d === todayStr()) {
          totalToday++;
          if (st === 'taken') takenToday++;
        }
        if (st === 'missed') missed3++;
      }
    }
  }
  return { takenToday, totalToday, missed3 };
}

/* So'nggi 7 kun bajarilishi + ketma-ketlik (streak) */
async function computeWeek(code) {
  const now = new Date();
  const rx = (await store.get(`rx:${code}`, true)) || { medicines: [] };
  const meds = rx.medicines || [];
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const ds = addDays(todayStr(), -i);
    const log = (await store.get(`log:${code}:${ds}`, true)) || [];
    let taken = 0, total = 0, upcoming = 0;
    for (const m of meds) {
      if (!medActiveOn(m, ds)) continue;
      for (const t of m.times || []) {
        total++;
        const isTaken = log.includes(doseKey(m.id, t));
        const st = doseStatus(ds, t, isTaken, now);
        if (st === 'taken') taken++;
        else if (st === 'upcoming' || st === 'due') upcoming++;
      }
    }
    let status;
    if (total === 0) status = 'none';
    else if (taken === total) status = 'full';
    else if (taken === 0 && upcoming === 0) status = 'missed';
    else status = 'partial';
    days.push({ date: ds, dow: new Date(ds + 'T00:00:00').getDay(), taken, total, status, isToday: ds === todayStr(), hasUpcoming: upcoming > 0 });
  }
  // Ketma-ketlik: eng yangi kundan orqaga qarab to'liq kunlar
  let streak = 0, counted = false;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.status === 'full') { streak++; counted = true; }
    else if (d.status === 'none') { continue; } // dorisiz kun ketma-ketlikni uzmaydi
    else if (!counted && d.isToday && d.hasUpcoming) { continue; } // bugun hali tugamagan
    else break;
  }
  return { days, streak };
}

/* Haftalik tarix ko'rinishi (bemor + shifokor) */
function WeeklyHistory({ code, refreshKey }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const w = await computeWeek(code); if (!cancelled) setData(w); }
      catch (e) { if (!cancelled) setErr(true); }
    })();
    return () => { cancelled = true; };
  }, [code, refreshKey]);

  if (err) return <Card style={{ textAlign: 'center', color: C.red, padding: 16 }}>Tarixni yuklab bo'lmadi.</Card>;
  if (!data) return <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 16 }}>Yuklanmoqda…</Card>;

  const WD = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
  const colorFor = (st) => (st === 'full' ? C.sage : st === 'partial' ? C.gold : st === 'missed' ? C.red : C.paperSoft);
  const anyMeds = data.days.some((d) => d.total > 0);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        {data.days.map((d) => (
          <div key={d.date} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, color: d.isToday ? C.tealDeep : C.inkSoft, fontWeight: d.isToday ? 700 : 500, marginBottom: 6 }}>{WD[d.dow]}</div>
            <div
              title={`${d.date}: ${d.total ? `${d.taken}/${d.total} doza` : 'dori yo\'q'}`}
              style={{
                height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: colorFor(d.status),
                color: d.status === 'none' ? C.inkSoft : d.status === 'partial' ? C.tealDeep : C.white,
                border: d.isToday ? `2px solid ${C.tealDeep}` : `1px solid ${C.line}`,
                fontFamily: SANS, fontSize: 11.5, fontWeight: 700,
              }}
            >
              {d.status === 'none' ? '–' : `${d.taken}/${d.total}`}
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        {!anyMeds ? (
          <span style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft }}>So'nggi 7 kunda dori tayinlanmagan</span>
        ) : data.streak > 0 ? (
          <span style={{ fontFamily: SANS, fontSize: 14, color: '#3E5637', fontWeight: 700 }}>🔥 {data.streak} kun ketma-ket to'liq</span>
        ) : (
          <span style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>Ketma-ketlik yo'q — bugun to'liq qabul qilib boshlang</span>
        )}
      </div>
    </Card>
  );
}

/* Shifokor: bitta bemor sahifasi — retsept + statistika */
function DoctorPatient({ doctorId, code, onBack, onError, onDeletedPatient }) {
  const [patient, setPatient] = useState(null);
  const [rx, setRx] = useState({ medicines: [] });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // med obj yoki 'new' yoki null
  const [templates, setTemplates] = useState([]);
  const [tplMode, setTplMode] = useState(null); // null | 'pick' | 'save'
  const [tplTitle, setTplTitle] = useState('');
  const [editInfo, setEditInfo] = useState(false);
  const [eName, setEName] = useState('');
  const [eDx, setEDx] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eYear, setEYear] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await store.get(`patient:${code}`, true);
      const r = (await store.get(`rx:${code}`, true)) || { medicines: [] };
      const t = (await store.get(`templates:${doctorId}`, true)) || [];
      setPatient(p);
      if (p) { setEName(p.name || ''); setEDx(p.diagnosis || ''); setEPhone(p.phone || ''); setEYear(p.birthYear ? String(p.birthYear) : ''); }
      setRx(r);
      setTemplates(t);
      setStats(await computeStats(code));
    } catch (e) {
      onError("Bemor ma'lumotini yuklab bo'lmadi.");
    } finally {
      setLoading(false);
    }
  }, [code, doctorId, onError]);

  useEffect(() => { load(); }, [load]);

  // Real-time: bemor doza belgilasa statistika/tarix jonli yangilanadi
  useEffect(() => {
    const off = store.subscribe((payload) => {
      const key = payload?.new?.key || payload?.old?.key;
      if (!key) return;
      if (key === `patient:${code}` || key === `rx:${code}` || key.startsWith(`log:${code}:`)) load();
    });
    return off;
  }, [code, load]);

  const saveRx = async (medicines) => {
    try {
      const next = { medicines };
      await store.set(`rx:${code}`, next, true);
      setRx(next);
      setStats(await computeStats(code));
    } catch (e) {
      onError("Retseptni saqlab bo'lmadi.");
    }
  };

  const upsertMed = async (med) => {
    const list = rx.medicines || [];
    const exists = list.some((m) => m.id === med.id);
    const next = exists ? list.map((m) => (m.id === med.id ? med : m)) : [...list, med];
    await saveRx(next);
    setEditing(null);
  };

  const deleteMed = async (id) => {
    if (!window.confirm('Bu dorini o\'chirasizmi?')) return;
    await saveRx((rx.medicines || []).filter((m) => m.id !== id));
  };

  /* --- Retsept shablonlari --- */
  const stripMed = (m) => ({ name: m.name, dosage: m.dosage, times: m.times, durationDays: m.durationDays, instructions: m.instructions });

  const applyTemplate = async (tpl) => {
    const newMeds = (tpl.medicines || []).map((m) => ({ ...stripMed(m), id: uid(), startDate: todayStr() }));
    if (!newMeds.length) return onError('Bu shablonda dori yo\'q.');
    await saveRx([...(rx.medicines || []), ...newMeds]);
    setTplMode(null);
  };

  const saveAsTemplate = async () => {
    const title = tplTitle.trim();
    if (!title) return onError('Shablon nomini kiriting.');
    if (!(rx.medicines || []).length) return onError('Saqlash uchun retseptda kamida bitta dori bo\'lishi kerak.');
    try {
      const list = (await store.get(`templates:${doctorId}`, true)) || [];
      const rec = { id: uid(), title, medicines: (rx.medicines || []).map(stripMed) };
      const next = [...list, rec];
      await store.set(`templates:${doctorId}`, next, true);
      setTemplates(next);
      setTplMode(null);
      setTplTitle('');
    } catch (e) {
      onError("Shablonni saqlab bo'lmadi.");
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm('Shablonni o\'chirasizmi?')) return;
    try {
      const next = templates.filter((t) => t.id !== id);
      await store.set(`templates:${doctorId}`, next, true);
      setTemplates(next);
    } catch (e) {
      onError("Shablonni o'chirib bo'lmadi.");
    }
  };

  const savePatientInfo = async () => {
    const name = eName.trim(), diagnosis = eDx.trim(), phone = ePhone.trim();
    if (!name || !diagnosis) return onError('Ism va tashxis bo\'sh bo\'lmasin.');
    if (eYear && !validBirthYear(eYear)) return onError(`Tug'ilgan yil 1900–${curYear()} oralig'ida bo'lsin (yoki bo'sh qoldiring).`);
    const birthYear = eYear ? Number(eYear) : null;
    try {
      const next = { ...patient, name, diagnosis, phone, birthYear };
      await store.set(`patient:${code}`, next, true);
      const list = (await store.get(`patients:${doctorId}`, true)) || [];
      await store.set(`patients:${doctorId}`, list.map((p) => (p.code === code ? { ...p, name, diagnosis, phone, birthYear } : p)), true);
      setPatient(next);
      setEditInfo(false);
    } catch (e) {
      onError("Ma'lumotni saqlab bo'lmadi.");
    }
  };

  const deletePatient = async () => {
    if (!window.confirm(`${patient?.name || 'Bemor'}ni butunlay o'chirasizmi? Retsept va tarix ham o'chadi.`)) return;
    try {
      const list = (await store.get(`patients:${doctorId}`, true)) || [];
      await store.set(`patients:${doctorId}`, list.filter((p) => p.code !== code), true);
      await store.set(`patient:${code}`, null, true);
      await store.set(`rx:${code}`, null, true);
      onDeletedPatient();
    } catch (e) {
      onError("Bemorni o'chirib bo'lmadi.");
    }
  };

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.inkSoft }}>Yuklanmoqda…</div>;
  if (!patient) return (
    <div>
      <TopBar title="Topilmadi" onBack={onBack} />
      <div style={{ padding: 16 }}><Banner type="error" icon={<AlertTriangle size={18} />}>Bemor topilmadi.</Banner></div>
    </div>
  );

  const danger = stats && stats.missed3 >= 3;

  return (
    <div>
      <TopBar title={patient.name} subtitle={`Kod: ${patient.code}`} onBack={onBack} />
      <div style={{ padding: 16 }}>
        {!editInfo ? (
          <Card style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 2 }}>Bemor</div>
                <div style={{ fontFamily: SANS, fontSize: 16, color: C.ink, fontWeight: 700, marginBottom: 2 }}>{patient.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
                  {patient.phone && (
                    <a href={`tel:${patient.phone.replace(/\s/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: SANS, fontSize: 13.5, color: C.teal, textDecoration: 'none', fontWeight: 600 }}>
                      <Phone size={14} /> {patient.phone}
                    </a>
                  )}
                  {patient.birthYear && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>
                      <CalendarDays size={14} /> {patient.birthYear}-y. ({curYear() - patient.birthYear} yosh)
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 2 }}>Tashxis</div>
                <div style={{ fontFamily: SERIF, fontSize: 19, color: C.tealDeep, fontWeight: 600 }}>{patient.diagnosis}</div>
              </div>
              <button onClick={() => { setEName(patient.name); setEDx(patient.diagnosis); setEPhone(patient.phone || ''); setEYear(patient.birthYear ? String(patient.birthYear) : ''); setEditInfo(true); }} title="Tahrirlash" style={iconBtn}>
                <Pencil size={16} />
              </button>
            </div>
          </Card>
        ) : (
          <Card style={{ marginBottom: 4, border: `1.5px solid ${C.gold}`, background: '#FFFDF7' }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, color: C.tealDeep, fontWeight: 600, marginBottom: 10 }}>Bemor ma'lumotini tahrirlash</div>
            <Field label="Bemor ismi">
              <input style={inputStyle} value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Ism familiya" />
            </Field>
            <Field label="Tashxis">
              <input style={inputStyle} value={eDx} onChange={(e) => setEDx(e.target.value)} placeholder="Tashxis" />
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1.4 }}>
                <Field label="Telefon" hint="Ixtiyoriy">
                  <input style={inputStyle} type="tel" value={ePhone} onChange={(e) => setEPhone(e.target.value)} placeholder="+998 90 123 45 67" />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Tug'ilgan yil" hint="Ixtiyoriy">
                  <input style={inputStyle} value={eYear} onChange={(e) => setEYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="1985" inputMode="numeric" onKeyDown={(e) => e.key === 'Enter' && savePatientInfo()} />
                </Field>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setEditInfo(false)} style={{ flex: 1 }}>Bekor qilish</Btn>
              <Btn variant="gold" onClick={savePatientInfo} style={{ flex: 1 }}>Saqlash</Btn>
            </div>
          </Card>
        )}

        {danger && (
          <div style={{ marginTop: 12 }}>
            <Banner type="error" icon={<ShieldAlert size={18} />} title="Diqqat talab qiladi">
              Bemor so'nggi 3 kunda <b>{stats.missed3} ta</b> dozani o'tkazib yubordi. Bog'lanib holatini so'rang.
            </Banner>
          </div>
        )}

        {/* Statistika */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <StatBox label="Bugun qabul qilingan" value={`${stats.takenToday}/${stats.totalToday}`} color={C.sage} />
          <StatBox label="3 kunda o'tkazib yuborilgan" value={stats.missed3} color={stats.missed3 >= 3 ? C.red : C.teal} />
        </div>

        {/* Haftalik tarix */}
        <SectionTitle icon={<CalendarDays size={18} color={C.teal} />}>So'nggi 7 kun</SectionTitle>
        <WeeklyHistory code={code} refreshKey={(rx.medicines || []).length} />

        {/* Retsept */}
        <SectionTitle icon={<ClipboardList size={18} color={C.teal} />}>Retsept</SectionTitle>

        {(rx.medicines || []).length === 0 && !editing && (
          <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 22 }}>Hali dori tayinlanmagan.</Card>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {(rx.medicines || []).map((m) => (
            <MedCard key={m.id} med={m} onEdit={() => setEditing(m)} onDelete={() => deleteMed(m.id)} />
          ))}
        </div>

        {editing ? (
          <MedForm
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSave={upsertMed}
          />
        ) : (
          <>
            <Btn variant="gold" full onClick={() => setEditing('new')} style={{ marginTop: 12 }}>
              <Plus size={18} /> Dori qo'shish
            </Btn>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {templates.length > 0 && (
                <Btn variant="quiet" onClick={() => setTplMode('pick')} style={{ flex: 1, fontSize: 14 }}>
                  <Files size={16} /> Shablondan
                </Btn>
              )}
              {(rx.medicines || []).length > 0 && (
                <Btn variant="quiet" onClick={() => { setTplTitle(''); setTplMode('save'); }} style={{ flex: 1, fontSize: 14 }}>
                  <Files size={16} /> Shablon saqlash
                </Btn>
              )}
            </div>

            {tplMode === 'pick' && (
              <TemplatePicker templates={templates} onApply={applyTemplate} onDelete={deleteTemplate} onClose={() => setTplMode(null)} />
            )}

            {tplMode === 'save' && (
              <Card style={{ marginTop: 10, border: `1.5px solid ${C.gold}`, background: '#FFFDF7' }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, color: C.tealDeep, fontWeight: 600, marginBottom: 4 }}>Shablon sifatida saqlash</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 10 }}>
                  Joriy <b>{(rx.medicines || []).length} ta</b> dori shablonga saqlanadi (bemorga bog'lanmagan holda).
                </div>
                <input
                  style={inputStyle}
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  placeholder="Shablon nomi (masalan: Gipertoniya standart)"
                  onKeyDown={(e) => e.key === 'Enter' && saveAsTemplate()}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <Btn variant="ghost" onClick={() => { setTplMode(null); setTplTitle(''); }} style={{ flex: 1 }}>Bekor qilish</Btn>
                  <Btn variant="gold" onClick={saveAsTemplate} style={{ flex: 1 }}>Saqlash</Btn>
                </div>
              </Card>
            )}
          </>
        )}

        <Btn variant="ghost" full onClick={deletePatient} style={{ marginTop: 24, color: C.red, border: '1.5px solid #E7C6C1' }}>
          <Trash2 size={16} /> Bemorni o'chirish
        </Btn>
      </div>
    </div>
  );
}

/* Shablon tanlash — retseptga qo'shish yoki o'chirish */
function TemplatePicker({ templates, onApply, onDelete, onClose }) {
  return (
    <Card style={{ marginTop: 10, border: `1px solid ${C.teal}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, color: C.tealDeep, fontWeight: 600 }}>Shablon tanlang</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {templates.map((t) => (
          <div key={t.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 700, color: C.ink }}>{t.title}</div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
                  {(t.medicines || []).map((m) => m.name).join(', ') || 'Bo\'sh'}
                </div>
              </div>
              <button onClick={() => onDelete(t.id)} title="Shablonni o'chirish" style={{ ...iconBtn, color: C.red }}>
                <Trash2 size={15} />
              </button>
            </div>
            <Btn variant="sage" full onClick={() => onApply(t)} style={{ marginTop: 10, padding: '10px', fontSize: 14 }}>
              <Plus size={15} /> Retseptga qo'shish ({(t.medicines || []).length} dori)
            </Btn>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatBox({ label, value, color }) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.3, marginTop: 2 }}>{label}</div>
    </Card>
  );
}

function MedCard({ med, onEdit, onDelete }) {
  const end = medEndDate(med);
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill size={18} color={C.gold} />
            <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: C.ink }}>{med.name}</div>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft, marginTop: 4 }}>{med.dosage}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {(med.times || []).map((t) => (
              <span key={t} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.teal, background: '#E9F0F1', padding: '4px 9px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={13} /> {t}
              </span>
            ))}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 8 }}>
            {med.durationDays ? `${med.durationDays} kun` : 'Doimiy'} · boshlangan: {med.startDate}
            {end && ` · tugaydi: ${end}`}
          </div>
          {med.instructions && (
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink, marginTop: 6, fontStyle: 'italic' }}>“{med.instructions}”</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={onEdit} style={iconBtn}><Pencil size={16} /></button>
          <button onClick={onDelete} style={{ ...iconBtn, color: C.red }}><Trash2 size={16} /></button>
        </div>
      </div>
    </Card>
  );
}

const iconBtn = {
  background: C.paperSoft, border: 'none', borderRadius: 9, width: 34, height: 34,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink,
};

/* Dori qo'shish/tahrirlash formasi */
function MedForm({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [dosage, setDosage] = useState(initial?.dosage || '');
  const [times, setTimes] = useState(initial?.times?.length ? initial.times : ['08:00']);
  const [durationDays, setDurationDays] = useState(initial?.durationDays ? String(initial.durationDays) : '');
  const [startDate, setStartDate] = useState(initial?.startDate || todayStr());
  const [instructions, setInstructions] = useState(initial?.instructions || '');
  const [err, setErr] = useState(null);

  const setTime = (i, v) => setTimes((ts) => ts.map((t, j) => (j === i ? v : t)));
  const addTime = () => setTimes((ts) => [...ts, '12:00']);
  const removeTime = (i) => setTimes((ts) => (ts.length > 1 ? ts.filter((_, j) => j !== i) : ts));

  const save = () => {
    if (!name.trim()) return setErr('Dori nomini kiriting.');
    if (!dosage.trim()) return setErr('Dozani kiriting (masalan: 1 tabletka).');
    const cleanTimes = Array.from(new Set(times.filter(Boolean))).sort();
    if (cleanTimes.length === 0) return setErr('Kamida bitta qabul vaqtini qo\'shing.');
    if (durationDays && (isNaN(Number(durationDays)) || Number(durationDays) < 1))
      return setErr('Davomiylik butun kun bo\'lishi kerak yoki bo\'sh qoldiring (doimiy).');
    onSave({
      id: initial?.id || uid(),
      name: name.trim(),
      dosage: dosage.trim(),
      times: cleanTimes,
      durationDays: durationDays ? Number(durationDays) : null,
      startDate,
      instructions: instructions.trim(),
    });
  };

  return (
    <Card style={{ marginTop: 12, border: `1.5px solid ${C.gold}`, background: '#FFFDF7' }}>
      <div style={{ fontFamily: SERIF, fontSize: 18, color: C.tealDeep, fontWeight: 600, marginBottom: 12 }}>
        {initial ? 'Dorini tahrirlash' : 'Yangi dori'}
      </div>
      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}

      <Field label="Dori nomi">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Enalapril" />
      </Field>
      <Field label="Dozasi">
        <input style={inputStyle} value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="Masalan: 10 mg, 1 tabletka" />
      </Field>

      <Field label="Qabul vaqtlari" hint="Kuniga bir necha marta bo'lishi mumkin">
        <div style={{ display: 'grid', gap: 8 }}>
          {times.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input type="time" style={{ ...inputStyle, flex: 1 }} value={t} onChange={(e) => setTime(i, e.target.value)} />
              <button onClick={() => removeTime(i)} disabled={times.length <= 1} style={{ ...iconBtn, width: 46, opacity: times.length <= 1 ? 0.4 : 1 }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <Btn variant="quiet" onClick={addTime} style={{ padding: '10px 12px', fontSize: 14 }}>
            <Plus size={15} /> Vaqt qo'shish
          </Btn>
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Boshlanish sanasi">
            <input type="date" style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Necha kun" hint="Bo'sh = doimiy">
            <input style={inputStyle} value={durationDays} onChange={(e) => setDurationDays(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Doimiy" inputMode="numeric" />
          </Field>
        </div>
      </div>

      <Field label="Qo'shimcha ko'rsatma" hint="Ixtiyoriy">
        <input style={inputStyle} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Masalan: ovqatdan keyin, suv bilan" />
      </Field>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <Btn variant="ghost" onClick={onCancel} style={{ flex: 1 }}>Bekor qilish</Btn>
        <Btn variant="gold" onClick={save} style={{ flex: 1 }}>Saqlash</Btn>
      </div>
    </Card>
  );
}

/* =========================================================================
   BEMOR — kirish
   ========================================================================= */
function PatientLogin({ onLogin, onBack, onError }) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) return setErr('Kod 6 xonali raqam bo\'lishi kerak.');
    setChecking(true);
    setErr(null);
    try {
      const p = await store.get(`patient:${c}`, true);
      if (!p) {
        setErr('Bunday kod topilmadi. Shifokoringizdan qaytadan so\'rang.');
        setChecking(false);
        return;
      }
      onLogin(c);
    } catch (e) {
      onError("Kodni tekshirib bo'lmadi. Internet aloqasini tekshiring.");
      setChecking(false);
    }
  };

  return (
    <div style={{ padding: '40px 24px' }}>
      <button onClick={onBack} style={{ background: C.paperSoft, border: 'none', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink, marginBottom: 24 }}>
        <ArrowLeft size={20} />
      </button>

      <div style={{ width: 60, height: 60, borderRadius: 16, background: '#FBF1D6', color: '#7A5A12', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <User size={30} />
      </div>
      <h1 style={{ fontFamily: SERIF, fontSize: 28, color: C.tealDeep, margin: '0 0 6px', fontWeight: 600 }}>Xush kelibsiz</h1>
      <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: '0 0 24px', lineHeight: 1.5 }}>
        Shifokoringiz bergan 6 xonali kodni kiriting.
      </p>

      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}

      <input
        style={{ ...inputStyle, fontFamily: SERIF, fontSize: 34, textAlign: 'center', letterSpacing: 10, padding: '16px 14px', fontWeight: 700, color: C.tealDeep }}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        placeholder="000000"
        inputMode="numeric"
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <Btn variant="gold" full onClick={submit} disabled={checking} style={{ marginTop: 16 }}>
        {checking ? 'Tekshirilmoqda…' : 'Kirish'}
      </Btn>
    </div>
  );
}

/* =========================================================================
   BEMOR — asosiy ekran
   ========================================================================= */
function PatientApp({ code, onLogout, onError }) {
  const [patient, setPatient] = useState(null);
  const [rx, setRx] = useState({ medicines: [] });
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unavailable');
  const [dismissedReminder, setDismissedReminder] = useState(false);
  const [liveMsg, setLiveMsg] = useState(null);

  const audioRef = useRef(null);
  const beepedRef = useRef(new Set()); // qaytariqni oldini olish uchun

  const day = todayStr();

  const load = useCallback(async () => {
    try {
      const p = await store.get(`patient:${code}`, true);
      const r = (await store.get(`rx:${code}`, true)) || { medicines: [] };
      const l = (await store.get(`log:${code}:${day}`, true)) || [];
      setPatient(p);
      setRx(r);
      setLog(l);
    } catch (e) {
      onError("Ma'lumotlaringizni yuklab bo'lmadi. Aloqani tekshiring.");
    } finally {
      setLoading(false);
    }
  }, [code, day, onError]);

  useEffect(() => { load(); }, [load]);

  // Real-time: shifokor o'zgartirsa reload'siz yangilanadi
  useEffect(() => {
    const off = store.subscribe((payload) => {
      const key = payload?.new?.key || payload?.old?.key;
      if (!key) return;
      if (key === `patient:${code}` || key === `rx:${code}` || key === `log:${code}:${day}`) {
        if (key === `rx:${code}`) setLiveMsg('Shifokor retseptingizni yangiladi');
        else if (key === `patient:${code}`) setLiveMsg("Ma'lumotingiz yangilandi");
        load();
      }
    });
    return off;
  }, [code, day, load]);

  // Live xabarni avtomatik yashirish
  useEffect(() => {
    if (!liveMsg) return;
    const id = setTimeout(() => setLiveMsg(null), 6000);
    return () => clearTimeout(id);
  }, [liveMsg]);

  // Soatni yangilab turish (30 soniyada bir)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  /* Beep (Web Audio) */
  const beep = useCallback(() => {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const play = (freq, at, dur) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
        o.start(ctx.currentTime + at);
        o.stop(ctx.currentTime + at + dur + 0.02);
      };
      play(880, 0, 0.3);
      play(1174, 0.28, 0.34);
    } catch (e) { /* jimgina o'tkazamiz */ }
  }, []);

  // Faol dorilar (bugun amal qiladigan)
  const activeMeds = (rx.medicines || []).filter((m) => medActiveOn(m, day));

  // Bugungi dozalar ro'yxati
  const doses = [];
  for (const m of activeMeds) {
    for (const t of m.times || []) {
      const key = doseKey(m.id, t);
      const taken = log.includes(key);
      doses.push({ med: m, time: t, key, taken, status: doseStatus(day, t, taken, now), h: parseInt(t.slice(0, 2), 10) + parseInt(t.slice(3, 5), 10) / 60 });
    }
  }
  doses.sort((a, b) => a.h - b.h);

  const dueDoses = doses.filter((d) => d.status === 'due');

  // Eslatma effekti: beep + notification (yangi due dozalar uchun)
  useEffect(() => {
    if (dueDoses.length === 0) return;
    let fired = false;
    for (const d of dueDoses) {
      const tag = `${day}:${d.key}`;
      if (!beepedRef.current.has(tag)) {
        beepedRef.current.add(tag);
        fired = true;
        if (notifPerm === 'granted') {
          try {
            new Notification('Vaqtida — dori vaqti', { body: `${d.med.name} · ${d.med.dosage} (${d.time})`, tag });
          } catch (e) {}
        }
      }
    }
    if (fired) {
      setDismissedReminder(false);
      beep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueDoses.map((d) => d.key).join(','), now]);

  const markTaken = async (dose) => {
    if (dose.taken) return;
    const next = Array.from(new Set([...log, dose.key]));
    setLog(next); // optimistik
    try {
      await store.set(`log:${code}:${day}`, next, true);
    } catch (e) {
      setLog(log); // qaytarish
      onError("Belgilashni saqlab bo'lmadi. Qaytadan urinib ko'ring.");
    }
  };

  const undoTaken = async (dose) => {
    if (!dose.taken) return;
    const next = log.filter((k) => k !== dose.key);
    setLog(next);
    try {
      await store.set(`log:${code}:${day}`, next, true);
    } catch (e) {
      setLog(log);
      onError("O'zgartirishni saqlab bo'lmadi.");
    }
  };

  const enableNotif = async () => {
    if (typeof Notification === 'undefined') return onError('Bu brauzer bildirishnomalarni qo\'llab-quvvatlamaydi.');
    try {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
      // audio kontekstni foydalanuvchi harakati bilan ochib qo'yamiz
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioRef.current.state === 'suspended') audioRef.current.resume();
    } catch (e) {
      onError('Bildirishnoma ruxsatini olishda muammo.');
    }
  };

  // Kurs tugash eslatmasi (bugun yoki ertaga tugaydigan dorilar)
  const endingSoon = activeMeds
    .map((m) => ({ m, end: medEndDate(m) }))
    .filter((x) => x.end && (x.end === day || x.end === addDays(day, 1)));

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.inkSoft }}>Yuklanmoqda…</div>;
  if (!patient)
    return (
      <div>
        <TopBar title="Topilmadi" onBack={onLogout} />
        <div style={{ padding: 16 }}>
          <Banner type="error" icon={<AlertTriangle size={18} />}>Bu kodga bemor topilmadi. Shifokoringizga murojaat qiling.</Banner>
          <Btn variant="ghost" full onClick={onLogout}>Boshqa kod kiritish</Btn>
        </div>
      </div>
    );

  const takenCount = doses.filter((d) => d.status === 'taken').length;
  const niceDate = uzDate(now);

  return (
    <div>
      <TopBar
        title={`Salom, ${patient.name.split(' ')[0] || patient.name}`}
        subtitle={niceDate}
        right={
          <Btn variant="quiet" onClick={onLogout} style={{ padding: '10px 12px', fontSize: 14 }}>
            <LogOut size={16} /> Chiqish
          </Btn>
        }
      />

      <div style={{ padding: 16 }}>
        {/* Real-time yangilanish xabari */}
        {liveMsg && (
          <Banner type="success" icon={<CalendarClock size={18} />} onClose={() => setLiveMsg(null)}>
            {liveMsg}
          </Banner>
        )}

        {/* Eslatma banneri (due doza) */}
        {dueDoses.length > 0 && !dismissedReminder && (
          <div style={{ animation: 'none' }}>
            <Banner type="warn" icon={<Bell size={18} />} title="Dori qabul qilish vaqti!" onClose={() => setDismissedReminder(true)}>
              {dueDoses.map((d) => (
                <div key={d.key} style={{ marginTop: 2 }}>• <b>{d.med.name}</b> — {d.med.dosage} ({d.time})</div>
              ))}
            </Banner>
          </div>
        )}

        {/* Kurs tugash eslatmasi */}
        {endingSoon.length > 0 && (
          <Banner type="info" icon={<CalendarClock size={18} />} title="Kurs tugayapti">
            {endingSoon.map(({ m, end }) => (
              <div key={m.id}>
                <b>{m.name}</b> kursi {end === day ? 'bugun' : 'ertaga'} tugaydi. Davom ettirish kerakmi — shifokoringizdan so'rang.
              </div>
            ))}
          </Banner>
        )}

        {/* Tashxis */}
        <Card style={{ background: C.teal, border: 'none', color: C.paper, marginBottom: 4 }}>
          <div style={{ fontFamily: SANS, fontSize: 13, opacity: 0.8 }}>Tashxisingiz</div>
          <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: C.gold, marginTop: 2 }}>{patient.diagnosis}</div>
        </Card>

        {/* Kun aylanasi */}
        <SectionTitle icon={<Clock size={18} color={C.teal} />}>Bugungi kun aylanasi</SectionTitle>
        <Card style={{ padding: '18px 10px' }}>
          {doses.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.inkSoft, padding: 20 }}>Bugun uchun tayinlangan dori yo'q.</div>
          ) : (
            <>
              <DayArc doses={doses} now={now} />
              <div style={{ textAlign: 'center', fontFamily: SANS, fontSize: 13.5, color: C.inkSoft, marginTop: 8 }}>
                Bugun {takenCount}/{doses.length} doza qabul qilindi
              </div>
            </>
          )}
        </Card>

        {/* Dori jadvali (read-only, faqat belgilash mumkin) */}
        <SectionTitle icon={<Pill size={18} color={C.teal} />}>Bugungi dorilar</SectionTitle>
        {doses.length === 0 ? (
          <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 22 }}>Hozircha faol dori yo'q. Bu — yaxshi belgi bo'lishi mumkin 🙂</Card>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {doses.map((d) => (
              <DoseCard key={d.key} dose={d} onTake={() => markTaken(d)} onUndo={() => undoTaken(d)} />
            ))}
          </div>
        )}

        {/* Haftalik tarix */}
        <SectionTitle icon={<CalendarDays size={18} color={C.teal} />}>So'nggi 7 kun</SectionTitle>
        <WeeklyHistory code={code} refreshKey={log.join(',')} />

        {/* Bildirishnoma boshqaruvi */}
        <SectionTitle icon={<Bell size={18} color={C.teal} />}>Eslatmalar</SectionTitle>
        {notifPerm === 'default' && (
          <Btn variant="primary" full onClick={enableNotif}>
            <Bell size={18} /> Bildirishnomalarni yoqish
          </Btn>
        )}
        {notifPerm === 'granted' && (
          <Banner type="success" icon={<Check size={18} />}>Bildirishnomalar yoqilgan. Dori vaqti kelganda ogohlantiramiz.</Banner>
        )}
        {notifPerm === 'denied' && (
          <Banner type="warn" icon={<BellOff size={18} />}>Bildirishnomalar bloklangan. Brauzer sozlamalaridan (qulf belgisi → ruxsatlar) yoqishingiz mumkin.</Banner>
        )}
        {notifPerm === 'unavailable' && (
          <Banner type="warn" icon={<BellOff size={18} />}>Bu brauzer tizim bildirishnomalarini qo'llab-quvvatlamaydi. Ilova ichidagi banner va tovush baribir ishlaydi.</Banner>
        )}

        <Banner type="info" icon={<Info size={18} />} title="Muhim">
          Eslatmalar <b>faqat ilova ochiq turganda</b> ishlaydi. Ilova yopiq bo'lsa ham eslatma kelishi uchun (haqiqiy push-bildirishnoma) alohida mobil ilova va server kerak bo'ladi — buni hozircha va'da qila olmaymiz.
        </Banner>
      </div>
    </div>
  );
}

/* Bitta doza kartasi */
function DoseCard({ dose, onTake, onUndo }) {
  const { med, time, status } = dose;
  const cfg = {
    taken: { bg: '#EEF4EB', bd: C.sage, label: 'Qabul qilindi', fg: '#3E5637' },
    due: { bg: '#FBF1D6', bd: C.gold, label: 'Hozir vaqti!', fg: '#7A5A12' },
    upcoming: { bg: C.white, bd: C.line, label: 'Kutilmoqda', fg: C.inkSoft },
    missed: { bg: '#F9E9E6', bd: C.red, label: "O'tkazib yuborilgan", fg: '#7E2F27' },
  }[status];

  return (
    <Card style={{ background: cfg.bg, border: `${status === 'due' ? 2 : 1}px solid ${cfg.bd}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ textAlign: 'center', minWidth: 58 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.tealDeep, lineHeight: 1 }}>{time}</div>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: cfg.fg, marginTop: 3 }}>{cfg.label}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, borderLeft: `1px solid ${cfg.bd}`, paddingLeft: 12 }}>
          <div style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: 700, color: C.ink }}>{med.name}</div>
          <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>{med.dosage}</div>
          {med.instructions && <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink, marginTop: 3, fontStyle: 'italic' }}>{med.instructions}</div>}
        </div>
        {status === 'taken' ? (
          <button onClick={onUndo} title="Bekor qilish" style={{ background: C.sage, border: 'none', borderRadius: 12, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.white, flexShrink: 0 }}>
            <Check size={26} />
          </button>
        ) : (
          <button
            onClick={onTake}
            title="Qabul qilindi deb belgilash"
            style={{ background: status === 'missed' ? C.white : C.teal, border: status === 'missed' ? `2px solid ${C.red}` : 'none', borderRadius: 12, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: status === 'missed' ? C.red : C.paper, flexShrink: 0 }}
          >
            <Check size={26} />
          </button>
        )}
      </div>
    </Card>
  );
}
