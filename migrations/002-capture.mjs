// Additive Phase 3 metadata only. No source documents or upload bytes are stored.
export async function up(db) {
  for (const name of ["captures", "captureUsage", "captureReceipts"]) {
    if (!(await db.listCollections({ name }).hasNext()))
      await db.createCollection(name);
  }
  await db
    .collection("captures")
    .createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "capture_expiry" },
    );
  await db.collection("captures").createIndex({ user_id: 1, createdAt: -1 });
  await db
    .collection("captureUsage")
    .createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "capture_usage_expiry" },
    );
  await db
    .collection("captureReceipts")
    .createIndex(
      { user_id: 1, capture_id: 1, suggestion_id: 1 },
      { unique: true, name: "capture_save_once" },
    );
}
