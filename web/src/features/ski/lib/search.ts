/** Lowercases and strips accents so a search without them still finds the resort. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
