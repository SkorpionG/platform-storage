/** Joins class names, dropping anything falsy. Enough for these examples; no conflict resolution. */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
