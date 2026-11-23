# @platform-storage/react

[![npm version](https://img.shields.io/npm/v/@platform-storage%2Freact.svg)](https://www.npmjs.com/package/@platform-storage/react) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

React hooks for [platform-storage](https://github.com/SkorpionG/platform-storage): read and write a schema-validated storage from a component, and render it on a server without a mismatch.

## Installation

Install this alongside the platform package you already use, rather than instead of it. Unlike the platform packages, this one does not re-export the core API: the schema, the storage and the errors keep coming from where they came from.

```sh
# Install with npm
npm install @platform-storage/web @platform-storage/react

# Install with pnpm
pnpm add @platform-storage/web @platform-storage/react

# Install with Yarn
yarn add @platform-storage/web @platform-storage/react

# Install with Bun
bun add @platform-storage/web @platform-storage/react
```

Swap `@platform-storage/web` for `@platform-storage/webextension` or `@platform-storage/react-native` as your platform requires. React 18 or newer is a peer dependency.

## Quick Start

```tsx
import * as z from "zod";
import { createLocalStorage, defineStorageSchema } from "@platform-storage/web";
import { useStorageValue } from "@platform-storage/react";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
});

const storage = createLocalStorage({ schema });

function ThemeToggle() {
  const [theme, writer] = useStorageValue(storage, "theme");

  return <button onClick={() => writer.set(theme === "dark" ? "light" : "dark")}>{theme}</button>;
}
```

The value is read during the render, with no promise and no loading state. Writing through the writer re-renders every component reading that key, and nothing else.

## API Usage

### `useStorageValue(storage, key)`

The key's value and its writer, read during the render.

**Parameters:**

- `storage: SyncPlatformStorage` — a storage whose backend answers immediately. A storage that cannot is a compile error rather than a runtime one.
- `key: KeyOf<Definition>` — one of the keys the schema declares.

**Returns:** `[value, writer]`, where `value` is typed from the key — with `undefined` dropped when the key declares a default — and `writer` is `{ set, update, remove }`.

```tsx
const [theme, writer] = useStorageValue(storage, "theme"); // "light" | "dark"
```

A [versioned key](https://github.com/SkorpionG/platform-storage/tree/main/packages/core#versioned-keys) is migrated and saved by the read during the render. Saving announces nothing, so it causes no extra render.

### `useStorageWriter(storage, key)`

The writer alone, for a component that writes a key it never displays and should not re-render when it changes.

**Parameters:** as above.

**Returns:** `SyncStorageWriter<Definition[Key]>`:

- `set(value): void` — validates and writes, then tells every hook reading that key. Throws `StorageValidationError` and announces nothing if the schema refuses the value.
- `update(updater): void` — works out the next value from the current one and stores it, as one step. `updater` receives its own copy, so it may change it in place.
- `remove(): void` — deletes the stored value, so the key reads as its default again. A different operation from writing `undefined`, which a key with a declared default cannot express at all.

A writer takes no options of its own, because a write has none to take. The invalid-data policy is a rule for reads, and it stays where it is declared.

### `useStorageValues(storage, keys)`

Several keys through one hook, read during the render, and a writer for them.

**Parameters:**

- `storage: SyncPlatformStorage` — a storage whose backend answers immediately.
- `keys: ReadonlyArray<KeyOf<Definition>>` — which keys to read, as a literal list, since the answer is typed from it. A key listed twice is read once.

**Returns:** `[values, writer]`, where `values` is an object keyed by the keys asked for, each typed as `useStorageValue` would type it, and `writer` is `SyncStorageValuesWriter`:

- `set(values): void` — writes any of the hook's keys in one call, as the storage's `setMany` does. Every value is validated before any is written, so one refusal throws `StorageValidationError`, writes nothing and announces nothing. A key set to `undefined` is removed.
- `remove(keys?): void` — removes the keys given, or every key the hook reads when given none.

```tsx
const [{ theme, user }, writer] = useStorageValues(storage, ["theme", "user"]);

<button onClick={() => writer.remove()}>Sign out</button>;
```

The object keeps its identity until one of its keys changes, and a change to any other key re-renders nothing. Only the keys that changed are read again, each once, and a key another hook also shows is read once for both. Keys that moved together before anything read them, such as after a change naming no key, are read in one call where the backend has a batch call. The list may be written inline: a new array on every render neither resubscribes nor rebuilds the answer. On a server, `values` is what the schema declares for each key, as [`readDeclaredValues`](#readdeclaredvaluestorage-key-and-readdeclaredvaluesstorage-keys) answers.

A list typed more widely than what it holds, such as an `Array` of every key, claims keys the answer will not have, as with core's `getMany`.

### `useAsyncStorageValue(storage, key)`

The same pair over any storage, including one that only answers later.

**Parameters:**

- `storage: PlatformStorage` — any storage, synchronous backend or not.
- `key: KeyOf<Definition>`

**Returns:** `[result, writer]`, where `result` is a discriminated union on `status`:

| `status`    | `value`         | `error`                |
| ----------- | --------------- | ---------------------- |
| `"loading"` | `undefined`     | `undefined`            |
| `"ready"`   | the key's value | `undefined`            |
| `"failed"`  | `undefined`     | `PlatformStorageError` |

Branch on `status`, never on the value. `{ status: "ready", value: undefined }` means the key genuinely holds nothing, and a check like `if (!result.value)` would report that as still loading — collapsing the one distinction this library exists to keep. `STORED_VALUE_STATUS` carries the three names for anyone who prefers a constant to a string.

A write does not send the result back to `"loading"`: the value already on screen stays until the next read lands, so nothing flashes.

### `useAsyncStorageWriter(storage, key)`

The asynchronous writer alone.

**Returns:** `AsyncStorageWriter<Definition[Key]>` — `set(value): Promise<void>`, `update(updater): Promise<void>` and `remove(): Promise<void>`. Each promise settles exactly as the storage's own does, so a refused write is a rejection rather than a silent success, and nothing is announced when one fails.

### `useAsyncStorageValues(storage, keys)`

The same over any storage, including one that only answers later, with every key read in one backend call. That is what an extension's rate-limited `sync` area and AsyncStorage's native bridge want.

**Parameters:**

- `storage: PlatformStorage` — any storage, synchronous backend or not.
- `keys: ReadonlyArray<KeyOf<Definition>>` — which keys to read, as a literal list. A key listed twice is read once.

**Returns:** `[result, writer]`. `result` has one status for the whole read, since one call lands or fails as a whole:

| `status`    | `values`                 | `error`                |
| ----------- | ------------------------ | ---------------------- |
| `"loading"` | `undefined`              | `undefined`            |
| `"ready"`   | every key, as one object | `undefined`            |
| `"failed"`  | `undefined`              | `PlatformStorageError` |

`writer` is `AsyncStorageValuesWriter`: `set(values): Promise<void>` and `remove(keys?): Promise<void>`, each settling exactly as the storage's `setMany` and `removeMany` do.

```tsx
const [result, writer] = useAsyncStorageValues(storage, ["theme", "user"]);

if (result.status === "loading") return <Spinner />;
if (result.status === "failed") return <Problem error={result.error} />;

return <button onClick={() => void writer.remove()}>{result.values.theme}</button>;
```

A change to any of the keys reads them all again in one call, and changes arriving together, such as a `clear()` naming every key, are read once. A change landing while a read is under way starts a read of its own, and the answer it overtook is never shown, so a backend call that never settles cannot hold the keys back. As with `useAsyncStorageValue`, a write does not send the result back to `"loading"`.

### `createStorageHooks(storage)`

The hooks bound to one storage, so it is not repeated at every call site and each key keeps its own type.

**Parameters:** `storage: PlatformStorage | SyncPlatformStorage`

**Returns:** `{ useValue, useValues, useWriter, notifyChanged }`. A storage that answers immediately yields the synchronous hooks; anything else yields the asynchronous ones, so the same application code works on every platform. `useValues(keys)` is `useStorageValues` or `useAsyncStorageValues` bound to the storage.

Declare it beside the schema rather than inside a component. It builds hooks; it is not one.

```tsx
export const { useValue, useValues, useWriter, notifyChanged } = createStorageHooks(storage);

const [theme, writer] = useValue("theme");
const [{ user }] = useValues(["theme", "user"]);
```

### `useHydrated()`

**Returns:** `boolean` — `false` through a server render and the browser's first pass, `true` from the moment hydration ends. For rendering something browser-only without causing a mismatch.

### `useStorageErrors(log?)`

**Parameters:**

- `log?: StorageErrorLog` — the log to read, from `createStorageErrorLog()` and built once outside any component. Defaults to the shared log `recordStorageError` collects into.

**Returns:** `ReadonlyArray<StorageErrorEntry>`, newest first. Each entry is `{ id, error, at, count }`, carrying the error itself rather than a copy of its fields, so `isStorageValidationError` and the rest still apply. Identical repeats collapse into `count`. Empty on a server whichever log it reads, since the browser's first pass has to print the same.

### `recordStorageError(error)` and `clearStorageErrors()`

The shared log, one per process. `recordStorageError` is what you pass as a storage's `onError`; `clearStorageErrors` empties it, for a control that dismisses what has been read.

### `createStorageErrorLog()`

A log of its own, for storages whose failures should be kept apart from every other storage's. Exported from `@platform-storage/react` and from `@platform-storage/react/server`, so a Server Component can call it.

**Returns:** `StorageErrorLog`:

- `record(error)` — the observer to hand to a storage's `onError`.
- `entries()` — every failure collected so far, newest first, as the same array until something changes.
- `clear()` — empties it.
- `subscribe(listener)` — calls `listener` whenever it changes, and returns a function that stops.

|                   | The shared log                           | A log of its own                         |
| ----------------- | ---------------------------------------- | ---------------------------------------- |
| Who reports to it | every storage given `recordStorageError` | only the storages given its `record`     |
| Lifetime          | the whole process                        | whatever holds it: one request, one part |
| Read by           | `useStorageErrors()`                     | `useStorageErrors(log)` or `entries()`   |
| Emptied by        | `clearStorageErrors()`                   | `clear()`                                |

A failure is published at once while nothing is listening, which is always the case on a server, so `entries()` answers the moment a read has failed. While something listens, it waits for the end of the turn, because a failure arriving during a render must not move another component's state in the middle of it.

### `notifyStorageChanged(storage, key?)` and `subscribeToStorage(storage, listener, key?)`

For a write made past the library, and for following a storage rather than one key.

**Parameters:** naming no `key` means the whole storage, which is what clearing it is.

**Returns:** `subscribeToStorage` returns an unsubscribe function.

### `readDeclaredValue(storage, key)` and `readDeclaredValues(storage, keys)`

From the `@platform-storage/react/server` subpath. What a key reads as with nothing stored, which is what a server render answers with, and the same for several keys as one object, which is what `useStorageValues` renders on a server. Like everything on that subpath, they carry no `"use client"`, so a Server Component can call them without pulling the hooks into the server bundle.

```tsx
const { theme, user } = readDeclaredValues(storage, ["theme", "user"]);
```

## Examples

### A storage that only answers later

An extension storage area and AsyncStorage have no synchronous half at all, so a read has to say where it has got to.

```tsx
import { useAsyncStorageValue } from "@platform-storage/react";

function Theme() {
  const [result, writer] = useAsyncStorageValue(storage, "theme");

  if (result.status === "loading") return <Spinner />;
  if (result.status === "failed") return <Problem error={result.error} />;

  return <button onClick={() => void writer.set("dark")}>{result.value}</button>;
}
```

### Showing what went wrong

A value that no longer matches its schema does not throw the read. It falls back to the default, and the reason goes to the storage's `onError` observer, so a fallback is quiet unless something is listening.

```tsx
import { recordStorageError, useStorageErrors } from "@platform-storage/react";

const storage = createLocalStorage({ schema, onError: recordStorageError });

function Failures() {
  const errors = useStorageErrors();

  return (
    <ul>
      {errors.map((entry) => (
        <li key={entry.id}>
          {entry.error.code} · {entry.error.message}
        </li>
      ))}
    </ul>
  );
}
```

A part of an application can keep a log of its own, apart from the shared one. Build it once, beside its storage, never inside a component, since the hook subscribes through it:

```tsx
import { createStorageErrorLog, useStorageErrors } from "@platform-storage/react";

const settingsLog = createStorageErrorLog();
const settings = createLocalStorage({ schema, onError: settingsLog.record });

function SettingsFailures() {
  const errors = useStorageErrors(settingsLog); // only what `settings` reported

  return <p>{errors.length} settings could not be read</p>;
}
```

### Choosing what a bad value does

The hooks take no policy of their own. Declare it where it already belongs, on the key or on the storage, and every read through a hook obeys it:

```ts
const storage = createLocalStorage({ schema, onInvalid: "throw", onError: recordStorageError });
```

Two policies over one schema means two storages over one schema, which is a line of code and costs nothing.

A per-read policy is deliberately absent rather than forgotten. An options object written at a call site is a new object on every render, and a callback has no identity that can be compared at all, so neither could take part in the cache that keeps a snapshot still. [`ROADMAP.md`](../../ROADMAP.md) records what an answer would have to look like.

> [!IMPORTANT]
> `onInvalid: "throw"` and a hook combine into something worth knowing: the read happens during the render, so the error reaches the nearest error boundary rather than a `try`/`catch`. That is what you want in development. In production `"fallback"` with `useStorageErrors()` usually serves better, because the default is on screen and the failure is still visible.

### Announcing a change the library cannot see

While any hook or listener is mounted, every change made through the storage reaches it by itself, and so does every change from another tab or extension context. One thing still needs announcing: a write straight to the backend past the library.

```ts
import { notifyStorageChanged } from "@platform-storage/react";

storage.clearSync();
notifyStorageChanged(storage);
```

`subscribeToStorage(storage, listener, key?)` is the other half, for anything that has to follow a storage as a whole rather than one key.

The storage connects to its backend's change feed when the first listener mounts and disconnects after the last, and hooks read again when one mounts after such a gap. AsyncStorage has no feed, so a React Native app hears writes made through the same storage only.

### Server rendering

A server has no storage to read, so a component rendered there answers with what the schema alone declares. React is handed that same value for its first pass in the browser, which is what keeps the two in agreement, and swaps in the stored value the moment hydration ends.

```tsx
import { readDeclaredValue } from "@platform-storage/react/server";

export default function Page() {
  const theme = readDeclaredValue(storage, "theme"); // "light", whatever a browser holds

  return <Shell initialTheme={theme} />;
}
```

> [!NOTE]
> A synchronous read does not abolish the flash under server rendering, and nothing can: no server knows what a particular browser stored. What it removes is the promise, the effect and the loading state, not the repaint.

`useHydrated()` is the escape hatch for anything that must not render until the browser has taken over.

### Keeping one request's failures apart

On a server, the shared log is one list for every request the process handles. A request that builds a storage of its own builds a log beside it, and reads that request's failures alone:

```tsx
import { createStorageErrorLog } from "@platform-storage/react/server";

export default function Page() {
  const log = createStorageErrorLog();
  const storage = createLocalStorage({ schema, fallback: "memory", onError: log.record });

  const theme = storage.getSync("theme");
  reportFailures(log.entries()); // this request's, and nobody else's

  return <Shell initialTheme={theme} />;
}
```

## Where it runs

Every hook here works wherever React does, including React Native. What differs is the storage behind it:

- **Web storage answers immediately**, so `useStorageValue`, `useStorageValues` and `useStorageWriter` read and write during the render.
- **Extension storage areas and AsyncStorage only answer later.** Those storages have no `getSync` at all, and the synchronous hooks refuse them at compile time rather than failing at runtime.

## License

MIT © SkorpionG
