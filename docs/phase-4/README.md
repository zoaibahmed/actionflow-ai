# Phase 4 — Dayflow Planner

Dayflow replaces the AI Planner preview at `/dashboard/planner`. It uses real owner-scoped tasks, the existing Better Auth session and MongoDB connection, and the same official OpenAI Responses transport as Smart Capture.

## Functionality

- Choose a calendar date and IANA timezone. Configure working hours, breaks, default duration, maximum session length and daily focus budget. Save preferences separately from schedule approval.
- Select up to 20 unfinished tasks and enter duration estimates. Unknown durations use a visibly identified, editable default estimate. No task deadline or task status changes when scheduling.
- Enter date-specific commitments. Generate an actual AI proposal or place blocks manually, including when AI configuration is unavailable.
- Review start/end times, elapsed duration, reasoning, deadline warnings and tasks that could not fit. Move blocks with time fields or keyboard-accessible 15-minute controls, adjust durations, remove blocks, revise breaks, regenerate, add notes, then explicitly approve.
- Reopen a saved day after refresh or in a later session. Proposed changes and saved versions have distinct labels. A failed save preserves the draft; session expiry preserves edits and offers sign-in in another tab.
- Already-reserved intervals from other planning dates are shown and respected, including schedules whose timezones span another local date. Their focus minutes also count toward the chosen local day's budget.

## Design and motion

The existing cream, charcoal, sage and indigo identity and licensed fonts remain. A quiet task desk sits beside an asymmetric timeline with connecting nodes, muted focus blocks and break markers. Mobile stacks the task desk above the day. Working boundaries collapse into a compact disclosure; contextual controls stay with each block.

Motion provides real processing-to-review transitions, block layout movement and a progress-meter transition. Pending UI appears only during real requests and never shows invented percentages. Normal scrolling, native inputs, visible focus and reduced-motion overrides remain. Time controls and move buttons provide an accessible alternative to drag gestures; pointer dragging is not implemented. The timeline is chronological, rather than a minute-scaled calendar grid.

## Backend and database

Migration `003-planner.mjs` is additive and was applied to the configured `actionflow_ai` database. It creates:

- `dailyPlans`: owner/date identity, timezone, version, approved inputs, task references, UTC start/end dates and timestamps. Unique owner/date and owner/schedule indexes.
- `plannerPreferences`: owner-scoped defaults and task duration estimates, with optimistic version checks.
- `plannerReceipts`: durable idempotency receipts that commit with schedule saves.
- `plannerLocks`: per-owner transaction serialization, preventing concurrent cross-date conflicts.

Task estimates live in planning metadata because the existing strict task schema has no duration field. Existing task records, CRUD, validators, deadlines and authorization are unchanged. Titles/descriptions are read from tasks rather than duplicated into schedule blocks. Atlas transactions are required, as for Smart Capture. No original uploads or Capture records are modified.

Every request verifies the session and trusted origin. Inputs are strict, bounded and checked server-side. All selected task references must belong to the user and remain unfinished. The server validates calendar dates, IANA zones, DST ambiguity/gaps, working ranges, breaks/commitments, elapsed duration, overlap, focus-session length, total daily focus and coverage of every selected task. AI output cannot bypass these checks. Tasks that cannot fit have an explicit unscheduled explanation. Deadlines generate warnings rather than being silently moved.

Approval uses a task-version snapshot, schedule-version comparison and transaction-backed request receipts. Repeated identical approval returns the existing saved version. Changed payloads cannot reuse a receipt. Concurrent saves cannot silently overwrite another version. A failed transaction does not advance the plan or leave a successful receipt. Preferences have their own optimistic version.

## AI configuration

No new application dependencies were added. `src/lib/ai/client.ts` shares the existing OpenAI SDK client configuration with Capture; no browser key, tools or external actions are introduced. The existing `OPENAI_API_KEY` and `OPENAI_MODEL` are used (default `gpt-4.1-mini`). Requests use `store:false`, strict Zod structured output, a 6,500-output-token bound, no automatic paid retries and the existing bounded request timeout. Uploaded/task content is treated as untrusted data. Provider errors are normalized and secrets/content are not logged.

`PLANNER_DAILY_LIMIT=20` sets the initial per-user UTC-day generation quota (valid range 1–1000). Persistent atomic controls also enforce three generation attempts per minute and 60 planner requests per minute. Failed provider attempts consume the generation allowance. Missing configuration has an honest setup state; manual scheduling still works.

Implementation follows the official [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).

## Files changed

- New: `src/lib/ai/client.ts`; `src/lib/planner/{schema,repository,openai}.ts`; `src/app/api/planner/route.ts`; `src/app/dashboard/planner/page.tsx`; `src/components/planner/planner-workspace.tsx`.
- Integration: `src/lib/capture/openai.ts`, `src/components/layout/app-shell.tsx`, `src/components/dashboard/command-center.tsx`, `src/app/dashboard/[section]/page.tsx`.
- Styles and availability copy: `src/app/globals.css`, `src/app/page.tsx`, `src/components/marketing/workflow.tsx`.
- Database/config: `migrations/003-planner.mjs`, `scripts/migrate.mjs`, `.env.example` (names only), `package.json` test scripts, `README.md`.
- Tests: `tests/planner.test.ts`, `tests/planner.integration.ts`, `tests/planner-service.integration.ts`; manual paid smoke: `scripts/planner-smoke.mts`.
- Validation artifacts and screenshots: this directory. Screenshots use disposable test users, an isolated Mongo replica set and mocked paid AI transport; they do not depict a real user's records.

## Validation

Final results are recorded in `validation-summary.json`, `browser-checks.json`, `accessibility.json` and related regression reports.

- Unit checks cover task/interval constraints, strict approval schemas, coverage, timezone conversion, DST gaps and 23/25-hour calendar days.
- Mocked official-SDK checks cover valid scheduling, foreign references, incomplete durations/coverage, malformed output, reserved time, missing configuration, quota and timeout. Existing Capture SDK checks also run.
- Isolated Mongo integration covers ownership, UTC persistence, duplicate/concurrent approvals, stale schedule/task versions, cross-date timezone collisions, preference persistence/versioning, quotas, transaction rollback/retry, plus existing Capture and task repository regressions.
- Browser checks cover real signup/confirmation/sign-in, real task data, preferences, processing, editable proposals, approval, HTTP replay, refresh persistence, stale versions, manual placement, commitments, duration estimates, conflict resolution, provider errors, guest/origin/ownership rejection, responsive widths 390/768/1024/1440, reduced motion and session expiry.
- Existing task-workspace, public/auth and Smart Capture browser regressions were rerun. Intentional error-response resource messages are filtered from console-error reports; no unexpected hydration/page exceptions are accepted.
- One manually invoked live OpenAI smoke test used three synthetic tasks and no database writes. Its validated output scheduled two blocks / 60 focus minutes and explicitly left one task unscheduled. All automated AI tests mock paid calls.

## Limits

- The supplied attachment ends mid-sentence in the Signature Interaction subsection. All complete supplied requirements above it were used; no missing requirements were invented.
- Single local-calendar-day working ranges; overnight working hours are rejected. Ambiguous DST local times require another time rather than a silently chosen UTC offset.
- No external calendar sync, notifications, reminders or recurring scheduling. Dashboard Today retains its existing deadline-based agenda; saved schedules reopen in Dayflow.
- Saved schedules remain a separate planning layer. Editing or completing a task does not silently move or delete saved blocks; reopen the day to review changes and remove unavailable tasks.
- Unsaved edits stay in browser memory, with an unload warning. They are not silently stored in local storage. Explicit reload/date-change actions confirm discarding changes.
- Chromium was tested locally; Safari, Firefox, physical mobile hardware and exhaustive screen-reader testing remain unverified. No new Lighthouse or physical-device performance score is claimed.
- SMTP remains unconfigured; local development verification/reset mail still uses the private file mailbox. Existing dev-only lint-tool advisories documented in Phase 3 remain outside this feature.

### Final measured results

- Lint and production build: passed (18 generated pages/routes).
- Unit tests: 14 passed. Mocked SDK suites: 2 passed. Mongo integration suites: 3 passed. Authentication integration: 1 passed.
- Browser checks: 97 passed — Planner 26, task workspace 17, public/auth pages 28, Smart Capture 26. No unexpected page, console or hydration errors in the recorded runs.
- Axe: zero violations in planner review, Capture input/review and task workspace under the tested WCAG 2 A/AA, 2.1 AA and 2.2 AA rules.
- Built client scan: 26 files checked, zero configured-secret leaks.
- Main local development login route: HTTP 200 after final build; isolated test services stopped. The normal app remains available on port 3000.

Preview: http://localhost:3000/dashboard/planner (sign-in required).

Screenshots: [Desktop editable schedule](screenshots/planner-review-1440.png), [mobile editable schedule](screenshots/planner-review-390.png), [real pending state](screenshots/planner-understanding-1440.png). These are isolated test fixtures, not production records.
