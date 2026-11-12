# Roadmap

What is deliberately out of scope, and the direction each item would take.

Nothing here is a commitment or a date. The list exists so that cut scope is recorded rather than remembered.

## Why values are stored bare

What a backend holds is exactly what the schema produced, with nothing wrapped around it. A key therefore stays readable by code that never loaded this library, and nothing is spent storing a wrapper.

A key that declares versions is the one exception, because it has to record its version somewhere. It stores `{ v, d }`, and a value with no envelope reads as its first version, which is what lets an existing key adopt versions with no migration of its own.

## Next

### A fallback without leaving the platform factories

A platform factory such as `createLocalStorage` cannot take a fallback, so working where the backend is missing means dropping down to `createStorage` and `withFallback`. Accepting a list of adapters would shorten that call without reaching the factories. A list also needs its wire types checked against each other, and `withFallback` can only say which of two halves it chose.

### An adapter's own `clear`

`clear("everything")` lists the backend and then removes what it found, so a name written between the two survives, and a backend without a batch call removes each name in turn. An optional `clear` on the adapter would let it be one native call with nothing missed: `localStorage.clear()`, an area's `clear()`, AsyncStorage's `clear()`. It widens the adapter contract, `withFallback` would have to forward it, and the storage would still have to work out which declared keys to announce.

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

### Several keys through one hook

A hook reading several keys at once, the way `getMany` does. A snapshot has to keep its identity until one of its keys changes, which for several keys means tracking a generation per key and building the answer again only when one of them moves.

### Suspense for the asynchronous hooks

A variant of the asynchronous value hook built on `use()`, so a component can render behind a boundary instead of branching on a status. Additive: the status-returning hook stays. It needs a cache keyed on the promise rather than the value, and a decision about what a refetch does to a boundary that has already resolved.

### Optimistic writes

A write over a slow backend shows the previous value until it lands. Publishing the new one immediately is delicate: a write validates and may normalize, so the value shown optimistically can be one the storage would never hold, and a rejected write then has to roll back to something that may itself have been superseded.

### A per-call policy through the hooks

The synchronous read takes a per-call invalid-data policy and the hooks do not.

Adding an options parameter naively would be a trap: an object written at a call site is new on every render, and a function has no identity that can be compared at all, so neither can take part in the cache that keeps a snapshot stable. An answer has to give the policy a stable identity.

Until there is one, policy belongs where it already works — on the key, or on the storage, declared outside React.

### A per-request error log

The error observer collects into one log for the process, which is right in a browser and wrong on a server, where every in-flight request would share it. Harmless only because nothing reads that log during a server render, and a leak between requests the moment something does.

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
