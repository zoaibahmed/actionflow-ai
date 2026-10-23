# Phase 5 — Smart Reminders, Notifications and Recurring Tasks

Implemented in the existing ActionFlow application. MongoDB, Better Auth, Smart Capture, task CRUD and Dayflow remain in place. This phase adds no AI calls and no unrelated product features.

## Delivery status — read this first

- **In-app notifications: verified end to end, including a fully closed browser.** A task with a real future relative reminder and an explicitly acknowledged custom reminder was created through the task form. Chromium was closed completely, the secured server processor ran, a notification appeared in MongoDB, and reopening the saved session displayed it. The test used a disposable account and isolated Mongo replica set; no fictional production notification was inserted.
- **Browser push: implemented, live delivery blocked/unverified in this environment.** Service-worker registration, permission UX, subscription persistence/removal and expired-subscription handling are implemented. A controlled headless Chromium subscription handshake failed with `AbortError: Registration failed - permission denied`, even with test notification permission granted. A real device receiving a push has not been verified. See `push-environment.json`.
- **Email: implemented, SMTP unconfigured and real inbox delivery unverified.** No reminder email was claimed as sent. Authentication file-mail behavior remains unchanged. Core in-app reminders do not require an email provider.
- The local managed processor was started against the configured ActionFlow database. Production still needs an external schedule or a managed worker. Browser polling is never the scheduler.

## Features

### Intentional reminders

The task creation/editing dialog supports no reminders, at due time, 5/15/30 minutes, 1 hour or 1 day before, and custom local date/time. Up to five manageable reminders are supported, with independently selected in-app, push and email channels. A past time requires an explicit “send on next processor run” acknowledgement. Nothing is scheduled by default.

The Reminder Stream also provides a compact native reminder editor. It reads actual task/reminder records, edits timing, cancels individual reminders or clears all, preserves recoverable input and checks list versions to prevent stale overwrites. Task and reminder changes in the task editor commit together; an idempotency receipt prevents repeated form submissions from creating another task.

Pending relative reminders follow changed due dates. Moving a deadline into the past or removing it cancels obsolete pending relative reminders rather than triggering them immediately. Custom reminder instants remain fixed. Completing or deleting a task cancels pending reminder/channel work in the same transaction, while delivered notification history remains. Reopening a task does not silently recreate cancelled reminders. Dayflow exposes intentional task links for reminder setup and its approved plan is unchanged.

### Notification center

The header bell has a real unread count, bounded recent history, a native accessible dialog and a restrained animation when new unread records arrive. It refreshes at most once per minute while visible, on focus, or after relevant actions; it pauses polling requests while the document is hidden. New arrivals refresh an open stream without replacing reminder drafts or unsaved preferences.

The full stream supports read/unread, mark all read, dismiss, task links, snooze and older-history pagination (20 records per page). Mutations are owner-scoped and version-checked. Snooze uses a durable receipt, creates a new pending reminder once and leaves the original notification history intact. Completed/deleted tasks cannot be snoozed. Task links verify ownership on the server and provide a meaningful unavailable-task fallback.

### Preferences and quiet hours

`/dashboard/settings` now holds real notification preferences: in-app, email and push, default offset, IANA timezone, snooze duration and quiet hours. Quiet hours can cross midnight. Notifications are deferred until the quiet window ends; they are not discarded. A disabled selected channel also defers its work, with an explanatory reason and scheduled retry time. Resuming deferred work follows the next processor run when it becomes eligible. DST handling for quiet-window release uses Temporal's compatible resolution and never releases before the current instant.

### Recurring tasks

Recurring series use an existing owned task as a template and create independent task occurrences; the original task stays unchanged. Support daily, weekly, fortnightly, monthly, yearly and custom intervals 1–30 of those units, with start/end dates, local time, timezone, task text/priority and optional reminder offsets/channels.

The UI requires acknowledgement of the explicit policy: monthly 31sts skip months without that date; February 29 skips non-leap years; missing or ambiguous DST times are skipped; missed occurrences are not backfilled. The processor generates only through 14 days ahead (including today's remaining valid occurrence), never unlimited future records.

Occurrence identifiers are deterministic UUIDs; a unique series/date ledger prevents duplicates across concurrent workers. Completing, editing or deleting an occurrence preserves its exception/tombstone and history. Series edits replace future uncompleted, unedited copies; completed, past and individually edited copies remain. Pause/end stop new generation and cancel future reminders while retaining existing tasks. Resume restores eligible series reminders on unedited future copies. Series status and edits are version-checked; up to fifty active/paused series are supported.

## Scheduler architecture and reliability

The Node processor is shared by a managed CLI runner and `POST /api/reminders/worker`. No timer runs inside a Next server instance; no browser timer, TTL deletion, request traffic or open dashboard is needed to schedule a reminder.

- Due reminders and delivery jobs are claimed with atomic Mongo updates, random lease tokens and 90-second leases. Abandoned processing is reclaimable.
- Per-owner transaction locks coordinate task mutations, reminder expansion and series writes. Reminder expansion commits the in-app notification and outbox work atomically. Unique notification IDs prevent duplicate in-app records.
- External email/push jobs have separate statuses and attempts. Providers are called outside transactions, after rechecking task state, reminder revision, quiet hours and channel preference.
- A maximum of five processing/provider attempts applies, including crash recovery. Provider retries back off from 30 seconds, doubling to 8 minutes by the fifth attempt. Quiet-hour/disabled-channel deferrals do not consume provider retry attempts.
- Lease fencing prevents a stale worker from overwriting a newer claim or cancellation. External requests already in flight cannot always be recalled after task completion/cancellation; their attempt outcome is retained honestly.
- SMTP uses a stable Message-ID, and push uses a stable topic/tag to reduce duplicates where the provider supports it. SMTP and Web Push do **not** provide an application-wide exactly-once guarantee. A timeout or crash can leave an uncertain external outcome; a retry may duplicate an external delivery.
- “Provider accepted” means acceptance only, not that a device displayed a push or an inbox received an email. In-app delivery is confirmed by the actual Mongo notification record.
- Each run has bounded work (20 reminder claims, 20 channel jobs, up to three series, plus bounded parent reconciliation). A heartbeat records real start/finish times for the UI. Indexes support due lookup, lease recovery and owner history.

The default managed runner waits 60 seconds between completed runs. Delivery timing depends on that cadence, job backlog, provider availability and quiet hours; exact minute precision is not promised.

## Database changes

Migration `004-reminders.mjs` adds collections without altering existing task/planner documents or their strict validators:

| Collection | Purpose |
|---|---|
| `reminders` | Task-linked schedule, selected channels, revisions, status, leases and deferral reasons |
| `taskReminderVersions` | Optimistic version for the whole editable reminder list |
| `notifications` | Real in-app records, read/dismiss/snooze state |
| `notificationPreferences` | Owner settings with version checks |
| `notificationOutbox` | Per-email/per-browser channel job and acceptance state |
| `notificationAttempts` | Actual external attempt metadata and outcome |
| `notificationReceipts` | Duplicate-safe snooze receipts |
| `reminderTaskReceipts` | Atomic task/reminder form submission receipts |
| `reminderLocks` | Per-owner transaction coordination |
| `pushSubscriptions` | Protected subscription endpoints and encryption keys |
| `recurringSeries` | Recurrence template, calendar rule, status and generation marker |
| `taskOccurrences` | Unique deterministic occurrence ledger and edit/delete exceptions |
| `reminderWorkerState` | Processor start/finish heartbeat |

Indexes cover due status/time, abandoned leases, owner/task status, owner schedule/history/unread queries, channel histories, series generation order and unique series/date and owner/task occurrences. Mongo `_id` uniqueness enforces reminder/notification/job/receipt identity. No TTL index is used as a trigger. Dismissal is soft; notification, attempt and recurrence history is retained until an explicit retention/administrative cleanup policy is applied. Original uploads are neither stored nor modified.

## Security

All user endpoints verify the existing Better Auth session, trusted origin and server-derived owner. Strict schemas reject user IDs and unknown fields; request bodies are bounded to 80 KB and read timeouts apply. User API requests have a persistent per-user limit of 90/minute. Worker access requires a server-only bearer secret of at least 32 characters, compared in constant time; missing configuration does not open the endpoint.

Subscriptions are limited to five per owner and cannot be reassigned across accounts. HTTPS endpoints are restricted to supported Google/Firefox/Apple/Windows push services, rejecting private hosts, custom ports, embedded credentials and lookalike domains. Encryption keys and endpoints are never returned by the account-history API. The service worker accepts only same-origin task links and never bypasses app authentication.

Email requires a verified user address and configured SMTP. HTML content is escaped, links use the configured application origin, and source documents are not included. Provider failures are normalized without logging keys or document/task content. The client-secret scan includes the worker secret, private VAPID key and SMTP password as well as existing secrets.

## Setup — local

From the existing project directory:

```text
npm install --legacy-peer-deps
npm run reminders:setup
npm run db:migrate
npm run dev
```

Keep the existing `.env.local`; do not overwrite database/authentication keys. Restart a running development server after changing environment configuration.

In a separate managed terminal:

```text
npm run reminders:work
```

To process one batch and exit:

```text
npm run reminders:once
```

The continuous runner handles shutdown signals and closes its Mongo connection. Keep it supervised for reliable local operation. The app shows when the processor last completed a run. In this workspace the migration was applied and the local runner was started; the ordinary app is on port 3000.

## Setup — production

No hosting/scheduled-job configuration was present, so no provider-specific cron capability is assumed. Choose one mechanism:

1. Run `npm run reminders:work` as a supervised Node service with the same server environment and database access; or
2. Configure an external scheduler to make authenticated **POST** requests to `https://YOUR_APP/api/reminders/worker` at the cadence your hosting and scheduler support (usually every minute where available). Send `Authorization: Bearer YOUR_REMINDER_WORKER_SECRET` from the scheduler's private secret store. GET is not supported. Never put the secret in the URL or client code.

Set `REMINDER_WORKER_SECRET` from the generated private value or another cryptographically random value of at least 32 characters. Ensure the platform's execution limit accommodates the configured work budget and provider timeouts (route `maxDuration=90`); use a managed worker if the host cannot run that long. MongoDB must support transactions, as already required by Capture and Planner. Observe heartbeat, failed/uncertain channel records and queue backlog. Do not assume a free hosting tier provides minute-level scheduling. External scheduling has not been deployed or verified here.

## Setup — optional browser push

Generate keys once without printing private values, using a real contact:

```text
npm run reminders:setup -- --push-subject=mailto:YOU@YOUR_DOMAIN
```

This preserves existing keys and adds `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` to the ignored local environment file. Copy these into the production secret/configuration store; only the public key is sent to the browser. Do not rotate keys without handling existing subscriptions. Use HTTPS in production. Restart the app/worker, open Preferences, choose **Enable browser reminders**, grant permission, and keep the push channel preference enabled. Unsubscribe explicitly from Preferences when desired.

Support depends on browser/platform; supported iOS installations generally require a home-screen web app. Permission denial, missing configuration, unsupported browsers, expired subscriptions and delivery failures have honest states. An expired provider subscription (404/410) is removed by the processor; enable the browser again to replace it. Registered browser subscriptions persist independently of an app session until explicitly unsubscribed or expired; shared-device users should unsubscribe before leaving the device.

To verify real push, use a supported browser/device and real VAPID setup, schedule a non-sensitive reminder with the push channel selected, close the active app tab, run the processor, inspect the per-device job/attempt status and actually confirm receipt on the device. That last step has not succeeded in this environment; do not interpret subscription storage or provider acceptance as device delivery.

## Setup — optional email

Configure the existing server-only values:

```text
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
```

Port 465 uses TLS; other ports require STARTTLS. Existing Better Auth confirmation/recovery mail uses the same configuration detection and is not overwritten. Development `MAIL_MODE=file` continues to serve authentication testing but is deliberately **not** treated as real reminder email delivery. The interface states: “Email reminders are unavailable until email delivery is configured.”

After configuring SMTP, verify an account's real email address, enable email in notification preferences, select email on a reminder, run the processor and confirm the actual inbox result. The email job's accepted state alone is not proof of inbox delivery. Production authentication also requires working SMTP rather than the local file mailbox.

## Files and dependencies

- New backend: `src/lib/reminders/{schema,repository,task-save,processor,recurrence,delivery}.ts`; `src/app/api/reminders/route.ts`; secured `src/app/api/reminders/worker/route.ts`.
- New UI: `src/components/reminders/{reminder-fields,notification-bell,reminder-stream}.tsx`; `/dashboard/reminders`, `/dashboard/notifications`, real `/dashboard/settings`, and owner-checked `/dashboard/tasks/[taskId]` pages.
- Integration: task repository optional transaction sessions, task actions/editor, app shell/bell/navigation, Dayflow task links, landing availability copy and scoped reminder styles.
- Operations: migration `004-reminders.mjs`, migration runner, `scripts/reminder-worker.mts`, `scripts/configure-reminders.mjs`, environment example, package/test scripts, client-secret scanner, README.
- Tests: `tests/reminders.test.ts`, `tests/reminders.integration.ts`, browser artifacts and screenshots in this directory.
- Added runtime dependency: `web-push` for standards-based encryption/VAPID delivery. Added development types: `@types/web-push`. No new animation or recurrence library; existing Motion and Temporal are reused.

## Validation and limitations

Actual final results are in `validation-summary.json`, the browser/regression JSON reports and `accessibility.json`. Ordinary provider tests use mocks; no reminder email or real device push was fabricated. Browser screenshots use disposable test users and isolated Mongo data.

Known limits: production scheduling not deployed; SMTP unconfigured; real device push blocked/unverified; Chromium was tested, not every browser or physical device. Unsaved drafts are memory-only and can be lost on navigation; recoverable request failures preserve the current form. Each page bounds upcoming/recent scheduling records, while notification history is paginated. Reminder history has no automated retention purge yet. Existing development-only lint-chain advisories from Phase 3 are separate from runtime dependencies. No Notes, Focus Mode, Analytics, SMS, calendar sync or billing work was added.

### Validation results

- Unit tests: **21 passed** (`npm test`).
- Mocked Capture/Planner SDK tests: **2 passed** (`npm run test:ai`).
- Reminder Mongo integration: **3 passed** on a fresh isolated replica-set database. Existing task/Capture/Planner integration: **3 passed**. Authentication confirmation/session/reset/logout integration: **1 passed**. No production records were used for these checks.
- Browser reminder checks: **25 passed**, including actual browser-closed in-app delivery, standalone create/edit/cancel, four responsive widths, read/unread/snooze/dismiss, preferences, recurrence, permission/subscription handling and session-expiry draft preservation. Recorded page/console error arrays are empty after expected error-response resource messages are filtered.
- Dayflow regression: **26 passed**, including persistent approval, task/version changes and session expiry. See `planner-run.json`.
- Existing task-workspace regression: **17 passed**. Public/auth page regression: **28 passed**. Capture regression results are recorded separately.
- Axe: **zero violations** in notification and preference views for the tested WCAG 2 A/AA, 2.1 AA and 2.2 AA rules. Chromium viewport checks cover 390, 768, 1024 and 1440 px; other regression suites also cover 360 px.
- Runtime dependency audit: **zero vulnerabilities** (`npm audit --omit=dev`). Existing development-only advisories remain as documented.

Email and actual device push receipt are deliberately **not** counted as successful real-delivery tests. The browser-closed proof covers real in-app Mongo delivery, with a custom acknowledged near-now reminder; the separate tomorrow/15-minute-before reminder was persisted and then cancelled on task completion rather than waiting a day during the test.

Session-expiry handling preserves reminder/recurrence and open task-form drafts with a new-tab sign-in link. Server authorization remains mandatory on every read/mutation. Explicit logout and initial protected-route verification retain their existing behavior.

References: [official Node Web Push library](https://github.com/web-push-libs/web-push), [Push API platform behavior](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

### Final checks and preview

Final lint and production build passed (23 generated pages). **122 browser checks passed** in total: reminders 25, Dayflow 26, tasks 17, public/auth pages 28 and Smart Capture 26. The configured-secret scan checked 26 built client files and found zero leaks. Final local checks returned login HTTP 200, unauthenticated worker HTTP 401 and notification-icon HTTP 200. The isolated test service was stopped; the normal port-3000 app and local reminder processor remain running.

Open [Reminder Stream](http://localhost:3000/dashboard/reminders) or [Notifications](http://localhost:3000/dashboard/notifications) after signing in. See [desktop upcoming stream](screenshots/upcoming-1440.png), [mobile upcoming stream](screenshots/upcoming-390.png), [desktop notifications](screenshots/notifications-1440.png), and [reduced-motion recurrence view](screenshots/recurrence-reduced-390.png). These screenshots show disposable test fixtures, not production user records.

Additional integration files changed include `src/components/auth/session-guard.tsx` for draft preservation, `public/reminder-sw.js` and the brand-derived notification icon assets. No authentication configuration, MongoDB task schema, existing task deadlines or approved planner data was replaced.
