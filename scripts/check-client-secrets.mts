import nextEnv from "@next/env";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
nextEnv.loadEnvConfig(process.cwd());
const root=path.join(process.cwd(),process.env.ACTIONFLOW_BUILD_DIR||".next","static");
const keys=["MONGODB_URI","BETTER_AUTH_SECRET","OPENAI_API_KEY","SMTP_PASSWORD","SMTP_USER","GOOGLE_CLIENT_SECRET","REMINDER_WORKER_SECRET","VAPID_PRIVATE_KEY","NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"];
const values=keys.flatMap(key=>process.env[key]&&process.env[key]!.length>=8?[{key,value:process.env[key]!}]:[]);
let files=0;const findings:{file:string;field:string}[]=[];
async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else if(/\.(js|map|json|css)$/.test(entry.name)){files++;const text=await readFile(p,"utf8");for(const {key,value} of values)if(text.includes(value)||text.includes(encodeURIComponent(value)))findings.push({file:path.relative(root,p),field:key});}}}
await walk(root);
console.log(JSON.stringify({files,configuredFieldsChecked:values.length,findings}));
if(findings.length)process.exitCode=1;
