/** Lowercases and strips accents so "lenas" finds "Las Le\u00f1as". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
