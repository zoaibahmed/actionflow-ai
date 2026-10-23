# OTP resend follow-up — 23 October 2026

The user reported a rejected signup code and a replacement not arriving on port 3000. Private metadata checks found the confirmed target account unverified with no active registration OTP at investigation time. This does not establish whether the code was already expired at the moment the user originally submitted it; the code itself was never requested, inspected or logged.

Changes:

- Resend no longer clears the code or disables its own submitter in `onClick`, before form submission. It submits `operation=resend` first, then clears the field and starts the cooldown only after server confirmation. Failed requests do not show success.
- A server rate-limit response starts a visible retry timer. Newly accepted signup/login sends show the cooldown immediately, instead of offering a resend which the server will reject within the first minute.
- Signup redirects carry the accepted notice; the notice correctly identifies a signup verification code rather than a sign-in code.
- Expired and attempt-locked codes have distinct explanatory errors; the five-minute validity and newest-request requirement remain enforced. No verification bypass or lifetime increase was introduced.

Files: `src/components/auth/otp-form.tsx`, `src/lib/auth/otp-actions.ts`, `src/lib/auth/actions.ts`. No database migrations or account modifications.

Validation: nine authentication integration tests passed, including hashed OTP verification, attempt/expiry limits, concurrent resend protection and verifying the newest resent code. Four isolated React/JSDOM component tests passed: resend reaches the action before the cooldown, failed delivery never claims success, server rate limits display cooldown, and accepted signup mail begins with a disabled resend timer. The local harness is `D:\Project Docs\actionflow-ui-test-tools\otp-form-regression.cjs`; its mocks do not establish real inbox arrival. The control simulation did not prove the former click handler alone caused the reported failure, so this is not claimed as a conclusively reproduced root cause.

SMTP connection/TLS verification succeeded; it did not send a test message. Native browser testing was attempted but unavailable because the browser tool could not initialize its runtime assets. No browser success is claimed for this follow-up. A fresh actual signup-code request to the confirmed recipient is reserved until after validation, so its five-minute lifetime is not consumed during the build. No OTP values belong in this report.

Final lint and production build passed. After those checks, one real signup-code request through the original app on port 3000 returned HTTP 200/success and a freshly created active verification record with 297 seconds remaining. Actual user entry/inbox receipt remains for the user to confirm privately. The temporary test server was stopped; the original application remains running. No code value was inspected or logged.
