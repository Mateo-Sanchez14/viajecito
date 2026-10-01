/**
 * Accepts only same-origin relative paths for the post-login redirect.
 * Anything else (absolute URLs, protocol-relative `//host`, backslash tricks) becomes `/`.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.includes("\\")) return "/";
  // Control characters (newlines, tabs) are stripped by URL parsers and can hide a host.
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}
