export function productionConfiguration(
  env: Record<string, string | undefined>,
) {
  const errors: string[] = [],
    warnings: string[] = [];
  for (const key of [
    "MONGODB_URI",
    "MONGODB_DB",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "OPENAI_API_KEY",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "MAIL_FROM",
    "REMINDER_WORKER_SECRET",
  ])
    if (!env[key]?.trim()) errors.push(key + " is required");
  for (const key of ["BETTER_AUTH_SECRET", "REMINDER_WORKER_SECRET"])
    if (env[key] && env[key].length < 32)
      errors.push(key + " must contain at least 32 random characters");
  try {
    const u = new URL(env.BETTER_AUTH_URL ?? "");
    if (u.username || u.password || u.search || u.hash || u.pathname !== "/")
      errors.push(
        "BETTER_AUTH_URL must be an origin without credentials or path",
      );
    if (u.protocol !== "https:") {
      if (
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      )
        warnings.push("Loopback HTTP is for local production smoke tests only");
      else errors.push("BETTER_AUTH_URL must use HTTPS");
    }
  } catch {
    errors.push("BETTER_AUTH_URL must be a valid origin");
  }
  if (env.MONGODB_URI && !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))
    errors.push("MONGODB_URI must be a MongoDB connection URI");
  if (env.OPENAI_BASE_URL)
    errors.push("OPENAI_BASE_URL must be unset in production");
  if (!["465", "587"].includes(env.SMTP_PORT || "587"))
    errors.push("SMTP_PORT must be 465 or 587");
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET))
    errors.push("Configure both Google credential fields or neither");
  if (!env.GOOGLE_CLIENT_ID)
    warnings.push("Google OAuth CONFIGURATION REQUIRED");
  if (env.MAIL_MODE === "file")
    warnings.push(
      "MAIL_MODE=file is ignored in production; SMTP must be configured",
    );
  const push = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT];
  if (push.some(Boolean) && !push.every(Boolean))
    errors.push("Configure all three VAPID fields or leave all blank");
  for (const key of [
    "CAPTURE_DAILY_LIMIT",
    "PLANNER_DAILY_LIMIT",
    "AGENT_DAILY_LIMIT",
  ])
    if (
      env[key] &&
      (!Number.isInteger(Number(env[key])) ||
        Number(env[key]) < 1 ||
        Number(env[key]) > 1000)
    )
      errors.push(key + " must be a whole number from 1 to 1000");
  return { errors, warnings };
}
