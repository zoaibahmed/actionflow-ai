import "server-only";
import { createHash } from "node:crypto";
import { APIError } from "better-auth/api";
import { getDatabase } from "../db/mongo";
import { consumeLimit } from "../capture/repository";
export async function authLimit(
  category: string,
  identity: string,
  limit: number,
  seconds: number,
) {
  const now = Date.now(),
    window = Math.floor(now / (seconds * 1000));
  const digest = createHash("sha256")
    .update(identity.toLowerCase())
    .digest("hex");
  if (limit === 1) {
    const rows = getDatabase().collection<{
      _id: string;
      until: Date;
      expiresAt: Date;
    }>("authCooldowns");
    const id = category + ":" + digest;
    await rows.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          until: new Date(0),
          expiresAt: new Date(now + 86400000),
        },
      },
      { upsert: true },
    );
    const accepted = await rows.findOneAndUpdate(
      { _id: id, until: { $lte: new Date(now) } },
      {
        $set: {
          until: new Date(now + seconds * 1000),
          expiresAt: new Date(now + 86400000),
        },
      },
      { returnDocument: "after" },
    );
    if (!accepted)
      throw new APIError("TOO_MANY_REQUESTS", {
        message:
          "Wait a full minute before requesting another code or reset email.",
        code: "AUTH_RATE_LIMIT",
      });
    return;
  }
  const result = await consumeLimit(
    getDatabase(),
    `auth-e:${category}:${digest}:${window}`,
    limit,
    new Date(now + seconds * 2000),
  );
  if (!result.allowed)
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many attempts. Wait before trying again.",
      code: "AUTH_RATE_LIMIT",
    });
}
export function googleConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}
