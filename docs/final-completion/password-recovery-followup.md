# Password recovery follow-up — 23 October 2026

The reported address was found in the real application's database as an unfinished, unverified signup created on 21 October. No account data was modified during that investigation. Better Auth's default recovery endpoint checks whether the user record exists, so a pending signup could previously receive a reset link.

Recovery now requires email verification to be complete. A server-side hook stops reset issuance for unfinished signups before a token is created or mail is queued. A second guard rejects password changes using links previously issued to still-unverified accounts. Unknown addresses retain Better Auth's no-user/no-token/no-mail behavior. All cases retain a neutral public response to avoid disclosing account membership.

The form now explains that recovery is for verified accounts and asks users with unfinished signups to finish email verification. Existing registration verification, password-plus-email-OTP login, verified-account recovery, reset expiry/single use and session revocation are preserved. No database records were deleted, verified manually or migrated.

Changed: `src/lib/auth/server.ts`, `src/lib/auth/actions.ts`, `tests/auth.integration.ts`. Added regression checks for unknown-address mail/token absence, unfinished-signup mail/token absence, and rejection of a legacy unverified-account reset link. Tests run against disposable local MongoDB with a private file mailbox; they do not send real messages.

The HTTP auth wrapper (`src/app/api/auth/[...all]/route.ts`) uses the same neutral explanatory copy as the form. Final auth regression result: **9/9 pass**, including existing OTP login and verified-account recovery. Initial runs exposed a not-yet-ready test server and an expected-message mismatch in the test; after correcting those fixture/expectation issues, all assertions passed. TypeScript checking also passed. No fresh real SMTP messages were needed for this follow-up.

Final lint (full project and targeted changed files) and production build both passed. Temporary test services were stopped; the original app remains on port 3000.
