import { Suspense } from "react";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { loadTasks } from "@/lib/tasks/data";
import Loading from "../loading";
async function Tasks() {
  const { tasks, name } = await loadTasks();
  return <TaskWorkspace tasks={tasks} name={name} view="tasks" />;
}
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Tasks />
    </Suspense>
  );
}
