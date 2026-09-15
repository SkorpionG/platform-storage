import type { KeyOf, PlatformStorage, StorageSchemaDefinition } from "@platform-storage/core";

/**
 * What a storage has told us about itself.
 *
 * One channel per storage rather than one counter for the process, so writing to a session storage re-renders nothing reading a local one, and writing one key re-renders nobody reading another.
 */
interface StorageChannel {
  /** Increments on every change, so a generation is comparable without a clock. */
  tick: number;
  /** The tick of the last change that named no key, which is what `clear()` is. */
  wide: number;
  readonly changedAt: Map<string, number>;
  readonly perKey: Map<string, Set<() => void>>;
  readonly everything: Set<() => void>;
}

const channels = new WeakMap<object, StorageChannel>();

function channelFor(storage: object): StorageChannel {
  const existing = channels.get(storage);

  if (existing !== undefined) return existing;

  const channel: StorageChannel = {
    tick: 0,
    wide: 0,
    changedAt: new Map<string, number>(),
    perKey: new Map<string, Set<() => void>>(),
    everything: new Set<() => void>(),
  };

  channels.set(storage, channel);

  return channel;
}

/* A copy, because a listener is free to unsubscribe while it runs and a `Set` cannot be mutated as it is iterated. */
function notifyAll(listeners: ReadonlySet<() => void>): void {
  for (const listener of Array.from(listeners)) listener();
}

/**
 * How many changes this key has seen, counting the ones that named no key.
 *
 * A read cached against this number is stable for exactly as long as the value behind it cannot have moved, which is what lets a snapshot hold its identity between renders.
 */
export function generationOf(storage: object, key: string): number {
  const channel = channelFor(storage);

  return Math.max(channel.changedAt.get(key) ?? 0, channel.wide);
}

/**
 * Tells every hook reading this storage to read again.
 *
 * The writers call it themselves, so an application only reaches for it after a change the library never saw: a `clear()`, or a write made straight past it to the backend.
 *
 * Named for the event rather than for the counter behind it, so that when the library grows a real change subscription this keeps its meaning and its signature.
 */
export function notifyStorageChanged<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
  key?: KeyOf<Definition>,
): void {
  const channel = channelFor(storage);
  channel.tick += 1;

  if (key === undefined) {
    /* A change with no key can have moved a value nothing has read yet, which a per-key record alone could not express. */
    channel.wide = channel.tick;
    for (const listeners of channel.perKey.values()) notifyAll(listeners);
  } else {
    channel.changedAt.set(key, channel.tick);
    const listeners = channel.perKey.get(key);
    if (listeners !== undefined) notifyAll(listeners);
  }

  notifyAll(channel.everything);
}

/**
 * Calls the listener whenever the key changes, or whenever anything does when no key is named.
 *
 * The value hooks use it for the key they read. Reach for it directly to follow a storage as a whole, which is what a panel showing everything stored needs and what no key-shaped hook can serve.
 */
export function subscribeToStorage<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
  listener: () => void,
  key?: KeyOf<Definition>,
): () => void {
  const channel = channelFor(storage);

  if (key === undefined) {
    channel.everything.add(listener);

    return () => {
      channel.everything.delete(listener);
    };
  }

  const existing = channel.perKey.get(key);
  const listeners = existing ?? new Set<() => void>();

  if (existing === undefined) channel.perKey.set(key, listeners);

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
