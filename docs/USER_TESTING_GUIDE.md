# ActionFlow AI user testing guide

**Current checkpoint: E (email verification OTP, password plus email OTP, Google provider and password recovery).** The Agent and existing productivity features remain available. SMTP provider acceptance and the authorized test inbox receipt are verified. Google login is implemented but needs Google Cloud client credentials before live testing. F/G remain pending.

## Start the app on this computer

If the app is already running, open http://localhost:3000/ instead of starting a second copy. Stop existing app/worker terminals with Ctrl+C before reinstalling dependencies. For a fresh start, open a PowerShell terminal:

```powershell
Set-Location 'D:\Project Docs\actionflow-ai'
npm ci
npm run db:migrate
npm run dev
```

Do not replace the existing `.env.local`. If setting up another development copy, use `.env.example` as a list of configuration names, and enter values privately in `.env.local`. Never put private keys into chat, screenshots or source control.

The database must be reachable and support MongoDB transactions (a replica set, including an appropriately configured hosted cluster). Existing migrations are additive. The app uses `MONGODB_URI`, `MONGODB_DB`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`.

Open **http://localhost:3000/**. The web terminal should show that the server is ready. Open a second terminal for reminders:

```powershell
Set-Location 'D:\Project Docs\actionflow-ai'
npm run reminders:setup
npm run reminders:work
```

The worker is a separate process. Leave its terminal open while testing reminders. It reports actual processing runs; it does not promise second-perfect delivery. Setup creates a missing worker secret privately without printing it. Do not repeatedly generate or replace existing production keys.

## Create an account and sign in

1. Open http://localhost:3000/signup, enter your name, a real email address you can receive mail at, and a password of at least twelve characters. Confirm the password.
2. Submit registration. On **Verify email**, enter or paste the six-digit code from your inbox. Check Spam if necessary. Verification codes expire in five minutes.
3. After verification, open http://localhost:3000/login and enter email and password.
4. The app takes you to the second-step email-code screen. Your password alone has not opened a workspace session. Enter the new sign-in code from your inbox.
5. Confirm the dashboard opens. Reload it to check session persistence. Existing tasks, reminders, plans and Agent history belong to the same account as before.
6. Open the avatar menu and choose **Sign out**. Private pages must then require sign-in again.

Choose **Send / resend code** if necessary. Wait a full minute between requests and use only the latest code. Five wrong attempts exhaust a code; broader identity/IP limits also apply. If the ten-minute sign-in challenge expires, go back and enter your password again. Email verification and login OTP cannot be turned off with the old `REQUIRE_EMAIL_VERIFICATION` setting.

Migration 006 preserves account IDs and application data but expires legacy password-only sessions. Existing users sign in again through the new flow. Unverified users can follow **Verify email / request a code** from the login error. Synthetic old demo addresses cannot receive real inbox codes; use an account with a reachable email. No OTP bypass was added.

Development file-mail mode is explicitly labeled in the UI. Codes/links are then in ignored `.local-mail` files rather than real inboxes. `npm run mail:latest` reveals only the private path and subject; inspect that file locally, never in shared logs or screenshots. The configured main app now uses real SMTP instead.

## Continue with Google

The button appears on login and signup. Until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are added privately, it is disabled with a setup explanation. Follow [GOOGLE_AUTH_SETUP.md](GOOGLE_AUTH_SETUP.md) for the exact Google Cloud origin/callback settings.

Once configured, a new Google user can continue directly to their workspace using Google's verified identity. Returning Google users retain their account and data. Google does not receive the credential-only email OTP challenge. Only identity scopes are requested, never Gmail inbox access.

An existing password account is not automatically merged by an email match. Sign in with password plus OTP, open **Settings → Sign-in methods**, choose **Link Google account** and complete Google authorization using the same verified email. Then sign out and test **Continue with Google**. Different-email links are blocked. Cancellation or invalid state must not sign you in.

## Recover a password

1. Open http://localhost:3000/forgot-password and submit your email.
2. The response is deliberately neutral. It does not reveal whether an account exists or claim inbox delivery.
3. Open the reset link from your actual inbox and choose/confirm a new password of at least twelve characters.
4. The link expires after thirty minutes and works once. An expired/used link offers **Request a new reset link**.
5. Sign in with the new password and a new email OTP. Resetting a password revokes existing sessions and does not remove the second factor.

Recovery email is sent after the neutral response to avoid exposing account existence through SMTP latency/failure. If no email arrives, check Spam and retry later. See [EMAIL_SETUP.md](EMAIL_SETUP.md) for transport checks and troubleshooting. One authorized Gmail connection-check message was accepted and its arrival confirmed; automated auth tests use mocked/file mail.

## Find your way around

On first use, the **workspace guide** explains the three main starting points:

- **Add a next step:** create a normal task.
- **Turn information into tasks:** open Smart Capture.
- **Build a plan with Dayflow:** choose tasks and available hours.

The guide is optional. Close it with its dismiss button or **Got it, let’s begin**. It stays dismissed for that account in this browser. Choose the question-mark Help button to reopen it. Clearing browser storage or changing devices may show it again.

On desktop, use the sidebar. On phones, use the floating dock: **Today**, **Tasks**, the central **Add** button, **Planner**, and **More**. More opens Capture, Reminders, Notifications, Settings and the workspace guide. The avatar menu contains account actions and sign-out.

## Test task management

1. Open Today. On a phone, tap the central Add button. Add is also available on other workspace routes.
2. Enter a clear task title, priority, status and optional deadline. Save.
3. Confirm the success message and task appearing in your workspace.
4. Refresh the page. The task must remain.
5. Open the task title to edit it. Save a changed title or priority, then refresh again.
6. Complete the task using its completion control. Check the progress display changes only after saving.
7. Try the Completed filter and reopen the task.
8. Open Tasks to filter/sort the full list and delete a test task. Cancel the deletion once before confirming it.

The phone Today view shows a selected priority task, a small progress panel, task filters and today's deadlines. Progress uses your actual task totals, not a fictional productivity score.

## Test Smart Capture

An OpenAI server key and model must be configured privately as `OPENAI_API_KEY` and `OPENAI_MODEL`.

1. Open Smart Capture from the sidebar or More.
2. Paste a message with an actionable request, or choose one image/PDF input.
3. Analyze it. Do not upload sensitive documents just for testing.
4. Review every suggestion. Edit titles, priorities, descriptions and dates as needed.
5. Resolve ambiguous dates or deliberately leave a task undated.
6. Select the suggestions you want, then approve saving.
7. Open Tasks and refresh to confirm that the approved records persist.

Limits: text 20,000 characters; PNG/JPEG/WebP 5 MB; PDF 10 MB and 20 pages; one source per request; up to ten suggested actions. The app discloses that analysis sends content to an external AI provider. Nothing should be saved without approval.

To test global Add safely, begin typing a Capture draft, add a separate task using the dock, and return to the draft. Your unfinished Capture text should remain.

## Test Dayflow Planner

1. Open Planner. On a phone, use the date strip or date picker to choose the day.
2. Choose real unfinished tasks and their time estimates.
3. Configure working hours, timezone, breaks and commitments.
4. Generate a proposal, then review the blocks. Adjust times, remove blocks or place unscheduled tasks.
5. Approve and save the plan.
6. Reopen the selected date and confirm the saved plan appears.

The date strip loads real planning days; it is not an illustration. Switching dates with unsaved changes should ask before discarding them. AI plans never silently change task deadlines or complete tasks.

## Test reminders and notifications

1. Open an unfinished task and add a reminder, or use Reminders.
2. Choose timing, timezone and available channels intentionally. Save.
3. Keep the worker running. Check Notifications when the reminder becomes eligible.
4. Try marking a notification read and snoozing an eligible reminder.
5. Complete the linked task and check that future reminders are cancelled.
6. In the recurring section, create a short test series from one of your own tasks. Inspect the generated occurrences, then pause or end the series when finished.
7. To test browser-closed behavior, close the browser while leaving the separate worker process running. Reopen the app after the due time and inspect the in-app notification history.

Browser-closed in-app processing depends on the server worker, not a browser timer. Actual push delivery depends on HTTPS, a supported browser/device, VAPID configuration and permission. Email reminders require a configured SMTP transport. A provider accepting a message is not proof that a device or inbox received it.

## Test the mobile website and workspace

Try 320, 360, 375, 390, 430 and 768px widths where possible. Also rotate the phone.

- Open the public page. The hero should be compact and the navigation should remain usable.
- Scroll normally. Illustrated inputs align into tasks, day blocks settle into place, Capture connects a message to a suggestion, and a reminder illustration moves into view.
- These are labeled illustrations; the website is not analyzing your content in the background.
- Enable Reduce Motion in the operating system/browser. All text, links and functionality should remain available with stable scenes.
- Sign in and use the dock, Add form, task editing sheet and Planner date strip.
- Scroll to the last item. The dock must not cover content or approval actions.
- Navigate with Tab/Shift+Tab, activate buttons with Enter/Space and close dialogs with Escape. Focus should return to the opener.

Safari, a real mobile keyboard and actual safe-area/browser chrome still require device testing; desktop browser emulation does not verify all of those behaviors.

## Features still scheduled

- **Checkpoint F:** Notes, Focus Mode, universal Search and real-data Insights.
- **Checkpoint G:** VPS templates, final security/performance review, complete regression testing and the finished version of this guide.

Do not treat any of these planned capabilities as verified. The Agent instructions below describe Checkpoint D; later checkpoints remain pending.

## Troubleshooting today

- **Database unavailable:** confirm the configured database is reachable and its network policy permits this computer. Do not paste its connection string into logs or support screenshots.
- **AI setup required:** configure the server-side OpenAI key/model. Never use `NEXT_PUBLIC_` for a secret.
- **AI quota exhausted:** wait for the application/provider quota window or review usage privately. Retrying rapidly will not bypass server limits.
- **OTP/reset email missing:** check Spam and the reported mail mode. Real SMTP needs an App Password or suitable provider credentials. Wait a minute before resending and use the latest code; see EMAIL_SETUP.md.
- **Session expired:** sign in again. Draft-preserving screens may offer a sign-in link in a new tab.
- **Wrong application URL:** `BETTER_AUTH_URL` must match the actual app origin. Do not disable origin protections to work around a mismatch.
- **Reminder not processed:** verify the separate worker is running and inspect its sanitized run status. Check timing, timezone, task status and quiet hours.
- **Push denied/unavailable:** check browser support, HTTPS, VAPID setup and site notification permissions. The app must not claim delivery when it is unavailable.
- **Google disabled:** add real Google Cloud web-client credentials and restart; a Gmail App Password is for SMTP, not OAuth. **OTP challenge expired:** restart password sign-in. **Agent missing:** restart the updated app, apply migrations and open `/dashboard/assistant`.



## Use the AI Workspace Agent — Checkpoint D

Open **AI Assistant** in the sidebar, the header spark / **Ask ActionFlow**, or mobile **More → AI Assistant**. Direct link: http://localhost:3000/dashboard/assistant. You must be signed in. Server configuration needs `OPENAI_API_KEY` and a supported `OPENAI_MODEL`; this reuses the existing Capture/Planner integration. Relevant workspace information is sent to OpenAI, so never enter passwords, keys or connection strings.

1. Select a suggested prompt (it fills the composer) or type your own. Choose **Send**.
2. Answer follow-up questions if a task name matches several records or a date/time is unclear. The assistant uses saved planning/notification timezone settings, falling back to the browser timezone when none exist.
3. Read-only requests can return immediately. Write requests show **Review before saving** cards. Nothing is changed by a chat message alone, including “yes” or “go ahead”.
4. Edit task title, description, priority, status or deadline on the card. Reminder timing and plan blocks/notes are also editable. Choose **Update preview** to validate edits and issue a fresh approval version.
5. Check the exact date/time/timezone checkbox when shown. For deletion, type **DELETE**. For a plan save/overwrite, type **SAVE PLAN**.
6. Choose **Approve action**. Only the server-confirmed receipt means the change committed. Open its task/record link or refresh the dashboard to verify persistence.
7. Choose **Cancel action** to leave the workspace unchanged. A preview expires after ten minutes; request a fresh one if it expires or the underlying task changes.

Each card is approved separately. If one saves and another fails, the first receipt remains valid and the failed card explains the problem. Retrying the exact approved card does not repeat its change. A network failure preserves your message; reopen recent history before resubmitting if uncertain.

Choose **New conversation** to start again. Recent conversations are private to your account, capped at twenty, retain up to forty recent messages each, and expire after thirty days. Select a title to resume. The adjacent delete icon opens a confirmation dialog. Deleting a conversation removes its held previews/history, not tasks already saved through it.

### Example prompts

Use real task titles from your account. Exact dates are safest; vague dates may require a follow-up. Date-only task deadlines need a time or an explicit choice to leave the task undated.

1. “What are my tasks today?”
2. “Show my overdue assignments.”
3. “List my unfinished high-priority tasks.”
4. “Find tasks with database in the title.”
5. “Create a high-priority task to study AI tomorrow at 5 PM.”
6. “Create an undated task to buy a notebook.”
7. “Set the priority of my database assignment to high.”
8. “Change my presentation task description to: rehearse the introduction.”
9. “Move my project deadline to Friday at 4 PM.”
10. “Mark my presentation task as completed.”
11. “Reopen my presentation task.”
12. “Delete my old shopping task.”
13. “Remind me in-app 15 minutes before my meeting task's deadline.”
14. “Show my upcoming reminders.”
15. “Move the reminder for my presentation task to tomorrow at 9 AM.”
16. “Snooze this reminder for 30 minutes.” Then identify the reminder/notification from the actual list if asked.
17. “Cancel the reminder for my presentation task.”
18. “What is my Dayflow plan for tomorrow?”
19. “Generate a draft plan tomorrow for my database assignment and presentation tasks.” Review the displayed working hours, breaks and focus budget; use Dayflow to change saved constraints first if needed.
20. “Move my saved study block to 10 AM.” Specify the planning date and task if asked.
21. “Summarize my unread notifications.”
22. “Mark this notification as read.” Select a real notification from the preceding list.
23. “Show my recurring-task information.”
24. “Help me organize my work this week.” Expect task/plan discussion and individually approved actions, not an automatic bulk rewrite.

Pending reminder snoozing is a reviewed custom-time update. Delivered reminders are snoozed through their actual notification record. Editing recurring series and bulk deletion are unavailable through the Agent. Notes, Focus, Universal Search and Insights are now supported; see Checkpoint F below. Reminder delivery still needs the existing worker; saving a reminder does not establish email/push transport.

Default Agent limits are five messages per minute and twenty per UTC day (including accepted provider failures). The server administrator can set `AGENT_DAILY_LIMIT`. Provider billing/quota limits are separate. Read/configuration, approval, session and stale-record errors should be shown honestly, never as a saved-action success.


## Checkpoint F — everyday workspace

Sign in normally at http://localhost:3000 using your existing verified account and email OTP. No new account/password is required. Live Google OAuth remains unverified.

### Notes

1. Open **Notes** in the sidebar or **More → Notes** on mobile. Choose **New note**.
2. Enter a title (1–160 characters) and content (up to 30,000 characters). Toolbar buttons insert bold/italic/list Markdown syntax. Content remains plain text; HTML never executes. Ctrl/Cmd+B formats selected text.
3. Pause typing for about 850 ms. **Saved** appears only after MongoDB confirmation. Ctrl/Cmd+S also saves.
4. Pin/unpin using the pin button. Search title/content in the collection and sort by creation/modification time. Collections have 30 notes per page.
5. Expand **Link to a task**, search and select a real task; association is optional.
6. Mobile opens a full writing canvas. **Back to notes** saves pending valid edits before returning; ordinary workspace links/search navigation also attempt to save.
7. Clear the title to test validation. **Not saved** preserves your content. Restore a valid title and choose **Retry save**. For stale edits, export the local draft, then explicitly reload the saved version or close/discard local edits. Never-saved drafts can be discarded.
8. Open the same note in two tabs. Save one, then change the older copy: it must report a conflict rather than overwrite the newer note.
9. Delete opens confirmation. **Keep note** cancels; **Delete note** permanently removes the owned note. Refresh to verify.

Recoverable failures retain the current editor. Browser reload/close warns about unsaved edits. Explicitly discarding that warning or using browser history can lose local changes. There is no offline vault or automatic cross-device merge.

### Focus

1. Open **Focus**. Choose 15/25/45/60 minutes or a whole-number custom duration from 1–180 minutes.
2. Optionally search/select a task. **Use … minutes by default** persists the default duration.
3. Choose **Begin focus**. Refresh: it must recover the same server-held session and elapsed time.
4. **Pause** stops accumulated time; **Resume** starts a new timed segment. Open another tab: both show the same session. Visible tabs reconcile on focus/visibility, broadcast messages and a 15-second poll.
5. Let a one-minute test finish. Recent history/totals must count it once, including after refresh. Its completion timestamp is the calculated finish time.
6. **End early** asks confirmation and records cancellation; unfinished time does not count as completed focus.

Time continues while the tab/browser is away or closed. Finished sessions reconcile when Focus is reopened/service invoked. No closed-browser notification is sent. Offline display is an estimate; only a server response confirms a saved transition. Reconnect before trusting a pending change.

### Universal Search

Choose the header magnifying glass or **Ctrl+K / Cmd+K**. Enter at least two characters. Results group owned tasks, notes, reminders (matched by task title), and saved plans (date or plan/block notes). Queries are debounced, server-side and literal: regex operators are ordinary text.

Use **↑ / ↓**, **Enter**, **Escape**. Escape restores trigger focus. Mobile uses a full-screen sheet above the dock. Pages contain at most six results per group, with up to ten pages. Narrow large searches. Results open actual note/task records or the selected saved-plan date.

### Insights

Open **Insights**, then choose **7 days** or **30 days**. Daily grouping uses saved Planner timezone, notification timezone, then browser fallback. **Read chart as a table** exposes accessible day/task/focus values.

Current retained records determine completed/pending/overdue. Completion trends use the latest completion timestamp; deleting/reopening work removes it from retained completion history. Missing timestamps are disclosed. Upcoming work covers now through local midnight seven calendar days ahead. Focus week starts Monday, month starts on the first; only completed sessions count on their local completion day. No fake score or reconstructed deleted history appears.

### New AI Assistant prompts

Open the existing **AI Assistant**. Use actual note/task names and choose among ambiguous matches.

1. “Find my notes about the project.”
2. “List my recent notes.”
3. “Read my Project journal note.”
4. “Summarize the Project journal note I selected.”
5. “Create a note titled Meeting recap with these points: review milestones and prepare the next draft.”
6. “Update my Meeting recap note to include a reminder to review the brief.”
7. “Pin my Project journal note.”
8. “Unpin my Meeting recap note.”
9. “Delete my old shopping note.”
10. “Show my recent completed focus sessions.”
11. “How much time did I spend focusing yesterday?”
12. “How much completed focus time is associated with my presentation task?”
13. “Start a 25-minute focus session for my presentation task.”
14. “End my active focus session.”
15. “Search my workspace for the project proposal.”
16. “How many tasks did I finish this week?”
17. “Compare my completed work over the last 7 and 30 days.”
18. “Which days had the most completed tasks this month?”
19. “What work is overdue?”

Reads can return immediately. Note creation/edit/pinning/deletion and focus start/end only prepare proposals. Review exact content, linked task and duration. Edit supported fields, choose **Update preview**, then **Approve action**. Note deletion also requires typing **DELETE**. A conversational “yes” does not execute writes. Cancel leaves domain records unchanged. Expired/stale previews need a fresh proposal. Open the confirmed receipt and refresh to verify persistence.

The model has no unrestricted database/browser-timer access. Notes are untrusted input. Focus pause/resume are manual; the Agent proposes start/end only. Routine tests mock provider calls; live wording/tool choices may vary.
# Checkpoint G quick start and deployment verification

Use an isolated test account for destructive tests. Never share OTPs, passwords, reset links or cookie values. Local commands from the project directory:

```text
npm ci --include=dev
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. For a production smoke: `npm run config:check`, `npm run build`, then `npm start` (loopback only). Run the independent worker in another shell with the same private environment: `npm run reminders:work`; `npm run reminders:once` performs one bounded pass. Never point a disposable test harness at the real database.

Production launch instructions and provider requirements are in `VPS_DEPLOYMENT.md`, `PRODUCTION_CONFIGURATION.md` and `FINAL_LAUNCH_CHECKLIST.md`. Checkpoint G did not deploy a VPS.

## Email OTP acceptance versus receipt

`npm run email:check` tests SMTP connection/TLS. `npm run email:check -- --send-to-self` sends one real connection-check email to the configured SMTP account; SMTP acceptance alone does not prove arrival. On 22 October the connection/provider checks succeeded and the owner separately confirmed an OTP email arrived. Full automated auth flows use a private local development mailbox, not a real inbox. Production never uses that mailbox.

For your own end-to-end test, sign up with an address you control, receive the registration OTP and enter it privately. A password sign-in must then lead to the second-factor screen, with no dashboard session until the new sign-in code is verified. Test one wrong code, resend cooldown, expired code and a fresh valid code. Reload the dashboard, sign out, and verify a protected route returns to sign-in. Test password recovery using its latest link and confirm old sessions are revoked. Do not send codes to a developer or paste them into chat.

## Reminder delivery without waiting for a future deadline

In a test account, create a temporary task and open its reminder settings. Choose a custom reminder just before the current time, explicitly acknowledge the past-time warning, select in-app delivery and save. Set the test account's quiet hours off (or schedule outside them) and enable the selected channel. Run `npm run reminders:once` with the same database environment, then refresh `/dashboard/notifications`: one notification should appear. Run once again: it must not duplicate. Use separate disposable tasks to test snooze, deadline changes, cancellation and recurrence. Restore preferences afterwards. Real email and push require configured delivery, consent and a controlled destination; a mocked provider acceptance test is not device delivery. Do not alter production record timestamps directly.

## AI Agent approval walkthrough

Open `/dashboard/assistant`. Ask about real tasks first, then request one change. Read and edit the preview; use **Update preview** before approving edited values. Approval is bound to that exact server-side revision/hash and current record versions. Confirm any uncertain dates. Destructive previews require the additional confirmation shown by the UI. **Cancel action** must leave records unchanged. A text message such as “yes” is not approval. Verify the confirmed receipt and affected record after refresh. A stale/expired preview must be regenerated; never bypass its validation.

Twenty practical prompts (use your actual record names; missing/ambiguous information should trigger clarification):

1. What are my tasks today?
2. Show my overdue assignments.
3. Which high-priority tasks are still open?
4. Find my database assignment.
5. Create an undated task called Read chapter five.
6. Create a task to study tomorrow at 5 PM.
7. Set the priority of my database assignment to high.
8. Update my presentation task description to include the revised outline.
9. Move my project deadline to Monday.
10. Mark my presentation task completed.
11. Reopen my reading task.
12. Prepare deletion of my old shopping task; show me the preview.
13. Remind me 15 minutes before my meeting deadline.
14. Show upcoming reminders.
15. Snooze my selected reminder for 30 minutes.
16. Summarize unread notifications.
17. Show tomorrow's saved Dayflow plan.
18. Propose a Dayflow change using my saved availability; ask if any constraints are missing.
19. Find my notes about the project and summarize only matching notes.
20. Show my productivity insights for the last seven days.

The existing checkpoint sections below contain the full task/Capture/Planner/Agent/Notes/Focus/Search/Insights walkthroughs and additional prompts. Checkpoint G results and limits are in `final-completion/checkpoint-g.md`; do not infer live Google, push or VPS verification from mocked tests.

