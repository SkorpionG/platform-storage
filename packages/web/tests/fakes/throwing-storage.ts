/**
 * A `Storage` whose writes fail, standing in for Safari private browsing, a sandboxed iframe, and an exhausted quota. happy-dom emulates none of those.
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
