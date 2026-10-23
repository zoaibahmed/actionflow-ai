export function escapeEmail(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function emailTemplate(
  title: string,
  body: string,
  detail: string,
  link?: string,
) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f7f7f2;color:#292d35;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;padding:24px 12px"><tr><td><div style="max-width:520px;margin:auto;background:white;border:1px solid #e2e5ee;border-radius:20px;padding:32px"><p style="color:#5363c6;font-weight:bold">ActionFlow AI</p><h1 style="font-size:25px;line-height:1.3">${escapeEmail(title)}</h1><p style="line-height:1.7">${escapeEmail(body)}</p><div style="background:#f0f1fc;padding:20px;border-radius:12px;font-size:24px;letter-spacing:4px;text-align:center">${escapeEmail(detail)}</div>${link ? `<p><a href="${escapeEmail(link)}" style="display:inline-block;background:#5363c6;color:#fff;padding:14px 20px;border-radius:10px;text-decoration:none;letter-spacing:0">Choose a new password</a></p><p style="font-size:12px;word-break:break-all">${escapeEmail(link)}</p>` : ""}<p style="font-size:12px;line-height:1.7;color:#656e7d;margin-top:24px">If you did not request this, ignore this email. Never share a sign-in code with anyone. Your workspace is waiting, at your pace.</p></div></td></tr></table></body></html>`;
}
export function otpMail(kind: "registration" | "login", code: string) {
  const title =
    kind === "registration" ? "Verify your email" : "Your secure sign-in code";
  const body =
    kind === "registration"
      ? "Use this code to verify your ActionFlow email address."
      : "Your password was accepted. Use this code to finish signing in.";
  return {
    subject:
      kind === "registration"
        ? "Verify your ActionFlow email"
        : "Your ActionFlow sign-in code",
    text: `${title}\n\n${body}\n\n${code}\n\nExpires in 5 minutes. Do not share this code. If you did not request this, ignore this email.`,
    html: emailTemplate(title, body + " Expires in 5 minutes.", code),
  };
}
export function resetMail(url: string) {
  return {
    subject: "Reset your ActionFlow password",
    text: `Choose a new password using this single-use link:\n\n${url}\n\nThis link expires in 30 minutes. If you did not request this, ignore this email.`,
    html: emailTemplate(
      "A fresh start for your workspace.",
      "Choose a new password using the secure link below. It expires in 30 minutes and can be used once.",
      "Password recovery",
      url,
    ),
  };
}
