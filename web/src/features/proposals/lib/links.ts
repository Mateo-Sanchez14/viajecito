/** The URL when it is http(s), otherwise null: previews are scraped, so never trust their scheme. */
export function safeHttpUrl(value: string): string | null {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
