const KNOWN_CODES = [
  "invalid_phone",
  "invalid_code",
  "expired_code",
  "too_many_attempts",
  "rate_limited",
  "delivery_unavailable",
] as const;

export type AuthErrorMessageKey =
  | `auth.errors.${(typeof KNOWN_CODES)[number]}`
  | "auth.errors.unknown";

/** Maps an api error code to its i18n key; anything unrecognised is `auth.errors.unknown`. */
export function errorCodeToMessageKey(code: string): AuthErrorMessageKey {
  return (KNOWN_CODES as readonly string[]).includes(code)
    ? (`auth.errors.${code}` as AuthErrorMessageKey)
    : "auth.errors.unknown";
}
