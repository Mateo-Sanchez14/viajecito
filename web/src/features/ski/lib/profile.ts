export type SizeField = "boot" | "height" | "weight";

/** Parsed value of a size input: `null` when blank, `undefined` when it is not a number. */
function parse(raw: string): number | null | undefined {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

const inRange = (value: number, min: number, max: number) => value >= min && value <= max;

export type SizeInput = { boot: string; height: string; weight: string };
export type ParsedSizes = { boot: number | null; height: number | null; weight: number | null };

/** Validates the optional sizes (blank is fine) against the api ranges; boot goes in half sizes. */
export function parseSizes(input: SizeInput): { sizes: ParsedSizes; errors: Partial<Record<SizeField, true>> } {
  const errors: Partial<Record<SizeField, true>> = {};
  const read = (field: SizeField, valid: (n: number) => boolean): number | null => {
    const value = parse(input[field]);
    if (value === undefined || (value !== null && !valid(value))) {
      errors[field] = true;
      return null;
    }
    return value;
  };
  const sizes = {
    boot: read("boot", (n) => inRange(n, 30, 50) && Number.isInteger(n * 2)),
    height: read("height", (n) => inRange(n, 100, 230) && Number.isInteger(n)),
    weight: read("weight", (n) => inRange(n, 25, 200) && Number.isInteger(n)),
  };
  return { sizes, errors };
}
