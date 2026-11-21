/** The map one storage keeps under a weakly held cache, made the first time it is asked for, so a storage nothing references any more takes its entries with it. */
export function entriesFor<Entry>(
  caches: WeakMap<object, Map<string, Entry>>,
  storage: object,
): Map<string, Entry> {
  const existing = caches.get(storage);

  if (existing !== undefined) return existing;

  const created = new Map<string, Entry>();
  caches.set(storage, created);

  return created;
}
