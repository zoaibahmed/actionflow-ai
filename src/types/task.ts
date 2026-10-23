export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";
export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type TaskInput = Pick<
  Task,
  "title" | "description" | "priority" | "status" | "due_at"
>;
export type TaskResult =
  | { ok: true; task: Task }
  | {
      ok: false;
      error: string;
      fields?: Record<string, string[]>;
      unauthorized?: boolean;
    };
