# Checkpoint G — production readiness handoff

Date: 22 October 2026. Repository: `D:\Project Docs\actionflow-ai`. Scope ended at G. Existing MongoDB, Better Auth, task/Capture/Planner/Agent/reminder/Notes/Focus/Search/Insights services and visual identity were preserved. **No live VPS connection or deployment was performed.**

## Prioritized audit and changes

1. Preserve the verified session/ownership/approval boundaries and rerun their regressions; distinguish mocked providers from real service delivery.
2. Harden production environment failure handling, proxy client-IP trust, worker authorization, response headers and loopback binding.
3. Prepare a normal Next Node server plus independent reminder worker deployment, protected environment, TLS/proxy templates and recoverable backup instructions.
4. Measure existing landing motion before changing it; fix actual accessibility and mobile defects rather than redesigning the product.
5. Validate build, tests, browser states, client secret exposure and document every external launch gate.

Implemented production configuration checks in app instrumentation and a CLI; minimal no-store liveness; global security headers; production-specific trusted IP header; byte-safe worker token comparison; configurable bounded worker polling; loopback production start; explicit Node engine requirement. Prepared separate hardened systemd units, fixed-origin Nginx/TLS template and encrypted quiesced backup script with protected-config/lock checks. This is a full-checkout deployment; `tsx` is required by the worker, so install development dependencies too.

Targeted UI changes: navbar state changes only at its scroll threshold; hero pointer geometry is cached with scroll/resize invalidation; corrected account/date accessible labels, assistant/planner/focus/insights text contrast and Notes heading order. Added an opt-in local-only frame/axe diagnostics panel. No new product capability, animation engine, authentication semantics or database schema was introduced.

## Status by capability

| Capability | Classification | Evidence / limit |
| --- | --- | --- |
| Existing task/Capture/Planner/Agent/workspace boundaries | **VERIFIED** locally | Automated suites, real local MongoDB transactions and HTTP checks; not a VPS load test |
| Email OTP sending | **VERIFIED** for configured local SMTP/inbox receipt | TLS connection and real SMTP acceptance passed; owner separately confirmed an OTP email arrived. Codes are not documented or logged |
| Password+OTP, verification and recovery semantics | **VERIFIED** in isolated automated/browser tests | Full OTP flow, expiry/replay/cooldown/attempts, reset/session revocation; complete real-inbox password+OTP browser flow was not repeated |
| Google OAuth | **IMPLEMENTED BUT NOT LIVE-TESTED** | Four signed mock-provider tests pass. Credential fields are configured and syntactically plausible; no real Google account/consent/callback verification was completed |
| AI Agent live model/tool integration | **VERIFIED** in a controlled local smoke | Ten synthetic cases, 19 real Responses requests, 71,512 total reported tokens. Actual approved MongoDB create/update, replay and cancel assertions; not an exhaustive live-model evaluation |
| Reminder/recurrence services | **VERIFIED** locally | Three integration tests cover lifecycle, concurrency, recurrence, retries and quiet hours. Independent production-mode `--once` worker exits successfully on an empty isolated DB |
| Browser push | **CONFIGURATION REQUIRED** | Current local environment has no complete VAPID configuration. Mock delivery/subscription logic covered; no real device display proof. Requires HTTPS, supported browser and permission |
| Production Next Node startup | **VERIFIED** locally | Loopback server on 3002, health 200, login 200, security headers, no QA overlay |
| VPS services/Nginx/TLS/backups | **IMPLEMENTED BUT NOT LIVE-TESTED** | Reviewed templates/runbook exist; Linux syntax, service permissions/restarts, certificates, off-site restore and firewall are not verified |
| Final domain/DNS/provider callback and credential rotation | **CONFIGURATION REQUIRED** | Operator must configure and validate the actual deployment environment |
| Full dependency audit | **FAILED / BLOCKED** for a clean all-dependency result | Five high entries in the development ESLint globbing chain remain; production-only audit reports zero vulnerabilities. Do not apply npm's incompatible major downgrade blindly |

## Tests actually executed

Final passing automated total: **85 tests**, separate from the ten real-model smoke scenarios.

| Suite / command | Passed |
| --- | ---: |
| `npm test` | 30 |
| `npm run test:workspace` via disposable Mongo replica-set harness | 14 |
| `npm run test:workspace:http` against isolated Next server | 5 |
| `npm run test:auth` against isolated server/private file mailbox | 8 |
| `npm run test:auth:google` with signed mock Google responses | 4 |
| `npm run test:agent` with local Mongo and mocked paid calls | 11 |
| `npm run test:agent:http` with create-preview mock mode | 1 |
| Existing task/Capture approval/Planner Mongo integration harness | 3 |
| `npm run test:reminders` in disposable replica set | 3 |
| `npm run test:ai` with mocked paid calls | 2 |
| `npm run test:auth:mail` with transport mocks | 2 |
| `npm run test:production:http` | 2 |

Lint, TypeScript and production build were executed successfully during G; the final validation entry below records the last build/scan. `npm run config:check` passes locally with explicit loopback/file-mail production warnings. `npm audit --omit=dev --json` reports zero vulnerabilities; full `npm audit --json` reports five high development-chain entries. These are separate results.

Two initial regression runs failed due to fixture configuration: missing-config Google test inherited real environment fields, and Agent HTTP test initially used the read mock rather than create mock. Explicit blank Google overrides and the correct mock mode fixed them; both suites then passed. An experimental real SMTP OTP observer failed to capture mail in memory even though the owner received the OTP; the observer was removed and is not counted as a passed end-to-end test. No application auth bypass was added to make tests pass.

## Live agent smoke

`scripts/agent-live-smoke.mts --allow-paid` refuses non-loopback/non-disposable databases and custom provider URLs. A temporary local replica set launcher provided a fresh database and loaded the server key privately. It enforces at most 25 provider requests (no SDK retries), existing per-turn output/tool/context limits, two synthetic owners and no test emails. Actual result: 19 requests, ten cases passed. It printed tool names/counts only, not source contents, keys or model conversation text.

Cases: task lookup; task create preview→approve→duplicate approve with exactly one insert; priority update preview→approval; reminder lookup; saved Dayflow lookup; notes lookup; Insights; Search; ambiguous deadline/task clarification with no proposal; cancellable task preview. Expected typed tools were selected. The test checks no model turn itself inserts tasks. Tests for planner mutation, reminders and other destructive paths remain mocked integration tests rather than claiming all 22 tools received a paid live check. [Official Responses function-calling documentation consulted](https://developers.openai.com/api/docs/guides/function-calling).

## Browser evidence

Local disposable account/database, real Better Auth and task persistence, mocked AI for UI interaction, no production user changes. Nine widths: 320/360/375/390/430/768/1024/1440/1920 for landing/dashboard/assistant/auth pages; six representative widths for the remaining workspace routes. No document overflow found. Automated axe scans of landing, all workspace routes and auth states reported zero violations after targeted fixes; incomplete manual checks remain. See `../PERFORMANCE_REPORT.md` for frame samples and precise limitations.

Verified browser password+OTP sign-in, create/edit/complete task, edit surviving reload, completion statistics, delete-confirmation cancellation, mobile drawer and Escape focus return, assistant preview approval and actual receipt, resumed conversation, and sign-out. Final fresh browser run captured no console warnings/errors. No real OS reduced-motion toggle, screen reader, CPU-throttled phone profile, real push permission or Google account login was performed.

Screenshots contain synthetic data, with the development QA panel visible:

- `checkpoint-g/landing-1440.png`
- `checkpoint-g/dashboard-390.png`
- `checkpoint-g/assistant-390.png`

## Files changed in G

- Runtime/security: `src/lib/production-config.ts`, `src/instrumentation.ts`, `src/lib/auth/server.ts`, `src/app/api/reminders/worker/route.ts`, `src/app/api/health/route.ts`, `scripts/reminder-worker.mts`, `next.config.ts`.
- UI/performance/a11y: `src/components/marketing/public-navbar.tsx`, `src/components/marketing/immersive-story.tsx`, `src/components/layout/app-shell.tsx`, `src/components/planner/planner-workspace.tsx`, `src/components/workspace/notes.tsx`, `src/components/dev/diagnostics.tsx`, `src/app/layout.tsx`, `src/app/globals.css`.
- Checks: `scripts/check-production.mts`, `scripts/check-client-secrets.mts`, `scripts/agent-live-smoke.mts`, `tests/production.test.ts`, `tests/production-http.integration.ts`.
- Packaging/config: `package.json`, `package-lock.json`, `.env.example`. Added development dependency: `axe-core`, loaded only for opt-in local accessibility QA.
- Deployment: `deploy/nginx/actionflow.conf`, `deploy/systemd/actionflow-app.service`, `deploy/systemd/actionflow-worker.service`, `deploy/backup.sh`.
- Docs: this report, `docs/VPS_DEPLOYMENT.md`, `docs/PRODUCTION_CONFIGURATION.md`, `docs/SECURITY_AUDIT.md`, `docs/PERFORMANCE_REPORT.md`, `docs/FINAL_LAUNCH_CHECKLIST.md`, `docs/USER_TESTING_GUIDE.md`, and the three screenshots. Temporary isolated launch helpers remain outside the application in the sibling local test-tools directory; their private environment files are not deliverables.

## Start and handoff

Local development: `npm run dev`; browser `http://localhost:3000`. Worker in another shell: `npm run reminders:work`. Production preparation: `npm ci --include=dev`, protected environment, `npm run config:check`, reviewed backup, `npm run db:migrate`, `npm run lint`, `npm test`, `npm run build`, `npm run secrets:check`, then `npm start`. Start the worker independently. Integration commands require an explicitly configured disposable replica set/provider mocks; never run them against real data.

Manual VPS steps, exact service/proxy commands, TLS bootstrap, backup consistency, restore rehearsal and rollback are in `../VPS_DEPLOYMENT.md`. Remaining launch gates are in `../FINAL_LAUNCH_CHECKLIST.md`: credential rotation, real domain/HTTPS/proxy isolation, Google live flow, device push, public OTP/recovery retest, Linux services, backup recovery, dependency advisory review and physical-phone profiling. Code readiness is not production deployment verification.

## Final validation record

After the final accessibility/configuration changes: `npm run build` exit 0 (32 generated routes/pages in the build progress), `npm run lint` exit 0, `npx tsc --noEmit` exit 0, and the 30-unit suite exit 0. The final `npm run secrets:check` scanned 40 static assets against seven configured private fields and found zero matches. This is an exact configured-value scan, not proof that every possible unknown credential pattern is absent. Final production dependency audit: zero findings; full development-chain audit retains the five reported high entries. Node tested: 25.2.1 on Windows.

Temporary test servers on 3001/3002 and disposable replica sets were stopped; the original development server on 3000 was preserved. Temporary browser tabs and viewport overrides were cleaned up. The actual deployment target remains untouched.
