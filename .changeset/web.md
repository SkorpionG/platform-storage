---
"@platform-storage/web": minor
---

Schema-first, type-safe `localStorage` and `sessionStorage`. This package re-exports the whole `@platform-storage/core` API, so an application installs one package.

- `createLocalStorage` and `createSessionStorage` build a storage over the respective backend. Web storage answers immediately, so both carry the synchronous half and a first render can read a stored value without a loading state.
- `localStorageAdapter` and `sessionStorageAdapter` are the adapters behind them, usable with `createStorage`, with `withFallback`, or anywhere else an adapter is taken. `webStorageAdapter` builds one over any object with the `Storage` shape.
- The storage is reached through a function on every operation rather than held from construction, because the access itself can fail rather than merely answer with nothing: Safari in private browsing, a sandboxed iframe, and a page whose origin the browser does not treat as a normal scheme, host and port all throw at the property access. A storage that cannot be reached is reported as `StorageUnavailableError`, and one that refuses a write as `StorageAdapterError` carrying the browser's own exception as its cause. A write refused because the origin is full is reported as `StorageQuotaExceededError`, recognized across the four shapes browsers use to say it: the standard `QuotaExceededError`, Firefox's `NS_ERROR_DOM_QUOTA_REACHED`, and the legacy codes 22 and 1014. `isQuotaExceeded` exposes that check for code reaching `localStorage` directly.
- `withFallback(localStorageAdapter(), memoryAdapter())` builds one storage that works both in a browser and where there is no `window`, so application code never branches on where it is running.
- `isWebStorageAvailable` reports whether a storage can actually be written to, by writing and removing a probe key, because presence is not availability.
- Runs anywhere the Web Storage API does, which includes an Electron renderer process. The Electron main process has no `window` and needs a different adapter.
