import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { ReminderStream } from "@/components/reminders/reminder-stream";
import Loading from "../loading";
async function Workspace(){await requireUser();return <ReminderStream initialView="upcoming"/>;}
export default function Page(){return <Suspense fallback={<Loading/>}><Workspace/></Suspense>;}
