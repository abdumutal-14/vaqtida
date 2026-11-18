# Changelog

All notable changes to **Vaqtida** are documented in this file.

## [1.0.0] - 2026-11-18

### Added
- Open-source release under the MIT License with full English documentation, contribution guidelines, and CI workflow.
- Automated unit test suite (`tests/reminders.test.js`) covering timezone wall-clock calculations, active medication windows, due-dose matching, and 3-day missed-dose risk detection.
- Offline-first persistent dose queue (`offlineQueue` in `db.js`) with automatic background flush on reconnect.
- Multi-role workflows for **Doctors**, **Patients** (with QR-code onboarding and 24-hour visual day arc), and **Pharmacies**.
- Web Push notifications via Service Worker (`public/sw.js`) and Supabase Edge Functions (`send-reminders`, `send-message-notification`).
- Bilingual support (Uzbek / Russian), Dark Mode, Large Font accessibility mode, and printable/PDF prescription export.
