import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const folder = join(process.cwd(), ".local-mail");
try {
  const files = (await readdir(folder))
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (!files.length) throw new Error("empty");
  const file = join(folder, files.at(-1));
  const mail = JSON.parse(await readFile(file, "utf8"));
  console.log(
    JSON.stringify(
      {
        file,
        subject: mail.subject,
        note: "Open this private development file locally to inspect its content. Codes and reset links are never printed by this command.",
      },
      null,
      2,
    ),
  );
} catch {
  console.log(
    "No local email yet. Submit the confirmation or password-reset form first.",
  );
}
