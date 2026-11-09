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
  /** How many listeners are attached, which decides whether the storage is being followed. */
  listening: number;
  /** Stops following the storage. Present exactly while its own reports reach this channel. */
  stopRelay: (() => void) | undefined;
  /** Whether following stopped, leaving a stretch in which changes went unheard. */
  missedChanges: boolean;
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
    listening: 0,
    stopRelay: undefined,
    missedChanges: false,
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
 * While anything is listening, every change made through the storage and every one reported from another tab or context arrives by itself. An application only reaches for this after a write made straight past the library to the backend.
 *
 * @param storage - The storage that changed.
 * @param key - Which key changed. Leave it out after a `clear()`, or any change that could have moved several.
 * @example
 * ```ts
 * await storage.clear();
 * notifyStorageChanged(storage);
 * ```
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
 * Tells this channel about a write a hook just made.
 *
 * Silent while the storage is being followed, because its own report is on the way and announcing twice would read twice. Otherwise the generation still has to move, or a reader mounted later would be handed the cached value from before the write.
 */
export function announceWrite<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
  key: KeyOf<Definition>,
): void {
  if (channelFor(storage).stopRelay === undefined) notifyStorageChanged(storage, key);
}

/* The first listener starts following the storage and the last one stops, so a storage nothing displays costs nothing. A hand-written stand-in may not offer `onChange`, and then its writers keep announcing for themselves. */
function retain<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
  channel: StorageChannel,
): () => void {
  channel.listening += 1;

  if (channel.listening === 1 && typeof storage.onChange === "function") {
    /* Anything may have changed while nothing was following, and a read cached from before would otherwise still look current. */
    if (channel.missedChanges) {
      channel.tick += 1;
      channel.wide = channel.tick;
      channel.missedChanges = false;
    }

    channel.stopRelay = storage.onChange((key) => {
      notifyStorageChanged(storage, key);
    });
  }

  let released = false;

  return () => {
    if (released) return;

    released = true;
    channel.listening -= 1;

    if (channel.listening > 0 || channel.stopRelay === undefined) return;

    channel.stopRelay();
    channel.stopRelay = undefined;
    channel.missedChanges = true;
  };
}

/**
 * Calls the listener whenever the key changes, or whenever anything does when no key is named.
 *
 * The value hooks use it for the key they read. Reach for it directly to follow a storage as a whole, which is what a panel showing everything stored needs and what no key-shaped hook can serve.
 *
 * @param storage - The storage to follow.
 * @param listener - Called after each change. It takes no arguments: read what you need from the storage.
 * @param key - Follow one key. Leave it out to hear about every change.
 * @returns Stops listening.
 * @example
 * ```ts
 * useEffect(() => subscribeToStorage(storage, refresh), [refresh]);
 * ```
 */
export function subscribeToStorage<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
  listener: () => void,
  key?: KeyOf<Definition>,
): () => void {
  const channel = channelFor(storage);
  const release = retain(storage, channel);

  if (key === undefined) {
    channel.everything.add(listener);

    return () => {
      channel.everything.delete(listener);
      release();
    };
  }

  const existing = channel.perKey.get(key);
  const listeners = existing ?? new Set<() => void>();

  if (existing === undefined) channel.perKey.set(key, listeners);

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    release();
  };
}
