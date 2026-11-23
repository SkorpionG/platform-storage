# Roadmap

What is deliberately out of scope, and the direction each item would take.

Nothing here is a commitment or a date. The list exists so that cut scope is recorded rather than remembered.

## Why values are stored bare

What a backend holds is exactly what the schema produced, with nothing wrapped around it. A key therefore stays readable by code that never loaded this library, and nothing is spent storing a wrapper.

A key that declares versions is the one exception, because it has to record its version somewhere. It stores `{ v, d }`, and a value with no envelope reads as its first version, which is what lets an existing key adopt versions with no migration of its own.

## Next

### A list of adapters

`createStorage` and every platform factory take one `fallback`, which covers a browser storage that has to work on a server. A list, trying each adapter in turn, would cover a third choice such as `localStorage`, then `sessionStorage`, then memory. It needs each adapter's wire type checked against the others through tuple types, an answer to which adapter was chosen that `chosen()` cannot give for more than two halves, and a rule that the storage answers immediately only when every adapter does.

### Migrating everything up front

Versioned keys migrate when they are read, so a key nothing reads stays as it was. A pass over the whole storage at startup, and a way to inspect a stored version, would serve tooling and tests. It has to define what happens when one key fails partway through.

### Migrations across keys

Splitting one key into two, merging two into one, or moving a value between them. None is key-local, so it needs a pass over the whole storage rather than a lazy per-key one, and somewhere to record how far that pass has run. Separate from versioned keys, which each see one key at a time.

### Devtools

A view of what is stored, against which schema, and what failed to validate. An adapter's optional `keys` is what it would read from.

### Per-key serializers

A serializer on the key definition, overriding the adapter's. Two motivations: storing a bare enum string so other code can read the key without this library, and lifting the requirement that a schema accept its own output as input.

A schema such as `z.string().transform(Number)` cannot be used today: `set` is typed to the value the key holds, and validation then rejects that value as input. Separating the stored form from the validated form is what would make a one-way transform work.

### Parameterized keys

A key whose stored name is computed from one or more arguments, such as a user id and a workspace id, for a value kept per entity rather than once. It adds parameters to the operations and a second type parameter to the key definition.

Much of the engine assumes a fixed list of names. `clear` removes what the schema lists, so it would have to discover instances through an adapter's optional `keys`. A change arriving from a backend names a stored key, which has to be matched back to a template and its arguments. A hook's identity has to include the arguments.

### Richer serializers

`Date`, `Map`, `Set` and `BigInt` round trips, as an opt-in serializer rather than a change to the JSON default. A backend transporting JSON values refuses such a value today rather than storing something else in its place, which is the safe answer but not an answer to the need.

### Encryption hooks

A serializer boundary is the natural seam. Needs care around key management, which is why it is not a first concern.

### A cookie backend

An adapter over `document.cookie`, for a small value that has to be shared across subdomains or reach a server. A cookie holds far less than the other backends, expires, and needs its domain and lifetime configured, so it would not simply be another `Storage`.

## React

### Suspense for the asynchronous hooks

A variant of the asynchronous value hook built on `use()`, so a component can render behind a boundary instead of branching on a status. Additive: the status-returning hook stays. It needs a cache keyed on the promise rather than the value, and a decision about what a refetch does to a boundary that has already resolved.

### Optimistic writes

A write over a slow backend shows the previous value until it lands. Publishing the new one immediately is delicate: a write validates and may normalize, so the value shown optimistically can be one the storage would never hold, and a rejected write then has to roll back to something that may itself have been superseded.

### A per-call policy through the hooks

The synchronous read takes a per-call invalid-data policy and the hooks do not.

Adding an options parameter naively would be a trap: an object written at a call site is new on every render, and a function has no identity that can be compared at all, so neither can take part in the cache that keeps a snapshot stable. An answer has to give the policy a stable identity.

Until there is one, policy belongs where it already works — on the key, or on the storage, declared outside React.

### An error log through context

`createStorageErrorLog()` builds a log of its own, and `useStorageErrors(log)` is handed it. A provider would let the hook find the nearest log instead. It would be a second way to name the same log, and a storage's `onError` is chosen when the storage is built, outside React, so the provider could never point a storage at its log: both would still have to be wired by hand.

## Tooling

### Type-aware linting

oxlint gains type-aware rules through a companion tracking the TypeScript 7 line, and this repository pins TypeScript 6. Every package already has its own `tsconfig.json`, so enabling them later is a config change.

### TypeScript 7

`latest` on npm is now the Go-native port. Revisit once the declaration-emit and typecheck tooling here is validated against it.

### Checking an inline `onInvalid` callback

A callback written inline inside `defineStorageSchema` has its return trusted rather than checked. The object is inferred and then constrained against a type derived from itself, so the callback gets no usable expectation to meet.

`defineKey(schema, options)` is the checked form and covers the case today.

### Refusing `readUnprefixed` without a prefix at compile time

The rule is checked when a storage is built. A union type would catch it while typing, but `CreateStorageOptions` would then stop being an interface a consumer can extend, or `Omit` from and spread back into `createStorage`, which breaks code built on it. Worth revisiting alongside another breaking change.

### Isolated declarations

`isolatedDeclarations` would enforce explicit types on every export and unlock a faster declaration-emit path. Left off while the generic-heavy core types are still being written, since the two interact badly during design churn.
