/** Lowercases and strips accents so "lenas" finds "Las Leñas". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
