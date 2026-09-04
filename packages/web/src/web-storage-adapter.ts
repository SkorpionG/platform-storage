/**
 * Reports whether a web storage object can actually be written to.
 *
 * The check writes and removes a probe key, because presence is not availability: Safari in private browsing and a sandboxed iframe both expose a `Storage` object whose `setItem` throws. Accessing `window.localStorage` can throw on its own for the same reason, which is why the storage arrives as a function to call inside the guard rather than as a value.
 */
export function isWebStorageAvailable(getStorage: () => Storage): boolean {
  const probeKey = "__platform_storage_probe__";

  try {
    const storage = getStorage();

    storage.setItem(probeKey, probeKey);
    storage.removeItem(probeKey);

    return true;
  } catch {
    return false;
  }
}
