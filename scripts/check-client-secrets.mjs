import nextEnv from "@next/env";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
nextEnv.loadEnvConfig(process.cwd());
const secrets = [
  process.env.OPENAI_API_KEY,
  process.env.MONGODB_URI,
  process.env.BETTER_AUTH_SECRET,
  process.env.REMINDER_WORKER_SECRET,
  process.env.VAPID_PRIVATE_KEY,
  process.env.SMTP_PASSWORD,
  process.env.GOOGLE_CLIENT_SECRET,
].filter(Boolean);
let files = 0,
  leaks = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(js|json|map)$/.test(entry.name)) {
      files++;
      const content = await readFile(file, "utf8");
      if (secrets.some((secret) => content.includes(secret))) leaks++;
    }
  }
}
await scan(".next/static");
console.log(JSON.stringify({ clientFilesChecked: files, secretLeaks: leaks }));
if (leaks) process.exitCode = 1;
