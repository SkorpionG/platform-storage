# @platform-storage/react

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

React hooks for [platform-storage](https://github.com/SkorpionG/platform-storage): read and write a schema-validated storage from a component, and render it on a server without a mismatch.

## Installation

Install this alongside the platform package you already use, rather than instead of it. Unlike the platform packages, this one does not re-export the core API: the schema, the storage and the errors keep coming from where they came from.

```sh
npm install @platform-storage/web @platform-storage/react
```

## API Usage

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

The value is read during the render, with no promise and no loading state. Writing through the writer re-renders every component reading that key, and nothing else: a write to one key does not disturb a component reading another, and a write to one storage does not disturb a component reading a different one.

`writer.remove()` deletes the stored value, so the key reads as its default again. That is a different operation from writing `undefined`, which a key with a declared default cannot express at all.

A writer takes no options of its own, because a write has none to take: `set` either stores the value or throws `StorageValidationError`, and the storage's own `onError` observer sees the failure either way. The invalid-data policy is a rule for reads, and it stays where it is declared, on the key or on the storage.

### Binding the hooks to one storage

`createStorageHooks` returns the hooks already bound, so the storage is not repeated at every call site and each key keeps its own type.

```tsx
// once, beside the schema
export const { useValue, useWriter, notifyChanged } = createStorageHooks(storage);

// anywhere: the key autocompletes, and the value is typed from it
const [theme, writer] = useValue("theme");
```

Declare it beside the schema rather than inside a component. It builds hooks; it is not one.

### Storages that only answer later

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

Branch on `status`, never on the value. `{ status: "ready", value: undefined }` means the key genuinely holds nothing, and a check like `if (!result.value)` would report that as still loading — collapsing the one distinction this library exists to keep. `STORED_VALUE_STATUS` carries the three names for anyone who prefers a constant to a string.

A write does not send the result back to `"loading"`: the value already on screen stays until the next read lands, so nothing flashes. Each writer promise settles exactly as the storage's own does, so a refused write is a rejection rather than a silent success.

`createStorageHooks` picks this half automatically for a storage that cannot answer immediately, so the same application code works on every platform.

### Writing a key without reading it

A component that writes a key it never displays should not re-render every time that value changes, so it takes the writer on its own.

```tsx
const writer = useStorageWriter(storage, "theme");
```

### When a stored value has gone bad

A value that no longer matches its schema does not throw the read. It falls back to the default, and the reason goes to the storage's `onError` observer, so a fallback is quiet unless something is listening.

```tsx
import { recordStorageError, useStorageErrors } from "@platform-storage/react";

const storage = createLocalStorage({ schema, onError: recordStorageError });

function Failures() {
  const errors = useStorageErrors();

  return (
    <ul>
      {errors.map((entry) => (
        <li key={entry.id}>{entry.error.message}</li>
      ))}
    </ul>
  );
}
```

Each entry carries the error itself rather than a copy of its fields, so `isStorageValidationError` and the rest still apply. `clearStorageErrors()` empties the log, for a control that dismisses what has been read.

#### Choosing what a bad value does

The hooks take no policy of their own. Declare it where it already belongs, on the key or on the storage, and every read through a hook obeys it:

```ts
const storage = createLocalStorage({ schema, onInvalid: "throw", onError: recordStorageError });
```

Two policies over one schema means two storages over one schema, which is a line of code and costs nothing.

A per-read policy is deliberately absent rather than forgotten: an options object written at a call site is a new object on every render, and a callback has no identity that can be compared at all, so it could not take part in the cache that keeps a snapshot still. [`ROADMAP.md`](../../ROADMAP.md) records what an answer would have to look like.

> [!IMPORTANT]
> `onInvalid: "throw"` and a hook combine into something worth knowing: the read happens during the render, so the error reaches the nearest error boundary rather than a `try`/`catch`. That is what you want in development. In production `"fallback"` with `useStorageErrors()` usually serves better, because the default is on screen and the failure is still visible.

### Changes the hooks cannot see

The writers announce their own writes. Two things happen behind them: clearing a storage, and writing straight to the backend past the library.

```ts
import { notifyStorageChanged } from "@platform-storage/react";

storage.clearSync();
notifyStorageChanged(storage);
```

`subscribeToStorage(storage, listener, key?)` is the other half, for anything that has to follow a storage as a whole rather than one key.

Cross-tab and cross-context changes are a separate matter: nothing reports them yet, on any platform. [`ROADMAP.md`](../../ROADMAP.md) tracks the change subscription that will, and these two functions are the seam it slots into.

### Server rendering

A server has no storage to read, so a component rendered there answers with what the schema alone declares. React is handed that same value for its first pass in the browser, which is what keeps the two in agreement, and swaps in the stored value the moment hydration ends.

```tsx
import { readDeclaredValue } from "@platform-storage/react/server";
```

That import path carries no `"use client"`, so a Server Component can call it without pulling the hooks into the server bundle.

> [!NOTE]
> A synchronous read does not abolish the flash under server rendering, and nothing can: no server knows what a particular browser stored. What it removes is the promise, the effect and the loading state, not the repaint.

`useHydrated()` reports `false` through the server render and the browser's first pass, and `true` from the moment hydration ends, for rendering something browser-only without causing a mismatch.

## Where it runs

Every hook here works wherever React does, including React Native. What differs is the storage behind it:

- **Web storage answers immediately**, so `useStorageValue` and `useStorageWriter` read and write during the render.
- **Extension storage areas and AsyncStorage only answer later.** Those storages have no `getSync` at all, and the synchronous hooks refuse them at compile time rather than failing at runtime.

## API

### `useStorageValue(storage, key)`

The key's value and its writer, as a tuple. Takes a `SyncPlatformStorage`, so a storage that cannot answer immediately is a compile error rather than a runtime one.

### `useStorageWriter(storage, key)`

The writer alone, for a component that writes a key it never displays and should not re-render when it changes.

### `useAsyncStorageValue(storage, key)` and `useAsyncStorageWriter(storage, key)`

The same pair over any `PlatformStorage`. The value arrives as `{ status, value, error }`, where `"ready"` with a `value` of `undefined` means the key holds nothing.

### `createStorageHooks(storage)`

`useValue`, `useWriter` and `notifyChanged`, bound to one storage. A storage that answers immediately yields the synchronous hooks; anything else yields the asynchronous ones.

### `useHydrated()`

`false` through a server render and the browser's first pass, `true` afterwards.

### `useStorageErrors()`, `recordStorageError` and `clearStorageErrors()`

`recordStorageError` is a storage's `onError`; the hook turns what it collects into React state, newest first; `clearStorageErrors` empties it.

### `notifyStorageChanged(storage, key?)` and `subscribeToStorage(storage, listener, key?)`

For a change the writers did not make, and for following a storage rather than one key. Naming no key means the whole storage, which is what clearing it is.

### `readDeclaredValue(storage, key)`

From `@platform-storage/react/server`. What the key reads as with nothing stored, which is what a server render answers with. The only export that carries no `"use client"`.

## License

MIT © SkorpionG
