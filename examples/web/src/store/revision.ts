/*
  Change subscription is not part of the library yet, so nothing tells the page a value moved. Every mutation bumps this counter instead and the hooks re-read, which is exactly the loop a `storage.subscribe` would replace.
*/
let revision = 0;
const revisionListeners = new Set<() => void>();

export function bumpRevision(): void {
  revision += 1;
  for (const listener of revisionListeners) listener();
}

export function subscribeToRevision(listener: () => void): () => void {
  revisionListeners.add(listener);
  return () => revisionListeners.delete(listener);
}

export function getRevision(): number {
  return revision;
}

/*
  A server render has no revision of its own: it reads a backend nothing can write to, so every snapshot taken there belongs to one generation. A constant of its own rather than zero, so a write in the browser cannot invalidate the values the first client render still has to match.
*/
export const HYDRATION_REVISION = -1;
