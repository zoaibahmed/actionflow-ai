import { NextResponse, type NextRequest } from "next/server";
export function GET(request: NextRequest) {
  // The auth handler verifies tokens. This destination itself makes no success claim.
  return NextResponse.redirect(
    new URL(
      request.nextUrl.searchParams.has("error")
        ? "/login?notice=invalid"
        : "/login",
      request.url,
    ),
  );
}
