# Manual single-VPS deployment runbook

Prepared in Checkpoint G. **No VPS has been accessed or deployed.** All domain names, paths and account names below are examples. Review against the actual distribution before execution. Ubuntu/Debian package and systemd examples are not universal.

## Architecture and prerequisites

Internet → Nginx HTTPS → Next.js on `127.0.0.1:3000`. A separate Node reminder worker connects directly to MongoDB. Both use the same protected environment file. MongoDB must support replica-set transactions: prefer the existing managed cluster with TLS, least-privilege database credentials and a VPS-IP allowlist. Do not expose a local MongoDB port to the Internet. A local alternative needs a secured replica set, authentication, private binding, monitoring and independent backups.

Install a maintained Node 24 LTS release from the official distribution, npm, Nginx, Certbot, MongoDB Database Tools, `age`, and ordinary build prerequisites. Build on Linux for native dependencies such as Sharp; never copy Windows `node_modules`. This checkout was tested locally with Node 25.2.1; Node 24 and Linux service execution still require target-host validation.

Example initial directories (review usernames and paths):

```bash
sudo useradd --system --create-home --home-dir /var/lib/actionflow --shell /usr/sbin/nologin actionflow
sudo install -d -m 0750 -o root -g actionflow /etc/actionflow
sudo install -d -m 0750 -o actionflow -g actionflow /opt/actionflow/releases /var/lib/actionflow
```

Allow SSH only from trusted administrator addresses and HTTP/HTTPS publicly; keep port 3000 and MongoDB private. Preserve your current SSH access before enabling a firewall. Keep OS security updates enabled. Configure DNS A/AAAA records for the actual hostname; only publish AAAA if IPv6 routing/firewall works.

## Build a release

Transfer a reviewed checkout, lockfile, `public`, fonts, source, scripts and deployment assets to `/opt/actionflow/releases/RELEASE_ID`. Exclude `.env.local`, local mail, all `.next-*` fixtures, test databases, screenshots containing user data and Windows dependencies. This working folder is not initialized as Git; use your own reviewed release archive/version-control process.

1. Create `/etc/actionflow/actionflow.env` privately from `.env.example`; ownership `root:actionflow`, mode `0640`. It must use simple `KEY=value` entries compatible with systemd and the shell; quote values safely and avoid command substitutions. Do not print it.
2. Make the release owned by the service account. As that account, enter the release directory. Export the protected environment in a trusted deployment shell (never enable `set -x`):

```bash
set -a
. /etc/actionflow/actionflow.env
set +a
npm ci --include=dev
npm run config:check
npm run lint
npm test
npm run build
```

3. Take and verify a backup before migration. With the same environment run `npm run db:migrate`. Existing migrations 001–007 are additive and idempotent; do not replace or drop the existing database. Recheck actual indexes and migration output.
4. Create `.next/cache` writable by `actionflow` inside the release, and an atomic `/opt/actionflow/current` symlink to that release. Keep the previous release and matching build available for rollback. Do not replace the symlink while the old process is still running: stop app and worker first during a planned maintenance window.
5. Review/copy `deploy/systemd/actionflow-app.service` and `actionflow-worker.service` into `/etc/systemd/system/`. Adjust `/usr/bin/node` if your official installation uses another absolute path. Then:

```bash
sudo systemd-analyze verify /etc/systemd/system/actionflow-app.service /etc/systemd/system/actionflow-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now actionflow-app actionflow-worker
sudo systemctl status actionflow-app actionflow-worker
curl --fail http://127.0.0.1:3000/api/health
```

`/api/health` is liveness only. A successful response does not establish MongoDB, SMTP, worker or OpenAI readiness. Verify an authenticated task read/write, OTP receipt, worker heartbeat, reminder dispatch and an approved agent action separately. Never include cookies in copied diagnostics.

## Nginx and TLS

Replace **every** `actionflow.example.com` occurrence in `deploy/nginx/actionflow.conf`. Bootstrap a plain HTTP ACME-webroot server first; do not enable the template's TLS block before certificates exist. Create `/var/www/letsencrypt`, use Certbot's webroot method for the actual domain, then enable the full HTTPS template. This avoids a certificate-file startup failure. Review distribution-specific site-enabling conventions.

```bash
sudo certbot certonly --webroot -w /var/www/letsencrypt -d actionflow.example.com
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Ensure the distribution's Certbot renewal timer is enabled and reloads Nginx after renewal. Check expiry monitoring. Do not use self-signed certificates or bypass browser warnings. HSTS in the template is one year without subdomain/preload enrollment; enable only after working HTTPS is confirmed.

The template strips untrusted forwarding headers, pins Host and forwarded origin, and overwrites `X-Actionflow-Client-IP`. Production Better Auth trusts only this dedicated IP header. **The direct Next port must remain loopback-only.** A CDN/load balancer requires a separate reviewed real-IP trust configuration; blindly trusting a supplied forwarded header defeats rate limiting. Nginx allows 12 MB requests, while application upload limits remain 5 MB images / 10 MB PDFs and 20 pages. Proxy buffering is disabled for streaming; uploads are bounded in the application. The internal worker HTTP route is blocked publicly; systemd runs the independent worker directly.

Access logs intentionally omit query strings and referrers to avoid password-reset/verification tokens. Review error logs and retention without logging request bodies, Authorization, cookies, OTPs or provider keys.

## Worker operation and monitoring

Actual entry points: `npm run reminders:once` (one bounded pass), `npm run reminders:work` (continuous). The service invokes the latter's Node entry directly. Default poll 60 seconds; no exact-to-the-second delivery guarantee. Atomic leases prevent ordinary concurrent processing; crashed leases expire. Retries/backoff and permanent failures are persisted. Email/push providers are external: delivery is not exactly-once, and a crash after provider acceptance can cause a retry.

SIGTERM stops future polling, waits for the bounded current pass, and closes MongoDB; service timeout is 90 seconds. Inspect `systemctl status`, sanitized journal entries, worker heartbeat/state and failed delivery records. Alert on stale heartbeat, repeated restarts, quota exhaustion, expired TLS, disk pressure, backup failures and provider rejection. Prefer one worker initially; load-test capacity before increasing concurrency. The app and worker restart independently.

## Backups and recovery

Prefer managed point-in-time backups and test restoration. `deploy/backup.sh` is an optional **quiesced, database-scoped** encrypted dump, not online point-in-time protection. Configure Database Tools with a root-only `0600` YAML config (`uri` and password privately), an off-VPS age public recipient, and a backup directory. It never puts credentials on command-line arguments. Set `MONGODUMP_CONFIG`, `BACKUP_DIRECTORY`, `AGE_RECIPIENT`, and `BACKUP_WRITES_QUIESCED=yes` only after stopping **all** writers (app, worker and any other clients). `MONGODB_DB` must match the target database.

For scheduled dumps, use a root-owned maintenance script/timer that stops both services, verifies no other writers, runs the encrypted backup, checks its exit status, and always restarts services with a shell trap even on failure. Do not enable unattended quiesced backups until this procedure has been rehearsed. Keep seven daily and four weekly copies, encrypted off-site copies and a separately protected decryption identity. Alert on missing backups; retain failures for investigation. A partial file is not a valid backup. The provided script deliberately does not delete older backups.

Restore rehearsal: choose a fresh isolated replica set with no application clients, verify `sha256sum -c`, decrypt to a protected temporary archive (or pipe into `mongorestore --archive --gzip` using a private restore config), restore into an isolated database with `--nsFrom 'actionflow_ai.*' --nsTo 'actionflow_restore_test.*'`, run migrations, verify representative user-owned task/reminder/plan/note counts, indexes and authorization, then boot an isolated app/worker with external sending disabled. Do not use `--drop` against the live cluster. Record recovery time and data-loss window. Never attach the test worker to restored real email/push destinations. Securely remove temporary plaintext archives after verification.

A full replica-set oplog backup is a different procedure: `mongodump --oplog` must be a full dump (not combined with `--db`) and restored with the appropriate oplog replay into an isolated topology. Do not treat a running database-scoped dump as a consistent snapshot. [MongoDB backup guidance](https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/).

## Updates and rollback

Build and validate a fresh release without overwriting the running build. Back up, stop writers, migrate only after review, switch the symlink and restart both services. Re-run local and public health/auth/OTP/task/agent/reminder checks. If unhealthy, stop both, restore the previous symlink and restart. A code rollback does not undo database migrations; incompatible schema changes require a separately rehearsed recovery/forward-fix plan. Never restore an old database over new user writes without an explicit recovery decision.

Nginx syntax, systemd hardening, firewall, TLS renewal, Linux permissions, restart behavior and backup restoration are **IMPLEMENTED BUT NOT LIVE-TESTED** until verified on the actual VPS. No deployment action has been performed by this checkpoint.

## Routine operations (run privately on the future host)

```bash
sudo systemctl restart actionflow-app
sudo systemctl restart actionflow-worker
sudo systemctl status actionflow-app actionflow-worker --no-pager
sudo journalctl -u actionflow-app -u actionflow-worker --since '30 minutes ago' --no-pager
sudo systemctl show actionflow-app actionflow-worker -p MemoryCurrent -p NRestarts
df -h / /var/lib/actionflow /var/log
free -m
sudo du -sh /var/log/nginx /var/lib/actionflow
sudo ss -lntp
```

Review logs privately; do not publish full logs or environment output. Investigate repeated restarts by checking sanitized configuration errors first, then private MongoDB connectivity/TLS and DNS, disk/memory pressure, provider status and worker leases. Do not disable session/ownership checks to diagnose a failure. Confirm port 3000 is loopback-only and any MongoDB listener is private. A single VPS is not high availability; maintenance and host failure can interrupt service.

Use the provider's private connection diagnostic or a protected MongoDB driver script to run `ping`; never place a password-bearing URI in a shell command. Check managed-provider connection, storage and replication alerts. For local MongoDB, monitor its own data-volume free space, replication health and journal/backup volume separately. Provision runtime database-scoped read/write credentials; use a separately protected migration credential with collection/index privileges and separate backup/restore permissions.

Migrations are the authoritative index definitions: tasks `owner_created`, `owner_status_due`, `owner_due`; auth unique email/session-token/provider-account and expiry indexes; capture save-once/TTL; planner owner/day uniqueness; reminder due/lease/outbox indexes; occurrence uniqueness; agent expiry/owner/history; auth cooldown expiry; Notes owner/pin/update; Focus active-session uniqueness and completion history. Apply all 001–007, then inspect `listIndexes` in the intended database against the migration files. Do not replace these with an ad hoc index list or remove unique constraints to make a migration pass.

Backup scheduling should match the chosen topology. Prefer the managed provider's scheduled/PITR backups without daily writer downtime. If using the quiesced dump template, schedule a reviewed maintenance wrapper through a systemd timer, for example `OnCalendar=*-*-* 03:00:00 UTC`, `Persistent=true`, invoking that root-owned wrapper once per day. The wrapper must stop and restart writers with failure-safe cleanup as described above, and alert on failure. Scheduling is an operator configuration gate; no automatic production shutdown/backup timer is enabled by this repository.
