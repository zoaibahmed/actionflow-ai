# ActionFlow AI — Phase 5

The existing Next.js 16 App Router / React / TypeScript / Tailwind light-themed frontend now has persistent accounts and tasks. Per the requested change, MongoDB and Better Auth replace the original Supabase/PostgreSQL plan.

## Run

1. Install packages with `npm install --legacy-peer-deps` (the existing React 19.3 setup is ahead of some optional auth-library peer ranges).
2. Copy `.env.example` to `.env.local` only on a new installation. This workspace already has a private local connection and generated signing secret; do not overwrite them.
3. Set `MONGODB_URI`, `MONGODB_DB=actionflow_ai`, `BETTER_AUTH_URL`, and a random `BETTER_AUTH_SECRET` of at least 32 characters.
4. Run `npm run db:migrate` to apply the versioned MongoDB schema and indexes. This was executed successfully against `actionflow_ai` in the supplied cluster during implementation.
5. Run `npm run dev` and open http://localhost:3000. Use `/signup`, confirm your email, then sign in.

For production, configure SMTP and an HTTPS `BETTER_AUTH_URL`, then run `npm run build` and `npm start`. Keep the auth URL, host, and port consistent. Do not use local file email delivery in production.

The cluster's SRV TXT lookup timed out on this machine. The local connection uses the cluster hosts resolved from its SRV record with explicit TLS and `authSource=admin`. TLS certificate verification remains enabled. Other installations may use the original Atlas SRV connection string. Cold connections from this environment can take approximately 20 seconds; authenticated screens have loading boundaries and failures have retry paths.

## Email confirmation and password recovery

Email verification is enabled locally with `REQUIRE_EMAIL_VERIFICATION=true`.

- Development uses `MAIL_MODE=file`: confirmation/reset emails are saved privately in the ignored `.local-mail/` directory. **They are not sent to real inboxes.**
- Run `npm run mail:latest` after submitting a signup or password-reset request. Open the link in that message locally. The output contains a temporary authentication token; keep it private.
- For real delivery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`. SMTP mode is selected when those values exist. Port 465 uses TLS; other ports require STARTTLS.
- File delivery is refused in production. SMTP credentials must come from an email provider; an OpenAI key cannot provide email delivery.
- Email work is scheduled after the HTTP response. Provider failures are logged without email content or tokens. For production, monitor those errors and use a reliable mail service.

Smart Capture uses a server-only OpenAI API key from ignored local environment configuration. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` (default `gpt-4.1-mini`). Sources are analyzed only after the user clicks Analyze, and tasks are saved only after explicit review and approval.

## Routes and behavior

- `/dashboard/capture`: real text/image/PDF analysis, editable suggestions and explicit approved-task saving.

- `/`: public landing page. Its scroll-driven product illustration is separate from private data; illustrated examples require review in the real Capture and Dayflow workspaces.
- `/login`, `/signup`, `/forgot-password`, `/reset-password`: validated, accessible account forms with password visibility, pending states, and secure errors.
- `/api/auth/[...all]`: Better Auth's session, verification, and password recovery handlers.
- `/auth/callback`: fixed return destination after email verification; accepts no arbitrary redirect target.
- `/dashboard`: real task statistics and due-today schedule, based on the visitor's local calendar day.
- `/dashboard/tasks`: persistent create/edit/complete/reopen/delete, status and priority filtering, and sorting by due date, priority, and creation date.
- `/dashboard/planner`: real AI-assisted and manual Dayflow scheduling, editable previews, explicit approval, persistent preferences and schedules.
- `/dashboard/reminders`: intentional reminders, delivery history and recurring series.
- `/dashboard/notifications`: paginated notification stream with read/unread, snooze and dismiss.
- `/dashboard/settings`: persistent notification preferences and browser push setup.
- `/dashboard/tasks/[taskId]`: owner-checked task detail with an unavailable-task fallback.

Task changes only appear after successful database operations. Failed saves keep the form contents; failed deletions keep the task visible. Task completion, counts, and schedules refresh together. There are no demo tasks, fictional schedule entries, or generated AI insights in the private workspace.

## Data and security

`migrations/001-initial.mjs` creates strict task document validation, owner/status/due-date indexes, minimal Better Auth collections/indexes, and an action-throttle expiry index. `npm run db:migrate` applies it and records migration `001-initial`. It is repeatable for this initial schema; add new versioned files for future changes.

Tasks have UUID `_id`, `user_id`, title (1–160 trimmed characters), nullable description (up to 2,000), priority (`low`, `medium`, `high`), status (`todo`, `in_progress`, `done`), nullable due/completion dates, and creation/update dates. MongoDB's `$$NOW` generates timestamps in atomic update pipelines. Reopening clears completion time; repeated completion preserves it. The collection validator enforces status/completion consistency. `$literal` prevents input strings from becoming update-pipeline expressions.

**MongoDB does not provide PostgreSQL RLS policies.** Authorization is enforced in the server data-access layer: each operation verifies the database-backed session, derives ownership from that session, and includes `user_id` in every task selector. Strict input validation rejects ownership and timestamp fields from browsers. No database credentials or general database query endpoint reach the browser. Use an Atlas application user restricted to the dedicated database in production; anyone with direct database credentials has the permissions granted to that database user.

Proxy provides an early signed-out routing check only. It is never the authorization boundary. Protected pages and every mutation verify sessions again. Sessions are stored in MongoDB with HttpOnly cookies, secure cookies on HTTPS, expiry/renewal, no shared user-data cache, trusted-origin checks, HTTP and Server Action throttling, and session revocation on password reset. Auth responses are private/no-store. Referrer policy prevents recovery-link tokens from being sent as referrers.

Local-day boundaries and due-date inputs use the browser's time zone, including daylight-saving boundaries. Stored dates are UTC instants. Invalid and DST-skipped local times are rejected. Better Auth's user record provides the account name and email. Planner records are separate from the unchanged task schema.

## Structure

- `src/lib/auth/`: Better Auth configuration, session checks, form actions, mail delivery, and action throttling.
- `src/lib/db/mongo.ts`: pooled server-side MongoDB connection.
- `src/lib/tasks/`: owner-scoped repository, protected data loader/actions, and local-time helpers.
- `src/components/auth/`: reusable account forms, sign-out, and session renewal/checking.
- `src/components/tasks/`: task workspace and editor, sharing the existing UI system.
- `src/components/layout/`: preserved responsive shell with real account identity.
- `src/lib/validation.ts`, `src/types/task.ts`: validated inputs and task types.
- `.env.example`: configuration names only. `.env.local` and `.local-mail/` are ignored.

## Checks

- `npm run lint`
- `npm run build`
- `npm test`: validation and local-date/statistics checks.
- `npm run test:db`: integration checks against the configured MongoDB database. Creates and cleans up only randomly tagged test-owned tasks; verifies persistence, cross-owner isolation, completion consistency, and collection validation.
- `npm run test:auth`: run with the development server and local file mailbox. Creates a disposable account, exercises confirmation/sign-in/session/protected routes/CSRF/reset/token reuse/sign-out, and removes its account/session records.

Live email delivery is not tested or configured. Smart Capture is available when OpenAI is configured. In-app notifications are available through the durable processor. Browser push requires VAPID and platform support; real push delivery is unverified here. Calendar connections and payments remain unavailable. Exhaustive screen-reader and full desktop viewport checks are not automated.

Integration references: [Better Auth Next.js](https://better-auth.com/docs/integrations/next), [MongoDB adapter](https://better-auth.com/docs/adapters/mongo), [email/password flows](https://better-auth.com/docs/authentication/email-password).

## Phase 2.5 interface overhaul

See [design, animation and validation report](docs/phase-2-5/README.md) and its rendered screenshots. The MongoDB and Better Auth integrations remain in place. Browser regression checks now cover public and authenticated interfaces across five viewport sizes.

## Phase 2.6 command center and signature motion

See [implementation and validation report](docs/phase-2-6/README.md) for the new dashboard composition, continuous scroll sequence, preserved integrations, files and rendered screenshots.

## Phase 3 Smart Capture

[Smart Capture and Living Workspace report](docs/phase-3/README.md) documents real text/image/PDF analysis, explicit review, transaction-backed approved-task saving, configuration, database metadata, tests and screenshots. Configure server-only OPENAI_API_KEY and OPENAI_MODEL; run the additive database migration before capture saves. Capture integration tests require the isolated local replica set; SDK tests mock paid calls.

## Phase 4 Dayflow Planner

[Implementation and validation report](docs/phase-4/README.md) covers real scheduling, editable approval, persistent preferences, task estimates, strict timezone/availability constraints, concurrent-edit protection, tests and rendered screenshots. Run the additive migration 003 using `npm run db:migrate`. Capture and Planner share the server-only OpenAI client and existing configuration; `PLANNER_DAILY_LIMIT` defaults to 20 generations per user per UTC day. No new application dependencies.

## Phase 5 Reminder Stream

[Implementation, delivery evidence and exact setup steps](docs/phase-5/README.md). Run `npm run reminders:setup`, `npm run db:migrate`, then keep `npm run reminders:work` supervised (or configure authenticated POST scheduling in production). Task-linked reminders, real in-app notifications, preferences, snooze and bounded recurring generation persist in MongoDB. Browser-closed in-app delivery was verified. SMTP remains unconfigured and live browser push is blocked/unverified in this test environment. New dependencies: `web-push` and development types.
