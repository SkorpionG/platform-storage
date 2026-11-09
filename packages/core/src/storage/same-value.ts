function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/* By index rather than with `every`, which skips a hole and so would let one stand in for anything. */
function sameElements(first: ReadonlyArray<unknown>, second: ReadonlyArray<unknown>): boolean {
  if (first.length !== second.length) return false;

  for (const index of first.keys()) {
    if (Object.hasOwn(first, index) !== Object.hasOwn(second, index)) return false;
    if (!isSameValue(first[index], second[index])) return false;
  }

  return true;
}

function sameEntries(
  first: ReadonlyMap<unknown, unknown>,
  second: ReadonlyMap<unknown, unknown>,
): boolean {
  if (first.size !== second.size) return false;

  for (const [key, value] of first) {
    if (!second.has(key) || !isSameValue(value, second.get(key))) return false;
  }

  return true;
}

function sameMembers(first: ReadonlySet<unknown>, second: ReadonlySet<unknown>): boolean {
  if (first.size !== second.size) return false;

  for (const member of first) if (!second.has(member)) return false;

  return true;
}

function sameFields(first: object, second: object): boolean {
  const keys = Object.keys(first);

  if (keys.length !== Object.keys(second).length) return false;

  return keys.every(
    (key) =>
      Object.hasOwn(second, key) && isSameValue(Reflect.get(first, key), Reflect.get(second, key)),
  );
}

/**
 * Whether two values a schema produced are the same value.
 *
 * Unlike comparing stored forms, this tells a `Date` from its text, a `Map` from an empty object and a hole in an array from an element. Anything it does not know how to look inside counts as the same only when it is the same object, so a doubt answers `false`.
 */
export function isSameValue(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (typeof first !== "object" || typeof second !== "object") return false;
  if (first === null || second === null) return false;

  if (Array.isArray(first) || Array.isArray(second)) {
    return Array.isArray(first) && Array.isArray(second) && sameElements(first, second);
  }

  if (first instanceof Date || second instanceof Date) {
    return (
      first instanceof Date &&
      second instanceof Date &&
      Object.is(first.getTime(), second.getTime())
    );
  }

  if (first instanceof Map || second instanceof Map) {
    return first instanceof Map && second instanceof Map && sameEntries(first, second);
  }

  if (first instanceof Set || second instanceof Set) {
    return first instanceof Set && second instanceof Set && sameMembers(first, second);
  }

  return isPlainObject(first) && isPlainObject(second) && sameFields(first, second);
}
