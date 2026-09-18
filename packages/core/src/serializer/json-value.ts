/**
 * Names a value the way an error message should, for the cases this module rejects.
 */
function describe(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "number") return String(value);
  if (typeof value !== "object" || value === null) return `a ${typeof value}`;

  const name: unknown = (value as { constructor?: { name?: unknown } }).constructor?.name;

  return typeof name === "string" && name !== "" ? `a ${name}` : "an object of an unknown kind";
}

function at(path: string): string {
  return path === "" ? "The value" : `\`${path}\``;
}

function problem(path: string, what: string): string {
  return `${at(path)} is ${what}, which is not a JSON value.`;
}

/**
 * Walks a value looking for the first part of it a JSON backend could not hold.
 *
 * `seen` tracks the path rather than every value visited, because one object appearing twice in a tree is fine and only a cycle is not.
 */
function walk(value: unknown, path: string, seen: Set<object>): string | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return undefined;

  if (typeof value === "number") {
    // `NaN` and the infinities have no JSON form and are stored as `null`, which turns a number into an absence without saying so.
    return Number.isFinite(value) ? undefined : problem(path, describe(value));
  }

  if (typeof value !== "object") return problem(path, describe(value));

  if (seen.has(value)) return problem(path, "a circular reference");

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      /* Every element is walked, with nothing skipped. An array has no way to drop one, so JSON turns a hole, an `undefined`, a function or a symbol into `null` and the list silently changes shape — which is the opposite of the object case below. */
      for (const [index, element] of value.entries()) {
        const found = walk(element, `${path}[${index}]`, seen);

        if (found !== undefined) return found;
      }

      return undefined;
    }

    const prototype: unknown = Object.getPrototypeOf(value);

    /* Anything carrying behavior — a Date, a Map, a Set, a class instance — is not a JSON value, whatever a backend chooses to do with it. */
    if (prototype !== Object.prototype && prototype !== null) return problem(path, describe(value));

    for (const [key, property] of Object.entries(value)) {
      /* JSON drops an object property holding one of these rather than corrupting it, and that is how an optional field is ordinarily written, so it is allowed here. */
      if (
        property === undefined ||
        typeof property === "function" ||
        typeof property === "symbol"
      ) {
        continue;
      }

      const found = walk(property, path === "" ? key : `${path}.${key}`, seen);

      if (found !== undefined) return found;
    }

    return undefined;
  } finally {
    seen.delete(value);
  }
}

/**
 * Reports the first part of a value a JSON backend could not hold, or `undefined` when every part of it can.
 *
 * `Object.entries` is what the walk follows, which is exactly what JSON serializes: own, enumerable, string-keyed properties. Anything else a backend would drop is never reached.
 */
export function findNonJsonValue(value: unknown): string | undefined {
  return walk(value, "", new Set<object>());
}
