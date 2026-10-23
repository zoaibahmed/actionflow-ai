# Checkpoint D — Secure AI Workspace Agent

Implemented in the existing application. Checkpoints E, F and G were not started.

## Open and use

Sign in and open `/dashboard/assistant`. Desktop sidebar: **AI Assistant**. Global header: **Ask ActionFlow** (spark icon on phones). Mobile **More** navigation also includes it. Choose a suggested prompt or type a request. Relevant workspace content is sent to OpenAI; the UI discloses this before submission.

The interface includes recent conversations, a new-conversation action, actual loading state, trusted record links, editable action cards, cancellation, committed receipts and a conversation-deletion dialog. Messages use plain React text, not generated HTML. Forms and native scrolling remain usable without animation. The existing Motion provider respects the user's reduced-motion preference; new transitions are restrained.

## Architecture

`POST /api/agent` verifies origin and Better Auth session before parsing a bounded body. User identity comes exclusively from the server session. A strict discriminated request schema rejects extra authority/payload fields. The service acquires a persistent per-user lease, checks quotas and request idempotency, selects the saved timezone and loads bounded history.

The existing official OpenAI SDK and server transport run a Responses function-calling loop with strict schemas generated through `zodResponsesFunction`. Tool inputs are validated again by trusted code. Only registered functions execute. There is no JavaScript, shell, arbitrary query, URL-fetch or generic database tool. Model responses never grant execution approval. OpenAI response storage is disabled, SDK retries remain disabled, and actual completed model token totals are recorded as metadata.

Consulted official reference: https://developers.openai.com/api/docs/guides/function-calling

### Registered tools

| Tool | Behavior |
| --- | --- |
| `find_tasks` | Owned tasks, literal title matching, today/overdue/open filters, priority; at most 30 |
| `read_reminders` | Actual pending/processing reminders, IDs, schedules and channel state; at most 30 |
| `read_recurring` | Existing recurring-series information; at most 20; read only |
| `read_notifications` | Actual recent/unread notification state; at most 20 |
| `read_dayflow` | Saved plan and planning constraints for an exact date |
| `propose_task_create` | Editable task draft; no task write |
| `propose_task_update` | Title, description, priority, status, deadline; no task write |
| `propose_task_delete` | One owned task; no deletion until separate confirmation |
| `propose_reminder` | Create/update/cancel actual reminder specifications; future reminder snoozing uses a custom-time update |
| `propose_notification` | Mark a notification read or snooze a delivered notification |
| `generate_dayflow_draft` | Existing planner generation, task selection, quotas and constraints; prepares a save proposal |
| `propose_plan_edit` | Existing plan's schedule/notes, with coverage, overlap and working-time validation |

Multiple title matches return choices to the model for clarification. No arbitrary matching record is selected. Explicit task IDs still undergo ownership checks. The model is instructed to clarify vague names and dates; dated writes require the user's separate date/time confirmation. Missing clock times and DST gaps/repeated clocks are rejected by trusted date conversion.

## Approval boundary

A pending action is stored server-side with owner, conversation, exact validated payload, canonical SHA-256 hash, revision, relevant task/reminder/notification versions, timezone and ten-minute expiry. The browser submits only its ID, revision, hash and confirmation fields when approving. It cannot replace an approved action's payload or target.

Task/reminder/plan edits update the held preview, revision and hash. The user must choose **Update preview** before approving edited fields. Dates/times require a checkbox. Deletion requires typing **DELETE**; plan saves/overwrites require **SAVE PLAN**. Targets cannot be changed through an edit request. Cancelled, expired, stale or cross-user actions cannot execute.

Approval rechecks the session at the endpoint, owner, held arguments, record state and constraints. The domain change, reminder reconciliation, approval receipt and audit entry commit in one MongoDB transaction. Repeated/concurrent approvals return the original receipt without repeating the write. Original reminder and planner services gained an optional existing transaction argument; their normal callers retain the original transaction behavior. Separate cards are individually atomic: one can succeed while another fails, with distinct receipts/errors. There is no implicit bulk deletion.

## Storage and security

Migration `005-agent.mjs` adds `agentConversations`, `agentActions`, `agentAudit`, `agentTurns` and `agentLeases`, validators and indexes. It was applied to the configured application database after disposable-database tests. Existing domain collections, records and authentication were retained.

Conversations, held actions, audit metadata and turn receipts expire after 30 days through MongoDB TTL indexes. Reads enforce expiry immediately; physical TTL deletion is asynchronous. History is capped at 20 active conversations, 40 stored messages per conversation and approximately 60 held action records. Deleting history removes its conversations/actions/audit/turn receipts, while previously committed tasks and plans remain. Leases retain one small row per user.

Secrets remain server-side. Obvious keys, private-key headers, password assignments and MongoDB URIs are rejected before chat persistence and redacted from tool content, snapshots and receipt labels. This is defense in depth, not a universal secret detector: users must not paste credentials or confidential material they do not want processed. Tool-returned content is explicitly untrusted; even an injected model tool request can only prepare a pending action. Logs do not include chat bodies or tool arguments. Audit stores tool/status/usage metadata.

## Environment and limits

Reuse `OPENAI_API_KEY`, `OPENAI_MODEL`, optional existing `OPENAI_BASE_URL`, MongoDB and Better Auth configuration. No new key or provider is required. `AGENT_DAILY_LIMIT=20` is configurable (clamped to 1–200). No secret value belongs in documentation or browser code. No new dependency was installed.

- 5 model requests per user/minute; default 20/day, resetting at UTC midnight. Accepted failures consume quota.
- 90 authenticated agent HTTP operations/minute.
- One active model request per user; 150-second fenced lease, 50-second overall provider signal.
- At most 3 Responses rounds, 6 tool calls and 3 proposals per request; 2,200 output tokens per agent round.
- Last 12 messages, at most 4,000 characters each, plus bounded/redacted tool results (22,000 characters each).
- Planner generation additionally uses existing planner quotas and its existing 6,500-token output bound.
- 90KB request body, ten-second body-read cutoff, 4,000-character chat input.

Missing/invalid provider configuration, provider failure, invalid schema, timeout, busy lease, quota, ambiguity, stale records and database rejection return recoverable errors. Failed user input remains in the composer; previously accepted conversation messages and previews remain accessible in history. Network retries reuse request IDs; completed retries do not invoke the provider again.

## Validation actually executed

| Check | Result |
| --- | --- |
| `npm test` | 25 tests passed |
| `npm run test:ai` | 2 mocked Capture/Planner SDK tests passed |
| `npm run test:agent` against disposable replica set | 11 tests passed |
| Agent HTTP integration against isolated app/provider fixture | 1 test passed |
| Existing task/Capture/Planner database regression | 3 tests passed |
| Existing reminder lifecycle/delivery/recurrence regression | 3 tests passed |
| Existing auth flow HTTP regression | 1 test passed; an additional repository/database test also passed |
| Lint / TypeScript / production build | Passed |
| Production client-secret scan | 32 client files, zero configured-secret matches |
| Additive database migration | 001–005 completed on the configured application database |

Agent tests cover strict tools, owner isolation, malicious record instructions, ambiguous references, create/update/delete holds, confirmation phrases, edited hashes, stale/expired/cancelled actions, concurrent approval replay, request replay, real reminder/notification services, actual planner SDK generation and approved edits, scheduling constraints, database rollback, independent partial outcomes, quotas, leases, interrupted/provider/invalid responses, missing configuration and conversation isolation/deletion. Paid provider calls are mocked.

The new integration scripts intentionally refuse non-local MongoDB and require an `actionflow_ai_agent_` database name. Run against a disposable MongoDB replica set with migration 005 applied. The HTTP test additionally expects the isolated application on port 3001, private development file-mail and a mocked provider returning a create-task proposal. Local test infrastructure is in the existing sibling `actionflow-ui-test-tools` harness; do not point these tests at live data.

Browser inspection used the actual isolated app with real Better Auth/MongoDB and mocked paid responses: sign-in, suggested prompts, draft creation, editable revision, explicit approval, confirmed task route/persistence, cancellation, conversation resume/new conversation, global entry and keyboard focus. Widths 320, 390, 768, 1024 and 1440 had no horizontal overflow. Screenshots: `screenshots/agent-desktop.png`, `screenshots/agent-mobile.png`, `screenshots/agent-mobile-review.png`. Observed browser outcomes are recorded in `agent-browser-checks.json`; the fresh final render produced no console errors or warnings. Browser checks are qualitative and geometry-based, not a Lighthouse score or full accessibility certification.

## Limitations and boundaries

No real paid OpenAI smoke call was made. Model extraction/clarification quality therefore needs a controlled live evaluation with the configured model. No real-device/Safari or system reduced-motion emulation was performed in this checkpoint; reduced-motion wiring was inspected in the shared Motion provider and CSS. Routine browser tests covered task approval, not every reminder/planner editor variant; those service paths were exercised in automated integration tests.

No bulk writes, recurring-series editing, external email/push delivery changes, Notes, Focus Mode, Universal Search, Insights, OTP, Google OAuth or deployment were implemented. Reminder delivery still requires the existing worker and configured channels. History is a bounded recent conversation, not a permanent archive. OpenAI/account limits can prevent requests even when the application's own quota remains.

## Files changed

New: `src/lib/agent/{schema,repository,tools,openai,service}.ts`, `src/app/api/agent/route.ts`, `src/app/dashboard/assistant/page.tsx`, `src/components/agent/agent-workspace.tsx`, `migrations/005-agent.mjs`, `tests/agent.test.ts`, `tests/agent.integration.ts`, `tests/agent-http.integration.ts`, this report and agent screenshots.

Updated: `src/lib/reminders/repository.ts`, `src/lib/planner/repository.ts`, `src/components/layout/app-shell.tsx`, `src/app/globals.css`, `scripts/migrate.mjs`, `.env.example`, `.gitignore`, `eslint.config.mjs`, `package.json`, `docs/USER_TESTING_GUIDE.md`, `docs/FINAL_VALIDATION_REPORT.md`.
