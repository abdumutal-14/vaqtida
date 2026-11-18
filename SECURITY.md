# Security Policy

## Reporting a Vulnerability

Because **Vaqtida** handles medication schedules and patient adherence workflows, security and data privacy are top priorities.

If you discover a security vulnerability, please **do not** open a public GitHub issue. Instead, report it privately to:

- **Email:** `abdurakhimovabdumutal14@gmail.com`

Please include a clear description of the issue, steps to reproduce, and potential impact. You will receive a response within 72 hours.

## Security Architecture Notes

- **Row-Level Security (RLS):** Doctor-specific records (`patients:{uid}`, `templates:{uid}`, `doctor:{uid}`) are scoped to the authenticated doctor's UID.
- **Two-Factor Patient Lookup:** Patient sign-in requires both an 8-character non-ambiguous code and the registered phone number.
- **Brute-Force Protection:** The `admin-create-doctor` Edge Function enforces IP-based rate limiting and temporary lockouts after repeated failed secret attempts.
- **Client Secrets:** Only public keys (`VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`) are exposed to the client bundle; service-role and VAPID private keys remain strictly in Supabase Edge Function secrets.
