# Google authentication setup

Google sign-in uses Better Auth's Google provider and the standard authorization-code redirect flow. It requests only `openid`, `email` and `profile`. It does not request Gmail access. Google SMTP credentials are unrelated to Google OAuth client credentials.

## Configure a client

1. In your own Google Cloud project, configure the OAuth consent screen / Google Auth Platform branding and audience. Add your intended test users while the app is in testing.
2. Create an OAuth client of type **Web application**.
3. Add the origin and exact redirect below. Add your final HTTPS domain separately when it exists.
4. Copy the client ID and secret privately into `.env.local`, then restart ActionFlow.

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
BETTER_AUTH_URL=http://localhost:3000
```

| Environment | Authorized JavaScript origin | Authorized redirect URI |
| --- | --- | --- |
| Local app | `http://localhost:3000` | `http://localhost:3000/api/auth/callback/google` |
| Production placeholder | `https://your-domain.example` | `https://your-domain.example/api/auth/callback/google` |

Use your actual domain for production; do not deploy from these instructions. Do not add paths to the origin, use wildcard callbacks, or substitute `/auth/callback` for Better Auth's Google callback. Port, scheme and hostname must match. If a different local port is intentionally configured, update all three settings consistently.

References: [Better Auth Google configuration](https://better-auth.com/docs/authentication/google), [Google web-server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server).

## Test it

- A new Google user can choose **Continue with Google** on login/signup, select the account and return to the dashboard. A verified Google identity does not receive the credential-only email OTP challenge.
- Sign out and repeat; the existing account and owned data should remain.
- Cancel Google authorization; return to the app and try again. Invalid state/callbacks must not establish a session.
- An existing email/password account is never silently merged merely because its email matches Google. Sign in with password plus email OTP, open **Settings → Sign-in methods → Link Google account**, and explicitly link your own Google account with the same verified email. Then sign out and test Google login.
- If the session is too old, sign in again before linking. Different-email linking is prohibited.

Missing credentials produce a disabled button with a configuration-required explanation. `redirect_uri_mismatch` means the configured callback differs from the Google Cloud client. Consent-screen test-user restrictions or a cancelled/failed callback can also prevent completion. Fix configuration; never disable state validation or weaken account-linking rules.

## Checkpoint E status

No live Google client ID or secret is configured in this checkout. Live Google consent/login is therefore **blocked, not passed**. The production provider is integrated and mocked integration tests passed for signed-token callbacks, first/returning user identity, tampered state, unverified identity rejection, refusal of implicit matching-email linking and explicit authenticated same-email linking. Mock values are used only by the tests; no mock provider is enabled in the application.
