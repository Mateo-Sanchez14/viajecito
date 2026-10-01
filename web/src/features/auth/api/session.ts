import { createBrowserClient } from "@/shared/api/client";
import { resetCsrfToken } from "@/shared/api/csrf";
import { toApiError } from "./errors";

/** Ends the session. A 401 means it was already gone, which is the outcome we wanted. */
export async function logout(): Promise<void> {
  const { error, response } = await createBrowserClient().POST(
    "/api/auth/logout",
  );
  resetCsrfToken();
  if (response.ok || response.status === 401) return;
  throw toApiError(error, response);
}
