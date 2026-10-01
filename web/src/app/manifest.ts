import type { MetadataRoute } from "next";
import messages from "../../messages/es-AR";

// Mirrors the light theme tokens in globals.css (--background).
const BACKGROUND = "#fafaf9";
const THEME = "#fafaf9";

/** Web app manifest (served at /manifest.webmanifest). Copy comes from the i18n messages. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: messages.pwa.name,
    short_name: messages.pwa.name,
    description: messages.pwa.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BACKGROUND,
    theme_color: THEME,
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
