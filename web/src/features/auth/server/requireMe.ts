import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/shared/api/client.server";
import type { Me } from "../MeProvider";

/** Request header set by `src/proxy.ts` with the path (and query) being rendered. */
export const NEXT_PATH_HEADER = "x-next-path";

/**
 * Auth gate for server components: returns `/api/me` for the current session or redirects
 * to `/login?next=<current path>` on 401. Other failures surface as errors, never as a
 * silent logout.
 */
export const requireMe = cache(async (): Promise<Me> => {
  const cookieHeader = (await cookies()).toString();
  const { data, response } = await createServerClient(cookieHeader).GET(
    "/api/me",
  );

  if (response.status === 401) {
    const path = (await headers()).get(NEXT_PATH_HEADER);
    redirect(path && path !== "/" ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }
  if (!data) throw new Error(`Could not load the session (HTTP ${response.status})`);
  return data;
});
