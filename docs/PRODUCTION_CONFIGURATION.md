# Production configuration

Checkpoint G, 22 October 2026. Copy `.env.example` privately; never commit a populated file. The templates use `/etc/actionflow/actionflow.env`, owned by root and readable only by the service group (`root:actionflow`, mode `0640`). Do not paste secrets into shell history, logs, support tickets or screenshots.

Run `npm run config:check` before building and starting. Production instrumentation also rejects missing required settings. A loopback HTTP warning is allowed for local smoke tests only; a public deployment must use HTTPS.

| Variable | Purpose / production value |
| --- | --- |
| `NODE_ENV` | `production` for both systemd services |
| `MONGODB_URI` | Authenticated TLS managed MongoDB URI, or private replica-set URI; transactions are required |
| `MONGODB_DB` | Existing database name; example `actionflow_ai` |
| `BETTER_AUTH_URL` | One canonical HTTPS origin, e.g. `https://actionflow.example.com`; no path |
| `BETTER_AUTH_SECRET` | Stable cryptographically random secret, at least 32 characters; rotation invalidates relevant auth state |
| `SMTP_HOST`, `SMTP_PORT` | Real SMTP host; `465` implicit TLS or `587` STARTTLS |
| `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Provider credentials and authorized sender. Gmail: `smtp.gmail.com`, port `465`, account username and app password; sender must be authorized by Gmail |
| `MAIL_MODE` | Leave unset for production. `file` is development-only and is ignored in production |
| `OPENAI_API_KEY` | Server-only project key with billing, model access and a provider spending limit |
| `OPENAI_MODEL` | Existing default `gpt-4.1-mini`; verify access in the intended project |
| `CAPTURE_DAILY_LIMIT`, `PLANNER_DAILY_LIMIT`, `AGENT_DAILY_LIMIT` | Default 20 each per user per UTC day. Persistent atomic counters; service-level maximums still apply |
| `CAPTURE_TIMEOUT_MS` | Default 55000; application clamps to 1000–55000 ms |
| `REMINDER_WORKER_SECRET` | Independent random secret, at least 32 characters. Generate privately using `npm run reminders:setup`; do not publish output |
| `REMINDER_INTERVAL_MS` | Worker polling, default 60000; clamped to 30000–60000 ms |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Both or neither. Google Web client; authorized redirect is the canonical origin plus `/api/auth/callback/google` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | All three or none. Generate once and retain across releases. Private key stays server-only; public key is intentionally returned for subscription |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Optional stable build secret for consistent Server Actions across builds. Set before build if used; retain securely across instances |
| `OPENAI_BASE_URL` | **Unset in production.** Isolated test mocks only |
| `ACTIONFLOW_BUILD_DIR` | Leave unset in production, so build and start use `.next` |
| `DIAGNOSTICS_ENABLED` | Leave unset/0. Local development QA overlay only; never rendered in production |

No application credential needs a `NEXT_PUBLIC_` prefix. Local fonts are bundled. SMTP, database, auth and AI settings are server-only; preserve the same environment for migration, build, app and worker. Optional provider presence can affect server-rendered initial UI, so rebuild when enabling Google or changing the canonical origin. Browser API keys are never needed.

The worker needs the full checkout and installed `tsx`, which is currently a development dependency. **Use `npm ci --include=dev` on this deployment**, not `npm ci --omit=dev` or a Next standalone directory alone. This is an explicit runtime packaging choice, not a serverless deployment.

Email delivery has three separate checks: TLS connection (`npm run email:check`), SMTP acceptance (`npm run email:check -- --send-to-self`), and human inbox receipt. Acceptance is not a delivery guarantee. The latter command sends one real message to the configured SMTP account. Registration and password sign-in require real OTP delivery; do not launch with an untested mail provider. See `EMAIL_SETUP.md` and `GOOGLE_AUTH_SETUP.md`.

Rotate credentials previously shared outside the private environment before public launch, then rerun the affected live checks. No secret values are included in this document.
