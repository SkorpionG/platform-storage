import { jsonSerializer } from "../serializer/json-serializer";
import type { Serializer } from "../serializer/serializer";
import { copyValue } from "../storage/copy-value";
import { defineSyncAdapter } from "./adapter";
import type { SyncStorageAdapter } from "./adapter";

/** What `memoryAdapter` accepts. */
export interface MemoryAdapterOptions<Wire = string> {
  readonly name?: string | undefined;
  /** Values to start from, already serialized, as though a previous run had written them. */
  readonly initial?: Readonly<Record<string, Wire>> | undefined;
}

/** What `memoryAdapter` accepts to hold anything other than text, which needs a serializer producing that form. */
export interface MemoryAdapterWireOptions<Wire> extends MemoryAdapterOptions<Wire> {
  readonly serializer: Serializer<Wire>;
}

/** The adapter `memoryAdapter` returns: a synchronous adapter that also exposes what it is holding. */
export interface MemoryStorageAdapter<Wire = string> extends SyncStorageAdapter<Wire> {
  /** What the adapter is holding, for a test to assert against without going back through a storage. */
  readonly entries: ReadonlyMap<string, Wire>;
}

/**
 * A backend that keeps everything in memory.
 *
 * Useful for tests, for server rendering, and as the second half of `withFallback` where a real backend may be missing. It transports strings through the JSON serializer rather than holding values directly, so a suite exercises the same serialization every other adapter does. Give it a `serializer` to pair it with a backend that transports something else, such as an extension area. Values are copied on the way in and out, as a real backend would, so changing one you read does not change what is stored.
 *
 * @param options - `name` for error messages, `initial` to start from values a previous run would have written, and `serializer` to hold something other than text. All optional.
 * @returns An adapter holding its own `entries` map.
 * @example
 * ```ts
 * const storage = createStorage({ schema, adapter: memoryAdapter() });
 * ```
 */
export function memoryAdapter(options?: MemoryAdapterOptions): MemoryStorageAdapter;
export function memoryAdapter<Wire>(
  options: MemoryAdapterWireOptions<Wire>,
): MemoryStorageAdapter<Wire>;
export function memoryAdapter<Wire>(
  options: MemoryAdapterOptions<Wire> & { readonly serializer?: Serializer<Wire> } = {},
): MemoryStorageAdapter<Wire> {
  const entries = new Map<string, Wire>(Object.entries(copyValue(options.initial ?? {})));

  return {
    ...defineSyncAdapter<Wire>({
      name: options.name ?? "memory",
      // The overloads allow leaving it out only when `Wire` is `string`, which is what this one transports.
      serializer: options.serializer ?? (jsonSerializer as unknown as Serializer<Wire>),
      getSync: (key) => copyValue(entries.get(key)),
      setSync: (key, value) => {
        entries.set(key, copyValue(value));
      },
      removeSync: (key) => {
        entries.delete(key);
      },
      hasSync: (key) => entries.has(key),
      keysSync: () => Array.from(entries.keys()),
    }),
    entries,
  };
}
