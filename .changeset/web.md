---
"@platform-storage/web": minor
---

Schema-first, type-safe `localStorage` and `sessionStorage`. This package re-exports the whole `@platform-storage/core` API, so an application installs one package.

- `createLocalStorage` and `createSessionStorage` build a storage over the respective backend.
- Web storage answers immediately, so both carry the synchronous half: a first render can read a stored value with no loading state.
- `localStorageAdapter` and `sessionStorageAdapter` are the adapters behind them. `webStorageAdapter` builds one over anything with the `Storage` shape.
- The storage is reached through a function on every operation rather than held from construction, because the access itself can throw: Safari in private browsing, a sandboxed iframe, and a page on an unusual origin all fail at the property access.
- A storage that cannot be reached is reported as `StorageUnavailableError`, and one that refuses a write as `StorageAdapterError` carrying the browser's own exception as its cause.
- A write refused because the origin is full is reported as `StorageQuotaExceededError`, recognized across the four shapes browsers use: the standard `QuotaExceededError` that current browsers raise, the `NS_ERROR_DOM_QUOTA_REACHED` older Firefox raised, and the legacy codes 22 and 1014.
- `isQuotaExceeded` exposes that check for code reaching `localStorage` directly.
- `withFallback(localStorageAdapter(), memoryAdapter())` builds one storage that works both in a browser and where there is no `window`, so application code never branches on where it is running.
- `isWebStorageAvailable` reports whether a storage can actually be written to, by writing and removing a probe key, because presence is not availability.
- Runs anywhere the Web Storage API does, which includes an Electron renderer process. The Electron main process has no `window` and needs a different adapter.
