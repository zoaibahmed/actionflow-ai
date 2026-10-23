import { up as workspaceUp } from "../migrations/007-workspace.mjs";
import { up as authSecurityUp } from "../migrations/006-auth-security.mjs";
import nextEnv from "@next/env";
import { MongoClient } from "mongodb";
import { up } from "../migrations/001-initial.mjs";
import { up as captureUp } from "../migrations/002-capture.mjs";
import { up as remindersUp } from "../migrations/004-reminders.mjs";
import { up as agentUp } from "../migrations/005-agent.mjs";
import { up as plannerUp } from "../migrations/003-planner.mjs";
nextEnv.loadEnvConfig(process.cwd());
const name = process.env.MONGODB_DB || "actionflow_ai";
if (name !== "actionflow_ai" && !name.startsWith("actionflow_ai_"))
  throw new Error("Use a dedicated actionflow_ai database.");
const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
try {
  const db = client.db(name);
  await client.connect();
  await up(db);
  await db
    .collection("migrations")
    .updateOne(
      { _id: "001-initial" },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
  await captureUp(db);
  await db
    .collection("migrations")
    .updateOne(
      { _id: "002-capture" },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
  await plannerUp(db);
  await db
    .collection("migrations")
    .updateOne(
      { _id: "003-planner" },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
  await remindersUp(db);
  await db
    .collection("migrations")
    .updateOne(
      { _id: "004-reminders" },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
  await agentUp(db);
  await db
    .collection("migrations")
    .updateOne(
      { _id: "005-agent" },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
  await authSecurityUp(db);
  await db
    .collection("migrations")
    .updateOne(
      { _id: "006-auth-security" },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
  await workspaceUp(db);
  await db
    .collection("migrations")
    .updateOne(
      { _id: "007-workspace" },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
  console.log(`Migrations 001–007 applied to ${name}.`);
} catch (error) {
  console.error(
    "Migration failed:",
    error.name,
    String(error.message).replace(
      /mongodb(?:\+srv)?:\/\/\S+/g,
      "[redacted connection]",
    ),
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
