# @platform-storage/react-native

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The React Native half of [platform-storage](https://github.com/SkorpionG/platform-storage).

> This package is not published to npm.

## Installation

```sh
npm install @platform-storage/react-native
```

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need from this project. Add a [Standard Schema](https://standardschema.dev) validation library such as Zod alongside it.

## What it adds

### `AsyncStorageLike`

The part of AsyncStorage this project uses, declared structurally: `getItem`, `setItem` and `removeItem`.

Declaring it rather than importing it is what keeps this package free of a native module, so it stays loadable under a test runner or on a server. It also means any compatible storage an application already holds can be used in its place.

```ts
import type { AsyncStorageLike } from "@platform-storage/react-native";
```

## License

MIT © SkorpionG
