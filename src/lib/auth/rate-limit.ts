import "server-only";
import { createHash } from "node:crypto";
import { getDatabase } from "@/lib/db/mongo";
// Server Actions bypass the auth HTTP router's limiter, so guard those calls too.
export async function allowAuthAction(mode: string, identity: string) {
  const key = createHash("sha256")
    .update(`${mode}:${identity.toLowerCase()}`)
    .digest("hex");
  const document = await getDatabase()
    .collection<{ _id: string; count: number; expiresAt: Date }>(
      "authActionLimit",
    )
    .findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            count: {
              $cond: [
                { $gt: ["$expiresAt", "$$NOW"] },
                { $add: ["$count", 1] },
                1,
              ],
            },
            expiresAt: {
              $cond: [
                { $gt: ["$expiresAt", "$$NOW"] },
                "$expiresAt",
                { $dateAdd: { startDate: "$$NOW", unit: "minute", amount: 1 } },
              ],
            },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
  return Boolean(document && document.count <= 10);
}
