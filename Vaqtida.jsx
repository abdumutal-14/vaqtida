import React, { useState, useEffect, useRef, useCallback, useContext, createContext, useId } from 'react';
import {
  Stethoscope, User, UserPlus, Pill, Bell, BellOff, Check, AlertTriangle,
  Trash2, Pencil, Plus, ArrowLeft, LogOut, Copy, X, ChevronRight, Clock,
  Users, ClipboardList, CalendarClock, Info, ShieldAlert, Files, Lock, Mail, CalendarDays, Phone, Type, Download,
  Store, Search, BadgeCheck, XCircle, IdCard, History, KeyRound, ShieldCheck, RefreshCw, Globe, WifiOff, Link2, QrCode, Ban, HelpCircle,
  Send, MessageCircle,
} from 'lucide-react';
import { store, hasBackend, auth, adminCreateDoctor, adminListDoctors, adminResetDoctorPassword, adminSetDoctorBlocked, offlineQueue, notifyNewMessage } from './db.js';
import { pushSupported, subscribeToPush, unsubscribeFromPush, getPushState } from './push.js';
import QRCode from 'qrcode';

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
/* Bemor kodi: 8 ta belgi, harf+raqam aralash. Chalkash belgilar (0/O, 1/I/L)
   chiqarib tashlangan — telefon orqali aytilganda yoki qo'lda yozilganda
   adashtirilmasin. 32^8 ≈ 1.1 trln variant — taxmin qilish amalda imkonsiz. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;
const genCode = () => Array.from({ length: CODE_LEN }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const CODE_RE = new RegExp(`^[A-Z0-9]{${CODE_LEN}}$`);
const cleanCodeInput = (v) => v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, CODE_LEN);

/* Tez-tez uchraydigan tashxislar — tashxis maydonida tayyor tavsiya
   sifatida ko'rsatiladi (erkin matn kiritish imkoniyati saqlanadi). */
const COMMON_DIAGNOSES = [
  { uz: 'Gipertoniya I daraja', ru: 'Гипертония I степени' },
  { uz: 'Gipertoniya II daraja', ru: 'Гипертония II степени' },
  { uz: 'Gipertoniya III daraja', ru: 'Гипертония III степени' },
  { uz: 'Yurak ishemik kasalligi', ru: 'Ишемическая болезнь сердца' },
  { uz: 'Aritmiya (yurak ritmi buzilishi)', ru: 'Аритмия (нарушение ритма сердца)' },
  { uz: 'Surunkali yurak yetishmovchiligi', ru: 'Хроническая сердечная недостаточность' },
  { uz: "Insultdan keyingi holat", ru: 'Состояние после инсульта' },
  { uz: 'Qandli diabet 1-turi', ru: 'Сахарный диабет 1 типа' },
  { uz: 'Qandli diabet 2-turi', ru: 'Сахарный диабет 2 типа' },
  { uz: 'Gipotireoz', ru: 'Гипотиреоз' },
  { uz: 'Gipertireoz', ru: 'Гипертиреоз' },
  { uz: 'Bronxial astma', ru: 'Бронхиальная астма' },
  { uz: "Surunkali obstruktiv o'pka kasalligi", ru: 'Хроническая обструктивная болезнь лёгких' },
  { uz: 'Surunkali buyrak yetishmovchiligi', ru: 'Хроническая почечная недостаточность' },
  { uz: 'Pielonefrit', ru: 'Пиелонефрит' },
  { uz: 'Gastrit', ru: 'Гастрит' },
  { uz: 'Oshqozon yarasi', ru: 'Язва желудка' },
  { uz: '12 barmoq ichak yarasi', ru: 'Язва двенадцатиперстной кишки' },
  { uz: 'Osteoartroz', ru: 'Остеоартроз' },
  { uz: 'Osteoporoz', ru: 'Остеопороз' },
  { uz: 'Revmatoid artrit', ru: 'Ревматоидный артрит' },
  { uz: 'Podagra', ru: 'Подагра' },
  { uz: 'Epilepsiya', ru: 'Эпилепсия' },
  { uz: 'Migren', ru: 'Мигрень' },
  { uz: 'Parkinson kasalligi', ru: 'Болезнь Паркинсона' },
  { uz: 'Depressiya', ru: 'Депрессия' },
  { uz: 'Anksiyete buzilishi', ru: 'Тревожное расстройство' },
  { uz: 'Glaukoma', ru: 'Глаукома' },
  { uz: 'Anemiya', ru: 'Анемия' },
];

/* Bemor kirish sahifasiga to'g'ridan-to'g'ri (kod oldindan to'ldirilgan
   holda) olib boradigan havola — QR-kod shu havolani kodlaydi. */
const patientLoginUrl = (code) =>
  `${window.location.origin}${window.location.pathname}?code=${code}`;

/* Telefon raqamlarini solishtirish uchun: faqat raqamlarni qoldirib,
   oxirgi 9 tasini olamiz (+998 kodi bo'lsa ham, bo'lmasa ham mos keladi). */
const normalizePhone = (p) => (p || '').replace(/\D/g, '').slice(-9);
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

/* O'zbekcha/ruscha sana (muhit lokaliga bog'liq bo'lmasin) */
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const RU_WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const localeDate = (d, lang) =>
  lang === 'ru'
    ? `${RU_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
    : `${UZ_WEEKDAYS[d.getDay()]}, ${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`;

/* ------------------------------ Til (i18n) ------------------------------
   Kalit — o'zbekcha matn, qiymat — ruscha tarjima. Har joyda t('uz','ru')
   deb chaqiriladi; hozirgi til Context orqali keladi. */
const LangContext = createContext('uz');
const translate = (lang, uz, ru) => (lang === 'ru' ? ru : uz);
function useT() {
  const lang = useContext(LangContext);
  // useCallback bilan barqarorlashtirilgan — aks holda har render'da yangi
  // funksiya qaytadi va uni useCallback/useEffect bog'liqligida ishlatgan
  // joylar (masalan DoctorPatient'ning "load") cheksiz qayta-qayta
  // ishga tushib qolar edi (har render → yangi "t" → "load" yangilanadi →
  // effekt qayta ishga tushadi → setState → render → ...).
  return useCallback((uz, ru) => translate(lang, uz, ru), [lang]);
}

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

/* Tashxis maydoni — tayyor tashxislar ro'yxati tavsiya sifatida
   ko'rsatiladi (datalist), lekin xohlagan matnni yozish ham mumkin. */
function DiagnosisField({ label, value, onChange }) {
  const t = useT();
  const lang = useContext(LangContext);
  const listId = useId();
  return (
    <Field label={label}>
      <input
        style={inputStyle}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('Masalan: Gipertoniya II daraja', 'Например: Гипертония II степени')}
      />
      <datalist id={listId}>
        {COMMON_DIAGNOSES.map((d) => (
          <option key={d.uz} value={lang === 'ru' ? d.ru : d.uz} />
        ))}
      </datalist>
    </Field>
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

/* Berilgan matnni QR-kod rasmiga aylantiradi (masalan bemor kirish havolasi) */
function QrCodeImg({ value, size = 160 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#1B3038', light: '#FFFFFF' } })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size, background: C.paperSoft, borderRadius: 10 }} />;
  return <img src={src} width={size} height={size} style={{ borderRadius: 10, display: 'block' }} alt="QR" />;
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
  const t = useT();
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
          [t('Kutilmoqda', 'Ожидается'), C.gold],
          [t('Qabul qilindi', 'Принято'), C.sage],
          [t("O'tkazib yuborildi", 'Пропущено'), C.red],
        ].map(([label, c]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 12.5, color: C.inkSoft }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: c, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* Xatolik chegarasi — bir komponent qulasa ham butun sayt oq bo'lib qolmasin */
class ErrorBoundary extends React.Component {
  static contextType = LangContext;
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Ilova xatosi:', error, info); }
  render() {
    if (this.state.error) {
      const t = (uz, ru) => translate(this.context, uz, ru);
      return (
        <div style={{ padding: 24, fontFamily: SANS, color: C.ink }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, color: C.tealDeep, fontWeight: 600, marginBottom: 8 }}>{t('Nimadir xato ketdi', 'Что-то пошло не так')}</div>
          <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.5, marginBottom: 16 }}>
            {t(
              "Ilovada kutilmagan xatolik yuz berdi. Sahifani qayta yuklab ko'ring. Muammo takrorlansa, shifokoringizga yoki dastur egasiga xabar bering.",
              'В приложении произошла непредвиденная ошибка. Перезагрузите страницу. Если проблема повторится, обратитесь к врачу или владельцу приложения.'
            )}
          </p>
          <Btn variant="primary" onClick={() => window.location.reload()}>{t('Sahifani qayta yuklash', 'Перезагрузить страницу')}</Btn>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================================================================
   Root App — rol tanlash va marshrutlash
   ========================================================================= */
export default function App() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState({ role: null, code: null });
  const [globalError, setGlobalError] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  // undefined = hali tekshirilmagan, null = profil yo'q, obyekt = profil bor
  const [doctorProfile, setDoctorProfile] = useState(undefined);
  const [bigFont, setBigFont] = useState(false);
  const [lang, setLang] = useState('uz');
  const isAdminRoute = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === '1';
  const urlCodeRaw = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('code') : null;
  const urlCode = urlCodeRaw && CODE_RE.test(urlCodeRaw.toUpperCase()) ? urlCodeRaw.toUpperCase() : null;
  const t = (uz, ru) => translate(lang, uz, ru);

  const reportError = useCallback((msg) => setGlobalError(msg), []);

  const toggleBigFont = () => {
    setBigFont((v) => {
      const next = !v;
      store.set('bigFont', next, false).catch(() => {});
      return next;
    });
  };

  const toggleLang = () => {
    setLang((v) => {
      const next = v === 'uz' ? 'ru' : 'uz';
      store.set('lang', next, false).catch(() => {});
      return next;
    });
  };

  // Auth sessiyasini kuzatish (bulut rejimida)
  useEffect(() => {
    if (!hasBackend) return;
    auth.getUser().then((u) => setAuthUser(u)).catch(() => {});
    const off = auth.onChange((u) => setAuthUser(u));
    return off;
  }, []);

  // Shifokor profili (F.I.Sh + litsenziya) — javobgarlik uchun majburiy
  useEffect(() => {
    if (!hasBackend || !authUser) { setDoctorProfile(undefined); return; }
    setDoctorProfile(undefined);
    store.get(`doctor:${authUser.id}`, true)
      .then((p) => setDoctorProfile(p || null))
      .catch(() => { reportError("Shifokor profilini yuklab bo'lmadi."); setDoctorProfile(null); });
  }, [authUser, reportError]);

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
        const bf = await store.get('bigFont', false);
        if (bf) setBigFont(true);
        const l = await store.get('lang', false);
        if (l === 'ru') setLang('ru');
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
    setDoctorProfile(undefined);
    persistSettings({ role: null, code: null });
  };

  const scale = bigFont ? 1.25 : 1;
  const shell = (content) => (
    <LangContext.Provider value={lang}>
      <div
        style={{
          minHeight: '100vh',
          background: `radial-gradient(120% 60% at 50% 0%, ${C.teal} 0%, ${C.tealDeep} 70%)`,
          display: 'flex',
          justifyContent: 'center',
          fontFamily: SANS,
        }}
      >
        <div
          style={{
            width: '100%',
            // zoom kengaytiradi — gorizontal siljish bo'lmasligi uchun kenglikni moslaymiz
            maxWidth: `min(480px, ${100 / scale}vw)`,
            minHeight: `${100 / scale}vh`,
            zoom: scale,
            background: C.paper,
            position: 'relative',
            boxShadow: '0 0 40px rgba(0,0,0,0.25)',
          }}
        >
          {globalError && (
            <div style={{ padding: '12px 16px 0' }}>
              <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setGlobalError(null)} title={t('Xatolik', 'Ошибка')}>
                {globalError}
              </Banner>
            </div>
          )}
          <ErrorBoundary>{content}</ErrorBoundary>

          {/* Til va katta shrift — har doim ko'rinadigan. Ixcham (faqat
              belgi) tugmalar — sahifa pastidagi matn/tugmalarni
              to'smasligi uchun. */}
          <div style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <button
              onClick={toggleLang}
              title={t('Tilni almashtirish', 'Сменить язык')}
              aria-label={t('Tilni almashtirish', 'Сменить язык')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 42, height: 42, borderRadius: 21, cursor: 'pointer',
                background: C.white, color: C.teal, border: `1.5px solid ${C.line}`,
                boxShadow: '0 3px 10px rgba(27,48,56,0.18)',
              }}
            >
              <Globe size={19} />
            </button>
            <button
              onClick={toggleBigFont}
              title={t('Katta shrift rejimi', 'Режим крупного шрифта')}
              aria-label={t('Katta shrift rejimi', 'Режим крупного шрифта')}
              aria-pressed={bigFont}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 42, height: 42, borderRadius: 21, cursor: 'pointer',
                background: bigFont ? C.gold : C.white,
                color: bigFont ? C.tealDeep : C.teal,
                border: `1.5px solid ${bigFont ? C.gold : C.line}`,
                boxShadow: '0 3px 10px rgba(27,48,56,0.18)',
              }}
            >
              <Type size={19} />
            </button>
          </div>
        </div>
      </div>
    </LangContext.Provider>
  );

  if (!ready) {
    return shell(
      <div style={{ padding: 40, textAlign: 'center', color: C.inkSoft, fontFamily: SANS, marginTop: 60 }}>{t('Yuklanmoqda…', 'Загрузка…')}</div>
    );
  }

  if (isAdminRoute) {
    return shell(<AdminCreateDoctor onBack={() => { window.location.href = window.location.pathname; }} onError={reportError} />);
  }

  // QR-kod skanerlanganda kelgan havola (?code=XXXXXXXX) — kodni oldindan
  // to'ldirilgan holda bemor kirish sahifasini ko'rsatamiz. Faqat hali
  // hech qanday rol tanlanmagan yoki bemor kod kiritmagan bo'lsa ishlaydi —
  // mavjud shifokor/dorixona sessiyasini bekor qilmaydi.
  if (urlCode && (!settings.role || (settings.role === 'patient' && !settings.code))) {
    return shell(
      <PatientLogin
        initialCode={urlCode}
        onLogin={(code) => persistSettings({ role: 'patient', code })}
        onBack={() => { window.history.replaceState({}, '', window.location.pathname); logout(); }}
        onError={reportError}
      />
    );
  }

  if (!settings.role) return shell(<RoleSelect onPick={(role) => persistSettings({ role, code: null })} />);
  if (settings.role === 'doctor') {
    if (hasBackend && !authUser) return shell(<DoctorAuth onBack={logout} onError={reportError} />);
    if (hasBackend && authUser && doctorProfile === undefined)
      return shell(<div style={{ padding: 40, textAlign: 'center', color: C.inkSoft }}>{t('Yuklanmoqda…', 'Загрузка…')}</div>);
    if (hasBackend && authUser && doctorProfile === null) {
      return shell(
        <DoctorProfileSetup
          uid={authUser.id}
          email={authUser.email}
          onDone={(p) => setDoctorProfile(p)}
          onError={reportError}
        />
      );
    }
    if (hasBackend && authUser && doctorProfile && !doctorProfile.consentAt) {
      return shell(
        <ConsentScreen
          onError={reportError}
          onAgree={async () => {
            const updated = { ...doctorProfile, consentAt: Date.now() };
            await store.set(`doctor:${authUser.id}`, updated, true);
            setDoctorProfile(updated);
          }}
        />
      );
    }
    const doctorId = authUser?.id || 'local';
    return shell(
      <DoctorApp
        doctorId={doctorId}
        email={authUser?.email}
        doctorProfile={doctorProfile}
        onLogout={doctorLogout}
        onError={reportError}
      />
    );
  }
  if (settings.role === 'pharmacy') return shell(<PharmacyApp onBack={logout} onError={reportError} />);
  if (settings.role === 'patient' && !settings.code)
    return shell(<PatientLogin onLogin={(code) => persistSettings({ role: 'patient', code })} onBack={logout} onError={reportError} />);
  return shell(<PatientApp code={settings.code} onLogout={logout} onError={reportError} />);
}

/* ------------------------------ Rol tanlash ------------------------------ */
function RoleSelect({ onPick }) {
  const t = useT();
  const [legalDoc, setLegalDoc] = useState(null);
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
          {t("Dorini o'z vaqtida qabul qilishga yordam beruvchi hamroh", 'Помощник, который поможет принимать лекарства вовремя')}
        </p>
      </div>

      <p style={{ fontFamily: SANS, fontSize: 15, color: C.ink, textAlign: 'center', marginBottom: 18 }}>{t('Siz kimsiz?', 'Кто вы?')}</p>

      <div style={{ display: 'grid', gap: 14 }}>
        <Card onClick={() => onPick('doctor')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#E9F0F1', color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Stethoscope size={26} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: 19, color: C.tealDeep, fontWeight: 600 }}>{t('Men shifokorman', 'Я врач')}</div>
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>{t("Bemor qo'shaman va retsept yozaman", 'Добавляю пациентов и выписываю рецепты')}</div>
          </div>
          <ChevronRight color={C.inkSoft} />
        </Card>

        <Card onClick={() => onPick('patient')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#FBF1D6', color: '#7A5A12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={26} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: 19, color: C.tealDeep, fontWeight: 600 }}>{t('Men bemorman', 'Я пациент')}</div>
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>{t('Shifokor bergan kod bilan kiraman', 'Вхожу по коду от врача')}</div>
          </div>
          <ChevronRight color={C.inkSoft} />
        </Card>

        <Card onClick={() => onPick('pharmacy')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#EFEAE0', color: '#6B5B3E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Store size={26} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: 19, color: C.tealDeep, fontWeight: 600 }}>{t('Men dorixonachiman', 'Я из аптеки')}</div>
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>{t('Bemor kodi orqali retseptni tekshiraman', 'Проверяю рецепт по коду пациента')}</div>
          </div>
          <ChevronRight color={C.inkSoft} />
        </Card>
      </div>

      <div style={{ textAlign: 'center', marginTop: 22 }}>
        <button onClick={() => setLegalDoc('privacy')} style={legalLinkStyle}>{t('Maxfiylik siyosati', 'Политика конфиденциальности')}</button>
        <span style={{ color: C.inkSoft, margin: '0 6px' }}>·</span>
        <button onClick={() => setLegalDoc('terms')} style={legalLinkStyle}>{t('Foydalanish shartlari', 'Условия использования')}</button>
      </div>

      {legalDoc && <LegalDocument doc={legalDoc} onSwitch={setLegalDoc} onBack={() => setLegalDoc(null)} overlay />}
    </div>
  );
}
const legalLinkStyle = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, textDecoration: 'underline',
};

/* Maxfiylik siyosati va Foydalanish shartlari matni — ikkalasi ham shu
   komponentda, "tab" orqali almashtiriladi. `overlay` bo'lsa butun
   ekranni bosib turuvchi qoplama sifatida (masalan RoleSelect ustida),
   aks holda oddiy sahifa sifatida ko'rsatiladi. */
function LegalDocument({ doc, onSwitch, onBack, overlay }) {
  const t = useT();
  const CONTACT_EMAIL = 'abdurakhimovabdumutal14@gmail.com';
  const UPDATED = t("2026-yil 20-iyulda yangilangan", "Обновлено 20 июля 2026 г.");

  const privacy = [
    {
      title: t('1. Qanday ma\'lumotlar yig\'iladi', '1. Какие данные собираются'),
      text: t(
        "Shifokor: F.I.Sh., email, litsenziya/diplom raqami. Bemor: ism, tashxis, telefon raqami, tug'ilgan yil (ixtiyoriy), dori nomlari va dozalari, qabul qilish tarixi. Dorixona alohida hisob yaratmaydi — faqat bemor kodi orqali retseptni ko'radi.",
        'Врач: ФИО, email, номер лицензии/диплома. Пациент: имя, диагноз, номер телефона, год рождения (необязательно), названия и дозы лекарств, история приёма. Аптека отдельный аккаунт не создаёт — видит рецепт только по коду пациента.'
      ),
    },
    {
      title: t('2. Ma\'lumotlar nima uchun ishlatiladi', '2. Для чего используются данные'),
      text: t(
        "Dori qabul qilish vaqtida eslatma yuborish, shifokorga bemor holatini (qabul foizi, xavf darajasi) ko'rsatish, dorixonaga retseptni tasdiqlash uchun. Ma'lumotlar reklama yoki boshqa maqsadda ishlatilmaydi.",
        'Для отправки напоминаний о приёме лекарств, показа врачу состояния пациента (процент приёма, уровень риска), подтверждения рецепта аптеке. Данные не используются в рекламных или иных целях.'
      ),
    },
    {
      title: t('3. Ma\'lumotlar qayerda saqlanadi', '3. Где хранятся данные'),
      text: t(
        "Ma'lumotlar bulutli infratuzilmada (Supabase, shifrlangan ulanish — HTTPS orqali) saqlanadi. Har bir shifokor faqat o'z bemorlarini ko'radi (baza darajasidagi ruxsat siyosati bilan cheklangan); bemor va dorixona faqat 8 belgili maxfiy kod orqali kiradi.",
        'Данные хранятся в облачной инфраструктуре (Supabase, соединение зашифровано через HTTPS). Каждый врач видит только своих пациентов (ограничено политикой доступа на уровне базы данных); пациент и аптека входят только по секретному 8-значному коду.'
      ),
    },
    {
      title: t('4. Kim ma\'lumotlaringizni ko\'ra oladi', '4. Кто может видеть ваши данные'),
      text: t(
        "Bemorning ma'lumotlarini — unga ulangan shifokor(lar), kodni bilgan dorixona va (texnik xizmat ko'rsatish uchun, zarurat bo'lganda) administrator ko'radi. Ma'lumotlar uchinchi shaxslarga sotilmaydi yoki reklama maqsadida berilmaydi.",
        'Данные пациента видят: привязанный(е) врач(и), аптека, знающая код, и (при необходимости технической поддержки) администратор. Данные не продаются и не передаются третьим лицам в рекламных целях.'
      ),
    },
    {
      title: t('5. Sizning huquqlaringiz', '5. Ваши права'),
      text: t(
        "Ma'lumotlaringizni ko'rish, tuzatish yoki o'chirishni so'rash huquqiga egasiz. Buning uchun shifokoringizga yoki quyidagi manzil orqali administratorga murojaat qiling.",
        'Вы имеете право просматривать, исправлять или запросить удаление своих данных. Для этого обратитесь к своему врачу или к администратору по адресу ниже.'
      ),
    },
    {
      title: t('6. Voyaga yetmaganlar', '6. Несовершеннолетние'),
      text: t(
        "Agar bemor 18 yoshdan kichik bo'lsa, ma'lumotlarni kiritish va ilovadan foydalanishga ota-ona yoki qonuniy vasiy roziligi talab etiladi.",
        'Если пациенту не исполнилось 18 лет, для ввода данных и использования приложения требуется согласие родителя или законного опекуна.'
      ),
    },
    {
      title: t('7. Bog\'lanish', '7. Контакты'),
      text: `${t('Savol yoki so\'rovlar uchun', 'По вопросам и запросам')}: ${CONTACT_EMAIL}`,
    },
  ];

  const terms = [
    {
      title: t('1. Xizmat tavsifi', '1. Описание сервиса'),
      text: t(
        "Vaqtida — dori qabul qilishni nazorat qilish va eslatib turishga yordam beruvchi ilova. Xizmat shifokor, bemor va dorixona o'rtasidagi muvofiqlashtirishni osonlashtiradi.",
        'Vaqtida — приложение, помогающее контролировать приём лекарств и напоминать о нём. Сервис облегчает координацию между врачом, пациентом и аптекой.'
      ),
    },
    {
      title: t('2. MUHIM: tibbiy maslahat emas', '2. ВАЖНО: не является медицинской консультацией'),
      text: t(
        "Ilova shifokor tashxisi yoki maslahati o'rnini bosmaydi — u faqat shifokor tomonidan buyurilgan retseptni eslatib turadi. Favqulodda holatda darhol tez tibbiy yordamga (103) murojaat qiling.",
        'Приложение не заменяет диагноз или консультацию врача — оно лишь напоминает о рецепте, назначенном врачом. В экстренной ситуации немедленно обратитесь в скорую помощь (103).'
      ),
    },
    {
      title: t('3. Foydalanuvchi majburiyatlari', '3. Обязанности пользователя'),
      text: t(
        "To'g'ri ma'lumot kiritish, hisob parolini/bemor kodini maxfiy saqlash va uchinchi shaxslarga bermaslik foydalanuvchining javobgarligidadir.",
        'Ввод достоверных данных, сохранение пароля аккаунта/кода пациента в тайне и непередача их третьим лицам — ответственность пользователя.'
      ),
    },
    {
      title: t('4. Shifokorning javobgarligi', '4. Ответственность врача'),
      text: t(
        "Shifokor hisobini yaratishda taqdim etilgan litsenziya/diplom ma'lumotlari haqiqiy bo'lishi va yozilgan retseptlar uchun javobgarlik shifokor zimmasida qoladi.",
        'Данные лицензии/диплома, предоставленные при создании аккаунта врача, должны быть достоверными; ответственность за назначенные рецепты остаётся за врачом.'
      ),
    },
    {
      title: t('5. Xizmat uzilishlari', '5. Перебои в работе сервиса'),
      text: t(
        "Ilova internet aloqasi yoki server ishlashiga bog'liq — texnik uzilishlar yuz berishi mumkin. Bunday holatlarda yuzaga kelishi mumkin bo'lgan bilvosita zarar uchun javobgarlik cheklangan; muhim tibbiy qarorlarni faqat ilovaga tayanib qabul qilmang.",
        'Приложение зависит от интернет-соединения и работы сервера — возможны технические перебои. Ответственность за косвенный ущерб в таких случаях ограничена; не принимайте важные медицинские решения, полагаясь только на приложение.'
      ),
    },
    {
      title: t('6. Hisobni bloklash/bekor qilish', '6. Блокировка/удаление аккаунта'),
      text: t(
        "Qoidabuzarlik yoki noto'g'ri ma'lumot aniqlansa, administrator hisobni vaqtincha bloklashi yoki bekor qilishi mumkin.",
        'При выявлении нарушений или недостоверных данных администратор может временно заблокировать или удалить аккаунт.'
      ),
    },
    {
      title: t('7. Amal qiluvchi qonunchilik', '7. Применимое законодательство'),
      text: t(
        "Ushbu shartlar O'zbekiston Respublikasi qonunchiligiga muvofiq talqin etiladi.",
        'Настоящие условия толкуются в соответствии с законодательством Республики Узбекистан.'
      ),
    },
    {
      title: t('8. Bog\'lanish', '8. Контакты'),
      text: `${t('Savol yoki so\'rovlar uchun', 'По вопросам и запросам')}: ${CONTACT_EMAIL}`,
    },
  ];

  const sections = doc === 'terms' ? terms : privacy;

  const body = (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => onSwitch && onSwitch('privacy')}
          style={{ ...tabBtnStyle, ...(doc !== 'terms' ? tabBtnActive : {}) }}
        >
          {t('Maxfiylik siyosati', 'Конфиденциальность')}
        </button>
        <button
          onClick={() => onSwitch && onSwitch('terms')}
          style={{ ...tabBtnStyle, ...(doc === 'terms' ? tabBtnActive : {}) }}
        >
          {t('Foydalanish shartlari', 'Условия')}
        </button>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginBottom: 12 }}>{UPDATED}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {sections.map((s, i) => (
          <Card key={i}>
            <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.tealDeep, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontFamily: SANS, fontSize: 14, color: C.inkSoft, lineHeight: 1.5 }}>{s.text}</div>
          </Card>
        ))}
      </div>
    </div>
  );

  if (overlay) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: C.paper, overflowY: 'auto' }}>
        <TopBar title={doc === 'terms' ? t('Foydalanish shartlari', 'Условия использования') : t('Maxfiylik siyosati', 'Политика конфиденциальности')} onBack={onBack} />
        {body}
      </div>
    );
  }
  return (
    <div>
      <TopBar title={doc === 'terms' ? t('Foydalanish shartlari', 'Условия использования') : t('Maxfiylik siyosati', 'Политика конфиденциальности')} onBack={onBack} />
      {body}
    </div>
  );
}
const tabBtnStyle = {
  flex: 1, padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${C.line}`,
  background: C.white, color: C.inkSoft, fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const tabBtnActive = { background: C.teal, color: C.paper, border: `1.5px solid ${C.teal}` };

/* Bir martalik majburiy rozilik ekrani — shifokor (profil to'ldirilgach)
   va bemor (birinchi marta kirganda) uchun ishlatiladi. Rozilik vaqti
   tegishli yozuvga (`doctor:{uid}` yoki `patient:{code}`) yoziladi, shu
   sabab har bir foydalanuvchidan FAQAT bir marta so'raladi. */
function ConsentScreen({ onAgree, onError, busy: externalBusy }) {
  const t = useT();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [legalDoc, setLegalDoc] = useState(null);

  const submit = async () => {
    setBusy(true);
    try {
      await onAgree();
    } catch (e) {
      onError(t("Roziligingizni saqlab bo'lmadi. Qaytadan urinib ko'ring.", 'Не удалось сохранить согласие. Попробуйте ещё раз.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '40px 24px' }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: '#E9F0F1', color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <ShieldCheck size={30} />
      </div>
      <h1 style={{ fontFamily: SERIF, fontSize: 26, color: C.tealDeep, margin: '0 0 6px', fontWeight: 600 }}>
        {t('Davom etishdan oldin', 'Прежде чем продолжить')}
      </h1>
      <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: '0 0 20px', lineHeight: 1.5 }}>
        {t(
          "Vaqtida ilovasidan foydalanish uchun Maxfiylik siyosati va Foydalanish shartlarini o'qib chiqib, roziligingizni tasdiqlashingiz kerak.",
          'Для использования Vaqtida необходимо ознакомиться с Политикой конфиденциальности и Условиями использования и подтвердить согласие.'
        )}
      </p>

      <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
        <Btn variant="ghost" full onClick={() => setLegalDoc('privacy')}>
          <ShieldCheck size={16} /> {t('Maxfiylik siyosatini o\'qish', 'Читать политику конфиденциальности')}
        </Btn>
        <Btn variant="ghost" full onClick={() => setLegalDoc('terms')}>
          <Files size={16} /> {t('Foydalanish shartlarini o\'qish', 'Читать условия использования')}
        </Btn>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
        <span style={{ fontFamily: SANS, fontSize: 14, color: C.ink, lineHeight: 1.4 }}>
          {t('Maxfiylik siyosati va Foydalanish shartlari bilan tanishdim va roziman.', 'Я ознакомлен(а) с Политикой конфиденциальности и Условиями использования и согласен(на) с ними.')}
        </span>
      </label>

      <Btn variant="primary" full onClick={submit} disabled={busy || externalBusy || !checked}>
        {(busy || externalBusy) ? t('Saqlanmoqda…', 'Сохранение…') : t('Roziman, davom etish', 'Согласен(на), продолжить')}
      </Btn>

      {legalDoc && <LegalDocument doc={legalDoc} onSwitch={setLegalDoc} onBack={() => setLegalDoc(null)} overlay />}
    </div>
  );
}

/* ------------------------------ Admin: shifokor hisobi yaratish ------------------------------
   Yashirin yo'l: URL oxiriga "?admin=1" qo'shib ochiladi (RoleSelect'da ko'rinmaydi).
   Admin kodi faqat serverda (Edge Function) tekshiriladi — mijozda saqlanmaydi,
   faqat shu brauzer sessiyasida (sessionStorage) qulaylik uchun eslab qolinadi. */
function AdminCreateDoctor({ onBack, onError }) {
  const t = useT();
  const [secret, setSecret] = useState(() => sessionStorage.getItem('vaqtida_admin_secret') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [created, setCreated] = useState(null);
  const [doctors, setDoctors] = useState(null);
  const [listBusy, setListBusy] = useState(false);
  const [rowBusyUid, setRowBusyUid] = useState(null);
  const [resetResult, setResetResult] = useState(null);

  const genPw = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p;
  };
  const genPassword = () => setPassword(genPw());

  const loadDoctors = async () => {
    if (!secret.trim()) return setErr(t('Admin kodini kiriting.', 'Введите код администратора.'));
    setErr(null);
    setListBusy(true);
    try {
      const list = await adminListDoctors(secret.trim());
      sessionStorage.setItem('vaqtida_admin_secret', secret.trim());
      setDoctors(list);
    } catch (e) {
      setErr(e.message || t("Ro'yxatni yuklab bo'lmadi.", 'Не удалось загрузить список.'));
    } finally {
      setListBusy(false);
    }
  };

  const resetPasswordFor = async (doc) => {
    setErr(null);
    setResetResult(null);
    setRowBusyUid(doc.uid);
    try {
      const newPassword = genPw();
      await adminResetDoctorPassword(secret.trim(), doc.uid, newPassword);
      setResetResult({ email: doc.email, password: newPassword });
    } catch (e) {
      setErr(e.message || t("Parolni tiklab bo'lmadi.", 'Не удалось сбросить пароль.'));
    } finally {
      setRowBusyUid(null);
    }
  };

  const toggleBlocked = async (doc) => {
    setErr(null);
    const next = !doc.blocked;
    const msg = next
      ? t(`${doc.fullName || doc.email}ni bloklaysizmi? U tizimga kira olmay qoladi.`, `Заблокировать ${doc.fullName || doc.email}? Он не сможет войти в систему.`)
      : t(`${doc.fullName || doc.email}ni blokdan chiqarasizmi?`, `Разблокировать ${doc.fullName || doc.email}?`);
    if (!window.confirm(msg)) return;
    setRowBusyUid(doc.uid);
    try {
      await adminSetDoctorBlocked(secret.trim(), doc.uid, next);
      setDoctors((list) => list.map((d) => (d.uid === doc.uid ? { ...d, blocked: next } : d)));
    } catch (e) {
      setErr(e.message || t("Holatni o'zgartirib bo'lmadi.", 'Не удалось изменить статус.'));
    } finally {
      setRowBusyUid(null);
    }
  };

  const submit = async () => {
    setErr(null);
    setCreated(null);
    const em = email.trim().toLowerCase();
    if (!secret.trim()) return setErr(t('Admin kodini kiriting.', 'Введите код администратора.'));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setErr(t("To'g'ri email kiriting.", 'Введите корректный email.'));
    if (password.length < 6) return setErr(t('Parol kamida 6 belgi.', 'Пароль минимум 6 символов.'));
    if (!fullName.trim()) return setErr(t('F.I.Sh. kiriting.', 'Введите ФИО.'));
    if (!licenseNumber.trim()) return setErr(t('Litsenziya/diplom raqamini kiriting.', 'Введите номер лицензии/диплома.'));
    setBusy(true);
    try {
      await adminCreateDoctor(secret.trim(), { email: em, password, fullName: fullName.trim(), licenseNumber: licenseNumber.trim() });
      sessionStorage.setItem('vaqtida_admin_secret', secret.trim());
      setCreated({ email: em, password, fullName: fullName.trim(), licenseNumber: licenseNumber.trim() });
      setEmail(''); setPassword(''); setFullName(''); setLicenseNumber('');
    } catch (e) {
      setErr(e.message || t("Hisob yaratib bo'lmadi.", 'Не удалось создать аккаунт.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '40px 24px' }}>
      <button onClick={onBack} style={{ background: C.paperSoft, border: 'none', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink, marginBottom: 24 }}>
        <ArrowLeft size={20} />
      </button>

      <div style={{ width: 60, height: 60, borderRadius: 16, background: '#EFEAE0', color: '#6B5B3E', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <ShieldCheck size={30} />
      </div>
      <h1 style={{ fontFamily: SERIF, fontSize: 26, color: C.tealDeep, margin: '0 0 6px', fontWeight: 600 }}>
        {t('Shifokor hisobi yaratish', 'Создание аккаунта врача')}
      </h1>
      <p style={{ fontFamily: SANS, fontSize: 14.5, color: C.inkSoft, margin: '0 0 22px', lineHeight: 1.5 }}>
        {t(
          "Litsenziya/diplom raqamini qo'lda tekshirgach, shifokor uchun hisob oching. Login ma'lumotlarini shifokorga xavfsiz yo'l bilan (masalan, shaxsan yoki telefon orqali) yetkazing.",
          'Проверив номер лицензии/диплома вручную, откройте аккаунт для врача. Передайте данные для входа врачу безопасным способом (лично или по телефону).'
        )}
      </p>

      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}
      {created && (
        <Banner type="success" icon={<Check size={18} />} onClose={() => setCreated(null)}>
          <b>{t('Hisob yaratildi:', 'Аккаунт создан:')}</b> {created.fullName} ({created.licenseNumber})<br />
          Email: <b>{created.email}</b> · {t('Vaqtinchalik parol:', 'Временный пароль:')} <b>{created.password}</b>
        </Banner>
      )}

      <Field label={t('Admin kodi', 'Код администратора')}>
        <div style={{ position: 'relative' }}>
          <KeyRound size={18} style={{ position: 'absolute', left: 12, top: 14, color: C.inkSoft }} />
          <input
            style={{ ...inputStyle, paddingLeft: 40 }}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={t('Maxfiy admin kodi', 'Секретный код администратора')}
          />
        </div>
      </Field>

      <Field label={t('Shifokor emaili', 'Email врача')}>
        <div style={{ position: 'relative' }}>
          <Mail size={18} style={{ position: 'absolute', left: 12, top: 14, color: C.inkSoft }} />
          <input
            style={{ ...inputStyle, paddingLeft: 40 }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="shifokor@email.com"
          />
        </div>
      </Field>

      <Field label={t('Vaqtinchalik parol', 'Временный пароль')}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Lock size={18} style={{ position: 'absolute', left: 12, top: 14, color: C.inkSoft }} />
            <input
              style={{ ...inputStyle, paddingLeft: 40 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('Kamida 6 belgi', 'Минимум 6 символов')}
            />
          </div>
          <button
            onClick={genPassword}
            title={t('Tasodifiy parol yaratish', 'Сгенерировать случайный пароль')}
            style={{ width: 48, borderRadius: 12, border: `1.5px solid ${C.line}`, background: C.white, color: C.teal, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </Field>

      <Field label={t('F.I.Sh.', 'ФИО')}>
        <input
          style={inputStyle}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t('Masalan: Yusupova Nilufar Baxtiyorovna', 'Например: Юсупова Нилуфар Бахтияровна')}
        />
      </Field>

      <Field label={t('Litsenziya / diplom raqami', 'Номер лицензии / диплома')}>
        <div style={{ position: 'relative' }}>
          <IdCard size={18} style={{ position: 'absolute', left: 12, top: 14, color: C.inkSoft }} />
          <input
            style={{ ...inputStyle, paddingLeft: 40 }}
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="Masalan: VRC-2019-04521"
          />
        </div>
      </Field>

      <Btn variant="primary" full onClick={submit} disabled={busy} style={{ marginTop: 4 }}>
        {busy ? t('Kutilmoqda…', 'Подождите…') : t('Hisob yaratish', 'Создать аккаунт')}
      </Btn>

      <div style={{ marginTop: 36, paddingTop: 24, borderTop: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: SERIF, fontSize: 20, color: C.tealDeep, fontWeight: 600 }}>
            {t('Shifokorlarni boshqarish', 'Управление врачами')}
          </div>
          <button onClick={loadDoctors} disabled={listBusy} title={t('Yuklash', 'Загрузить')} style={{ ...iconBtn, opacity: listBusy ? 0.5 : 1 }}>
            <RefreshCw size={16} />
          </button>
        </div>

        {resetResult && (
          <Banner type="success" icon={<Check size={18} />} onClose={() => setResetResult(null)}>
            <b>{t('Yangi parol:', 'Новый пароль:')}</b> {resetResult.email} — <b>{resetResult.password}</b>
          </Banner>
        )}

        {doctors === null ? (
          <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 20 }}>
            {t("Ro'yxatni ko'rish uchun yuqoridagi admin kodini kiritib, yangilash tugmasini bosing.", 'Введите код администратора выше и нажмите кнопку обновления, чтобы увидеть список.')}
          </Card>
        ) : doctors.length === 0 ? (
          <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 20 }}>{t("Hozircha shifokor yo'q.", 'Пока нет врачей.')}</Card>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {doctors.map((doc) => (
              <Card key={doc.uid} style={doc.blocked ? { border: `1.5px solid ${C.red}`, background: '#FBF3F2' } : undefined}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 700, color: C.ink }}>{doc.fullName || '—'}</div>
                    <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>{doc.email}</div>
                    {doc.licenseNumber && (
                      <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>{t('Litsenziya', 'Лицензия')}: {doc.licenseNumber}</div>
                    )}
                    <span
                      style={{
                        display: 'inline-block', marginTop: 6, fontFamily: SANS, fontSize: 11.5, fontWeight: 700,
                        padding: '3px 9px', borderRadius: 20,
                        color: doc.blocked ? '#7E2F27' : '#3E5637',
                        background: doc.blocked ? '#F7E2DF' : '#E7F0E3',
                      }}
                    >
                      {doc.blocked ? t('Bloklangan', 'Заблокирован') : t('Faol', 'Активен')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => resetPasswordFor(doc)}
                      disabled={rowBusyUid === doc.uid}
                      title={t('Parolni tiklash', 'Сбросить пароль')}
                      style={{ ...iconBtn, opacity: rowBusyUid === doc.uid ? 0.5 : 1 }}
                    >
                      <KeyRound size={16} />
                    </button>
                    <button
                      onClick={() => toggleBlocked(doc)}
                      disabled={rowBusyUid === doc.uid}
                      title={doc.blocked ? t('Blokdan chiqarish', 'Разблокировать') : t('Bloklash', 'Заблокировать')}
                      style={{ ...iconBtn, color: doc.blocked ? C.sage : C.red, opacity: rowBusyUid === doc.uid ? 0.5 : 1 }}
                    >
                      {doc.blocked ? <ShieldCheck size={16} /> : <Ban size={16} />}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Shifokor: kirish ------------------------------
   Ochiq ro'yxatdan o'tish yo'q — hisoblarni faqat admin yaratadi (litsenziyani
   qo'lda tekshirgach), shu bois bu yerda faqat login mavjud. */
function DoctorAuth({ onBack }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null);
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setErr(t("To'g'ri email kiriting.", 'Введите корректный email.'));
    if (password.length < 6) return setErr(t("Parol kamida 6 belgidan iborat bo'lishi kerak.", 'Пароль должен быть не короче 6 символов.'));
    setBusy(true);
    try {
      await auth.signIn(em, password);
    } catch (e) {
      const m = (e && e.message) || '';
      if (/Invalid login/i.test(m)) setErr(t("Email yoki parol noto'g'ri.", 'Неверный email или пароль.'));
      else if (/confirm/i.test(m)) setErr(t('Email tasdiqlanmagan. Pochtangizni tekshiring.', 'Email не подтверждён. Проверьте почту.'));
      else if (/banned/i.test(m)) setErr(t('Hisobingiz bloklangan. Administratorga murojaat qiling.', 'Ваш аккаунт заблокирован. Обратитесь к администратору.'));
      else setErr(m || t('Kirishda xatolik yuz berdi.', 'Ошибка при входе.'));
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
        {t('Shifokor hisobiga kirish', 'Вход в аккаунт врача')}
      </h1>
      <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: '0 0 22px', lineHeight: 1.5 }}>
        {t('Email va parolingiz bilan kiring.', 'Войдите с помощью email и пароля.')}
      </p>

      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}

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
      <Field label={t('Parol', 'Пароль')}>
        <div style={{ position: 'relative' }}>
          <Lock size={18} style={{ position: 'absolute', left: 12, top: 14, color: C.inkSoft }} />
          <input
            style={{ ...inputStyle, paddingLeft: 40 }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('Kamida 6 belgi', 'Минимум 6 символов')}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
      </Field>

      <Btn variant="primary" full onClick={submit} disabled={busy} style={{ marginTop: 4 }}>
        {busy ? t('Kutilmoqda…', 'Подождите…') : t('Kirish', 'Войти')}
      </Btn>

      <p style={{ textAlign: 'center', marginTop: 16, fontFamily: SANS, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.5 }}>
        {t(
          "Hisobingiz yo'qmi? Yangi shifokor hisoblari litsenziya tekshiruvidan so'ng administrator tomonidan ochiladi.",
          'Нет аккаунта? Новые аккаунты врачей открываются администратором после проверки лицензии.'
        )}
      </p>
    </div>
  );
}

/* Mavjud shifokor hisobida F.I.Sh/litsenziya bo'lmasa — bir martalik to'ldirish */
function DoctorProfileSetup({ uid, email, onDone, onError }) {
  const t = useT();
  const [fullName, setFullName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!fullName.trim()) return setErr(t('F.I.Sh. kiriting.', 'Введите ФИО.'));
    if (!licenseNumber.trim()) return setErr(t('Litsenziya/diplom raqamini kiriting.', 'Введите номер лицензии/диплома.'));
    setErr(null);
    setBusy(true);
    try {
      const profile = { uid, email, fullName: fullName.trim(), licenseNumber: licenseNumber.trim(), createdAt: Date.now() };
      await store.set(`doctor:${uid}`, profile, true);
      onDone(profile);
    } catch (e) {
      onError(t("Profilni saqlab bo'lmadi. Qaytadan urinib ko'ring.", 'Не удалось сохранить профиль. Попробуйте ещё раз.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '40px 24px' }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: '#E9F0F1', color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <IdCard size={30} />
      </div>
      <h1 style={{ fontFamily: SERIF, fontSize: 26, color: C.tealDeep, margin: '0 0 6px', fontWeight: 600 }}>{t("Profilni to'ldiring", 'Заполните профиль')}</h1>
      <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: '0 0 22px', lineHeight: 1.5 }}>
        {t(
          "Bemorlar va dorixonalar retseptni kim yozganini ko'rishi uchun F.I.Sh. va litsenziya raqamingiz kerak.",
          'Пациентам и аптекам нужно видеть, кто выписал рецепт, поэтому укажите ФИО и номер лицензии.'
        )}
      </p>

      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}

      <Field label={t('F.I.Sh.', 'ФИО')}>
        <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('Masalan: Yusupova Nilufar Baxtiyorovna', 'Например: Юсупова Нилуфар Бахтияровна')} />
      </Field>
      <Field label={t('Litsenziya / diplom raqami', 'Номер лицензии / диплома')}>
        <input style={inputStyle} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="Masalan: VRC-2019-04521" onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>

      <Btn variant="primary" full onClick={submit} disabled={busy} style={{ marginTop: 4 }}>
        {busy ? t('Saqlanmoqda…', 'Сохранение…') : t('Saqlash va davom etish', 'Сохранить и продолжить')}
      </Btn>
    </div>
  );
}

/* ------------------------ Sarlavha (header) ------------------------ */
function TopBar({ title, subtitle, onBack, right }) {
  const t = useT();
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, background: C.paper, padding: '16px 16px 12px', borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack && (
          <button onClick={onBack} aria-label={t('Orqaga', 'Назад')} style={{ background: C.paperSoft, border: 'none', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink }}>
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
function DoctorApp({ doctorId, email, doctorProfile, onLogout, onError }) {
  const t = useT();
  const [patients, setPatients] = useState([]);
  const [view, setView] = useState('list'); // list | patient | help
  const [selected, setSelected] = useState(null); // code
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // real-time qayta hisoblash uchun
  const [search, setSearch] = useState('');
  const [onlyDanger, setOnlyDanger] = useState(false);
  const [overall, setOverall] = useState(null);
  const patientsRef = useRef([]);
  useEffect(() => { patientsRef.current = patients; }, [patients]);

  const loadPatients = useCallback(async () => {
    try {
      const list = (await store.get(`patients:${doctorId}`, true)) || [];
      setPatients(list);
    } catch (e) {
      onError(t("Bemorlar ro'yxatini yuklab bo'lmadi.", 'Не удалось загрузить список пациентов.'));
    } finally {
      setLoading(false);
    }
  }, [doctorId, onError, t]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Real-time: bemor doza belgilasa yoki ro'yxat o'zgarsa jonli yangilanadi
  useEffect(() => {
    const off = store.subscribe((payload) => {
      const key = payload?.new?.key || payload?.old?.key;
      if (!key) return;
      if (key === `patients:${doctorId}`) { loadPatients(); return; }
      const m = key.match(/^(?:log|rx|patient):([A-Z0-9]{8})/);
      if (m && patientsRef.current.some((p) => p.code === m[1])) setTick((t) => t + 1);
    });
    return off;
  }, [doctorId, loadPatients]);

  // Barcha bemorlar bo'yicha umumiy qabul qilish foizi (bugun + so'nggi 7 kun).
  // Bir nechta bemorda ketma-ket real-time o'zgarish bo'lsa, har bir "tick"
  // hisoblashni qaytadan boshlab yuborishi mumkin (ko'p bemorda hisoblash
  // sekin) — shu sabab bir zum kutib (debounce), o'zgarishlar tinchigach
  // BIR marta to'liq hisoblaymiz, aks holda natija hech qachon yangilanmay
  // qolishi mumkin edi.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!patients.length) { setOverall({ todayTaken: 0, todayTotal: 0, weekTaken: 0, weekTotal: 0, dangerCodes: [] }); return; }
      let todayTaken = 0, todayTotal = 0, weekTaken = 0, weekTotal = 0;
      const dangerCodes = [];
      for (const p of patients) {
        try {
          const s = await computeStats(p.code);
          todayTaken += s.takenToday;
          todayTotal += s.totalToday;
          if (s.missed3 >= 3 || p.flagged) dangerCodes.push(p.code);
          const w = await computeWeek(p.code);
          for (const d of w.days) { weekTaken += d.taken; weekTotal += d.total; }
        } catch (e) { /* bitta bemorda xato bo'lsa ham davom etamiz */ }
      }
      if (!cancelled) setOverall({ todayTaken, todayTotal, weekTaken, weekTotal, dangerCodes });
    }, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [patients, tick]);

  // Xavfli bemor haqida push-bildirishnoma: joriy obuna holatini tekshiramiz
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unavailable');
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => {
    getPushState().then(setPushOn).catch(() => {});
  }, []);

  const enableDoctorNotif = async () => {
    if (typeof Notification === 'undefined') return onError(t('Bu brauzer bildirishnomalarni qo\'llab-quvvatlamaydi.', 'Этот браузер не поддерживает уведомления.'));
    try {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
      if (p === 'granted' && pushSupported()) {
        try {
          await subscribeToPush(`doctor:${doctorId}`);
          setPushOn(true);
        } catch (e) {
          setPushOn(false);
        }
      }
    } catch (e) {
      onError(t('Bildirishnoma ruxsatini olishda muammo.', 'Проблема при получении разрешения на уведомления.'));
    }
  };

  const filtered = patients.filter((p) => {
    if (onlyDanger && !(overall?.dangerCodes || []).includes(p.code)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.diagnosis.toLowerCase().includes(q) || p.code.includes(q);
  });

  if (view === 'patient' && selected) {
    return (
      <DoctorPatient
        doctorId={doctorId}
        doctorProfile={doctorProfile}
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

  if (view === 'help') {
    return <DoctorHelp onBack={() => setView('list')} />;
  }

  return (
    <div>
      <TopBar
        title={t('Shifokor paneli', 'Панель врача')}
        subtitle={doctorProfile ? `${doctorProfile.fullName} · ${t('Litsenziya', 'Лицензия')}: ${doctorProfile.licenseNumber}` : (email || t('Bemorlar va retseptlar', 'Пациенты и рецепты'))}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn
              variant="quiet"
              onClick={() => setView('help')}
              style={{ padding: '10px 12px', fontSize: 14 }}
            >
              <HelpCircle size={16} /> {t('Yordam', 'Помощь')}
            </Btn>
            <Btn
              variant="quiet"
              onClick={() => {
                if (window.confirm(t('Chiqishni xohlaysizmi?', 'Хотите выйти?'))) onLogout();
              }}
              style={{ padding: '10px 12px', fontSize: 14 }}
            >
              <LogOut size={16} /> {t('Chiqish', 'Выйти')}
            </Btn>
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        <DoctorAddPatient doctorId={doctorId} doctorProfile={doctorProfile} onAdded={loadPatients} onError={onError} />

        {notifPerm === 'granted' && pushOn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontFamily: SANS, fontSize: 12.5, color: C.inkSoft }}>
            <Bell size={13} color={C.sage} /> {t('Xavfli bemorlar haqida bildirishnoma yoqilgan', 'Уведомления о пациентах группы риска включены')}
          </div>
        ) : notifPerm !== 'denied' && (
          <Btn variant="quiet" full onClick={enableDoctorNotif} style={{ marginBottom: 4, fontSize: 14 }}>
            <Bell size={16} /> {t('Xavfli bemor haqida bildirishnoma olish', 'Получать уведомления о пациентах группы риска')}
          </Btn>
        )}

        {patients.length > 0 && overall && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
            <StatBox
              label={t('Bugungi qabul foizi (barcha bemorlar)', 'Процент приёма сегодня (все пациенты)')}
              value={overall.todayTotal ? `${Math.round((overall.todayTaken / overall.todayTotal) * 100)}%` : '—'}
              color={C.sage}
            />
            <StatBox
              label={t("So'nggi 7 kun qabul foizi", 'Процент приёма за 7 дней')}
              value={overall.weekTotal ? `${Math.round((overall.weekTaken / overall.weekTotal) * 100)}%` : '—'}
              color={C.teal}
            />
          </div>
        )}

        <SectionTitle icon={<Users size={18} color={C.teal} />}>{t('Bemorlar', 'Пациенты')} ({patients.length})</SectionTitle>

        {patients.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={17} style={{ position: 'absolute', left: 12, top: 13, color: C.inkSoft }} />
              <input
                style={{ ...inputStyle, paddingLeft: 38 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Ism, tashxis yoki kod bo'yicha qidirish", 'Поиск по имени, диагнозу или коду')}
              />
            </div>
            <button
              onClick={() => setOnlyDanger((v) => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20,
                border: `1.5px solid ${onlyDanger ? C.red : C.line}`,
                background: onlyDanger ? '#F9E9E6' : C.white,
                color: onlyDanger ? C.red : C.inkSoft,
                fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <ShieldAlert size={14} /> {t('Faqat diqqat talab qiladiganlar', 'Только требующие внимания')}{overall?.dangerCodes?.length ? ` (${overall.dangerCodes.length})` : ''}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ color: C.inkSoft, padding: 20, textAlign: 'center' }}>{t('Yuklanmoqda…', 'Загрузка…')}</div>
        ) : patients.length === 0 ? (
          <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 26 }}>{t("Hozircha bemor yo'q. Yuqoridan yangi bemor qo'shing.", 'Пока нет пациентов. Добавьте нового пациента выше.')}</Card>
        ) : filtered.length === 0 ? (
          <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 26 }}>{t('Qidiruvga mos bemor topilmadi.', 'По запросу пациенты не найдены.')}</Card>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered
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

/* Shifokorlar uchun qisqa qo'llanma va ko'p so'raladigan savollar.
   Ular texnik odam bo'lmasligi mumkin — shu sabab bosqichma-bosqich,
   sodda tilda yozilgan (rasmiy hujjat emas, ichki yordam sahifasi). */
function DoctorHelp({ onBack }) {
  const t = useT();
  const steps = [
    {
      title: t('1. Yangi bemor qo‘shish', '1. Добавление нового пациента'),
      text: t(
        "Bosh sahifada \"Yangi bemor\" tugmasini bosing, ism, tashxis va telefon raqamini kiriting. Sizga 8 belgili kod va QR-kod beriladi — shuni bemorga ayting yoki QR-ni skanerlashga bering. Bemor shu kod (va telefon raqami) bilan o'ziga kiradi.",
        'На главной странице нажмите «Новый пациент», введите имя, диагноз и номер телефона. Вам будет выдан код из 8 символов и QR-код — сообщите его пациенту или дайте отсканировать QR. Пациент входит по этому коду (и номеру телефона).'
      ),
    },
    {
      title: t('2. Retsept yozish', '2. Назначение рецепта'),
      text: t(
        "Bemor sahifasida \"Umumiy retsept yozish\" orqali bir nechta dori nomini birdaniga kiriting, so'ng har biriga alohida doza miqdori va qabul qilish vaqtlarini belgilang.",
        'На странице пациента через «Назначить рецепт» сразу впишите названия нескольких лекарств, затем для каждого укажите дозу и время приёма.'
      ),
    },
    {
      title: t('3. Bemor tomonidan kuzatuv', '3. Наблюдение со стороны пациента'),
      text: t(
        "Bemor kunlik dozalarni ko'radi va \"qabul qilindi\" deb belgilaydi. Siz bemor sahifasida uning qabul tarixini va bugungi holatini real vaqtda ko'rib turasiz.",
        'Пациент видит ежедневные дозы и отмечает «принято». Вы видите историю приёма и текущее состояние на странице пациента в реальном времени.'
      ),
    },
    {
      title: t('4. Boshqa shifoxonada davolangan bemor', '4. Пациент, лечившийся в другой клинике'),
      text: t(
        "Agar bemorda Vaqtida'dan oldin kod bo'lsa (masalan, boshqa shifoxonada shifokor bergan bo'lsa), uni qaytadan qo'shmang — \"Mavjud bemorni ulash\" tugmasidan uning kodini kiritib o'z ro'yxatingizga ulang. Bemorning butun tarixi saqlanadi, ikkala shifokor ham ko'radi.",
        'Если у пациента уже есть код Vaqtida (например, выдан в другой клинике), не добавляйте заново — через «Привязать существующего пациента» введите его код. Вся история пациента сохранится, оба врача её увидят.'
      ),
    },
    {
      title: t('5. Bemorni ro‘yxatdan olib tashlash', '5. Удаление пациента из своего списка'),
      text: t(
        "\"Ro'yxatimdan olib tashlash\" faqat SIZNING ro'yxatingizdan o'chiradi — bemorning ma'lumoti va boshqa shifokorlar bilan bog'lanishi saqlanib qoladi.",
        '«Убрать из моего списка» удаляет только из ВАШЕГО списка — данные пациента и его связь с другими врачами сохраняются.'
      ),
    },
    {
      title: t('6. Tarix (audit)', '6. История (аудит)'),
      text: t(
        "Bemor sahifasida \"Tarix\" tugmasi orqali kim, qachon va nimani o'zgartirganini (retsept, doza va h.k.) ko'rasiz.",
        'На странице пациента через кнопку «История» видно, кто, когда и что изменил (рецепт, дозу и т.д.).'
      ),
    },
    {
      title: t('7. Xavfli bemor bildirishnomasi', '7. Уведомление о пациенте группы риска'),
      text: t(
        "Bosh sahifadagi \"Xavfli bemor haqida bildirishnoma olish\" tugmasini yoqsang, bemor ketma-ket 3 marta dozani o'tkazib yuborsa, telefoningizga push-bildirishnoma keladi.",
        'Включив на главной странице «Получать уведомления о пациентах группы риска», вы получите push-уведомление, если пациент подряд пропустит 3 дозы.'
      ),
    },
  ];
  const faqs = [
    {
      q: t('Parolimni unutdim, nima qilaman?', 'Я забыл пароль, что делать?'),
      a: t('Administratorga murojaat qiling — u sizga yangi parol o‘rnatib beradi.', 'Обратитесь к администратору — он установит вам новый пароль.'),
    },
    {
      q: t('Bemor kodini yo‘qotib qo‘ydim, qayta ko‘rish mumkinmi?', 'Я потерял код пациента, можно посмотреть заново?'),
      a: t('Ha. Bemor sahifasida "QR-kod" tugmasini bosing — kod va QR qaytadan ko‘rsatiladi.', 'Да. На странице пациента нажмите «QR-код» — код и QR будут показаны снова.'),
    },
    {
      q: t('Bemorni ro‘yxatimdan o‘chirsam, uning ma’lumoti butunlay yo‘qoladimi?', 'Если я удалю пациента из списка, его данные исчезнут совсем?'),
      a: t('Yo‘q. Faqat sizning shaxsiy ro‘yxatingizdan olib tashlanadi. Agar bemorga boshqa shifokor ham ulangan bo‘lsa, umumiy tarix va retseptlar saqlanadi.', 'Нет. Удаляется только из вашего личного списка. Если пациент привязан к другому врачу, общая история и рецепты сохраняются.'),
    },
    {
      q: t('Bemorga eslatma qanday boradi?', 'Как пациенту приходит напоминание?'),
      a: t('Bemor ilovani telefoniga o‘rnatib, bildirishnomalarni yoqsa, dori vaqti kelganda avtomatik push-eslatma keladi — internet uzilgan bo‘lsa ham, keyinroq qabul belgisi saqlanib qoladi.', 'Если пациент установит приложение на телефон и включит уведомления, при наступлении времени приёма придёт автоматическое push-напоминание — даже при потере интернета отметка о приёме сохранится и отправится позже.'),
    },
    {
      q: t('Ilova tilini o‘zgartirsam bo‘ladimi?', 'Можно ли изменить язык приложения?'),
      a: t('Ha — pastki qismdagi til tugmasi ("O‘zbekcha / Русский") orqali istalgan vaqtda almashtirasiz.', 'Да — переключателем языка внизу («O‘zbekcha / Русский») можно переключить в любой момент.'),
    },
  ];
  return (
    <div>
      <TopBar title={t('Yordam', 'Помощь')} subtitle={t("Qo'llanma va ko'p so'raladigan savollar", 'Руководство и частые вопросы')} onBack={onBack} />
      <div style={{ padding: 16 }}>
        <SectionTitle icon={<Info size={18} color={C.teal} />}>{t('Qanday ishlaydi', 'Как это работает')}</SectionTitle>
        <div style={{ display: 'grid', gap: 10, marginBottom: 8 }}>
          {steps.map((s, i) => (
            <Card key={i}>
              <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.tealDeep, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontFamily: SANS, fontSize: 14, color: C.inkSoft, lineHeight: 1.5 }}>{s.text}</div>
            </Card>
          ))}
        </div>

        <SectionTitle icon={<HelpCircle size={18} color={C.teal} />}>{t("Ko'p so'raladigan savollar", 'Частые вопросы')}</SectionTitle>
        <div style={{ display: 'grid', gap: 10 }}>
          {faqs.map((f, i) => (
            <Card key={i}>
              <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{f.q}</div>
              <div style={{ fontFamily: SANS, fontSize: 14, color: C.inkSoft, lineHeight: 1.5 }}>{f.a}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Yangi bemor qo'shish */
function DoctorAddPatient({ doctorId, doctorProfile, onAdded, onError }) {
  const t = useT();
  const [mode, setMode] = useState(null); // null | 'new' | 'link'
  const [name, setName] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [newCode, setNewCode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkedName, setLinkedName] = useState(null);

  const submit = async () => {
    if (!name.trim() || !diagnosis.trim()) {
      onError(t("Ism va tashxisni to'ldiring.", 'Заполните имя и диагноз.'));
      return;
    }
    if (normalizePhone(phone).length < 9) {
      onError(t(
        "Telefon raqamini kiriting — bemor kirishda kod bilan bir qatorda shu raqam ham so'raladi (xavfsizlik uchun).",
        'Введите номер телефона — при входе он потребуется вместе с кодом (для безопасности).'
      ));
      return;
    }
    if (birthYear && !validBirthYear(birthYear)) {
      onError(t(`Tug'ilgan yil 1900–${curYear()} oralig'ida bo'lsin (yoki bo'sh qoldiring).`, `Год рождения должен быть в диапазоне 1900–${curYear()} (или оставьте поле пустым).`));
      return;
    }
    setSaving(true);
    try {
      const existing = (await store.get(`patients:${doctorId}`, true)) || [];
      // Kod BUTUN tizim bo'yicha noyob bo'lishi kerak (patient:{code} umumiy
      // kalit fazosi) — faqat shu shifokorning ro'yxati bilan solishtirish
      // yetarli emas, boshqa shifokor xuddi shu kodni yaratib qo'yishi mumkin.
      let code = genCode();
      let guard = 0;
      while ((await store.get(`patient:${code}`, true)) && guard < 50) {
        code = genCode();
        guard++;
      }
      const rec = {
        code,
        name: name.trim(),
        diagnosis: diagnosis.trim(),
        phone: phone.trim(),
        birthYear: birthYear ? Number(birthYear) : null,
        createdAt: Date.now(),
        doctorId,
        doctorName: doctorProfile?.fullName || null,
        doctorLicense: doctorProfile?.licenseNumber || null,
      };
      await store.set(`patient:${code}`, rec, true);
      await store.set(`rx:${code}`, { medicines: [] }, true);
      // Bemorga bog'langan HAMMA shifokorlar ro'yxati — keyinroq boshqa
      // shifokor ulansa, shu yerga qo'shiladi (pastdagi submitLink'ga qarang).
      await store.set(`doctors:${code}`, [{
        doctorId, fullName: doctorProfile?.fullName || null, licenseNumber: doctorProfile?.licenseNumber || null, linkedAt: Date.now(),
      }], true);
      await store.set(`patients:${doctorId}`, [...existing, rec], true);
      setNewCode(code);
      setName('');
      setDiagnosis('');
      setPhone('');
      setBirthYear('');
      onAdded();
    } catch (e) {
      onError(t("Bemorni saqlab bo'lmadi. Qaytadan urinib ko'ring.", 'Не удалось сохранить пациента. Попробуйте ещё раз.'));
    } finally {
      setSaving(false);
    }
  };

  /* Boshqa shifokor (masalan boshqa shifoxonada) allaqachon ochgan bemorni
     o'z ro'yxatiga ulaydi — bemor kodi orqali. Umumiy yozuv (patient:/rx:)
     o'zgarmaydi, faqat shu shifokorning o'z ro'yxatiga qo'shiladi — shu
     bois bemor bir nechta shifokorda parallel kuzatilishi mumkin. */
  const submitLink = async () => {
    const c = linkCode.trim().toUpperCase();
    if (!CODE_RE.test(c)) return onError(t(`Kod ${CODE_LEN} ta belgidan iborat bo'lishi kerak.`, `Код должен состоять из ${CODE_LEN} символов.`));
    setLinking(true);
    try {
      const patient = await store.get(`patient:${c}`, true);
      if (!patient) {
        onError(t('Bunday kod topilmadi.', 'Такой код не найден.'));
        setLinking(false);
        return;
      }
      const existing = (await store.get(`patients:${doctorId}`, true)) || [];
      if (existing.some((p) => p.code === c)) {
        onError(t("Bu bemor allaqachon ro'yxatingizda bor.", 'Этот пациент уже есть в вашем списке.'));
        setLinking(false);
        return;
      }
      await store.set(`patients:${doctorId}`, [...existing, patient], true);
      // Shu shifokorni ham bemorning "tayinlagan shifokorlar" ro'yxatiga
      // qo'shamiz — bemor/dorixona endi ikkala shifokorni ham ko'radi.
      try {
        const doctorsList = (await store.get(`doctors:${c}`, true)) || [];
        if (!doctorsList.some((d) => d.doctorId === doctorId)) {
          await store.set(`doctors:${c}`, [...doctorsList, {
            doctorId, fullName: doctorProfile?.fullName || null, licenseNumber: doctorProfile?.licenseNumber || null, linkedAt: Date.now(),
          }], true);
        }
      } catch (e) { /* asosiy ulash muvaffaqiyatli bo'lgani muhim — jim o'tkazamiz */ }
      setLinkedName(patient.name);
      setLinkCode('');
      onAdded();
    } catch (e) {
      onError(t("Ulab bo'lmadi. Qaytadan urinib ko'ring.", 'Не удалось привязать. Попробуйте ещё раз.'));
    } finally {
      setLinking(false);
    }
  };

  if (linkedName) {
    return (
      <Card style={{ background: C.sage, border: 'none', color: C.white }}>
        <div style={{ fontFamily: SANS, fontSize: 14, opacity: 0.9 }}>
          {t('Bemor ro\'yxatingizga ulandi:', 'Пациент добавлен в ваш список:')}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, margin: '6px 0' }}>{linkedName}</div>
        <Btn variant="quiet" full onClick={() => { setLinkedName(null); setMode(null); }} style={{ marginTop: 4 }}>
          {t('Yaxshi, yopish', 'Хорошо, закрыть')}
        </Btn>
      </Card>
    );
  }

  if (newCode) {
    return (
      <Card style={{ background: C.teal, border: 'none', color: C.paper }}>
        <div style={{ fontFamily: SANS, fontSize: 14, opacity: 0.85 }}>{t('Bemor qo\'shildi. Ushbu kodni bemorga bering:', 'Пациент добавлен. Передайте этот код пациенту:')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 6px' }}>
          <div style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: 3, fontWeight: 700, color: C.gold }}>{newCode}</div>
          <Btn
            variant="gold"
            onClick={() => {
              try { navigator.clipboard.writeText(newCode); } catch (e) {}
            }}
            style={{ padding: '10px 12px' }}
          >
            <Copy size={16} /> {t('Nusxa', 'Копия')}
          </Btn>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: C.paper, borderRadius: 12, padding: 14, marginTop: 4 }}>
          <QrCodeImg value={patientLoginUrl(newCode)} size={140} />
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.tealDeep, textAlign: 'center' }}>
            {t("Bemor shu QR-kodni skanerlab, kodni qo'lda yozmasdan kirishi mumkin", 'Пациент может отсканировать этот QR-код и войти без ручного ввода')}
          </div>
        </div>
        <Btn variant="quiet" full onClick={() => setNewCode(null)} style={{ marginTop: 8 }}>
          {t('Yaxshi, yopish', 'Хорошо, закрыть')}
        </Btn>
      </Card>
    );
  }

  return (
    <Card>
      {mode === null ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="primary" onClick={() => setMode('new')} style={{ flex: 1 }}>
            <UserPlus size={18} /> {t("Yangi bemor", 'Новый пациент')}
          </Btn>
          <Btn variant="ghost" onClick={() => setMode('link')} style={{ flex: 1 }}>
            <Link2 size={18} /> {t("Mavjud bemorni ulash", 'Привязать пациента')}
          </Btn>
        </div>
      ) : mode === 'new' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: C.tealDeep, fontWeight: 600 }}>{t('Yangi bemor', 'Новый пациент')}</div>
            <button onClick={() => setMode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft }}>
              <X size={20} />
            </button>
          </div>
          <Field label={t('Bemor ismi', 'Имя пациента')}>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Masalan: Karimova Dilnoza', 'Например: Каримова Дилноза')} />
          </Field>
          <DiagnosisField label={t('Tashxis', 'Диагноз')} value={diagnosis} onChange={setDiagnosis} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1.4 }}>
              <Field label={t('Telefon', 'Телефон')} hint={t('Kirishda kod bilan birga so\'raladi', 'Понадобится вместе с кодом при входе')}>
                <input style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label={t("Tug'ilgan yil", 'Год рождения')} hint={t('Ixtiyoriy', 'Необязательно')}>
                <input style={inputStyle} value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="1985" inputMode="numeric" />
              </Field>
            </div>
          </div>
          <Btn variant="gold" full onClick={submit} disabled={saving}>
            {saving ? t('Saqlanmoqda…', 'Сохранение…') : t("Qo'shish va kod olish", 'Добавить и получить код')}
          </Btn>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: C.tealDeep, fontWeight: 600 }}>{t('Mavjud bemorni ulash', 'Привязать существующего пациента')}</div>
            <button onClick={() => { setMode(null); setLinkCode(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
            {t(
              "Bemor boshqa shifoxonada (boshqa shifokorda) allaqachon ro'yxatdan o'tgan bo'lsa, uning kodini kiriting — bemor sizning ro'yxatingizga ham qo'shiladi, umumiy tarixi saqlanadi.",
              'Если пациент уже зарегистрирован в другой больнице (у другого врача), введите его код — пациент добавится и в ваш список, вся история сохранится.'
            )}
          </div>
          <Field label={t('Bemor kodi', 'Код пациента')}>
            <input
              style={{ ...inputStyle, fontFamily: SERIF, fontSize: 20, textAlign: 'center', letterSpacing: 4, fontWeight: 700, color: C.tealDeep, textTransform: 'uppercase' }}
              value={linkCode}
              onChange={(e) => setLinkCode(cleanCodeInput(e.target.value))}
              placeholder="XXXXXXXX"
              autoCapitalize="characters"
              onKeyDown={(e) => e.key === 'Enter' && submitLink()}
            />
          </Field>
          <Btn variant="gold" full onClick={submitLink} disabled={linking}>
            <Link2 size={18} /> {linking ? t('Ulanmoqda…', 'Привязка…') : t('Ulash', 'Привязать')}
          </Btn>
        </div>
      )}
    </Card>
  );
}

/* Bemor qatori — statistika va ogohlantirish belgisi bilan */
function PatientRow({ patient, tick, onOpen, onError }) {
  const t = useT();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await computeStats(patient.code);
        if (!cancelled) setStats(s);
      } catch (e) {
        onError(t("Statistikani hisoblab bo'lmadi.", 'Не удалось рассчитать статистику.'));
      }
    })();
    return () => { cancelled = true; };
  }, [patient.code, tick, onError, t]);

  const danger = (stats && stats.missed3 >= 3) || patient.flagged;

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
            <Pill_ text={`${t('Bugun', 'Сегодня')}: ${stats.takenToday}/${stats.totalToday}`} color={C.teal} />
            {stats.missed3 >= 3 && <Pill_ text={t(`3 kunda ${stats.missed3} o'tkazib yuborilgan`, `Пропущено за 3 дня: ${stats.missed3}`)} color={C.red} />}
            {patient.flagged && <Pill_ text={t('Kuzatuvda', 'Под наблюдением')} color={C.red} />}
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
  const t = useT();
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

  if (err) return <Card style={{ textAlign: 'center', color: C.red, padding: 16 }}>{t("Tarixni yuklab bo'lmadi.", 'Не удалось загрузить историю.')}</Card>;
  if (!data) return <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 16 }}>{t('Yuklanmoqda…', 'Загрузка…')}</Card>;

  const WD = t('Ya,Du,Se,Ch,Pa,Ju,Sh', 'Вс,Пн,Вт,Ср,Чт,Пт,Сб').split(',');
  const colorFor = (st) => (st === 'full' ? C.sage : st === 'partial' ? C.gold : st === 'missed' ? C.red : C.paperSoft);
  const anyMeds = data.days.some((d) => d.total > 0);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        {data.days.map((d) => (
          <div key={d.date} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, color: d.isToday ? C.tealDeep : C.inkSoft, fontWeight: d.isToday ? 700 : 500, marginBottom: 6 }}>{WD[d.dow]}</div>
            <div
              title={`${d.date}: ${d.total ? `${d.taken}/${d.total} ${t('doza', 'доз')}` : t("dori yo'q", 'нет лекарств')}`}
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
          <span style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft }}>{t("So'nggi 7 kunda dori tayinlanmagan", 'За последние 7 дней лекарств не назначено')}</span>
        ) : data.streak > 0 ? (
          <span style={{ fontFamily: SANS, fontSize: 14, color: '#3E5637', fontWeight: 700 }}>🔥 {t(`${data.streak} kun ketma-ket to'liq`, `${data.streak} дн. подряд полностью`)}</span>
        ) : (
          <span style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>{t("Ketma-ketlik yo'q — bugun to'liq qabul qilib boshlang", 'Серии нет — начните сегодня с полного приёма')}</span>
        )}
      </div>
    </Card>
  );
}

/* Bemor va shifokor o'rtasidagi oddiy xabar almashinuvi — real vaqtli
   chat emas, har ikki tomon ilovani ochganda ko'radi (real-time
   obuna orqali tezroq yangilanadi). Bemorga ulangan BARCHA shifokorlar
   bitta umumiy suhbatni ko'radi — audit tarixi bilan bir xil naqsh. */
function MessageThread({ code, viewerRole, doctorProfile }) {
  const t = useT();
  const lang = useContext(LangContext);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setMessages((await store.get(`messages:${code}`, true)) || []);
    } catch (e) {
      setMessages([]);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = store.subscribe((payload) => {
      const key = payload?.new?.key || payload?.old?.key;
      if (key === `messages:${code}`) load();
    });
    return off;
  }, [code, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const list = (await store.get(`messages:${code}`, true)) || [];
      const entry = {
        id: uid(),
        from: viewerRole,
        text: trimmed,
        at: Date.now(),
        doctorName: viewerRole === 'doctor' ? (doctorProfile?.fullName || null) : undefined,
      };
      const next = [...list, entry].slice(-200);
      await store.set(`messages:${code}`, next, true);
      setMessages(next);
      setText('');
      notifyNewMessage({ code, from: viewerRole, text: trimmed, doctorName: entry.doctorName });
    } catch (e) {
      // xato bo'lsa ham matn saqlanib qoladi — foydalanuvchi qayta yuborishi mumkin
    } finally {
      setSending(false);
    }
  };

  return (
    <Card style={{ padding: 12 }}>
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 8, marginBottom: 10 }}>
        {messages === null ? (
          <div style={{ color: C.inkSoft, fontSize: 13.5, textAlign: 'center', padding: 10 }}>{t('Yuklanmoqda…', 'Загрузка…')}</div>
        ) : messages.length === 0 ? (
          <div style={{ color: C.inkSoft, fontSize: 13.5, textAlign: 'center', padding: 10 }}>{t("Hali xabar yo'q.", 'Пока нет сообщений.')}</div>
        ) : (
          messages.map((m) => {
            const mine = m.from === viewerRole;
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '80%', padding: '8px 12px', borderRadius: 14,
                    background: mine ? C.teal : C.paperSoft,
                    color: mine ? C.paper : C.ink,
                    fontFamily: SANS, fontSize: 14, lineHeight: 1.4,
                  }}
                >
                  {!mine && m.from === 'doctor' && m.doctorName && (
                    <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.75, marginBottom: 2 }}>{m.doctorName}</div>
                  )}
                  {m.text}
                  <div style={{ fontSize: 10.5, opacity: 0.65, marginTop: 3, textAlign: 'right' }}>
                    {new Date(m.at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('Xabar yozing…', 'Напишите сообщение…')}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{ ...iconBtn, width: 46, background: C.teal, color: C.paper, opacity: sending || !text.trim() ? 0.5 : 1 }}
        >
          <Send size={18} />
        </button>
      </div>
    </Card>
  );
}

/* Shifokor: bitta bemor sahifasi — retsept + statistika */
function DoctorPatient({ doctorId, doctorProfile, code, onBack, onError, onDeletedPatient }) {
  const t = useT();
  const lang = useContext(LangContext);
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
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState(null);
  const [quickMode, setQuickMode] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [otherDoctors, setOtherDoctors] = useState([]);
  const [flagged, setFlagged] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await store.get(`patient:${code}`, true);
      const r = (await store.get(`rx:${code}`, true)) || { medicines: [] };
      const t = (await store.get(`templates:${doctorId}`, true)) || [];
      const doctorsList = (await store.get(`doctors:${code}`, true)) || [];
      const myList = (await store.get(`patients:${doctorId}`, true)) || [];
      setPatient(p);
      if (p) { setEName(p.name || ''); setEDx(p.diagnosis || ''); setEPhone(p.phone || ''); setEYear(p.birthYear ? String(p.birthYear) : ''); }
      setRx(r);
      setTemplates(t);
      setOtherDoctors(doctorsList.filter((d) => d.doctorId !== doctorId));
      setFlagged(Boolean(myList.find((mp) => mp.code === code)?.flagged));
      setStats(await computeStats(code));
    } catch (e) {
      onError(t("Bemor ma'lumotini yuklab bo'lmadi.", 'Не удалось загрузить данные пациента.'));
    } finally {
      setLoading(false);
    }
  }, [code, doctorId, onError, t]);

  useEffect(() => { load(); }, [load]);

  // Real-time: bemor doza belgilasa statistika/tarix jonli yangilanadi
  useEffect(() => {
    const off = store.subscribe((payload) => {
      const key = payload?.new?.key || payload?.old?.key;
      if (!key) return;
      if (key === `patient:${code}` || key === `rx:${code}` || key === `doctors:${code}` || key === `patients:${doctorId}` || key.startsWith(`log:${code}:`)) load();
    });
    return off;
  }, [code, doctorId, load]);

  /* Diqqat talab qiladi deb qo'lda belgilash — FAQAT shu shifokorning
     o'z ro'yxatida (patients:{doctorId}, owner=doctorId) saqlanadi, shu
     sabab boshqa shifokorlarga yoki bemorga ko'rinmaydi. */
  const toggleFlag = async () => {
    const next = !flagged;
    setFlagged(next); // optimistik
    try {
      const myList = (await store.get(`patients:${doctorId}`, true)) || [];
      await store.set(`patients:${doctorId}`, myList.map((p) => (p.code === code ? { ...p, flagged: next } : p)), true);
    } catch (e) {
      setFlagged(!next);
      onError(t("Belgini o'zgartirib bo'lmadi.", 'Не удалось изменить отметку.'));
    }
  };

  const saveRx = async (medicines, action = 'updated') => {
    try {
      const next = {
        medicines,
        updatedAt: Date.now(),
        updatedBy: { doctorId, doctorName: doctorProfile?.fullName || null, doctorLicense: doctorProfile?.licenseNumber || null },
      };
      await store.set(`rx:${code}`, next, true);
      setRx(next);
      setStats(await computeStats(code));
      // Javobgarlik uchun audit izi — kim, qachon, nima o'zgartirdi
      try {
        const auditList = (await store.get(`audit:${code}`, true)) || [];
        const entry = {
          at: Date.now(),
          doctorId,
          doctorName: doctorProfile?.fullName || null,
          doctorLicense: doctorProfile?.licenseNumber || null,
          action,
          medicinesCount: medicines.length,
        };
        await store.set(`audit:${code}`, [...auditList, entry].slice(-100), true);
      } catch (e) { console.warn('Audit yozib bo\'lmadi (retsept baribir saqlandi):', e); }
    } catch (e) {
      onError(t("Retseptni saqlab bo'lmadi.", 'Не удалось сохранить рецепт.'));
    }
  };

  const upsertMed = async (med) => {
    const list = rx.medicines || [];
    const exists = list.some((m) => m.id === med.id);
    const next = exists ? list.map((m) => (m.id === med.id ? med : m)) : [...list, med];
    await saveRx(next, exists ? t('dori tahrirlandi', 'лекарство изменено') : t("dori qo'shildi", 'лекарство добавлено'));
    setEditing(null);
  };

  const deleteMed = async (id) => {
    if (!window.confirm(t('Bu dorini o\'chirasizmi?', 'Удалить это лекарство?'))) return;
    await saveRx((rx.medicines || []).filter((m) => m.id !== id), t('dori o\'chirildi', 'лекарство удалено'));
  };

  /* Umumiy retsept: avval faqat dori nomlarini tez kiritish, doza/vaqt
     keyinroq har biri uchun alohida belgilanadi (needsSetup = true). */
  const addQuickMeds = async (names) => {
    const clean = names.map((n) => n.trim()).filter(Boolean);
    if (!clean.length) return onError(t('Kamida bitta dori nomini kiriting.', 'Введите хотя бы одно название лекарства.'));
    const newMeds = clean.map((name) => ({
      id: uid(),
      name,
      dosage: '',
      times: [],
      durationDays: null,
      startDate: todayStr(),
      instructions: '',
    }));
    await saveRx([...(rx.medicines || []), ...newMeds], t(`umumiy retseptga qo'shildi (${newMeds.length} ta dori)`, `добавлено в общий рецепт (${newMeds.length} лек.)`));
    setQuickMode(false);
  };

  /* --- Retsept shablonlari --- */
  const stripMed = (m) => ({ name: m.name, dosage: m.dosage, times: m.times, durationDays: m.durationDays, instructions: m.instructions });

  const applyTemplate = async (tpl) => {
    const newMeds = (tpl.medicines || []).map((m) => ({ ...stripMed(m), id: uid(), startDate: todayStr() }));
    if (!newMeds.length) return onError(t('Bu shablonda dori yo\'q.', 'В этом шаблоне нет лекарств.'));
    await saveRx([...(rx.medicines || []), ...newMeds], t('shablondan qo\'shildi', 'добавлено из шаблона'));
    setTplMode(null);
  };

  const saveAsTemplate = async () => {
    const title = tplTitle.trim();
    if (!title) return onError(t('Shablon nomini kiriting.', 'Введите название шаблона.'));
    if (!(rx.medicines || []).length) return onError(t('Saqlash uchun retseptda kamida bitta dori bo\'lishi kerak.', 'Для сохранения в рецепте должно быть хотя бы одно лекарство.'));
    try {
      const list = (await store.get(`templates:${doctorId}`, true)) || [];
      const rec = { id: uid(), title, medicines: (rx.medicines || []).map(stripMed) };
      const next = [...list, rec];
      await store.set(`templates:${doctorId}`, next, true);
      setTemplates(next);
      setTplMode(null);
      setTplTitle('');
    } catch (e) {
      onError(t("Shablonni saqlab bo'lmadi.", 'Не удалось сохранить шаблон.'));
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm(t('Shablonni o\'chirasizmi?', 'Удалить шаблон?'))) return;
    try {
      const next = templates.filter((tpl) => tpl.id !== id);
      await store.set(`templates:${doctorId}`, next, true);
      setTemplates(next);
    } catch (e) {
      onError(t("Shablonni o'chirib bo'lmadi.", 'Не удалось удалить шаблон.'));
    }
  };

  const savePatientInfo = async () => {
    const name = eName.trim(), diagnosis = eDx.trim(), phone = ePhone.trim();
    if (!name || !diagnosis) return onError(t('Ism va tashxis bo\'sh bo\'lmasin.', 'Имя и диагноз не должны быть пустыми.'));
    if (eYear && !validBirthYear(eYear)) return onError(t(`Tug'ilgan yil 1900–${curYear()} oralig'ida bo'lsin (yoki bo'sh qoldiring).`, `Год рождения должен быть в диапазоне 1900–${curYear()} (или оставьте поле пустым).`));
    const birthYear = eYear ? Number(eYear) : null;
    try {
      const next = { ...patient, name, diagnosis, phone, birthYear };
      await store.set(`patient:${code}`, next, true);
      const list = (await store.get(`patients:${doctorId}`, true)) || [];
      await store.set(`patients:${doctorId}`, list.map((p) => (p.code === code ? { ...p, name, diagnosis, phone, birthYear } : p)), true);
      setPatient(next);
      setEditInfo(false);
    } catch (e) {
      onError(t("Ma'lumotni saqlab bo'lmadi.", 'Не удалось сохранить данные.'));
    }
  };

  /* Bemor endi bir nechta shifokorga (masalan turli shifoxonalarda) bog'lanishi
     mumkin bo'lgani uchun bu yerda faqat SHU shifokorning o'z ro'yxatidan olib
     tashlaymiz — umumiy yozuv (retsept, tarix) boshqa shifokorlar uchun
     saqlanib qoladi, chunki ular ham shu bemorga bog'langan bo'lishi mumkin. */
  const deletePatient = async () => {
    if (!window.confirm(t(
      `${patient?.name || 'Bemor'}ni ro'yxatingizdan olib tashlaysizmi? Bemorning umumiy ma'lumoti (boshqa shifokorlar uchun) saqlanib qoladi.`,
      `Удалить ${patient?.name || 'пациента'} из вашего списка? Общие данные пациента (для других врачей) сохранятся.`
    ))) return;
    try {
      const list = (await store.get(`patients:${doctorId}`, true)) || [];
      await store.set(`patients:${doctorId}`, list.filter((p) => p.code !== code), true);
      // Shu shifokorni "tayinlagan shifokorlar" ro'yxatidan ham olib tashlaymiz
      try {
        const doctorsList = (await store.get(`doctors:${code}`, true)) || [];
        await store.set(`doctors:${code}`, doctorsList.filter((d) => d.doctorId !== doctorId), true);
      } catch (e) { /* asosiy ro'yxatdan olib tashlash muvaffaqiyatli bo'lgani muhim */ }
      onDeletedPatient();
    } catch (e) {
      onError(t("Ro'yxatdan olib tashlab bo'lmadi.", 'Не удалось удалить из списка.'));
    }
  };

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.inkSoft }}>{t('Yuklanmoqda…', 'Загрузка…')}</div>;
  if (!patient) return (
    <div>
      <TopBar title={t('Topilmadi', 'Не найдено')} onBack={onBack} />
      <div style={{ padding: 16 }}><Banner type="error" icon={<AlertTriangle size={18} />}>{t('Bemor topilmadi.', 'Пациент не найден.')}</Banner></div>
    </div>
  );

  const danger = (stats && stats.missed3 >= 3) || flagged;

  return (
    <div>
      <TopBar title={patient.name} subtitle={`${t('Kod', 'Код')}: ${patient.code}`} onBack={onBack} />
      <div style={{ padding: 16 }}>
        {!editInfo ? (
          <Card style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 2 }}>{t('Bemor', 'Пациент')}</div>
                <div style={{ fontFamily: SANS, fontSize: 16, color: C.ink, fontWeight: 700, marginBottom: 2 }}>{patient.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
                  {patient.phone && (
                    <a href={`tel:${patient.phone.replace(/\s/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: SANS, fontSize: 13.5, color: C.teal, textDecoration: 'none', fontWeight: 600 }}>
                      <Phone size={14} /> {patient.phone}
                    </a>
                  )}
                  {patient.birthYear && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: SANS, fontSize: 13.5, color: C.inkSoft }}>
                      <CalendarDays size={14} /> {patient.birthYear}-{t('y.', 'г.')} ({curYear() - patient.birthYear} {t('yosh', 'лет')})
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 2 }}>{t('Tashxis', 'Диагноз')}</div>
                <div style={{ fontFamily: SERIF, fontSize: 19, color: C.tealDeep, fontWeight: 600 }}>{patient.diagnosis}</div>
                {otherDoctors.length > 0 && (
                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.inkSoft, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Users size={13} />
                    {t(
                      `Bu bemor boshqa shifokorga ham ulangan: ${otherDoctors.map((d) => d.fullName).filter(Boolean).join(', ')}`,
                      `Этот пациент также привязан к другим врачам: ${otherDoctors.map((d) => d.fullName).filter(Boolean).join(', ')}`
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  onClick={toggleFlag}
                  title={flagged ? t("Kuzatuv belgisini olib tashlash", 'Убрать отметку наблюдения') : t("Diqqat talab qiladi deb belgilash", 'Отметить как требующего внимания')}
                  aria-pressed={flagged}
                  style={{ ...iconBtn, background: flagged ? '#F7E2DF' : C.paperSoft, color: flagged ? C.red : C.ink }}
                >
                  <ShieldAlert size={16} />
                </button>
                <button onClick={() => setShowQr((v) => !v)} title={t('QR-kod', 'QR-код')} style={iconBtn}>
                  <QrCode size={16} />
                </button>
                <button onClick={() => { setEName(patient.name); setEDx(patient.diagnosis); setEPhone(patient.phone || ''); setEYear(patient.birthYear ? String(patient.birthYear) : ''); setEditInfo(true); }} title={t('Tahrirlash', 'Редактировать')} style={iconBtn}>
                  <Pencil size={16} />
                </button>
              </div>
            </div>
            {showQr && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: C.paperSoft, borderRadius: 12, padding: 14, marginTop: 12 }}>
                <QrCodeImg value={patientLoginUrl(patient.code)} size={140} />
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.inkSoft, textAlign: 'center' }}>
                  {t("Bemor shu QR-kodni skanerlab kirishi mumkin", 'Пациент может отсканировать этот QR-код для входа')}
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card style={{ marginBottom: 4, border: `1.5px solid ${C.gold}`, background: '#FFFDF7' }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, color: C.tealDeep, fontWeight: 600, marginBottom: 10 }}>{t("Bemor ma'lumotini tahrirlash", 'Редактировать данные пациента')}</div>
            <Field label={t('Bemor ismi', 'Имя пациента')}>
              <input style={inputStyle} value={eName} onChange={(e) => setEName(e.target.value)} placeholder={t('Ism familiya', 'Имя и фамилия')} />
            </Field>
            <DiagnosisField label={t('Tashxis', 'Диагноз')} value={eDx} onChange={setEDx} />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1.4 }}>
                <Field label={t('Telefon', 'Телефон')} hint={t('Ixtiyoriy', 'Необязательно')}>
                  <input style={inputStyle} type="tel" value={ePhone} onChange={(e) => setEPhone(e.target.value)} placeholder="+998 90 123 45 67" />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label={t("Tug'ilgan yil", 'Год рождения')} hint={t('Ixtiyoriy', 'Необязательно')}>
                  <input style={inputStyle} value={eYear} onChange={(e) => setEYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="1985" inputMode="numeric" onKeyDown={(e) => e.key === 'Enter' && savePatientInfo()} />
                </Field>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setEditInfo(false)} style={{ flex: 1 }}>{t('Bekor qilish', 'Отмена')}</Btn>
              <Btn variant="gold" onClick={savePatientInfo} style={{ flex: 1 }}>{t('Saqlash', 'Сохранить')}</Btn>
            </div>
          </Card>
        )}

        {danger && (
          <div style={{ marginTop: 12 }}>
            <Banner type="error" icon={<ShieldAlert size={18} />} title={t('Diqqat talab qiladi', 'Требует внимания')}>
              {stats && stats.missed3 >= 3 && (
                <div>{t(`Bemor so'nggi 3 kunda ${stats.missed3} ta dozani o'tkazib yubordi. Bog'lanib holatini so'rang.`, `Пациент пропустил ${stats.missed3} доз(ы) за последние 3 дня. Свяжитесь и уточните состояние.`)}</div>
              )}
              {flagged && (
                <div style={{ marginTop: stats && stats.missed3 >= 3 ? 4 : 0 }}>{t("Siz bu bemorni qo'lda kuzatuvga belgilagansiz (faqat sizga ko'rinadi).", 'Вы вручную отметили этого пациента для наблюдения (видно только вам).')}</div>
              )}
            </Banner>
          </div>
        )}

        {/* Statistika */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <StatBox label={t('Bugun qabul qilingan', 'Принято сегодня')} value={`${stats.takenToday}/${stats.totalToday}`} color={C.sage} />
          <StatBox label={t("3 kunda o'tkazib yuborilgan", 'Пропущено за 3 дня')} value={stats.missed3} color={stats.missed3 >= 3 ? C.red : C.teal} />
        </div>

        {/* Haftalik tarix */}
        <SectionTitle icon={<CalendarDays size={18} color={C.teal} />}>{t("So'nggi 7 kun", 'Последние 7 дней')}</SectionTitle>
        <WeeklyHistory code={code} refreshKey={(rx.medicines || []).length} />

        {/* Retsept */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionTitle icon={<ClipboardList size={18} color={C.teal} />}>{t('Retsept', 'Рецепт')}</SectionTitle>
          <button
            onClick={async () => {
              const opening = !showAudit;
              setShowAudit(opening);
              if (opening) {
                // Har safar ochilganda qaytadan yuklaymiz — audit yozuvi
                // retsept saqlangandan bir zum keyin serverga tushishi mumkin,
                // shuning uchun eski (keshlangan) natijani ko'rsatmaymiz.
                setAudit(null);
                try { setAudit((await store.get(`audit:${code}`, true)) || []); }
                catch (e) { onError(t("O'zgarishlar tarixini yuklab bo'lmadi.", 'Не удалось загрузить историю изменений.')); setAudit([]); }
              }
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.teal, display: 'flex', alignItems: 'center', gap: 5, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}
          >
            <History size={15} /> {t('Tarix', 'История')}
          </button>
        </div>

        {showAudit && (
          <Card style={{ marginBottom: 10, background: C.paperSoft }}>
            {audit === null ? (
              <div style={{ color: C.inkSoft, fontSize: 13.5 }}>{t('Yuklanmoqda…', 'Загрузка…')}</div>
            ) : audit.length === 0 ? (
              <div style={{ color: C.inkSoft, fontSize: 13.5 }}>{t("Hali o'zgarish yo'q.", 'Изменений пока нет.')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {audit.slice().reverse().slice(0, 15).map((a, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink, borderBottom: i < audit.length - 1 ? `1px solid ${C.line}` : 'none', paddingBottom: 5 }}>
                    <span style={{ color: C.inkSoft }}>{new Date(a.at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ')}</span> — {a.action}
                    {a.doctorName && <span style={{ color: C.inkSoft }}> ({a.doctorName}{a.doctorLicense ? `, ${t('litsenziya', 'лицензия')}: ${a.doctorLicense}` : ''})</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {(rx.medicines || []).length === 0 && !editing && (
          <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 22 }}>{t('Hali dori tayinlanmagan.', 'Лекарства ещё не назначены.')}</Card>
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
        ) : quickMode ? (
          <QuickRxForm onCancel={() => setQuickMode(false)} onSave={addQuickMeds} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Btn variant="gold" onClick={() => setQuickMode(true)} style={{ flex: 1 }}>
                <ClipboardList size={18} /> {t('Umumiy retsept yozish', 'Написать общий рецепт')}
              </Btn>
              <Btn variant="ghost" onClick={() => setEditing('new')} style={{ flex: 1 }}>
                <Plus size={18} /> {t('Bitta dori', 'Одно лекарство')}
              </Btn>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {templates.length > 0 && (
                <Btn variant="quiet" onClick={() => setTplMode('pick')} style={{ flex: 1, fontSize: 14 }}>
                  <Files size={16} /> {t('Shablondan', 'Из шаблона')}
                </Btn>
              )}
              {(rx.medicines || []).length > 0 && (
                <Btn variant="quiet" onClick={() => { setTplTitle(''); setTplMode('save'); }} style={{ flex: 1, fontSize: 14 }}>
                  <Files size={16} /> {t('Shablon saqlash', 'Сохранить шаблон')}
                </Btn>
              )}
            </div>

            {tplMode === 'pick' && (
              <TemplatePicker templates={templates} onApply={applyTemplate} onDelete={deleteTemplate} onClose={() => setTplMode(null)} />
            )}

            {tplMode === 'save' && (
              <Card style={{ marginTop: 10, border: `1.5px solid ${C.gold}`, background: '#FFFDF7' }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, color: C.tealDeep, fontWeight: 600, marginBottom: 4 }}>{t('Shablon sifatida saqlash', 'Сохранить как шаблон')}</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 10 }}>
                  {t(`Joriy ${(rx.medicines || []).length} ta dori shablonga saqlanadi (bemorga bog'lanmagan holda).`, `Текущие ${(rx.medicines || []).length} лек. будут сохранены в шаблон (без привязки к пациенту).`)}
                </div>
                <input
                  style={inputStyle}
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  placeholder={t('Shablon nomi (masalan: Gipertoniya standart)', 'Название шаблона (например: Гипертония стандарт)')}
                  onKeyDown={(e) => e.key === 'Enter' && saveAsTemplate()}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <Btn variant="ghost" onClick={() => { setTplMode(null); setTplTitle(''); }} style={{ flex: 1 }}>{t('Bekor qilish', 'Отмена')}</Btn>
                  <Btn variant="gold" onClick={saveAsTemplate} style={{ flex: 1 }}>{t('Saqlash', 'Сохранить')}</Btn>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Bemor bilan xabar almashinuv */}
        <SectionTitle icon={<MessageCircle size={18} color={C.teal} />}>{t('Xabarlar', 'Сообщения')}</SectionTitle>
        <MessageThread code={code} viewerRole="doctor" doctorProfile={doctorProfile} />

        <Btn variant="ghost" full onClick={deletePatient} style={{ marginTop: 24, color: C.red, border: '1.5px solid #E7C6C1' }}>
          <Trash2 size={16} /> {t("Ro'yxatimdan olib tashlash", 'Удалить из моего списка')}
        </Btn>
      </div>
    </div>
  );
}

/* Shablon tanlash — retseptga qo'shish yoki o'chirish */
function TemplatePicker({ templates, onApply, onDelete, onClose }) {
  const t = useT();
  return (
    <Card style={{ marginTop: 10, border: `1px solid ${C.teal}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, color: C.tealDeep, fontWeight: 600 }}>{t('Shablon tanlang', 'Выберите шаблон')}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {templates.map((tpl) => (
          <div key={tpl.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 700, color: C.ink }}>{tpl.title}</div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
                  {(tpl.medicines || []).map((m) => m.name).join(', ') || t("Bo'sh", 'Пусто')}
                </div>
              </div>
              <button onClick={() => onDelete(tpl.id)} title={t("Shablonni o'chirish", 'Удалить шаблон')} style={{ ...iconBtn, color: C.red }}>
                <Trash2 size={15} />
              </button>
            </div>
            <Btn variant="sage" full onClick={() => onApply(tpl)} style={{ marginTop: 10, padding: '10px', fontSize: 14 }}>
              <Plus size={15} /> {t('Retseptga qo\'shish', 'Добавить в рецепт')} ({(tpl.medicines || []).length} {t('dori', 'лек.')})
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
  const t = useT();
  const end = medEndDate(med);
  const needsSetup = !med.dosage.trim() || !(med.times || []).length;
  return (
    <Card style={needsSetup ? { border: `1.5px solid ${C.gold}`, background: '#FFFDF7' } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill size={18} color={C.gold} />
            <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: C.ink }}>{med.name}</div>
          </div>
          {needsSetup ? (
            <div style={{ fontFamily: SANS, fontSize: 13, color: '#7A5A12', marginTop: 4, fontWeight: 600 }}>
              {t('Doza va qabul vaqti hali belgilanmagan', 'Доза и время приёма ещё не назначены')}
            </div>
          ) : (
            <>
              <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft, marginTop: 4 }}>{med.dosage}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(med.times || []).map((tm) => (
                  <span key={tm} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.teal, background: '#E9F0F1', padding: '4px 9px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={13} /> {tm}
                  </span>
                ))}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 8 }}>
                {med.durationDays ? `${med.durationDays} ${t('kun', 'дн.')}` : t('Doimiy', 'Постоянно')} · {t('boshlangan', 'начато')}: {med.startDate}
                {end && ` · ${t('tugaydi', 'заканчивается')}: ${end}`}
              </div>
              {med.instructions && (
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink, marginTop: 6, fontStyle: 'italic' }}>“{med.instructions}”</div>
              )}
            </>
          )}
          {needsSetup && (
            <Btn variant="gold" onClick={onEdit} style={{ marginTop: 10, padding: '10px 14px', fontSize: 14 }}>
              <Clock size={15} /> {t('Doza va vaqtni belgilash', 'Указать дозу и время')}
            </Btn>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!needsSetup && <button onClick={onEdit} style={iconBtn}><Pencil size={16} /></button>}
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
  const t = useT();
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
    if (!name.trim()) return setErr(t('Dori nomini kiriting.', 'Введите название лекарства.'));
    if (!dosage.trim()) return setErr(t('Dozani kiriting (masalan: 1 tabletka).', 'Введите дозу (например: 1 таблетка).'));
    const cleanTimes = Array.from(new Set(times.filter(Boolean))).sort();
    if (cleanTimes.length === 0) return setErr(t('Kamida bitta qabul vaqtini qo\'shing.', 'Добавьте хотя бы одно время приёма.'));
    if (durationDays && (isNaN(Number(durationDays)) || Number(durationDays) < 1))
      return setErr(t('Davomiylik butun kun bo\'lishi kerak yoki bo\'sh qoldiring (doimiy).', 'Длительность должна быть целым числом дней или оставьте пустым (постоянно).'));
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
        {initial ? t('Dorini tahrirlash', 'Редактировать лекарство') : t('Yangi dori', 'Новое лекарство')}
      </div>
      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}

      <Field label={t('Dori nomi', 'Название лекарства')}>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Enalapril" />
      </Field>
      <Field label={t('Dozasi', 'Доза')}>
        <input style={inputStyle} value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder={t('Masalan: 10 mg, 1 tabletka', 'Например: 10 мг, 1 таблетка')} />
      </Field>

      <Field label={t('Qabul vaqtlari', 'Время приёма')} hint={t("Kuniga bir necha marta bo'lishi mumkin", 'Может быть несколько раз в день')}>
        <div style={{ display: 'grid', gap: 8 }}>
          {times.map((tm, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input type="time" style={{ ...inputStyle, flex: 1 }} value={tm} onChange={(e) => setTime(i, e.target.value)} />
              <button onClick={() => removeTime(i)} disabled={times.length <= 1} style={{ ...iconBtn, width: 46, opacity: times.length <= 1 ? 0.4 : 1 }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <Btn variant="quiet" onClick={addTime} style={{ padding: '10px 12px', fontSize: 14 }}>
            <Plus size={15} /> {t("Vaqt qo'shish", 'Добавить время')}
          </Btn>
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={t('Boshlanish sanasi', 'Дата начала')}>
            <input type="date" style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('Necha kun', 'Сколько дней')} hint={t("Bo'sh = doimiy", 'Пусто = постоянно')}>
            <input style={inputStyle} value={durationDays} onChange={(e) => setDurationDays(e.target.value.replace(/[^0-9]/g, ''))} placeholder={t('Doimiy', 'Постоянно')} inputMode="numeric" />
          </Field>
        </div>
      </div>

      <Field label={t("Qo'shimcha ko'rsatma", 'Дополнительные указания')} hint={t('Ixtiyoriy', 'Необязательно')}>
        <input style={inputStyle} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t('Masalan: ovqatdan keyin, suv bilan', 'Например: после еды, запивая водой')} />
      </Field>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <Btn variant="ghost" onClick={onCancel} style={{ flex: 1 }}>{t('Bekor qilish', 'Отмена')}</Btn>
        <Btn variant="gold" onClick={save} style={{ flex: 1 }}>{t('Saqlash', 'Сохранить')}</Btn>
      </div>
    </Card>
  );
}

/* Umumiy retsept: tez orada faqat dori nomlarini yozish — doza va qabul
   vaqtini har biri uchun keyinroq alohida belgilaydi (MedCard'dagi
   "Belgilash" tugmasi orqali). */
function QuickRxForm({ onCancel, onSave }) {
  const t = useT();
  const [names, setNames] = useState(['']);
  const [err, setErr] = useState(null);
  const inputsRef = useRef([]);
  const prevLen = useRef(names.length);

  // Yangi (Enter yoki "Yana dori" bilan qo'shilgan) qatorga avtomatik
  // fokus — shifokor sichqonchasiz, ketma-ket Enter bosib bir nechta
  // dorini tez kiritishi uchun.
  useEffect(() => {
    if (names.length > prevLen.current) inputsRef.current[names.length - 1]?.focus();
    prevLen.current = names.length;
  }, [names.length]);

  const setName = (i, v) => setNames((ns) => ns.map((n, j) => (j === i ? v : n)));
  const addRow = () => setNames((ns) => [...ns, '']);
  const removeRow = (i) => setNames((ns) => (ns.length > 1 ? ns.filter((_, j) => j !== i) : ns));

  const save = () => {
    const clean = names.map((n) => n.trim()).filter(Boolean);
    if (!clean.length) return setErr(t('Kamida bitta dori nomini kiriting.', 'Введите хотя бы одно название лекарства.'));
    onSave(clean);
  };

  return (
    <Card style={{ marginTop: 12, border: `1.5px solid ${C.gold}`, background: '#FFFDF7' }}>
      <div style={{ fontFamily: SERIF, fontSize: 18, color: C.tealDeep, fontWeight: 600, marginBottom: 4 }}>{t('Umumiy retsept', 'Общий рецепт')}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
        {t(
          'Avval faqat dori nomlarini yozing. Doza va qabul vaqtini har biri uchun keyinroq alohida belgilaysiz.',
          'Сначала напишите только названия лекарств. Дозу и время приёма вы укажете позже для каждого отдельно.'
        )}
      </div>
      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}

      <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
        {names.map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input
              ref={(el) => { inputsRef.current[i] = el; }}
              style={{ ...inputStyle, flex: 1 }}
              value={n}
              onChange={(e) => setName(i, e.target.value)}
              placeholder="Masalan: Enalapril"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (i === names.length - 1) addRow();
                  else inputsRef.current[i + 1]?.focus();
                }
              }}
            />
            <button onClick={() => removeRow(i)} disabled={names.length <= 1} style={{ ...iconBtn, width: 46, opacity: names.length <= 1 ? 0.4 : 1 }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <Btn variant="quiet" onClick={addRow} style={{ padding: '10px 12px', fontSize: 14 }}>
        <Plus size={15} /> {t('Yana dori', 'Ещё лекарство')}
      </Btn>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <Btn variant="ghost" onClick={onCancel} style={{ flex: 1 }}>{t('Bekor qilish', 'Отмена')}</Btn>
        <Btn variant="gold" onClick={save} style={{ flex: 1 }}>{t('Saqlash', 'Сохранить')}</Btn>
      </div>
    </Card>
  );
}

/* =========================================================================
   DORIXONA — retsept tekshirish portali
   Faqat bemorga ochiq (owner=null) yozuvlarni o'qiydi — autentifikatsiya kerak
   emas, chunki maqsad tez tekshiruv (dorixonachi navbatda kutayotgan mijoz bilan).
   ========================================================================= */
function PharmacyApp({ onBack, onError }) {
  const t = useT();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null); // { patient, activeMeds }
  const [drugQuery, setDrugQuery] = useState('');

  const check = async () => {
    const c = code.trim().toUpperCase();
    if (!CODE_RE.test(c)) return setErr(t(`Kod ${CODE_LEN} ta belgidan iborat bo'lishi kerak.`, `Код должен состоять из ${CODE_LEN} символов.`));
    setChecking(true);
    setErr(null);
    setResult(null);
    try {
      const patient = await store.get(`patient:${c}`, true);
      if (!patient) {
        setErr(t('Bunday kod topilmadi. Bemordan kodni qaytadan so\'rang.', 'Такой код не найден. Уточните код у пациента.'));
        setChecking(false);
        return;
      }
      const rx = (await store.get(`rx:${c}`, true)) || { medicines: [] };
      const today = todayStr();
      const activeMeds = (rx.medicines || []).filter((m) => medActiveOn(m, today));
      const doctorsList = await store.get(`doctors:${c}`, true);
      const doctors = doctorsList && doctorsList.length
        ? doctorsList
        : (patient.doctorName ? [{ doctorId: patient.doctorId, fullName: patient.doctorName, licenseNumber: patient.doctorLicense }] : []);
      setResult({ patient, activeMeds, doctors });
    } catch (e) {
      onError(t("Tekshirib bo'lmadi. Internet aloqasini tekshiring.", 'Не удалось проверить. Проверьте интернет-соединение.'));
    } finally {
      setChecking(false);
    }
  };

  const reset = () => { setResult(null); setCode(''); setDrugQuery(''); setErr(null); };

  const drugMatch = drugQuery.trim()
    ? (result?.activeMeds || []).find((m) => m.name.toLowerCase().includes(drugQuery.trim().toLowerCase()))
    : null;

  return (
    <div>
      <TopBar title={t('Dorixona tekshiruvi', 'Проверка в аптеке')} subtitle={t('Retsept haqiqiyligini tekshirish', 'Проверка подлинности рецепта')} onBack={onBack} />
      <div style={{ padding: 16 }}>
        {!result ? (
          <>
            <Banner type="info" icon={<Info size={18} />}>
              {t(
                `Bemorning ${CODE_LEN} belgili kodini kiriting — unga qaysi dorilar shifokor tomonidan tayinlanganini ko'rasiz.`,
                `Введите ${CODE_LEN}-значный код пациента — вы увидите, какие лекарства назначены врачом.`
              )}
            </Banner>

            {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}

            <Field label={t('Bemor kodi', 'Код пациента')}>
              <input
                style={{ ...inputStyle, fontFamily: SERIF, fontSize: 22, textAlign: 'center', letterSpacing: 5, fontWeight: 700, color: C.tealDeep, textTransform: 'uppercase' }}
                value={code}
                onChange={(e) => setCode(cleanCodeInput(e.target.value))}
                placeholder="XXXXXXXX"
                autoCapitalize="characters"
                onKeyDown={(e) => e.key === 'Enter' && check()}
              />
            </Field>
            <Btn variant="primary" full onClick={check} disabled={checking}>
              <Search size={18} /> {checking ? t('Tekshirilmoqda…', 'Проверка…') : t('Tekshirish', 'Проверить')}
            </Btn>
          </>
        ) : (
          <>
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginBottom: 2 }}>{t('Bemor', 'Пациент')}</div>
              <div style={{ fontFamily: SERIF, fontSize: 19, color: C.tealDeep, fontWeight: 600 }}>{result.patient.name}</div>
              {result.doctors.length > 0 ? (
                result.doctors.map((d, i) => (
                  <div key={d.doctorId || i} style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginTop: i === 0 ? 6 : 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IdCard size={14} /> {t('Tayinlagan', 'Назначил')}: {d.fullName} ({t('litsenziya', 'лицензия')}: {d.licenseNumber || '—'})
                  </div>
                ))
              ) : (
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, marginTop: 6 }}>{t("Shifokor ma'lumoti yo'q (eski yozuv)", 'Нет данных о враче (старая запись)')}</div>
              )}
            </Card>

            <Field label={t('Dori nomini tekshirish', 'Проверить название лекарства')} hint={t('Ixtiyoriy — aniq shu dorini qidiring', 'Необязательно — найдите конкретное лекарство')}>
              <input style={inputStyle} value={drugQuery} onChange={(e) => setDrugQuery(e.target.value)} placeholder={t('Masalan: Amoksitsillin', 'Например: Амоксициллин')} />
            </Field>
            {drugQuery.trim() && (
              drugMatch ? (
                <Banner type="success" icon={<BadgeCheck size={18} />}>
                  <b>{t('Ha', 'Да')}</b> — "{drugMatch.name}" {t('ushbu bemorga shifokor tomonidan tayinlangan', 'назначено этому пациенту врачом')} ({drugMatch.dosage}).
                </Banner>
              ) : (
                <Banner type="error" icon={<XCircle size={18} />}>
                  <b>{t("Yo'q", 'Нет')}</b> — "{drugQuery}" {t('ushbu bemorning faol retseptida topilmadi.', 'не найдено в активном рецепте этого пациента.')}
                </Banner>
              )
            )}

            <SectionTitle icon={<ClipboardList size={18} color={C.teal} />}>{t('Hozir faol dorilar', 'Сейчас активные лекарства')} ({result.activeMeds.length})</SectionTitle>
            {result.activeMeds.length === 0 ? (
              <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 22 }}>{t('Bu bemorga hozir faol dori tayinlanmagan.', 'У этого пациента сейчас нет активных лекарств.')}</Card>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {result.activeMeds.map((m) => {
                  const end = medEndDate(m);
                  return (
                    <Card key={m.id}>
                      <div style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: 700, color: C.ink }}>{m.name}</div>
                      <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft, marginTop: 2 }}>{m.dosage}</div>
                      <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 6 }}>
                        {m.durationDays ? `${m.durationDays} ${t('kun', 'дн.')}` : t('Doimiy', 'Постоянно')} · {t('boshlangan', 'начато')}: {m.startDate}{end && ` · ${t('tugaydi', 'заканчивается')}: ${end}`}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            <Btn variant="ghost" full onClick={reset} style={{ marginTop: 16 }}>
              <Search size={16} /> {t('Boshqa bemorni tekshirish', 'Проверить другого пациента')}
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   BEMOR — kirish
   ========================================================================= */
function PatientLogin({ onLogin, onBack, onError, initialCode }) {
  const t = useT();
  const [code, setCode] = useState(initialCode || '');
  const [phone, setPhone] = useState('');
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    const c = code.trim().toUpperCase();
    if (!CODE_RE.test(c)) return setErr(t(`Kod ${CODE_LEN} ta belgidan iborat bo'lishi kerak.`, `Код должен состоять из ${CODE_LEN} символов.`));
    setChecking(true);
    setErr(null);
    try {
      const p = await store.get(`patient:${c}`, true);
      if (!p) {
        setErr(t('Bunday kod topilmadi. Shifokoringizdan qaytadan so\'rang.', 'Такой код не найден. Уточните код у врача.'));
        setChecking(false);
        return;
      }
      // Bemorda telefon raqami qayd etilgan bo'lsa — qo'shimcha tekshiruv
      // sifatida mos kelishi shart (kod bilan bir qatorda ikkinchi omil).
      // Eski (telefonsiz) yozuvlar uchun bu tekshiruv o'tkazib yuboriladi.
      if (p.phone && normalizePhone(phone) !== normalizePhone(p.phone)) {
        setErr(t("Telefon raqami mos kelmadi. Shifokoringizga murojaat qiling.", 'Номер телефона не совпадает. Обратитесь к врачу.'));
        setChecking(false);
        return;
      }
      onLogin(c);
    } catch (e) {
      onError(t("Kodni tekshirib bo'lmadi. Internet aloqasini tekshiring.", 'Не удалось проверить код. Проверьте интернет-соединение.'));
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
      <h1 style={{ fontFamily: SERIF, fontSize: 28, color: C.tealDeep, margin: '0 0 6px', fontWeight: 600 }}>{t('Xush kelibsiz', 'Добро пожаловать')}</h1>
      <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: '0 0 24px', lineHeight: 1.5 }}>
        {t(`Shifokoringiz bergan telefon raqami va ${CODE_LEN} belgili kodni kiriting.`, `Введите номер телефона и ${CODE_LEN}-значный код, полученные от врача.`)}
      </p>

      {err && <Banner type="error" icon={<AlertTriangle size={18} />} onClose={() => setErr(null)}>{err}</Banner>}

      <Field label={t('Telefon raqami', 'Номер телефона')}>
        <div style={{ position: 'relative' }}>
          <Phone size={18} style={{ position: 'absolute', left: 12, top: 14, color: C.inkSoft }} />
          <input
            style={{ ...inputStyle, paddingLeft: 40 }}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
          />
        </div>
      </Field>

      <Field label={t('Bemor kodi', 'Код пациента')}>
        <input
          style={{ ...inputStyle, fontFamily: SERIF, fontSize: 28, textAlign: 'center', letterSpacing: 6, padding: '16px 14px', fontWeight: 700, color: C.tealDeep, textTransform: 'uppercase' }}
          value={code}
          onChange={(e) => setCode(cleanCodeInput(e.target.value))}
          placeholder="XXXXXXXX"
          autoCapitalize="characters"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>
      <Btn variant="gold" full onClick={submit} disabled={checking} style={{ marginTop: 4 }}>
        {checking ? t('Tekshirilmoqda…', 'Проверка…') : t('Kirish', 'Войти')}
      </Btn>
    </div>
  );
}

/* Bemor ekrani bo'limlari: katta, sodda tugmalar (yoshi katta
   foydalanuvchilar ham qiynalmasin uchun matn+belgi bilan). */
function PatientTabBar({ tab, setTab }) {
  const t = useT();
  const tabs = [
    { key: 'today', label: t('Bugun', 'Сегодня'), icon: <Clock size={19} /> },
    { key: 'history', label: t('Tarix', 'История'), icon: <CalendarDays size={19} /> },
    { key: 'chat', label: t('Xabar', 'Чат'), icon: <MessageCircle size={19} /> },
    { key: 'info', label: t("Ma'lumot", 'Инфо'), icon: <Info size={19} /> },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, margin: '4px 0 14px' }}>
      {tabs.map((tb) => {
        const active = tab === tb.key;
        return (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            aria-pressed={active}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '10px 6px', borderRadius: 12, cursor: 'pointer',
              border: `1.5px solid ${active ? C.teal : C.line}`,
              background: active ? C.teal : C.white,
              color: active ? C.paper : C.ink,
              fontFamily: SANS, fontSize: 13, fontWeight: 700,
            }}
          >
            {tb.icon} {tb.label}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   BEMOR — asosiy ekran
   ========================================================================= */
function PatientApp({ code, onLogout, onError }) {
  const t = useT();
  const lang = useContext(LangContext);
  const [patient, setPatient] = useState(null);
  const [rx, setRx] = useState({ medicines: [] });
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unavailable');
  const [dismissedReminder, setDismissedReminder] = useState(false);
  const [liveMsg, setLiveMsg] = useState(null);
  const [pushOn, setPushOn] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [pendingSync, setPendingSync] = useState(() => offlineQueue.size() > 0);
  const [doctors, setDoctors] = useState([]);
  const [tab, setTab] = useState('today'); // today | history | info
  const [remindersOn, setRemindersOn] = useState(true);

  const audioRef = useRef(null);
  const beepedRef = useRef(new Set()); // qaytariqni oldini olish uchun

  // Eslatmalar yoqilgan/o'chirilganligi — qurilmaga xos sozlama
  useEffect(() => {
    store.get('remindersOn', false).then((v) => { if (v === false) setRemindersOn(false); }).catch(() => {});
  }, []);

  const day = todayStr();

  const load = useCallback(async () => {
    try {
      const p = await store.get(`patient:${code}`, true);
      const r = (await store.get(`rx:${code}`, true)) || { medicines: [] };
      const l = (await store.get(`log:${code}:${day}`, true)) || [];
      const d = await store.get(`doctors:${code}`, true);
      setPatient(p);
      setRx(r);
      setLog(l);
      // Eski (bitta shifokorli) yozuvlar uchun orqaga qarab moslashuvchan:
      // "doctors:{code}" hali yaratilmagan bo'lsa, patient.doctorName'dan foydalanamiz.
      setDoctors(d && d.length ? d : (p?.doctorName ? [{ doctorId: p.doctorId, fullName: p.doctorName, licenseNumber: p.doctorLicense }] : []));
    } catch (e) {
      onError(t("Ma'lumotlaringizni yuklab bo'lmadi. Aloqani tekshiring.", 'Не удалось загрузить данные. Проверьте соединение.'));
    } finally {
      setLoading(false);
    }
  }, [code, day, onError, t]);

  useEffect(() => { load(); }, [load]);

  // Real-time: shifokor o'zgartirsa reload'siz yangilanadi
  useEffect(() => {
    const off = store.subscribe((payload) => {
      const key = payload?.new?.key || payload?.old?.key;
      if (!key) return;
      if (key === `patient:${code}` || key === `rx:${code}` || key === `log:${code}:${day}` || key === `doctors:${code}`) {
        if (key === `rx:${code}`) setLiveMsg(t('Shifokor retseptingizni yangiladi', 'Врач обновил ваш рецепт'));
        else if (key === `patient:${code}`) setLiveMsg(t("Ma'lumotingiz yangilandi", 'Ваши данные обновлены'));
        load();
      }
    });
    return off;
  }, [code, day, load, t]);

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

  // Push obuna holatini tekshirish
  useEffect(() => {
    getPushState().then(setPushOn).catch(() => {});
  }, []);

  // "Ilovani o'rnatish" (PWA) taklifini ushlab qolish
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Oflayn navbatni internet qaytganda (yoki muntazam ravishda, zaxira
  // sifatida — 'online' hodisasi ba'zan tarmoq holatini aniq ushlamaydi)
  // avtomatik yuborishga urinib turamiz.
  useEffect(() => {
    const tryFlush = async () => {
      const remaining = await offlineQueue.flush();
      setPendingSync(remaining > 0);
    };
    tryFlush();
    window.addEventListener('online', tryFlush);
    const id = setInterval(tryFlush, 15000);
    return () => { window.removeEventListener('online', tryFlush); clearInterval(id); };
  }, []);

  const doInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch (e) {}
    setInstallPrompt(null);
  };

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
  // Shifokor yozgan, ammo hali qabul vaqti belgilanmagan dorilar bormi?
  const hasUnscheduled = activeMeds.some((m) => !(m.times || []).length);

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
    if (!remindersOn || dueDoses.length === 0) return;
    let fired = false;
    for (const d of dueDoses) {
      const tag = `${day}:${d.key}`;
      if (!beepedRef.current.has(tag)) {
        beepedRef.current.add(tag);
        fired = true;
        if (notifPerm === 'granted') {
          try {
            new Notification(t('Vaqtida — dori vaqti', 'Vaqtida — время приёма'), { body: `${d.med.name} · ${d.med.dosage} (${d.time})`, tag });
          } catch (e) {}
        }
      }
    }
    if (fired) {
      setDismissedReminder(false);
      beep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueDoses.map((d) => d.key).join(','), now, remindersOn]);

  /* Doza belgilash internetsiz ham ishlashi kerak: mahalliy holatni
     darhol yangilaymiz va yozuvni oflayn navbatga qo'yamiz — internet
     qaytganda avtomatik yuboriladi (pastdagi effekt orqali). */
  const markTaken = async (dose) => {
    if (dose.taken) return;
    const next = Array.from(new Set([...log, dose.key]));
    setLog(next); // optimistik, hech qachon qaytarilmaydi
    const synced = await offlineQueue.setQueued(`log:${code}:${day}`, next);
    setPendingSync(!synced);
  };

  const undoTaken = async (dose) => {
    if (!dose.taken) return;
    const next = log.filter((k) => k !== dose.key);
    setLog(next);
    const synced = await offlineQueue.setQueued(`log:${code}:${day}`, next);
    setPendingSync(!synced);
  };

  const enableNotif = async () => {
    if (typeof Notification === 'undefined') return onError(t('Bu brauzer bildirishnomalarni qo\'llab-quvvatlamaydi.', 'Этот браузер не поддерживает уведомления.'));
    try {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
      // audio kontekstni foydalanuvchi harakati bilan ochib qo'yamiz
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioRef.current.state === 'suspended') audioRef.current.resume();
      // Web Push obunasi (fon bildirishnomasi uchun asos — server 2-bosqichda yuboradi)
      if (p === 'granted' && pushSupported()) {
        try {
          await subscribeToPush(code);
          setPushOn(true);
        } catch (e) {
          // Push obuna bo'lmadi — ilova ochiq turgandagi eslatma baribir ishlaydi
          setPushOn(false);
        }
      }
    } catch (e) {
      onError(t('Bildirishnoma ruxsatini olishda muammo.', 'Проблема при получении разрешения на уведомления.'));
    }
  };

  /* Eslatmalarni butunlay o'chirish/yoqish (brauzer ruxsatidan alohida —
     patient istalgan vaqt ilova ichida to'xtatib/qayta yoqa oladi). */
  const toggleReminders = async () => {
    const next = !remindersOn;
    setRemindersOn(next);
    try {
      await store.set('remindersOn', next, false);
    } catch (e) { /* qurilma xotirasi bo'lmasa ham davom etamiz */ }
    if (!next) {
      try { await unsubscribeFromPush(code); } catch (e) {}
      setPushOn(false);
    } else if (notifPerm === 'granted' && pushSupported() && !pushOn) {
      try {
        await subscribeToPush(code);
        setPushOn(true);
      } catch (e) {}
    }
  };

  // Kurs tugash eslatmasi (bugun yoki ertaga tugaydigan dorilar)
  const endingSoon = activeMeds
    .map((m) => ({ m, end: medEndDate(m) }))
    .filter((x) => x.end && (x.end === day || x.end === addDays(day, 1)));

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.inkSoft }}>{t('Yuklanmoqda…', 'Загрузка…')}</div>;
  if (!patient)
    return (
      <div>
        <TopBar title={t('Topilmadi', 'Не найдено')} onBack={onLogout} />
        <div style={{ padding: 16 }}>
          <Banner type="error" icon={<AlertTriangle size={18} />}>{t('Bu kodga bemor topilmadi. Shifokoringizga murojaat qiling.', 'Пациент с этим кодом не найден. Обратитесь к врачу.')}</Banner>
          <Btn variant="ghost" full onClick={onLogout}>{t('Boshqa kod kiritish', 'Ввести другой код')}</Btn>
        </div>
      </div>
    );

  if (!patient.consentAt) {
    return (
      <ConsentScreen
        onError={onError}
        onAgree={async () => {
          const updated = { ...patient, consentAt: Date.now() };
          await store.set(`patient:${code}`, updated, true);
          setPatient(updated);
        }}
      />
    );
  }

  const takenCount = doses.filter((d) => d.status === 'taken').length;
  const niceDate = localeDate(now, lang);

  return (
    <div>
      <TopBar
        title={`${t('Salom', 'Здравствуйте')}, ${patient.name.split(' ')[0] || patient.name}`}
        subtitle={niceDate}
        right={
          <Btn
            variant="quiet"
            onClick={() => {
              if (window.confirm(t(
                "Chiqishni xohlaysizmi? Qayta kirish uchun sizga yana 8 belgili kod kerak bo'ladi.",
                'Хотите выйти? Для повторного входа понадобится 8-значный код.'
              ))) onLogout();
            }}
            style={{ padding: '10px 12px', fontSize: 14 }}
          >
            <LogOut size={16} /> {t('Chiqish', 'Выйти')}
          </Btn>
        }
      />

      <div style={{ padding: 16 }}>
        {/* Oflayn navbat holati */}
        {pendingSync && (
          <Banner type="warn" icon={<WifiOff size={18} />}>
            {t(
              "Internet yo'q. Belgilaganingiz saqlanib turibdi — ulanish tiklanishi bilan avtomatik yuboriladi.",
              'Нет интернета. Ваша отметка сохранена локально — отправится автоматически, когда связь восстановится.'
            )}
          </Banner>
        )}

        {/* Real-time yangilanish xabari */}
        {liveMsg && (
          <Banner type="success" icon={<CalendarClock size={18} />} onClose={() => setLiveMsg(null)}>
            {liveMsg}
          </Banner>
        )}

        {/* Eslatma banneri (due doza) */}
        {remindersOn && dueDoses.length > 0 && !dismissedReminder && (
          <div style={{ animation: 'none' }}>
            <Banner type="warn" icon={<Bell size={18} />} title={t('Dori qabul qilish vaqti!', 'Время принять лекарство!')} onClose={() => setDismissedReminder(true)}>
              {dueDoses.map((d) => (
                <div key={d.key} style={{ marginTop: 2 }}>• <b>{d.med.name}</b> — {d.med.dosage} ({d.time})</div>
              ))}
            </Banner>
          </div>
        )}

        {/* Kurs tugash eslatmasi */}
        {endingSoon.length > 0 && (
          <Banner type="info" icon={<CalendarClock size={18} />} title={t('Kurs tugayapti', 'Курс заканчивается')}>
            {endingSoon.map(({ m, end }) => (
              <div key={m.id}>
                <b>{m.name}</b> {t(`kursi ${end === day ? 'bugun' : 'ertaga'} tugaydi. Davom ettirish kerakmi — shifokoringizdan so'rang.`, `курс заканчивается ${end === day ? 'сегодня' : 'завтра'}. Нужно ли продолжать — уточните у врача.`)}
              </div>
            ))}
          </Banner>
        )}

        <PatientTabBar tab={tab} setTab={setTab} />

        {tab === 'today' && (
          <>
            {/* Kun aylanasi */}
            <SectionTitle icon={<Clock size={18} color={C.teal} />}>{t('Bugungi kun aylanasi', 'Круг дня сегодня')}</SectionTitle>
            <Card style={{ padding: '18px 10px' }}>
              {doses.length === 0 ? (
                <div style={{ textAlign: 'center', color: C.inkSoft, padding: 20 }}>
                  {hasUnscheduled
                    ? t("Shifokoringiz dori yozgan, ammo qabul vaqtlari hali belgilanmagan.", 'Врач назначил лекарства, но время приёма ещё не указано.')
                    : t("Bugun uchun tayinlangan dori yo'q.", 'На сегодня лекарств не назначено.')}
                </div>
              ) : (
                <>
                  <DayArc doses={doses} now={now} />
                  <div style={{ textAlign: 'center', fontFamily: SANS, fontSize: 13.5, color: C.inkSoft, marginTop: 8 }}>
                    {t(`Bugun ${takenCount}/${doses.length} doza qabul qilindi`, `Сегодня принято ${takenCount}/${doses.length} доз`)}
                  </div>
                </>
              )}
            </Card>

            {/* Dori jadvali (read-only, faqat belgilash mumkin) */}
            <SectionTitle icon={<Pill size={18} color={C.teal} />}>{t('Bugungi dorilar', 'Лекарства на сегодня')}</SectionTitle>
            {doses.length === 0 ? (
              <Card style={{ textAlign: 'center', color: C.inkSoft, padding: 22 }}>
                {hasUnscheduled
                  ? t("Shifokoringiz retsept yozgan, ammo qabul vaqtlari hali belgilanmagan. Tez orada belgilanadi.", 'Врач выписал рецепт, но время приёма ещё не указано. Скоро будет назначено.')
                  : t("Hozircha faol dori yo'q. Bu — yaxshi belgi bo'lishi mumkin 🙂", 'Пока нет активных лекарств. Возможно, это хороший знак 🙂')}
              </Card>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {doses.map((d) => (
                  <DoseCard key={d.key} dose={d} onTake={() => markTaken(d)} onUndo={() => undoTaken(d)} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            {/* Haftalik tarix */}
            <SectionTitle icon={<CalendarDays size={18} color={C.teal} />}>{t("So'nggi 7 kun", 'Последние 7 дней')}</SectionTitle>
            <WeeklyHistory code={code} refreshKey={log.join(',')} />
          </>
        )}

        {tab === 'chat' && (
          <>
            {/* Shifokor bilan xabar almashinuv */}
            <SectionTitle icon={<MessageCircle size={18} color={C.teal} />}>{t('Shifokor bilan xabar', 'Сообщение врачу')}</SectionTitle>
            <Banner type="warn" icon={<AlertTriangle size={18} />}>
              {t(
                "Favqulodda holatda darhol tez tibbiy yordamga (103) murojaat qiling — bu yerdagi xabarga darhol javob berilishi kafolatlanmaydi.",
                'В экстренной ситуации немедленно обратитесь в скорую помощь (103) — мгновенный ответ на сообщение здесь не гарантируется.'
              )}
            </Banner>
            <MessageThread code={code} viewerRole="patient" />
          </>
        )}

        {tab === 'info' && (
          <>
            {/* Tashxis */}
            <Card style={{ background: C.teal, border: 'none', color: C.paper, marginBottom: 4 }}>
              <div style={{ fontFamily: SANS, fontSize: 13, opacity: 0.8 }}>{t('Tashxisingiz', 'Ваш диагноз')}</div>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: C.gold, marginTop: 2 }}>{patient.diagnosis}</div>
              {doctors.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {doctors.map((d, i) => (
                    <div key={d.doctorId || i} style={{ fontFamily: SANS, fontSize: 12.5, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 5, marginTop: i > 0 ? 3 : 0 }}>
                      <IdCard size={13} /> {t('Tayinlagan', 'Назначил')}: {d.fullName}{d.licenseNumber ? ` (${t('litsenziya', 'лицензия')}: ${d.licenseNumber})` : ''}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Bildirishnoma boshqaruvi */}
            <SectionTitle icon={<Bell size={18} color={C.teal} />}>{t('Eslatmalar', 'Напоминания')}</SectionTitle>

            {!remindersOn ? (
              <>
                <Banner type="warn" icon={<BellOff size={18} />}>
                  {t("Eslatmalar o'chirilgan — dori vaqti kelganda ogohlantirilmaysiz.", 'Напоминания отключены — вы не будете получать уведомления о времени приёма.')}
                </Banner>
                <Btn variant="primary" full onClick={toggleReminders} style={{ marginTop: 10 }}>
                  <Bell size={18} /> {t('Eslatmalarni yoqish', 'Включить напоминания')}
                </Btn>
              </>
            ) : (
              <>
                {installPrompt && (
                  <Btn variant="gold" full onClick={doInstall} style={{ marginBottom: 10 }}>
                    <Download size={18} /> {t("Ilovani telefonga o'rnatish", 'Установить приложение на телефон')}
                  </Btn>
                )}

                {notifPerm === 'default' && (
                  <Btn variant="primary" full onClick={enableNotif}>
                    <Bell size={18} /> {t('Bildirishnomalarni yoqish', 'Включить уведомления')}
                  </Btn>
                )}
                {notifPerm === 'granted' && (
                  <Banner type="success" icon={<Check size={18} />}>
                    {t('Bildirishnomalar yoqilgan. Dori vaqti kelganda ogohlantiramiz.', 'Уведомления включены. Мы предупредим, когда придёт время лекарства.')}
                    {pushOn && <div style={{ marginTop: 4 }}>{t('Fon bildirishnomasiga', 'На фоновые уведомления')} <b>{t("obuna bo'ldingiz", 'вы подписались')}</b>.</div>}
                  </Banner>
                )}
                {notifPerm === 'denied' && (
                  <Banner type="warn" icon={<BellOff size={18} />}>{t('Bildirishnomalar bloklangan. Brauzer sozlamalaridan (qulf belgisi → ruxsatlar) yoqishingiz mumkin.', 'Уведомления заблокированы. Их можно включить в настройках браузера (значок замка → разрешения).')}</Banner>
                )}
                {notifPerm === 'unavailable' && (
                  <Banner type="warn" icon={<BellOff size={18} />}>{t("Bu brauzer tizim bildirishnomalarini qo'llab-quvvatlamaydi. Ilova ichidagi banner va tovush baribir ishlaydi.", 'Этот браузер не поддерживает системные уведомления. Баннер и звук в приложении всё равно будут работать.')}</Banner>
                )}

                <Btn variant="quiet" full onClick={toggleReminders} style={{ marginTop: 10 }}>
                  <BellOff size={18} /> {t('Eslatmalarni o\'chirish', 'Отключить напоминания')}
                </Btn>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* Bitta doza kartasi */
function DoseCard({ dose, onTake, onUndo }) {
  const t = useT();
  const { med, time, status } = dose;
  const cfg = {
    taken: { bg: '#EEF4EB', bd: C.sage, label: t('Qabul qilindi', 'Принято'), fg: '#3E5637' },
    due: { bg: '#FBF1D6', bd: C.gold, label: t('Hozir vaqti!', 'Сейчас время!'), fg: '#7A5A12' },
    upcoming: { bg: C.white, bd: C.line, label: t('Kutilmoqda', 'Ожидается'), fg: C.inkSoft },
    missed: { bg: '#F9E9E6', bd: C.red, label: t("O'tkazib yuborilgan", 'Пропущено'), fg: '#7E2F27' },
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
          <button onClick={onUndo} title={t('Bekor qilish', 'Отменить')} style={{ background: C.sage, border: 'none', borderRadius: 12, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.white, flexShrink: 0 }}>
            <Check size={26} />
          </button>
        ) : (
          <button
            onClick={onTake}
            title={t('Qabul qilindi deb belgilash', 'Отметить как принято')}
            style={{ background: status === 'missed' ? C.white : C.teal, border: status === 'missed' ? `2px solid ${C.red}` : 'none', borderRadius: 12, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: status === 'missed' ? C.red : C.paper, flexShrink: 0 }}
          >
            <Check size={26} />
          </button>
        )}
      </div>
    </Card>
  );
}
