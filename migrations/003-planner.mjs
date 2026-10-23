// Additive user-owned planning records; existing tasks and validators stay intact.
export async function up(db) {
  for (const name of [
    "dailyPlans",
    "plannerPreferences",
    "plannerReceipts",
    "plannerLocks",
  ]) {
    if (!(await db.listCollections({ name }).hasNext()))
      await db.createCollection(name);
  }
  await db
    .collection("dailyPlans")
    .createIndex(
      { user_id: 1, date: 1 },
      { unique: true, name: "owner_day_unique" },
    );
  await db
    .collection("dailyPlans")
    .createIndex(
      { user_id: 1, "intervals.start_at": 1 },
      { name: "owner_schedule" },
    );
}
