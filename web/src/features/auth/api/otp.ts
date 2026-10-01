import { createBrowserClient } from "@/shared/api/client";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { components } from "@/shared/api/schema";
import { toApiError } from "./errors";

export type OtpRequestOut = components["schemas"]["OtpRequestOut"];
export type OtpVerifyOut = components["schemas"]["OtpVerifyOut"];

/** Asks the api to WhatsApp a login code. The api answers 202 whether or not the phone is eligible. */
export async function requestOtp(phone: string): Promise<OtpRequestOut> {
  const { data, error, response } = await createBrowserClient().POST(
    "/api/auth/otp/request",
    { body: { phone } },
  );
  if (response.ok && data) return data;
  throw toApiError(error, response.status);
}

/** Exchanges the code for a session cookie. */
export async function verifyOtp(
  phone: string,
  code: string,
): Promise<OtpVerifyOut> {
  const { data, error, response } = await createBrowserClient().POST(
    "/api/auth/otp/verify",
    { body: { phone, code } },
  );
  if (response.ok && data) {
    // Login rotates the CSRF token; the cached one is now stale.
    resetCsrfToken();
    return data;
  }
  throw toApiError(error, response.status);
}
