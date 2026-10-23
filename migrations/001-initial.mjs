// Versioned MongoDB migration. Run only against the dedicated ActionFlow database.
export async function up(db) {
  const validator = {
    $and: [
      {
        $jsonSchema: {
          bsonType: "object",
          additionalProperties: false,
          required: [
            "_id",
            "user_id",
            "title",
            "description",
            "priority",
            "status",
            "due_at",
            "completed_at",
            "created_at",
            "updated_at",
          ],
          properties: {
            _id: {
              bsonType: "string",
              pattern:
                "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
            },
            user_id: { bsonType: "string", minLength: 1, maxLength: 128 },
            title: { bsonType: "string", minLength: 1, maxLength: 160 },
            description: { bsonType: ["string", "null"], maxLength: 2000 },
            priority: { enum: ["low", "medium", "high"] },
            status: { enum: ["todo", "in_progress", "done"] },
            due_at: { bsonType: ["date", "null"] },
            completed_at: { bsonType: ["date", "null"] },
            created_at: { bsonType: "date" },
            updated_at: { bsonType: "date" },
          },
        },
      },
      {
        $expr: {
          $and: [
            { $eq: ["$title", { $trim: { input: "$title" } }] },
            {
              $eq: [
                { $eq: ["$status", "done"] },
                { $ne: ["$completed_at", null] },
              ],
            },
          ],
        },
      },
    ],
  };
  if (!(await db.listCollections({ name: "tasks" }).hasNext())) {
    await db.createCollection("tasks", {
      validator,
      validationLevel: "strict",
      validationAction: "error",
    });
  } else
    await db.command({
      collMod: "tasks",
      validator,
      validationLevel: "strict",
      validationAction: "error",
    });
  await db.collection("tasks").createIndexes([
    { key: { user_id: 1, created_at: -1 }, name: "owner_created" },
    { key: { user_id: 1, status: 1, due_at: 1 }, name: "owner_status_due" },
    { key: { user_id: 1, due_at: 1 }, name: "owner_due" },
  ]);
  await db
    .collection("authActionLimit")
    .createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "action_limit_expiry" },
    );
  // Better Auth's required collections and indexes; no separate profile model.
  await db
    .collection("user")
    .createIndex({ email: 1 }, { unique: true, name: "email_unique" });
  await db
    .collection("session")
    .createIndex({ token: 1 }, { unique: true, name: "token_unique" });
  await db
    .collection("session")
    .createIndex({ userId: 1 }, { name: "session_owner" });
  await db
    .collection("session")
    .createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "session_expiry" },
    );
  await db
    .collection("account")
    .createIndex(
      { providerId: 1, accountId: 1 },
      { unique: true, name: "provider_account_unique" },
    );
  await db
    .collection("verification")
    .createIndex({ identifier: 1 }, { name: "verification_identifier" });
  await db
    .collection("verification")
    .createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "verification_expiry" },
    );
}
