import type { JsonValue } from "../../src/index";
import type { ExtensionStorageArea, ExtensionStorageNamespace } from "../../src/types";

export interface FakeStorageArea extends ExtensionStorageArea {
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
export function fakeStorageArea(
  initial: Readonly<Record<string, JsonValue>> = {},
): FakeStorageArea {
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

export interface FakeStorageNamespace extends ExtensionStorageNamespace {
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

/** An area that rejects every call in the browser's own vocabulary, as a `sync` write over quota does. */
export function rejectingStorageArea(message: string): ExtensionStorageArea {
  return {
    get: () => Promise.reject(new Error(message)),
    set: () => Promise.reject(new Error(message)),
    remove: () => Promise.reject(new Error(message)),
  };
}
