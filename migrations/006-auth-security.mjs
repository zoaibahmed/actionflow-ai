export async function up(db) {
  await db.collection("authCooldowns").createIndex({expiresAt:1},{expireAfterSeconds:0});
  await db
    .collection("twoFactor")
    .createIndex({ userId: 1 }, { name: "two_factor_owner" });
  await db
    .collection("user")
    .updateMany(
      { twoFactorEnabled: { $ne: true } },
      { $set: { twoFactorEnabled: true } },
    );
  // Legacy password-only sessions cannot attest the new policy. Expire, never replace users/data.
  await db
    .collection("session")
    .updateMany(
      { authPolicyVersion: { $ne: 2 }, expiresAt: { $gt: new Date() } },
      { $set: { expiresAt: new Date(), policyRevokedAt: new Date() } },
    );
}
