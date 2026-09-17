# @examples/expo

A React Native app demonstrating [`@platform-storage/react-native`](../../packages/react-native), built with [Expo](https://expo.dev) and Expo Router. It reads one storage over [the schema every other example uses](../schema/src/schema.ts), unchanged, and it is the second example that cannot be opened at a URL.

It runs in **Expo Go**, with no development build to make: both AsyncStorage and `@expo/ui` are bundled into it on SDK 57.

## Run it

```sh
pnpm --filter @examples/expo start     # then press i for iOS, a for Android
pnpm --filter @examples/expo ios
pnpm --filter @examples/expo android
```

iOS needs Xcode and a simulator; Android needs Android Studio and an emulator, which `a` will install Expo Go into for you. `pnpm --filter @examples/expo build` runs `expo export`, which bundles both platforms with Metro and needs neither toolchain — that is the check CI runs.

`pnpm --filter @examples/expo doctor` checks the dependency set against the SDK. It reports one duplicate copy of React, which is expected: the app is on the version SDK 57 pins and `packages/react` is on the workspace's own for its tests. The bundle Metro produces contains one.

## What is different about this one

Every other example can read synchronously. This one cannot, and that shapes all of it:

- **There is no synchronous half.** AsyncStorage only ever answers later, so the adapter exposes no `getSync` and neither does anything built on it. `useStorageValue` will not compile against this storage, and a panel says so with the errors it produces.
- **Every read has a status.** A read that has not landed is not the same answer as a key holding nothing, so each control renders a placeholder that reports which.
- **The backend is an argument, not a lookup.** The library imports no native module; the application hands it the instance. That is why there is no resolver panel here, and why the same library can be pointed at a stub that refuses everything.
- **The device holds text.** An extension area transports JSON values, so it has no encoding step to fail in. This backend transports strings, which makes it the only example that can show **deserialization** failing before validation is ever reached.

## What to look at

- **Values** — every kind of value the schema declares, each with the type its read returns. The `i` button opens the schema itself as a sheet.
- **Resilience** — bad data written behind the library's back, read under each invalid-data policy. The amber key is the one that is not JSON at all.
- **Inspector** — what the adapter calls itself, what survived the last launch, what the device is physically holding, and every failure the `onError` observer saw.

Changing **Theme** on the Values tab repaints the app, resolving `"system"` against the device. It takes a frame longer than it does in the browser demos, because a device storage cannot answer during a render.

In Expo Go, the floating dev-tools button sits over the `i` button. Turn it off with **Tools button** in the dev menu, or ignore it: no such button exists in a real build.

The restart panel is the one worth doing by hand, because it is the only claim here that needs two processes: set some values, quit the app from the app switcher, and open it again. The count it read at launch was written by the process you just killed.
