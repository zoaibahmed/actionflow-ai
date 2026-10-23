#!/usr/bin/env bash
# Requires Database Tools and age. YAML config must be root-owned mode 600.
set -euo pipefail
umask 077
: "${MONGODUMP_CONFIG:?Protected Database Tools YAML config path}"
: "${BACKUP_DIRECTORY:?Encrypted backup directory}"
: "${AGE_RECIPIENT:?Public age recipient}"
: "${MONGODB_DB:?Database name to back up}"
: "${BACKUP_WRITES_QUIESCED:?Set yes only after stopping every writer}"
[[ "$BACKUP_WRITES_QUIESCED" == yes ]] || { echo 'Quiesce all writers or use managed PITR/full replica-set oplog backup.' >&2; exit 1; }
[[ -f "$MONGODUMP_CONFIG" && ! -L "$MONGODUMP_CONFIG" && $(stat -c %u "$MONGODUMP_CONFIG") == 0 && $(stat -c %a "$MONGODUMP_CONFIG") == 600 ]] || { echo 'Use a regular root-owned mode-600 MongoDB Tools config.' >&2; exit 1; }
mkdir -p -- "$BACKUP_DIRECTORY"
exec 9>"$BACKUP_DIRECTORY/.backup.lock"
flock -n 9 || { echo 'Another backup is already running.' >&2; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIRECTORY/actionflow-$stamp.archive.gz.age"
# A failed pipeline leaves a .partial file; it is never considered a valid backup.
mongodump --config="$MONGODUMP_CONFIG" --db="$MONGODB_DB" --archive --gzip | age -r "$AGE_RECIPIENT" -o "$target.partial"
mv -- "$target.partial" "$target"
sha256sum "$target" > "$target.sha256"
echo 'Encrypted backup created. Verify with an isolated restore before calling it recoverable.'
# Retention is explicit in the runbook; this script never deletes old backups.
