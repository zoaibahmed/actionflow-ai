export async function up(db) {
  const definitions = {
    notes: {
      _id: "string",
      user_id: "string",
      title: "string",
      content: "string",
      pinned: "bool",
      version: ["int", "long", "double"],
      createdAt: "date",
      updatedAt: "date",
    },
    focusSessions: {
      _id: "string",
      user_id: "string",
      status: "string",
      durationMs: ["int", "long", "double"],
      elapsedMs: ["int", "long", "double"],
      version: ["int", "long", "double"],
      createdAt: "date",
    },
    focusPreferences: { _id: "string", minutes: ["int", "long", "double"] },
  };
  for (const [name, fields] of Object.entries(definitions)) {
    const validator = {
      $jsonSchema: {
        bsonType: "object",
        required: Object.keys(fields),
        properties: Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, { bsonType: v }]),
        ),
      },
    };
    if (!(await db.listCollections({ name }).hasNext()))
      await db.createCollection(name, { validator });
    else
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
  }
  await db
    .collection("notes")
    .createIndex({ user_id: 1, pinned: -1, updatedAt: -1, _id: 1 });
  await db
    .collection("notes")
    .createIndex({ user_id: 1, pinned: -1, createdAt: -1, _id: 1 });
  await db
    .collection("focusSessions")
    .createIndex(
      { user_id: 1, active: 1 },
      { unique: true, partialFilterExpression: { active: true } },
    );
  await db
    .collection("focusSessions")
    .createIndex({ user_id: 1, status: 1, completedAt: -1 });
  await db
    .collection("focusSessions")
    .createIndex({ user_id: 1, taskId: 1, completedAt: -1 });
  await db
    .collection("tasks")
    .createIndex({ user_id: 1, status: 1, completed_at: -1 });
}
