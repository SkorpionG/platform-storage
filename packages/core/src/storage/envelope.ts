/** How a versioned key stores its value, with the version beside it so one write keeps the two together. */
interface Envelope {
  readonly v: number;
  readonly d: unknown;
}

/** What a stored value turned out to hold. */
interface StoredVersion {
  readonly version: number;
  readonly payload: unknown;
}

/* Exact on purpose: the fewer shapes count, the less an ordinary stored object can be mistaken for one. */
function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  if (Object.keys(value).length !== 2) return false;
  if (!Object.hasOwn(value, "v") || !Object.hasOwn(value, "d")) return false;

  const { v } = value as Envelope;

  return Number.isSafeInteger(v) && v > 0;
}

/** Puts a value in the form a versioned key stores. */
export function wrapEnvelope(version: number, value: unknown): Envelope {
  return { v: version, d: value };
}

/** Reads a stored value of a versioned key. Anything that is not an envelope predates the key having versions, and so is version 1. */
export function unwrapStored(stored: unknown): StoredVersion {
  return isEnvelope(stored)
    ? { version: stored.v, payload: stored.d }
    : { version: 1, payload: stored };
}
