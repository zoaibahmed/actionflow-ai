import "server-only";
import { requireUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/mongo";
import { taskRepository } from "./repository";
export async function loadTasks() {
  const user = await requireUser();
  const tasks = await taskRepository(getDatabase(), user.id).list();
  return { tasks, name: user.name };
}
