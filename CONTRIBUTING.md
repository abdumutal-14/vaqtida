# Contributing to Vaqtida

Thank you for your interest in contributing to **Vaqtida**! Whether you are fixing a bug, improving offline synchronization, adding translations, or enhancing test coverage, your help is appreciated.

## How to Contribute

1. **Fork the repository** and create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Install dependencies** and verify the test suite passes:
   ```bash
   npm install
   npm test
   ```
3. **Make your changes** following the existing code conventions:
   - Keep offline resilience in mind: patient-facing mutations should go through `offlineQueue` in `db.js`.
   - Maintain bilingual UI strings (`t('Uzbek', 'Russian')`) for all user-facing text.
   - Never commit real API keys, VAPID private keys, or secrets.
4. **Verify build & tests** before opening a Pull Request:
   ```bash
   npm test
   npm run build
   ```
5. **Open a Pull Request** describing the problem solved, your approach, and any testing steps.

## Areas Where Help Is Especially Welcome

- Automated end-to-end tests (Playwright) for offline dose logging and sync recovery
- Modularizing components in `Vaqtida.jsx`
- Additional localization languages
- Accessibility audits (screen reader labels, high-contrast themes)
