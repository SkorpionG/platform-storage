/** How many prototypes sit above a value: at most one for a plain object, two for a direct instance of a built-in. Counted rather than compared or tested with `instanceof`, because a value can come from another realm. */
function prototypeDepth(value: object): number {
  let depth = 0;

  for (
    let prototype: unknown = Object.getPrototypeOf(value);
    prototype !== null;
    prototype = Object.getPrototypeOf(prototype as object)
  ) {
    depth += 1;
  }

  return depth;
}

/** Whether a built-in's own method accepts a value, which only a genuine instance from any realm does. */
function isBranded(probe: () => unknown): boolean {
  try {
    probe();

    return true;
  } catch {
    return false;
  }
}

/**
 * Copies the data in a value, so that changing the copy cannot reach the original.
 *
 * Plain objects, arrays, dates, maps and sets are copied, keeping cycles and shared references. Anything else is handed back as it is: a class instance has behavior this cannot reproduce, and refusing it would make such a value impossible to work with at all.
 */
export function copyValue<Value>(value: Value): Value {
  const copies = new Map<object, unknown>();

  /* Written with `defineProperty` because assigning a stored `__proto__` key would set the copy's prototype instead of copying the data. */
  function fill<Target extends object>(source: object, target: Target): Target {
    copies.set(source, target);

    for (const key of Object.keys(source)) {
      Object.defineProperty(target, key, {
        value: copy(Reflect.get(source, key)),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return target;
  }

  function copyBuiltIn(current: object): unknown {
    if (Array.isArray(current)) {
      const array: Array<unknown> = [];
      array.length = current.length;

      return fill(current, array);
    }

    if (isBranded(() => Date.prototype.getTime.call(current as Date))) {
      return new Date((current as Date).getTime());
    }

    if (isBranded(() => Map.prototype.has.call(current as Map<unknown, unknown>, undefined))) {
      const map = new Map<unknown, unknown>();
      copies.set(current, map);

      for (const [key, entry] of current as Map<unknown, unknown>) map.set(copy(key), copy(entry));

      return map;
    }

    if (isBranded(() => Set.prototype.has.call(current as Set<unknown>, undefined))) {
      const set = new Set<unknown>();
      copies.set(current, set);

      for (const entry of current as Set<unknown>) set.add(copy(entry));

      return set;
    }

    return current;
  }

  function copy(current: unknown): unknown {
    if (typeof current !== "object" || current === null) return current;
    if (copies.has(current)) return copies.get(current);

    const depth = prototypeDepth(current);

    if (depth === 0) return fill(current, Object.create(null) as object);
    if (depth === 1) return fill(current, {});

    const copied = depth === 2 ? copyBuiltIn(current) : current;

    copies.set(current, copied);

    return copied;
  }

  return copy(value) as Value;
}
