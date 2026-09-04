# @platform-storage/extension

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The browser extension half of [platform-storage](https://github.com/SkorpionG/platform-storage).

> This package is not published to npm.

## Installation

```sh
npm install @platform-storage/extension
```

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need. Add a [Standard Schema](https://standardschema.dev) validation library such as Zod alongside it.

## What it adds

### `EXTENSION_STORAGE_AREA`

The areas an extension can address, as an object of literals: `Local`, `Sync` and `Session`. `ExtensionStorageAreaName` is the union of their values.

### `ExtensionStorageArea` and `ExtensionStorageNamespace`

The part of the promise-based WebExtension storage API this project uses, declared structurally so no browser type package reaches a consumer's type graph. `session` is optional on the namespace, because Manifest V2 and older browser versions do not have it.

The declaration is the common denominator of Chrome's, Firefox's and the WebExtension polyfill's own types, and conformance tests check it against all three. If one of those tests starts failing, the declaration has drifted from a real API and needs widening to cover all of them rather than narrowing to one.

## License

MIT © SkorpionG
