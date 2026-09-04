# @platform-storage/web

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The browser half of [platform-storage](https://github.com/SkorpionG/platform-storage).

> This package is not published to npm.

## Installation

```sh
npm install @platform-storage/web
```

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need. Add a [Standard Schema](https://standardschema.dev) validation library such as Zod alongside it.

## What it adds

### `isWebStorageAvailable(getStorage: () => Storage): boolean`

Reports whether a web storage object can actually be written to, by writing and removing a probe key.

Presence is not availability: Safari in private browsing and a sandboxed iframe both expose a `Storage` whose `setItem` throws. Reaching for `window.localStorage` can throw on its own for the same reason, which is why the storage arrives as a function to call inside the guard rather than as a value.

```ts
import { isWebStorageAvailable } from "@platform-storage/web";

if (isWebStorageAvailable(() => window.localStorage)) {
  // Safe to write.
}
```

## License

MIT © SkorpionG
