# Checkpoint G performance and browser evidence

Measured locally on 22 October 2026 with the desktop in-app browser, Next development server, isolated local MongoDB, native scrolling and no CPU/network throttle. These are diagnostic samples, **not Lighthouse scores, production Core Web Vitals or a 60fps guarantee**.

## Before / after sample

The opt-in local QA overlay (`DIAGNOSTICS_ENABLED=1 npm run dev`, PowerShell: `$env:DIAGNOSTICS_ENABLED='1'; npm run dev`) records visible-tab `requestAnimationFrame` intervals and PerformanceObserver long tasks. Start recording, scroll down twice and back up, then stop. Sampling duration includes time between manual tool actions; runs differ in length and are not controlled benchmarks. The overlay is never mounted in production and loads axe only on demand.

| Landing sample, 1280 × 720 | Frames | Mean interval | p95 interval | Long tasks |
| --- | ---: | ---: | ---: | ---: |
| Before targeted fixes | 216 | 17.82 ms | 16.8 ms | 0 |
| After targeted fixes | 286 | 16.78 ms | 16.9 ms | 0 |

Do not interpret the mean difference as a proven speedup. No repeatable severe scroll stall was observed in these samples. They do not capture GPU/raster cost, all dropped frames, input delay, LCP or phone performance. CPU throttling, browser trace/profiler and real reduced-motion emulation were unavailable through this browser surface. A physical mid-range phone and production profiler pass remain launch checks.

## Changes

- Navbar React state is updated only when crossing its surface threshold, rather than invoking a state updater on every scroll event.
- Hero mouse tilt reuses geometry until scroll/resize/leave invalidates it instead of reading its bounding rectangle for every pointer event. Touch/coarse pointer behavior remains simplified and reduced motion skips tilt.
- Existing transform-based MotionValues, native scrolling, lazy Motion features, local fonts and reduced-motion policy are preserved. No WebGL, smooth-scroll dependency or new visual effect was introduced.
- A development-only diagnostics panel allows repeatable frame samples and on-demand axe checks. `axe-core` is the only added dependency and is a development QA tool.

## Responsive/accessibility evidence

Landing and authenticated dashboard were checked for document horizontal overflow at 320, 360, 375, 390, 430, 768, 1024, 1440 and 1920 CSS pixels: none found. A DOM overflow check is not proof that every dialog/content state fits. Desktop and 390px dashboard screenshots were visually inspected; mobile task create/edit, reload persistence and completion were exercised. See checkpoint report for additional route checks.

Landing axe scan: zero violations, 38 passing rules, two incomplete checks requiring manual review. Dashboard initially flagged the account button's visible initials/name not matching its accessible name; fixed by including both. Recheck at 390px: zero violations, 38 passing rules, two incomplete checks. This is not a full WCAG certification. Existing `MotionConfig reducedMotion="user"` and CSS reduced-motion rules were reviewed; an actual OS preference toggle was not automated.

Screenshot `final-completion/checkpoint-g/dashboard-390.png` shows synthetic data and the local QA panel. No real user data or credentials are included. The panel may cover controls during QA; it does not ship in the production UI.

Additional route checks: tasks, Capture, Planner, Reminders, Notifications, Notes, Focus, Insights and Settings had no document overflow at 320/390/768/1024/1440/1920px. Assistant plus login/signup/forgot-password/reset-password were checked at all nine widths above. This covers initial/representative states, not every possible data volume.

The wider axe pass found and fixed low-contrast assistant role text, planner date buttons and schedule copy, Focus duration presets, Insights labels, planner visible-label naming, and the empty Notes heading level. Final scans of every listed workspace route, including resumed assistant history, reported zero violations. Login, signup, recovery and invalid-reset scans also reported zero violations. Workspace scans retain one or two incomplete checks; auth scans had none. UI testing exercised password→OTP→dashboard, task create/edit/complete, reload persistence, delete confirmation cancellation, mobile drawer Escape, assistant preview approval/receipt/history, and sign-out. Destructive deletion is covered by automated isolated tests rather than browser deletion of a real record.

A temporary hydration warning was observed while changing the account label through hot reload. A fresh server and new tab were used afterwards; no warnings/errors were captured during the final assistant/route/landing checks. This does not substitute for production-browser monitoring.
