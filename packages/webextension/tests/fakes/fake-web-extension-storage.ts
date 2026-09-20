import type { JsonValue } from "../../src/index";
import type { WebExtensionStorageArea, WebExtensionStorageNamespace } from "../../src/types";

interface FakeStorageArea extends WebExtensionStorageArea {
  /** What the area is holding, for a test to assert against without going back through a storage. */
  readonly entries: ReadonlyMap<string, JsonValue>;
}

function toKeys(keys: string | Array<string>): Array<string> {
  return typeof keys === "string" ? [keys] : keys;
}

/**
 * One in-memory storage area.
 *
 * `set` round-trips each value through JSON, because a real area serializes what it is given rather than keeping the object: a suite that stored an object and read it back must not be handed the very same reference. `get` answers only with the keys it found, as the real one does, so a missing key is absent from the record rather than present as `undefined`.
 */
function fakeStorageArea(initial: Readonly<Record<string, JsonValue>> = {}): FakeStorageArea {
  const entries = new Map<string, JsonValue>(Object.entries(initial));

  return {
    entries,
    get: (keys) => {
      const found: Record<string, JsonValue> = {};

      for (const key of toKeys(keys)) {
        const value = entries.get(key);

        if (value !== undefined) found[key] = value;
      }

      return Promise.resolve(found);
    },
    set: (items) => {
      for (const [key, value] of Object.entries(items)) {
        entries.set(key, JSON.parse(JSON.stringify(value)));
      }

      return Promise.resolve();
    },
    remove: (keys) => {
      for (const key of toKeys(keys)) entries.delete(key);

      return Promise.resolve();
    },
  };
}

export interface FakeStorageNamespace extends WebExtensionStorageNamespace {
  readonly local: FakeStorageArea;
  readonly sync: FakeStorageArea;
  readonly session?: FakeStorageArea;
}

/**
 * A `storage` namespace. `session` is present unless a suite asks otherwise, which is how it stands in for Manifest V2 or an older browser.
 */
export function fakeStorageNamespace(
  options: { readonly session?: boolean } = {},
): FakeStorageNamespace {
  const namespace = { local: fakeStorageArea(), sync: fakeStorageArea() };

  return options.session === false ? namespace : { ...namespace, session: fakeStorageArea() };
}

/** An area that rejects every call in the browser's own vocabulary, as one without the right permission does. */
export function rejectingStorageArea(message: string): WebExtensionStorageArea {
  return {
    get: () => Promise.reject(new Error(message)),
    set: () => Promise.reject(new Error(message)),
    remove: () => Promise.reject(new Error(message)),
  };
}

/**
 * An area that reads and removes normally and refuses only a write, which is what a full one actually does.
 *
 * The message is what a browser puts in front of a caller: an area reports a full quota by naming the limit that was passed rather than with an error type of its own.
 */
export function fullStorageArea(message: string): WebExtensionStorageArea {
  const area = fakeStorageArea();

  return { ...area, set: () => Promise.reject(new Error(message)) };
}
