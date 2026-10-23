import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/mongo";
import { taskRepository } from "@/lib/tasks/repository";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import Loading from "../../loading";
async function Detail({params}:{params:Promise<{taskId:string}>}){const user=await requireUser();const {taskId}=await params;const task=await taskRepository(getDatabase(),user.id).findById(taskId);if(!task)return <section className="coming-soon"><h1>This task is no longer available.</h1><p>It may have been deleted. Your reminder history remains in your stream.</p><Link className="button primary" href="/dashboard/notifications">Back to notifications</Link></section>;return <TaskWorkspace tasks={[task]} name={user.name} view="tasks"/>;}
export default function TaskDetail({params}:{params:Promise<{taskId:string}>}){return <Suspense fallback={<Loading/>}><Detail params={params}/></Suspense>;}
