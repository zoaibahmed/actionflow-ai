import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import { consumeLimit } from "../capture/repository";
import { CaptureError, normalizeError } from "../capture/errors";
import { getPreferences } from "../planner/repository";
import {
  getNotificationPreferences,
  ownerTransaction,
} from "../reminders/repository";
import { aiConfigured } from "../ai/client";
import type { ToolContext } from "./tools";
import { runAgent } from "./openai";
import {
  hash,
  audit,
  conversation,
  loadConversation,
  type ConversationDoc,
} from "./repository";
import { rejectSecrets, redact, type AgentMessage } from "./schema";
export async function agentMessage(
  db: Db,
  owner: string,
  body: {
    conversationId: string | null;
    requestId: string;
    text: string;
    timezone: string;
  },
  signal?: AbortSignal,
) {
  rejectSecrets(body.text);
  if (!aiConfigured())
    throw new CaptureError(
      "setup",
      "Configure the server-side OpenAI key before using the assistant.",
      503,
    );
  const now = Date.now(),
    token = randomUUID();
  const leases = db.collection<{ _id: string; until: Date; token: string }>(
    "agentLeases",
  );
  await leases.updateOne(
    { _id: owner },
    { $setOnInsert: { until: new Date(0), token: "" } },
    { upsert: true },
  );
  const lease = await leases.findOneAndUpdate(
    { _id: owner, until: { $lte: new Date(now) } },
    { $set: { until: new Date(now + 150000), token } },
    { returnDocument: "after" },
  );
  if (!lease)
    throw new CaptureError(
      "busy",
      "An assistant request is already running. Please wait for it to finish.",
      409,
    );
  let id = body.conversationId;
  let accepted = false;
  try {
    const turns = db.collection<{
      _id: string;
      user_id: string;
      hash: string;
      conversationId: string;
      status: string;
      purgeAt: Date;
    }>("agentTurns");
    const tid = owner + ":" + body.requestId,
      digest = hash(body);
    const prior = await turns.findOne({ _id: tid });
    if (prior) {
      if (prior.hash !== digest)
        throw new CaptureError(
          "duplicate",
          "This request identifier was already used for another message.",
          409,
        );
      if (prior.status === "completed")
        return loadConversation(db, owner, prior.conversationId);
      throw new CaptureError(
        "retry",
        "The previous request did not finish. Retry with a new message request.",
        409,
      );
    }
    for (const [key, limit, expiry] of [
      [`agent:minute:${owner}:${Math.floor(now / 60000)}`, 5, now + 120000],
      [
        `agent:day:${owner}:${new Date(now).toISOString().slice(0, 10)}`,
        Math.min(200, Math.max(1, Number(process.env.AGENT_DAILY_LIMIT) || 20)),
        now + 172800000,
      ],
    ] as const) {
      if (!(await consumeLimit(db, key, limit, new Date(expiry))).allowed)
        throw new CaptureError(
          "quota",
          "Your assistant usage limit was reached. Try later; daily limits reset at UTC midnight.",
          429,
        );
    }
    if (!id) {
      if (
        (await db
          .collection<ConversationDoc>("agentConversations")
          .countDocuments({ user_id: owner, purgeAt: { $gt: new Date() } })) >=
        20
      )
        throw new CaptureError(
          "history_limit",
          "You have twenty conversations. Delete an old conversation before starting another.",
        );
      id = randomUUID();
      await db.collection<ConversationDoc>("agentConversations").insertOne({
        _id: id,
        user_id: owner,
        title: body.text.slice(0, 70),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        purgeAt: new Date(now + 30 * 86400000),
      });
    }
    const c = await conversation(db, owner, id);
    if (
      (await db
        .collection("agentActions")
        .countDocuments({ user_id: owner, conversationId: id })) >= 60
    )
      throw new CaptureError(
        "conversation_limit",
        "Start a new conversation; this one reached its action-history limit.",
      );
    await turns.insertOne({
      _id: tid,
      user_id: owner,
      hash: digest,
      conversationId: id,
      status: "started",
      purgeAt: new Date(now + 30 * 86400000),
    });
    accepted = true;
    const userMessage: AgentMessage = {
      id: body.requestId,
      role: "user",
      text: body.text,
      createdAt: new Date().toISOString(),
    };
    await db.collection<ConversationDoc>("agentConversations").updateOne(
      { _id: id, user_id: owner },
      {
        $push: { messages: { $each: [userMessage], $slice: -40 } },
        $set: { updatedAt: new Date() },
      },
    );
    const [pref, notificationPref] = await Promise.all([
      getPreferences(db, owner),
      getNotificationPreferences(db, owner),
    ]);
    const timezone = pref.exists
      ? pref.preferences.timezone
      : notificationPref.version
        ? notificationPref.value.timezone
        : body.timezone;
    const context: ToolContext = {
      db,
      owner,
      conversationId: id,
      timezone,
      signal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(50000),
      ]),
      proposals: [],
      links: [],
    };
    const result = await runAgent(context, [...c.messages, userMessage]);
    if (
      !(await leases.findOne({ _id: owner, token, until: { $gt: new Date() } }))
    )
      throw new CaptureError(
        "lease",
        "The request expired. Reload the conversation before retrying.",
        409,
      );
    const links = Array.from(
      new Map(context.links.map((l) => [l.href, l])).values(),
    ).slice(0, 12);
    const message: AgentMessage = {
      id: randomUUID(),
      role: "assistant",
      text: result.text,
      createdAt: new Date().toISOString(),
      links,
    };
    await db.collection<ConversationDoc>("agentConversations").updateOne(
      { _id: id, user_id: owner },
      {
        $push: { messages: { $each: [message], $slice: -40 } },
        $set: { updatedAt: new Date() },
      },
    );
    await turns.updateOne({ _id: tid }, { $set: { status: "completed" } });
    await audit(db, owner, id, "model", "completed", undefined, {
      totalTokens: result.tokens,
    });
    return await loadConversation(db, owner, id);
  } catch (error) {
    if (accepted && id) {
      const failure = normalizeError(error);
      await db
        .collection<ConversationDoc>("agentConversations")
        .updateOne(
          { _id: id, user_id: owner },
          {
            $push: {
              messages: {
                $each: [
                  {
                    id: randomUUID(),
                    role: "assistant",
                    text:
                      redact(failure.message) +
                      " You can review any existing previews or retry your message.",
                    createdAt: new Date().toISOString(),
                  },
                ],
                $slice: -40,
              },
            },
            $set: { updatedAt: new Date() },
          },
        )
        .catch(() => {});
      await audit(db, owner, id, "model", "failed").catch(() => {});
    }
    throw error;
  } finally {
    await leases
      .updateOne({ _id: owner, token }, { $set: { until: new Date(0) } })
      .catch(() => {});
  }
}
export async function deleteConversation(
  db: Db,
  client: MongoClient,
  owner: string,
  id: string,
) {
  const token = randomUUID();
  const leases = db.collection<{ _id: string; until: Date; token: string }>(
    "agentLeases",
  );
  const lease = await leases.findOneAndUpdate(
    { _id: owner, until: { $lte: new Date() } },
    { $set: { until: new Date(Date.now() + 60000), token } },
    { returnDocument: "after" },
  );
  if (!lease)
    throw new CaptureError(
      "busy",
      "Wait for the assistant request to finish before deleting history.",
      409,
    );
  try {
    return await ownerTransaction(db, client, owner, async (tx) => {
      await db
        .collection("agentActions")
        .deleteMany({ conversationId: id, user_id: owner }, { session: tx });
      await db
        .collection("agentAudit")
        .deleteMany({ conversationId: id, user_id: owner }, { session: tx });
      await db
        .collection("agentTurns")
        .deleteMany({ conversationId: id, user_id: owner }, { session: tx });
      await db
        .collection<ConversationDoc>("agentConversations")
        .deleteOne({ _id: id, user_id: owner }, { session: tx });
    });
  } finally {
    await leases.updateOne(
      { _id: owner, token },
      { $set: { until: new Date(0) } },
    );
  }
}
