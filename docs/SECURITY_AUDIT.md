# Checkpoint G security review

22 October 2026. This is a scoped code review plus local regression evidence, not a penetration-test certification.

## Fixes and protections

- Production startup validates required server configuration without printing values. Public base URLs require HTTPS; loopback HTTP is explicitly a local-test exception. A custom OpenAI base URL is rejected in production. Provider pairs, quota ranges and minimum secret lengths are checked.
- Production Better Auth reads client IP only from `X-Actionflow-Client-IP`. The Nginx template overwrites this header and pins origin/Host forwarding. Next is bound to loopback. This trust model requires the provided network boundary; direct public access is unsafe.
- The internal worker bearer-token comparison now checks UTF-8 byte lengths before `timingSafeEqual`; unequal-byte tokens fail with 401 rather than throwing. Public Nginx blocks the worker endpoint entirely.
- Global headers disable framing, MIME sniffing, referrer transmission, camera/microphone/geolocation and object embedding. CSP restricts base URI and frame ancestors. It is **not** a strict nonce/script CSP; inline-script hardening remains a separate compatibility project.
- Request and server-function logging remain disabled. Nginx access logs omit query strings/referrers. No request bodies, credentials, OTPs, reset URLs or model document content are intentionally logged.

## Reviewed existing boundaries

Better Auth verifies sessions server-side. Task, note, focus, planner, reminder and conversation queries include trusted owner IDs; client authority fields and Mongo operators are rejected by strict schemas. Server Actions and API origin checks protect mutations. Redirects are constrained to the canonical origin. Credential sign-in requires verified email plus a pending OTP challenge; a password-only cookie is not a workspace session. OTPs are hashed, short-lived, attempt-limited and resend-controlled. Password reset is single-use and revokes sessions. Google state and verified claims are validated; same-email implicit linking is disabled, and explicit linking requires a completed session.

Agent tools are narrow typed functions, never arbitrary shell/JS/Mongo access. Read data is wrapped as untrusted context. Model output can prepare previews but cannot authorize writes. Server-side actions bind owner, arguments/hash, revision, record versions and expiry; execution is transactional, replay-safe and audited. Destructive operations need additional confirmation. Persistent usage counters and owner leases bound model work. Capture validates actual image/PDF bytes, dimensions/pages and size, strips image metadata and does not permanently store source uploads by default. Text and tool context are bounded.

## Regression evidence

G reruns cover cross-user task/capture/planner/reminder/notes/focus/search/history isolation, foreign origins, malformed payloads, malicious record instructions, approval substitution/replay/stale versions, concurrency, database rollback, quota controls, OTP bypass/expiry/attempts and Google linking/state. See `final-completion/checkpoint-g.md` for exact suite counts and corrected fixture failures. The 10-command live agent smoke used temporary local MongoDB and synthetic records only; approved creates/updates persisted, replay did not duplicate, cancellation and ambiguity did not write.

SMTP TLS connection and provider acceptance succeeded; the user separately confirmed an OTP email arrived. An experimental live-mail observer failed to capture the code internally despite actual receipt; it was removed. We do not count that observer as a successful end-to-end real-inbox login test. Automated complete password-plus-OTP flows use an isolated development mailbox and pass.

## Remaining risks / launch gates

| Severity | Finding / action |
| --- | --- |
| High | Rotate credentials previously shared in conversation before public launch; keep replacements only in the protected environment and repeat provider checks |
| High | Real VPS/TLS/firewall/proxy isolation and restore rehearsal have not been performed; do not expose the service before validating them |
| Medium | `npm audit` reports five high-severity dependency-chain entries in development ESLint tooling (`braces` → `micromatch` → `fast-glob` → Next ESLint plugin/config). They represent one glob-pattern denial-of-service chain; production dependency audit is clean. No safe in-range automatic fix was offered; npm suggested an incompatible Next ESLint downgrade. Do not feed untrusted glob patterns into lint tooling; track upstream fix. Full node_modules are deployed for the worker, so keep the checkout private and do not expose build tools as endpoints |
| Medium | SMTP acceptance is not guaranteed inbox delivery; monitor rejection/retries and test sender reputation, SPF/DKIM/DMARC for the production sender |
| Medium | External reminder delivery cannot be exactly-once across a crash after provider acceptance. Durable status/retry handling does not remove that external side-effect window |
| Medium | Real Google OAuth account flow and real browser-push delivery are unverified; mocked token/push tests do not establish provider operation |
| Low | Minimal CSP, not nonce-based script enforcement; future hardening must preserve Next/Motion compatibility |
| Low | Local performance/a11y checks do not establish behavior on low-end physical phones, all assistive technology or production network conditions |

No dependency downgrade, authentication bypass, database migration/replacement, live record deletion or VPS exposure was used to obtain passing checks.
