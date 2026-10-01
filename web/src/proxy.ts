import { NextResponse, type NextRequest } from "next/server";

/**
 * Exposes the requested path to server components (layouts cannot read it), so the auth
 * gate can build `/login?next=...`. Always overwrites the header: clients cannot spoof it.
 */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "x-next-path",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
