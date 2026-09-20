# Roadmap

What is deliberately out of scope for now, and the direction each item would take.

Nothing here is a commitment or a date. The list exists so that cut scope is recorded rather than remembered.

## v0.1 — the current target

Schema definition, typed keys and values, runtime validation on both directions, automatic serialization, typed errors, and the layered invalid-data policy.

The API is asynchronous, with a typed synchronous extension wherever the adapter can answer immediately. The memory adapter and `withFallback` come with it.

One package per platform, each re-exporting the core so that an application installs one: `@platform-storage/web` over `localStorage` and `sessionStorage`, `@platform-storage/extension` over the `local`, `sync` and `session` areas, and `@platform-storage/react-native` over AsyncStorage.

`@platform-storage/react` is installed alongside whichever of those a project already has. It adds hooks over any storage, plus the declared read a server render answers with.

## Why values are stored bare

What a backend holds is exactly what the schema produced, with nothing wrapped around it. A key therefore stays readable by code that never loaded this library, and nothing is spent storing a wrapper.

It also leaves room to move. Anything added later can treat an unwrapped value as the earliest version it knows, and adopt data already stored without a migration of its own. Everything below is written against that.

## Next

### Renaming the key a value is stored under

A key could name the stored names it used to have, so a read finding nothing at the current one tries them, brings the value forward and drops the old one. Lazy, so it costs nothing until that key is read, and independent of everything below it. The smallest of these items and the one most often wanted.

### Change subscription

Watching a key, over the `storage` event on the web, `storage.onChanged` in extensions, and an in-process emitter elsewhere.

It needs an optional capability on the adapter contract, because the backends genuinely differ: an extension reports changes made by other contexts, the web event fires only in _other_ tabs, and AsyncStorage reports nothing at all. Anything useful built on it will want the previous value beside the new one.

Until it lands, nothing reports a change made in another tab or another extension context, so an application only ever sees the writes it made itself.

### Batch reads and writes

Reading, writing and removing several keys at once, each keeping its own type in the result. Extension areas take batches natively, so the adapter contract would grow optional hooks with a loop everywhere else. This is where a per-operation round trip costs the most, and where `clear()` would stop being one call per key.

### Namespace prefix

A prefix on the keys a storage stores under, so one origin can hold several unrelated storages without their names colliding.

Two things it has to get right. A key needs a way out of the prefix, for addressing a name something else owns. And adopting a prefix renames everything already stored, which cannot be done silently, so it would lean on the rename above.

### Versioned keys and migrations

The largest deferred piece, and the reason several decisions look the way they do.

A key could declare the shapes it has had, and a function from each to the next, so a value written by an older release is brought forward on read instead of failing validation.

Versioning would belong to the key rather than the storage, so one schema can hold versioned and unversioned keys together. A versioned key has to record its version somewhere, and that is the one place the bare-value rule gives way — for that key alone.

What matters in the design: each step typed against the shape before it rather than against `unknown`, no way to express a missing step, a malformed chain caught where it is declared rather than when old data turns up, and validation at every step before anything is written back. The errors would extend the existing hierarchy.

### Recovering a value by hand

The escape hatch beside the above, for a key that has to stay readable by other code: a function receiving the stored value as `unknown`, returning a replacement, and having it written back. No type safety, deliberately. Close to what an `onInvalid` callback already does, except that the result would persist.

### Migrations across keys

Splitting one key into two, merging two into one, or moving a value between them. None is key-local, so it needs a pass over the whole storage rather than a lazy per-key one, and somewhere to record how far that pass has run. Later than versioned keys, and separate from them.

### Listing what a backend holds, and devtools over it

The adapter contract cannot enumerate keys, deliberately: positional enumeration is a web `Storage` idea no other backend shares. An optional capability, present only on backends that can answer, would serve the need without narrowing the contract — and would unblock a view of what is stored, against which schema, and what failed to validate.

### Per-key serializers

A serializer on the key definition, overriding the adapter's. Two motivations: storing a bare enum string so other code can read the key without this library, and lifting the requirement that a schema accept its own output as input.

A schema such as `z.string().transform(Number)` cannot be used today: `set` is typed to the value the key holds, and validation then rejects that value as input. Separating the stored form from the validated form is what would make a one-way transform work.

### Parameterized keys

A key whose stored name is computed from arguments, for a value kept per entity rather than once. It adds a parameter to the operations and a second type parameter to the key definition.

### Richer serializers

`Date`, `Map`, `Set` and `BigInt` round trips, as an opt-in serializer rather than a change to the JSON default. A backend transporting JSON values refuses such a value today rather than storing something else in its place, which is the safe answer but not an answer to the need.

### Encryption hooks

A serializer boundary is the natural seam. Needs care around key management, which is why it is not a first concern.

### Two smaller adapter gaps

`memoryAdapter` declares its wire as `string`, which is untrue when it is paired with a backend transporting JSON values; a wire type parameter would fix it without changing the default. And `withFallback` chooses a half on first use and keeps that choice, but nothing exposes which one it picked.

## React

### Suspense for the asynchronous hooks

A variant of the asynchronous value hook built on `use()`, so a component can render behind a boundary instead of branching on a status. Additive: the status-returning hook stays. It needs a cache keyed on the promise rather than the value, and a decision about what a refetch does to a boundary that has already resolved.

### Optimistic writes

A write over a slow backend shows the previous value until it lands. Publishing the new one immediately is delicate: a write validates and may normalize, so the value shown optimistically can be one the storage would never hold, and a rejected write then has to roll back to something that may itself have been superseded.

### An updater form for the writers

A writer takes a value, never a function of the previous one, so a component that only writes cannot compute the next. Over a storage that answers later the updater has to read before it writes, and two updates in flight then race; that ordering is the whole of the work.

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

### Isolated declarations

`isolatedDeclarations` would enforce explicit types on every export and unlock a faster declaration-emit path. Left off while the generic-heavy core types are still being written, since the two interact badly during design churn.
