import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { loadTasks } from "@/lib/tasks/data";
export async function Today() {
  const { tasks, name } = await loadTasks();
  return <TaskWorkspace tasks={tasks} name={name} />;
}
