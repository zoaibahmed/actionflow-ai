export async function up(db) {
  const definitions = {
    agentConversations: {
      _id: "string",
      user_id: "string",
      title: "string",
      messages: "array",
      createdAt: "date",
      updatedAt: "date",
      purgeAt: "date",
    },
    agentActions: {
      _id: "string",
      user_id: "string",
      conversationId: "string",
      revision: "int",
      hash: "string",
      title: "string",
      payload: "object",
      versions: "object",
      timezone: "string",
      expiresAt: "date",
      purgeAt: "date",
      status: "string",
    },
    agentAudit: {
      user_id: "string",
      conversationId: "string",
      tool: "string",
      status: "string",
      createdAt: "date",
      purgeAt: "date",
    },
    agentTurns: {
      _id: "string",
      user_id: "string",
      hash: "string",
      conversationId: "string",
      status: "string",
      purgeAt: "date",
    },
    agentLeases: { _id: "string", until: "date", token: "string" },
  };
  for (const [name, fields] of Object.entries(definitions)) {
    const validator = {
      $jsonSchema: {
        bsonType: "object",
        required: Object.keys(fields),
        properties: Object.fromEntries(
          Object.entries(fields).map(([key, bsonType]) => [
            key,
            {
              bsonType:
                bsonType === "int" ? ["int", "long", "double"] : bsonType,
            },
          ]),
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
    if (fields.purgeAt)
      await db
        .collection(name)
        .createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 });
  }
  await db
    .collection("agentConversations")
    .createIndex({ user_id: 1, updatedAt: -1 });
  await db
    .collection("agentActions")
    .createIndex({ user_id: 1, conversationId: 1, status: 1 });
  await db
    .collection("agentAudit")
    .createIndex({ user_id: 1, conversationId: 1, createdAt: -1 });
}
