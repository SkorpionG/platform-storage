---
"@platform-storage/core": minor
"@platform-storage/web": minor
"@platform-storage/webextension": minor
"@platform-storage/react-native": minor
---

A key can now change where it is stored without losing what it holds: `readFrom` on a key definition lists the names it used to have, and a read that finds nothing at the current name moves a value found under one of them.

`update` and `updateSync` work out a key's next value from its current one as a single step. The updater receives its own copy of the current value, so it may change it in place, and an update that fails leaves the stored value and the key's default as they were. Writes to one key through one storage now run in the order they were started, and `get` and `has` wait for writes already under way.

Adapters can list every name a backend holds through an optional `keys`, and `keysSync` on the synchronous ones. The web, extension, React Native and memory adapters all offer it, the React Native one when the instance has `getAllKeys`.

`withFallback` adapters gain `chosen()`, which says which half is in use without forcing the decision. `memoryAdapter` takes a `serializer`, so it can hold something other than text and be paired with an extension area, and copies values on the way in and out as a real backend does.

`STORAGE_OPERATION` gains `Update` and `Keys`.
