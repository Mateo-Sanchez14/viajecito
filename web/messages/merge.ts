type Tree = { [key: string]: unknown };

type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void
  ? I
  : never;

function isTree(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeTwo(target: Tree, source: Tree): Tree {
  const result: Tree = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    result[key] = isTree(existing) && isTree(value) ? mergeTwo(existing, value) : value;
  }
  return result;
}

/**
 * Deep-merges message files. Files that share a namespace are combined key by key;
 * on a leaf conflict the later file wins. Inputs are never mutated.
 */
export function mergeMessages<T extends Tree[]>(...files: T): UnionToIntersection<T[number]> {
  return files.reduce<Tree>(mergeTwo, {}) as UnionToIntersection<T[number]>;
}
