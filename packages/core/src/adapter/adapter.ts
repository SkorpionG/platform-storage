import type { Serializer } from "../serializer/serializer";

/**
 * What a storage backend has to provide.
 *
 * Deliberately small, and deliberately keyed by string rather than by index: positional enumeration is a web `Storage` idea that no other backend has. A missing value is `undefined`, never `null`, because a schema may legitimately store `null`.
 *
 * The wire type travels with the adapter, alongside the serializer that produces it, because backends disagree about what they can hold.
 */
export interface StorageAdapter<Wire = unknown> {
  /** Identifies the adapter in error messages. */
  readonly name: string;
  readonly serializer: Serializer<Wire>;

  get(key: string): Promise<Wire | undefined>;
  set(key: string, value: Wire): Promise<void>;
  remove(key: string): Promise<void>;

  /** Optional: the engine falls back to a `get` when a backend has no cheaper existence check. */
  has?(key: string): Promise<boolean>;

  /** Optional: a cheap probe used to choose between adapters, never to decide whether an operation succeeded. */
  isAvailable?(): boolean;
}

/**
 * A backend that can also answer immediately.
 *
 * Implementing this is what unlocks `getSync` and its siblings on the storage built over it, which is what makes an SSR-safe first render possible without a loading state. Backends that cannot answer immediately simply do not implement it, and the synchronous methods are then absent from the type.
 */
export interface SyncStorageAdapter<Wire = unknown> extends StorageAdapter<Wire> {
  getSync(key: string): Wire | undefined;
  setSync(key: string, value: Wire): void;
  removeSync(key: string): void;
  hasSync?(key: string): boolean;
}

/** The wire type an adapter transports. */
export type WireOf<Adapter> = Adapter extends StorageAdapter<infer Wire> ? Wire : never;

/**
 * Whether an adapter can answer immediately, and so can back the synchronous half of the API.
 *
 * Narrows the adapter, so the synchronous methods are reachable inside the branch.
 *
 * @param adapter - Any adapter.
 * @returns `true` when it implements `getSync`, `setSync` and `removeSync`.
 * @example
 * ```ts
 * if (isSyncStorageAdapter(adapter)) {
 *   const raw = adapter.getSync("theme");
 * }
 * ```
 */
export function isSyncStorageAdapter<Wire>(
  adapter: StorageAdapter<Wire>,
): adapter is SyncStorageAdapter<Wire> {
  return (
    "getSync" in adapter &&
    typeof adapter.getSync === "function" &&
    "setSync" in adapter &&
    typeof adapter.setSync === "function" &&
    "removeSync" in adapter &&
    typeof adapter.removeSync === "function"
  );
}

/** What an author of a synchronous adapter writes. The asynchronous half is derived from it. */
export interface SyncAdapterDefinition<Wire> {
  readonly name: string;
  readonly serializer: Serializer<Wire>;
  getSync(key: string): Wire | undefined;
  setSync(key: string, value: Wire): void;
  removeSync(key: string): void;
  hasSync?(key: string): boolean;
  isAvailable?(): boolean;
}

/**
 * Builds a full adapter from its synchronous half, so each operation is written once.
 *
 * The generated asynchronous methods start from a resolved promise, which turns a synchronous throw into a rejection: a caller awaiting `get` should never have to also wrap it in `try`.
 *
 * @param definition - The synchronous operations, the adapter's name, and the serializer it transports through. `hasSync` and `isAvailable` are optional.
 * @returns An adapter carrying both halves, ready for `createStorage`.
 * @example
 * ```ts
 * const adapter = defineSyncAdapter({
 *   name: "memory",
 *   serializer: jsonSerializer,
 *   getSync: (key) => store.get(key),
 *   setSync: (key, value) => void store.set(key, value),
 *   removeSync: (key) => void store.delete(key),
 * });
 * ```
 */
export function defineSyncAdapter<Wire>(
  definition: SyncAdapterDefinition<Wire>,
): SyncStorageAdapter<Wire> {
  const { hasSync, isAvailable } = definition;

  return {
    name: definition.name,
    serializer: definition.serializer,

    getSync: (key) => definition.getSync(key),
    setSync: (key, value) => {
      definition.setSync(key, value);
    },
    removeSync: (key) => {
      definition.removeSync(key);
    },

    get: (key) => Promise.resolve().then(() => definition.getSync(key)),
    set: (key, value) =>
      Promise.resolve().then(() => {
        definition.setSync(key, value);
      }),
    remove: (key) =>
      Promise.resolve().then(() => {
        definition.removeSync(key);
      }),

    ...(hasSync === undefined
      ? {}
      : {
          hasSync: (key: string) => hasSync(key),
          has: (key: string) => Promise.resolve().then(() => hasSync(key)),
        }),
    ...(isAvailable === undefined ? {} : { isAvailable: () => isAvailable() }),
  };
}
