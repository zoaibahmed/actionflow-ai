import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/server";
import { withMailDelivery } from "@/lib/auth/mail";
import type { NextRequest } from "next/server";

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export async function GET(request: NextRequest) {
  return privateResponse(await toNextJsHandler(getAuth()).GET(request));
}
export async function POST(request: NextRequest) {
  try {
    const response = await withMailDelivery(() =>
      toNextJsHandler(getAuth()).POST(request),
    );
    if (
      request.nextUrl.pathname.endsWith("/request-password-reset") &&
      response.ok
    )
      return privateResponse(
        Response.json({
          status: true,
          message:
            "If this address belongs to a verified account, we’ll email a reset link. If you haven’t verified your email, finish signup first.",
        }),
      );
    return privateResponse(response);
  } catch {
    if (request.nextUrl.pathname.endsWith("/request-password-reset"))
      return privateResponse(
        Response.json({
          status: true,
          message:
            "If this address belongs to a verified account, we’ll email a reset link. If you haven’t verified your email, finish signup first.",
        }),
      );
    return privateResponse(
      Response.json(
        {
          code: "EMAIL_DELIVERY_FAILED",
          message:
            "Email delivery was not confirmed. Wait a minute and request a new code.",
        },
        { status: 503 },
      ),
    );
  }
}
