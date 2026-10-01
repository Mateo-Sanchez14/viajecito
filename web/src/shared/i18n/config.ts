import messages from "../../../messages/es-AR";

// The app ships a single locale and has no locale routing.
export const LOCALE = "es-AR";

export function resolveRequestConfig() {
  return { locale: LOCALE, messages };
}
