import { writeFile } from "node:fs/promises";
import { verified } from "../tests/helpers/auth-flow";
if (
  process.env.MONGODB_DB !== "actionflow_ai_auth_e_f_tests" ||
  !process.env.MONGODB_URI?.startsWith("mongodb://127.0.0.1:") ||
  process.env.SMTP_HOST
)
  throw new Error("Disposable fixture only");
const a = await verified();
await writeFile(
  "../actionflow-ui-test-tools/workspace-browser-private.json",
  JSON.stringify({ email: a.email, password: a.password }),
);
console.log(
  "Disposable verified browser fixture ready; credentials kept private.",
);
