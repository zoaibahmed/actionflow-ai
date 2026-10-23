# Email setup

ActionFlow uses one server-only email service for registration OTP, password-login OTP, password recovery and existing reminder emails. Better Auth is unchanged at version 1.7.11; its built-in Email OTP and Two Factor plugins provide code lifecycle and challenge handling.

## Environment

Put these values privately in `.env.local`; never prefix them with `NEXT_PUBLIC_`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sender@gmail.com
SMTP_PASSWORD=your-google-app-password
MAIL_FROM="ActionFlow AI <sender@gmail.com>"
MAIL_MODE=file
```

The credentials above are placeholders. Gmail uses STARTTLS on 587; port 465 uses implicit TLS. The service accepts only those encrypted ports, requires certificate validation and TLS 1.2 or newer, and bounds connection/socket timeouts. `MAIL_FROM` should use the authenticated sender or an authorized alias. A configured SMTP transport takes precedence over development file mail. A failed SMTP send never silently falls back to a local mailbox.

For Gmail, enable Google Account 2-Step Verification, then create an App Password for ActionFlow in the account's security settings. Use that App Password rather than the normal Google password. Availability can depend on account/organization policy. See [Google's App Password instructions](https://support.google.com/accounts/answer/185833).

Restart the local server after changing configuration. Do not re-generate existing auth secrets or replace the database connection.

## Check transport safely

```powershell
npm run email:check
```

This verifies the connection without sending an email. To send one explicitly authorized test to the configured SMTP user's address:

```powershell
npm run email:check -- --send-to-self
```

The command prints only connection/acceptance booleans. A successful SMTP response proves provider acceptance, not inbox delivery. Check Inbox and Spam separately. During Checkpoint E, the authorized Gmail connection/send succeeded and the user explicitly confirmed receipt of the connection-check email. No real registration/reset test email was sent by the automated suites; those use private file mail. Normal application forms now use the same verified SMTP transport.

## Templates and failure behavior

Registration and sign-in codes contain six digits and expire after five minutes. Registration verification does not sign the user in. Password-login OTP is sent only after the password is accepted. Codes are stored as keyed HMAC hashes, never plaintext in MongoDB.

Password recovery uses a single-use, thirty-minute Better Auth link and revokes existing sessions after reset. The response is neutral for known/unknown addresses. It says that recovery was requested conditionally, never that an email was delivered. Reset email runs in Next.js `after`, so SMTP latency and failures do not determine the response timing or expose account existence through a special reset response. Transport failures emit only a generic server diagnostic without recipient, token or provider detail. If no email arrives, retry later or check transport privately. OTP sending reports delivery failure honestly.

Existing reminder templates retain their task links, deadline/timezone details and stable Message-ID, using the same centralized SMTP service. Network error classifications needed for bounded/uncertain reminder retries are preserved without retaining raw provider error text.

## Private development mailbox

When SMTP variables are absent and `MAIL_MODE=file` outside production, mail is written to ignored `.local-mail/*.json` files. The UI explicitly says there is no inbox delivery. `npm run mail:latest` prints only the private file path and subject, not the code/link; open that file locally if needed. Do not upload it, include it in screenshots or paste its contents into chat.

Automated fixtures explicitly clear SMTP variables, use a disposable local MongoDB replica set and file mail. Never point those fixtures at real user data. File mail is unavailable in a production build.

## Troubleshooting

- Authentication rejected: check the App Password, sender account and Google security settings privately.
- Connection timeout: check SMTP network access and the chosen encrypted port.
- TLS error: fix certificate/network configuration; do not disable verification.
- No code: check Spam, wait a full minute, resend, and use only the latest code.
- Repeated wrong codes: restart sign-in after the attempt window permits; server-side limits cannot be bypassed through the UI.
- Reminder email absent: confirm the existing worker is running, email is enabled in preferences and quiet hours/task state permit delivery.
- Neutral password-reset message: it deliberately does not confirm whether an address is registered or mail arrived.

Development request URLs, Server Action arguments and browser-console forwarding are disabled in Next logging. Authentication logs suppress provider detail. Any future production proxy/access logs must also redact authentication/reset URLs; deployment configuration remains outside this checkpoint.
