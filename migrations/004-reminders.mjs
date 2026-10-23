// Additive scheduling records. TTL is cleanup only, never the delivery trigger.
export async function up(db) {
  for (const name of [
    "reminders",
    "taskReminderVersions",
    "notifications",
    "notificationPreferences",
    "notificationOutbox",
    "notificationAttempts",
    "notificationReceipts",
    "reminderLocks",
    "reminderTaskReceipts",
    "pushSubscriptions",
    "recurringSeries",
    "taskOccurrences",
    "reminderWorkerState",
  ]) {
    if (!(await db.listCollections({ name }).hasNext()))
      await db.createCollection(name);
  }
  await db.collection("reminders").createIndexes([
    { key: { status: 1, nextAttemptAt: 1 }, name: "due_reminders" },
    { key: { status: 1, leaseUntil: 1 }, name: "reminder_lease_recovery" },
    {
      key: { user_id: 1, task_id: 1, status: 1 },
      name: "owner_task_reminders",
    },
    { key: { user_id: 1, scheduledAt: 1 }, name: "owner_upcoming" },
  ]);
  await db.collection("notifications").createIndexes([
    { key: { user_id: 1, createdAt: -1, _id: -1 }, name: "owner_history" },
    { key: { user_id: 1, dismissedAt: 1, readAt: 1 }, name: "owner_unread" },
  ]);
  await db.collection("notificationOutbox").createIndexes([
    { key: { status: 1, nextAttemptAt: 1 }, name: "due_deliveries" },
    { key: { status: 1, leaseUntil: 1 }, name: "delivery_lease_recovery" },
    {
      key: { user_id: 1, reminder_id: 1, revision: 1 },
      name: "owner_delivery_history",
    },
  ]);
  await db
    .collection("notificationAttempts")
    .createIndex({ user_id: 1, job_id: 1, startedAt: -1 });
  await db.collection("pushSubscriptions").createIndex({ user_id: 1 });
  await db
    .collection("recurringSeries")
    .createIndex({ status: 1, checkedThrough: 1, updatedAt: 1 });
  await db
    .collection("recurringSeries")
    .createIndex({ user_id: 1, createdAt: -1 });
  await db.collection("taskOccurrences").createIndexes([
    {
      key: { series_id: 1, date: 1 },
      unique: true,
      name: "unique_series_date",
    },
    {
      key: { user_id: 1, task_id: 1 },
      unique: true,
      name: "unique_owned_occurrence",
    },
  ]);
}
