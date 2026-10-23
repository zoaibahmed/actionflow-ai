# Checkpoint E — Email OTP, Google sign-in and secure recovery

Implemented in the existing Better Auth 1.7.11 / MongoDB application. No auth dependency upgrade, new package, database migration to another provider, F/G feature or VPS deployment was introduced.

## Features and architecture

- Registration uses Better Auth `emailOTP` with six-digit verification, five-minute expiry, five incorrect attempts per code, mandatory email verification and no automatic sign-in after verification.
- Password login uses Better Auth `twoFactor` with email OTP. The accepted password creates a signed, short-lived challenge; the plugin discards its provisional session. Only successful OTP verification creates the usable session. Passwordless Email OTP, TOTP, backup-code and disable/enrollment bypass endpoints are blocked by server hooks. Trusted-device requests are rejected.
- OTP hashes use HMAC-SHA256 keyed by the server auth secret. The plaintext code is passed only to the email transport (or explicitly private development mailbox).
- Registration/new-user hooks enable credential email second factor by policy. Existing users enroll on the next password sign-in without changing identity, password or domain records. The documented OTP-only mode does not need an authenticator secret or backup codes.
- Google authorization-code login uses Better Auth's official provider. Scope overrides are restricted to identity scopes; direct ID-token sign-in and arbitrary authorization parameters are disallowed. Google identities must be verified before a session can be created. Implicit matching-email linking is disabled. Explicit linking requires a completed, fresh session and the same verified email, through Settings.
- Password recovery uses Better Auth's expiring single-use reset link, safe app-origin redirects, existing password validation and session revocation after reset. Known and unknown addresses receive a neutral response without a delivery claim, including transport-failure cases, to avoid account enumeration.

Official compatibility references: [Email OTP](https://better-auth.com/docs/plugins/email-otp), [Two Factor](https://better-auth.com/docs/plugins/2fa), [Google](https://better-auth.com/docs/authentication/google). Installed plugin source/types were inspected before implementation; no undocumented plugin endpoint was invented.

## Approval-free authentication security

All authentication decisions are server-side. Existing application authorization still derives ownership from Better Auth sessions. The shared session helper additionally requires a verified email and session `authPolicyVersion=2`; this is written only by a server database hook, not accepted from client input. Pending challenge cookies are not sessions and were rejected by Agent, Planner, Reminders and Capture endpoints in tests.

The application keeps origin/CSRF checks and secure HttpOnly/SameSite cookies through Better Auth; HTTPS uses Secure cookies. Redirects remain on the configured app origin. Auth secrets, app passwords, OTPs and tokens are not printed by application diagnostics. Next development URL/Server Action argument logging is disabled; `mail:latest` now prints only private metadata. Future proxy logging still requires separate deployment configuration.

Persistent atomic controls add a full sixty-second resend/reset cooldown per identity, ten password attempts/minute per identity and ten verification attempts/fifteen minutes per identity across challenges. Better Auth also retains its IP/path limits and per-code attempt/replay controls. The signed password-login challenge lasts ten minutes; individual email codes last five. Resending rotates the code. Session lifetime is seven days; reset revokes sessions.

OTP and reminder email sending awaits actual provider acceptance; privacy-preserving reset delivery is deferred with Next.js `after` and logs only a generic failure diagnostic. Centralized email sending requires TLS, uses bounded connection timeouts and normalizes errors. A request-scoped delivery guard detects failed email sends even when a plugin catches its callback rejection. No SMTP failure silently becomes a local-mail success. Neutral password-reset responses intentionally do not expose a per-address transport result.

## UI

The existing cream/indigo split-screen identity remains. Login/signup have Google buttons and honest missing-configuration states. `/verify-email` and `/two-factor` provide a single accessible, paste-friendly six-digit field, numeric keyboard, one-time-code autofill, focus management, resend cooldown, loading/error/success feedback and back-to-login recovery. Password recovery retains show/hide, validation and expired-link recovery. Settings adds explicit Google account linking.

No artificial loading delay or new animation dependency was added. The shared Motion provider still respects reduced motion. OTP forms remain functional without motion.

## Database changes

Migration `006-auth-security.mjs` adds `twoFactor` owner indexing and TTL-indexed `authCooldowns`, sets existing users' email-OTP policy flag and expires only legacy sessions lacking policy version 2. Users, passwords, tasks, AI history, reminders, plans and ownership are retained. Compatible version-2 sessions are preserved. Expiring a legacy session deliberately asks its owner to complete the new secure sign-in flow; it does not recreate their account. Run `npm run db:migrate` before starting the updated app.

A real, reachable email address is required. Old synthetic/demo addresses cannot receive real inbox OTPs; no authentication bypass was added for them. Unverified existing users have a login link to the verification/resend screen. Password recovery does not remove the second-factor requirement.

## Delivery and configuration status

SMTP: Gmail configured privately in `.env.local`, STARTTLS/587 connection verified, the single authorized connection-check email accepted, and the user explicitly confirmed inbox receipt. No secret values are included here. Automated auth tests use local file mail and do not send messages to real recipients.

Google: server provider and UI integrated; **live Google login is blocked by missing client ID/secret**. Signed, mocked OAuth integrations passed. See [email setup](../EMAIL_SETUP.md) and [Google setup](../GOOGLE_AUTH_SETUP.md) for exact configuration and testing instructions.

## Tests and evidence

Lint, TypeScript and the production build passed. The production scan checked 34 client files and found zero configured-secret matches. Migration 001–006 completed on the configured application database after isolated testing. Tests use disposable local replica sets, synthetic accounts, private file mail and mocked external providers. New auth tests explicitly refuse the live database. Google tests mock token exchange/certificate fetching and use signed test JWTs against the actual Better Auth handler and production policy hooks.

- Auth HTTP integration: eight scenarios covering registration, invalid/expired/rotated codes, replay, atomic resend limits, password+OTP, pending access rejection, trusted-device/bypass rejection, existing enrollment, reset/revocation, Google missing configuration/state errors and migration preservation.
- Mocked Google integration: four scenarios covering registration/return, state/unverified identity, implicit-link refusal and authenticated same-email link.
- Email transport/template integration: two tests for TLS, acceptance/rejection, swallowed callback failure, safe network classification and escaped branded templates.
- Existing regression results: 25 unit tests; 11 Agent service integration tests; 1 Agent HTTP test with the new password/OTP flow; 3 task/Capture/Planner database tests; 3 reminder lifecycle/recurrence tests; 2 mocked Capture/Planner SDK tests — all passed.
- Actual browser: registration OTP verification, password-to-OTP transition, OTP completion into dashboard, reload persistence, Settings configuration state, logout, invalid reset-link UI, clear console and responsive geometry at 390/768/1024/1440. Screenshots are in `screenshots/auth-otp-desktop.png`, `screenshots/auth-otp-mobile.png` and the refreshed main-app `screenshots/auth-login.png`. Observed checks are recorded in `auth-browser-checks.json`.

No live Google flow, real-device/Safari test or system reduced-motion emulation is claimed. The browser exercised private file mail; only the separately authorized SMTP connection-check email was sent to a real inbox. No performance score is claimed.

## Files changed

Auth: `src/lib/auth/{server,session,actions,types,mail,policy,otp-actions,email-templates}.ts`; `src/components/auth/{auth-form,auth-screen,otp-form,google-button,google-link}.tsx`; new verification/two-factor route pages; auth layout referrer metadata; auth API delivery boundary; Settings account linking; scoped additions to `src/app/globals.css`.

Infrastructure/tests/docs: `migrations/006-auth-security.mjs`, `scripts/{migrate,mail-latest,check-client-secrets}.mjs`, `scripts/check-email.mts`, `next.config.ts`, `package.json`, `.env.example`, centralized `src/lib/reminders/delivery.ts`, auth integration/helper tests, Agent HTTP regression, this report, email/Google setup, user guide, final validation report and screenshots. `.env.local` was updated privately and remains ignored.

## Remaining limitations

Google Cloud credentials/consent configuration must be supplied by the user before live OAuth testing. External email arrival can be delayed or filtered even after provider acceptance. Losing access to the verified mailbox requires an identity-verified administrative recovery process; no insecure email-change or OTP bypass was added. Original reminder delivery still needs its existing worker. Later checkpoints remain untouched.


## Reproduce isolated tests

`npm test`, `npm run test:ai` and `npm run test:auth:mail` run unit/mocked services without paid provider calls. The auth/Google/Agent HTTP suites require the existing local fixture harness in `D:/Project Docs/actionflow-ui-test-tools`, its disposable MongoDB replica set, file-mail overrides and port-3001 test application. `auth-e-check.cjs` runs the eight auth scenarios; `auth-google-check.cjs` runs four mocked OAuth scenarios; `agent-http-check.cjs` runs the authenticated Agent regression. Provider mocks are confined to test processes. Do not run HTTP fixtures against the real database or SMTP credentials. The test-only Next build directory is ignored and removed from permanent TypeScript includes after fixture shutdown.

The single authorized real SMTP check ran separately with `npm run email:check -- --send-to-self`. The user confirmed Inbox receipt. No additional external email/OAuth/paid-AI test is claimed.
