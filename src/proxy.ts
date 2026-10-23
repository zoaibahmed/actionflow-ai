import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
export function proxy(request: NextRequest) {
  // Routing hint only. Pages and all task operations verify the database session again.
  if (!getSessionCookie(request))
    return NextResponse.redirect(new URL("/login", request.url));
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/dashboard/:path*"] };
