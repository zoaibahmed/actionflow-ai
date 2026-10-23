# Final launch gates

Local code validation and external production verification are different. Do not mark deployment complete from a successful local build.

- [x] Production configuration validation, loopback start command and liveness route implemented.
- [x] Nginx fixed-host/forwarding, upload/timeout and worker-block templates prepared.
- [x] Separate non-root app and reminder-worker systemd templates prepared.
- [x] SMTP connection/provider acceptance checked; user confirmed an OTP email arrived.
- [x] Ten synthetic live agent scenarios exercised with bounded paid usage and MongoDB approval assertions.
- [x] Automated auth, approval/authorization, persistence and reminder regressions rerun; see exact results in checkpoint report.
- [ ] Rotate previously shared credentials and privately configure the production domain/environment.
- [ ] Verify Linux Node 24 runtime, `nginx -t`, `systemd-analyze verify`, permissions and independent service restarts on the actual host.
- [ ] Confirm DNS, public HTTPS, firewall/private Next/Mongo ports and unspoofable proxy headers.
- [ ] Confirm certificate renewal dry run and expiry alerts.
- [ ] Complete actual Google sign-in/linking with the final HTTPS callback and authorized account.
- [ ] Complete registration, password+OTP login, resend and password recovery through the public HTTPS origin; confirm real inbox receipt without sharing codes.
- [ ] Test browser-push permission, subscription and actual delivery on supported desktop/mobile browsers; document platform/PWA restrictions.
- [ ] Verify worker heartbeat, real scheduled in-app/email/push delivery and restart recovery on the host.
- [ ] Restore an encrypted backup into an isolated replica set and record recovery time/data-loss window; configure off-site retention and alerts.
- [ ] Resolve or formally accept the development ESLint globbing advisory; do not run unsafe automated major downgrades.
- [ ] Profile the production build on a physical mid-range phone, including reduced motion and keyboard/screen-reader checks.
- [ ] Verify production bundle secret scan after the final build and configuration change.
- [ ] Perform a reviewed deployment and rollback rehearsal. No VPS deployment was performed in Checkpoint G.
