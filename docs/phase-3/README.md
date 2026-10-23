# ActionFlow AI · Phase 3: Smart Capture & the Living Workspace

Smart Capture is implemented in the existing application at `/dashboard/capture`. The original MongoDB database, Better Auth configuration, task schema, protected routes, and task CRUD remain in place. AI daily planning and reminders remain previews.

## Working capture flow

- Paste up to 20,000 characters, choose/drop a PNG/JPEG/WebP up to 5 MB, or choose/drop a PDF up to 10 MB and 20 pages. Only one source is accepted per analysis.
- Images are verified by decoding actual bytes, bounded to 25 million pixels, rotated, resized to at most 2400×2400, flattened onto white, and stripped of metadata. PDFs require a PDF signature, successful parsing and a valid page count; damaged and encrypted files are rejected.
- The server sends actual source content to the official OpenAI Responses API. Text, image and inline PDF file inputs are supported. No provider Files API upload is created. Original upload bytes stay in memory and are not saved to MongoDB or the application filesystem.
- The UI discloses external AI processing before submission. The processing state corresponds to the real pending request, without invented percentages or fabricated results.
- Up to ten strictly validated suggestions appear with editable title, description, priority, date, time and IANA time zone, plus original wording, source excerpt and clarification information. Missing timing context is retained in the editable description where useful.
- Nothing is selected or saved automatically. Every selected suggestion requires a confirmed complete deadline or an explicit choice to save without one. Select all, clear selection, remove, retry, start new capture and save selected tasks are functional.
- Approved tasks are ordinary owner-scoped task records. They appear in the existing dashboard and survive refresh. A mixed save result shows which records succeeded and which require retry; edits are preserved.

## Dates, limits and security

The extraction prompt receives the current instant and the user's local date/time in their validated IANA zone. Original date wording is retained. Unclear dates and missing times require review rather than invented deadlines. All deadlines require human confirmation, including model results labeled certain. Temporal conversion rejects invalid, skipped and ambiguous daylight-saving wall times.

Both capture endpoints verify the origin and the database-backed session on the server. No browser-supplied owner, task status or server timestamps are accepted. Upload bodies and approval JSON are byte-bounded; body reads and AI requests have timeouts. File extensions/MIME and actual file contents are checked. Model output uses a strict Zod-backed schema, bounded fields and no more than ten actions. Source material is explicitly untrusted; no tools, code execution, URL fetching or external task actions are enabled.

Atomic MongoDB controls enforce five requests per user per minute and a configurable default allowance of twenty analyses per day, resetting at midnight UTC. Valid analysis attempts count even if the provider later fails. The quota is consumed before the paid call and SDK retries are disabled. Error responses normalize provider/configuration/quota/timeout/validation/session/database failures without logging document content or credentials.

Approved items commit a receipt and the existing task insert in one MongoDB transaction. Repeated and concurrent approvals return the actual previously saved task rather than duplicating it. A changed replay is rejected; a task deleted after its original save is not silently recreated. Each item commits separately, allowing honest partial results and safe retry of failures.

On capture only, session-expiry detection preserves the existing source and unsaved edits and offers sign-in in a new tab. This changes no authorization rule: analysis and saving still reject unauthenticated requests, and newly opening the protected page still requires authentication. Explicit logout and other protected-route behavior are preserved.

## Database changes

Migration `002-capture` adds metadata collections and indexes only:

- `captures`: owner, generated suggestion IDs, creation and expiry times; TTL after 24 hours. No original source bytes, source text or extracted content is retained here.
- `captureUsage`: atomic counters with expiry indexes for bounded request windows and daily quotas.
- `captureReceipts`: owner/capture/suggestion identity, approved-payload hash, task ID and creation time, with a unique compound index for duplicate prevention.

The migration has been applied to the configured ActionFlow database. Existing task documents were not deleted or replaced. Integration and browser tests use a separate disposable local replica set.

## The Living Workspace

The existing cream, sage, charcoal, indigo and local-font identity is preserved. The hero and story now share one persistent spatial subject: message, screenshot and handwritten note layers move toward a structured task and then align inside an illustrated schedule as the visitor scrolls. Pointer tilt and a small magnetic CTA response are optional enhancements. Native scrolling is retained; reduced motion uses a static composition.

SVG logo strokes draw once; the wordmark reveals through a timed mask; headline lines and supporting content enter in a coordinated sequence. Navigation retains its floating scroll surface, active section indicator, authenticated links and accessible mobile dialog. The schedule illustration is explicitly a preview of future AI daily planning, not a claim that planning works now.

The dashboard's Dayflow Canvas opens up the task desk, reveals compact controls on selection/hover/focus, connects chronological agenda items with a curved path and provides a quick-action dock. Capture is a real available action; Planner is labeled Preview. Source capture, understanding and review share a connected stage treatment. File previews use layout transitions, and editing favors familiar labeled form controls over decorative movement. No artificial preloader or additional animation dependency was introduced.

## Configuration and dependencies

`OPENAI_API_KEY` is server-only. The credential found in `.env.example` was removed and moved to ignored `.env.local`; the example now contains configuration names/defaults only. `OPENAI_MODEL` defaults to `gpt-4.1-mini`, a supported multimodal structured-output model ([model reference](https://developers.openai.com/api/docs/models/gpt-4.1-mini)). Implementation follows the official [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [file input](https://developers.openai.com/api/docs/guides/file-inputs) documentation.

`CAPTURE_DAILY_LIMIT` defaults to 20. Optional `CAPTURE_TIMEOUT_MS` is bounded to 1–55 seconds and defaults to 55 seconds. The existing MongoDB connection must support transactions, as Atlas and replica sets do. Missing AI configuration produces an honest setup-required state. Production email still needs SMTP; this phase preserves the existing development mailbox.

Added application dependencies:

- `openai`: official server SDK and structured response parsing.
- `sharp`: verification, normalization and metadata removal for images.
- `pdf-lib`: PDF readability and page-count validation.
- `@js-temporal/polyfill`: explicit IANA-zone deadline conversion with DST ambiguity rejection.

## Files changed

- `src/lib/capture/{schema,input,openai,repository,http,errors}.ts`: validation, AI integration, limits, approval receipts and normalized endpoint handling.
- `src/app/api/capture/{analyze,save}/route.ts`: protected analysis and approval endpoints.
- `src/app/dashboard/capture/page.tsx`, `src/components/capture/capture-workspace.tsx`: real capture, processing, review and recovery UI.
- `src/lib/tasks/repository.ts`: owner-scoped lookup and transaction-compatible approved-task insert, reusing existing serialization and task value rules.
- `migrations/002-capture.mjs`, `scripts/migrate.mjs`: additive metadata collections and indexes.
- `src/components/marketing/workflow.tsx`, `src/app/page.tsx`, `src/app/globals.css`: connected scene, kinetic identity, updated availability labels, capture styling and responsive/reduced-motion behavior.
- `src/components/dashboard/command-center.tsx`, `src/components/tasks/task-workspace.tsx`, `src/components/layout/app-shell.tsx`: Dayflow dock, curved agenda, contextual actions and available capture navigation.
- `src/components/auth/session-guard.tsx`: capture-only draft-preserving expiry notification; protected server access remains unchanged.
- `src/app/dashboard/[section]/page.tsx`: removes the obsolete capture placeholder.
- `tests/capture.test.ts`, `tests/capture-service.integration.ts`, `tests/capture.integration.ts`: input, SDK, date, quota, ownership, transaction and retry coverage.
- `scripts/capture-smoke.mts`, `scripts/check-client-secrets.mjs`: explicit manual live smoke checks and built-client secret scan.
- `.env.example`, `package.json`, `package-lock.json`, `README.md`, this report and JSON/screenshot artifacts.

## Validation

- ESLint and the production build passed, including TypeScript and generation of all 17 pages/routes. The built client scan checked 23 static files and found zero API-key, database-URI or auth-secret leaks.
- `npm test`: all ten tests passed, including the seven new capture tests and three existing validation/date tests.
- `npm run test:ai`: passed with a local mocked OpenAI transport; covers missing configuration, text/image/PDF payload types, bounded private requests, invalid output, unauthorized/quota errors and timeout handling. It never uses a paid key.
- `npm run test:capture` against an isolated replica set: passed. Thirty concurrent quota attempts admit exactly twenty; concurrent approval attempts create one task; ownership, changed replays, partial database validation failures, retry recovery, deleted-task replays and expired captures are checked.
- Existing database and authentication integration tests passed, including confirmation, session persistence, password reset, CSRF, token reuse and logout.
- Capture browser regression: 26 checks passed with mocked paid calls and actual isolated MongoDB writes. Covers approval, edited/selected saving, replay prevention, refresh persistence, image/PDF payloads, provider failures, quota/rate enforcement, 390/768/1024/1440px layouts, reduced motion and session-expiry draft retention.
- Existing task browser regression: 17 checks passed, including CRUD, completion/reopening, filters, five widths, sidebar, mobile drawer, keyboard-safe delete cancellation, validation, logout and protected routing. The edit test selects the row before using its new contextual controls.
- Public browser regression: 28 checks passed across five widths and the five public/account routes, including overflow, scroll stages, menu and reduced motion.
- Living motion check: logo, wordmark, headline, continuous scene stages, pointer enhancement and reduced-motion checks passed without browser exceptions. See the JSON artifacts for measured frame timings and their environment.
- Automated axe WCAG A/AA scans found zero violations in the capture and review states. These do not replace a complete assistive-technology audit.
- Three small, non-sensitive synthetic sources were tested against the real configured OpenAI API: text, image and PDF. Each returned one action with the expected absolute date and time. No database writes were made by these live smoke tests; all automated paid calls are mocked.
- `npm audit --omit=dev`: zero reported runtime vulnerabilities. The full audit reports five high development-tool advisories in the existing ESLint → glob → braces chain; the registry's latest braces release remains affected. No incompatible Next/ESLint downgrade was forced.

## Performance observations

The final production trace used local headless Chromium and 120 scroll frames. Without CPU slowdown, mean frame time was **16.94 ms**, p95 **16.90 ms**, with one frame over 33 ms. Under synthetic 4× CPU slowdown, mean was **19.44 ms**, p95 **34.60 ms**, with thirteen frames over 33 ms. The earlier development-server trace was slower (54.84 ms mean under 4× slowdown). Production measurements are recorded separately in `living-motion-production-1x.json` and `living-motion-production-4x.json`.

These are local synthetic measurements, not representative mid-range-device validation or a Lighthouse score. The 4× run did not sustain a consistent 60 FPS. Mobile layouts and reduced motion simplify the composition, but physical-device performance still needs testing.

## Limits and preview

Open [ActionFlow](http://localhost:3000) or the protected [Smart Capture workspace](http://localhost:3000/dashboard/capture). Screenshots under `screenshots/` are actual browser output. Review and dashboard screenshots contain disposable regression data and mocked model suggestions, not claims of real-user AI output.

Original sources and unsaved edits live in the current browser tab and are not restored after refresh or navigation; approved tasks persist in MongoDB. Analysis suggestions may be imperfect, so explicit human review is mandatory. Documents are sent to OpenAI when Analyze is clicked; provider retention policies still apply even though response storage is disabled. PDFs that are encrypted or structurally unreadable must be re-exported first.

Testing used Chromium viewport emulation rather than physical mobile devices or Safari/WebKit. Synthetic CPU-throttled frame timings are not proof of 60 FPS on representative mid-range hardware. AI planning, recurring reminders, notifications, voice, payments, collaboration and a document vault remain out of scope.
