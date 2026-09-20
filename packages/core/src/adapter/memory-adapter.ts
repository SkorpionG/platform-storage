import { jsonSerializer } from "../serializer/json-serializer";
import { defineSyncAdapter } from "./adapter";
import type { SyncStorageAdapter } from "./adapter";

/** What `memoryAdapter` accepts. */
export interface MemoryAdapterOptions {
  readonly name?: string | undefined;
  /** Values to start from, already serialized, as though a previous run had written them. */
  readonly initial?: Readonly<Record<string, string>> | undefined;
}

/** The adapter `memoryAdapter` returns: a synchronous adapter that also exposes what it is holding. */
export interface MemoryStorageAdapter extends SyncStorageAdapter<string> {
  /** What the adapter is holding, for a test to assert against without going back through a storage. */
  readonly entries: ReadonlyMap<string, string>;
}

/**
 * A backend that keeps everything in memory.
 *
 * Useful for tests, for server rendering, and as the second half of `withFallback` where a real backend may be missing. It transports strings through the JSON serializer rather than holding values directly, so a suite exercises the same serialization every other adapter does.
 *
 * @param options - `name` for error messages, and `initial` to start from values a previous run would have written. Both optional.
 * @returns An adapter holding its own `entries` map.
 * @example
 * ```ts
 * const storage = createStorage({ schema, adapter: memoryAdapter() });
 * ```
 */
export function memoryAdapter(options: MemoryAdapterOptions = {}): MemoryStorageAdapter {
  const entries = new Map<string, string>(Object.entries(options.initial ?? {}));

  return {
    ...defineSyncAdapter({
      name: options.name ?? "memory",
      serializer: jsonSerializer,
      getSync: (key) => entries.get(key),
      setSync: (key, value) => {
        entries.set(key, value);
      },
      removeSync: (key) => {
        entries.delete(key);
      },
      hasSync: (key) => entries.has(key),
    }),
    entries,
  };
}
