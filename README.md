# Vaqtida — Offline-First Medication Adherence PWA

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/abdumutal-14/vaqtida/actions/workflows/ci.yml/badge.svg)](https://github.com/abdumutal-14/vaqtida/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/Live-vaqtida.vercel.app-1B3038)](https://vaqtida.vercel.app)

**Vaqtida** (*"On Time"*) is an open-source, offline-first Progressive Web App (PWA) designed to improve medication adherence by connecting **doctors**, **patients**, and **pharmacies** in a unified, low-connectivity-resilient workflow.

---

## Why Vaqtida?

In regions with intermittent mobile connectivity, cloud-dependent health applications often fail at the exact moment a patient needs to check their schedule or confirm a dose. Vaqtida addresses this gap with an **offline-first architecture**:

- **Zero-Loss Dose Logging (`db.js`):** Dose confirmations are written immediately to a local persistent offline queue (`vaqtida_offline_queue`) and automatically synchronized to Supabase once connectivity is restored.
- **Full App Shell Caching (`public/sw.js`):** Custom Service Worker caches static assets and navigation routes so the app opens and operates reliably without network access.
- **Background Web Push Reminders (`push.js` & `supabase/functions/send-reminders`):** Server-side `pg_cron` scheduler and Deno Edge Functions deliver timely medication alerts and notify doctors if a patient misses 3+ doses within a 3-day window.
- **Multi-Role Clinical Workflow:**
  - **Doctors:** Create patient records, prescribe multi-medication regimens, save reusable prescription templates, track 7-day adherence streaks, flag high-risk patients, and export printable/PDF prescriptions.
  - **Patients:** Access schedules via an 8-character code or QR code (`?code=...`), log doses with one tap, view a 24-hour visual day arc, receive low-stock warnings, and message their doctor directly.
  - **Pharmacies:** Verify active prescriptions and patient allergies instantaneously using the patient's 8-character code without requiring a separate account.
- **Accessibility & Localization:** Built-in bilingual support (Uzbek & Russian), one-tap **Large Font Mode (1.25x)** for elderly patients, and **Dark Mode**.

---

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        Client PWA (React + Vite)                     │
│  ┌────────────────┐   ┌───────────────────┐   ┌───────────────────┐  │
│  │  Vaqtida.jsx   │   │       db.js       │   │      push.js      │  │
│  │ (Doctor/Patient│◄─►│  kv_store + RLS   │   │  Web Push / VAPID │  │
│  │  /Pharmacy UI) │   │  + Offline Queue  │   │   Subscription    │  │
│  └────────────────┘   └─────────┬─────────┘   └─────────┬─────────┘  │
│                                 │                       │            │
│  ┌──────────────────────────────▼───────────────────────▼─────────┐  │
│  │              Service Worker (public/sw.js)                     │  │
│  │         Runtime Asset Cache  │  Push & Notification Click      │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ HTTPS / Realtime
┌─────────────────────────────────▼────────────────────────────────────┐
│                       Supabase Backend                               │
│  ┌───────────────┐  ┌─────────────────────────────────────────────┐  │
│  │ PostgreSQL    │  │ Deno Edge Functions                         │  │
│  │ kv_store +    │  │ • send-reminders (pg_cron every minute)     │  │
│  │ Row-Level Sec │  │ • send-message-notification (instant push)  │  │
│  │               │  │ • admin-create-doctor (rate-limited admin)  │  │
│  └───────────────┘  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```text
vaqtida/
├── Vaqtida.jsx                      # Main multi-role UI (Doctor, Patient, Pharmacy, Admin)
├── db.js                            # Supabase + localStorage abstraction & offline sync queue
├── push.js                          # Web Push VAPID subscription lifecycle
├── index.html                       # PWA entry point & mobile meta configuration
├── vite.config.js                   # Vite build configuration
├── src/
│   └── main.jsx                     # React root mount & Service Worker registration
├── public/
│   ├── sw.js                        # Service Worker (offline caching & push handler)
│   ├── manifest.webmanifest         # PWA Web App Manifest
│   └── icon-*.png                   # App & maskable icons
├── supabase/
│   ├── config.toml                  # Supabase Edge Function configuration
│   ├── schedule.sql                 # pg_cron setup for automated dose reminders
│   └── functions/
│       ├── send-reminders/          # Scheduled push reminder & 3-day missed-dose detector
│       ├── send-message-notification/ # Real-time chat push notification dispatcher
│       └── admin-create-doctor/     # Brute-force-protected doctor account management
└── tests/
    └── reminders.test.js            # Unit tests for reminder scheduling & adherence logic
```

---

## Getting Started

### Prerequisites
- **Node.js** 18+ (20+ recommended)
- **npm** 9+
- A **Supabase** project (optional — the app automatically falls back to `localStorage` if environment variables are omitted)

### Local Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/abdumutal-14/vaqtida.git
   cd vaqtida
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Run unit tests and production build:**
   ```bash
   npm test
   npm run build
   ```

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a pull request.

## Security

For reporting vulnerabilities or security concerns, please review [SECURITY.md](SECURITY.md).

## License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for full details.
