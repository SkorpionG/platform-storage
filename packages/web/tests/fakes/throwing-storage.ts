/**
 * A `Storage` that exists but refuses everything, standing in for Safari private browsing and a sandboxed iframe. happy-dom emulates neither.
 *
 * This is what makes presence different from availability, and so what the probe has to catch. A storage that works but has run out of room is `storageRefusingWrites` instead.
 */
export function throwingStorage(message = "QuotaExceededError"): Storage {
  const reject = (): never => {
    throw new DOMException(message, "QuotaExceededError");
  };

  return {
    get length(): number {
      return 0;
    },
    clear: reject,
    getItem: (): string | null => null,
    key: (): string | null => null,
    removeItem: reject,
    setItem: reject,
  };
}

/**
 * A `Storage` that reads and removes normally and refuses only a write, which is what a full origin actually looks like.
 *
 * `failure` is thrown as it is given, so a suite can hand over each of the shapes browsers use: a `DOMException` named `QuotaExceededError`, the `NS_ERROR_DOM_QUOTA_REACHED` older Firefox used, an older browser setting only a numeric `code`, and something that is not a quota failure at all.
 */
export function storageRefusingWrites(failure: unknown): Storage {
  const entries = new Map<string, string>();

  return {
    get length(): number {
      return entries.size;
    },
    clear: () => {
      entries.clear();
    },
    getItem: (key: string): string | null => entries.get(key) ?? null,
    key: (index: number): string | null => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (): never => {
      throw failure;
    },
  };
}
