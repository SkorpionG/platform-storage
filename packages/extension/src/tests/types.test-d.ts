import { describe, expectTypeOf, it } from "vitest";
import type { Storage as PolyfillStorage } from "webextension-polyfill";

import { jsonSerializer } from "../index";
import type { ExtensionStorageArea, ExtensionStorageAreaName, Serializer } from "../index";

/*
  The point of this file: `src` declares the storage-area shape structurally so no browser type package reaches a consumer's type graph. That only stays honest if the declaration still matches every real API, which is what the conformance assertions below check.

  Written as a conditional type rather than `toExtend`, so the direction of the assignability check is unambiguous: the real area must satisfy our interface, never the reverse.
*/
type Conforms<Area> = Area extends ExtensionStorageArea ? true : false;

describe("ExtensionStorageArea", () => {
  it("is satisfied by Chrome's Manifest V3 storage areas", () => {
    expectTypeOf<Conforms<typeof chrome.storage.local>>().toEqualTypeOf<true>();
    expectTypeOf<Conforms<typeof chrome.storage.sync>>().toEqualTypeOf<true>();
    expectTypeOf<Conforms<typeof chrome.storage.session>>().toEqualTypeOf<true>();
  });

  it("is satisfied by the `browser` global Firefox exposes", () => {
    expectTypeOf<Conforms<typeof browser.storage.local>>().toEqualTypeOf<true>();
    expectTypeOf<Conforms<typeof browser.storage.sync>>().toEqualTypeOf<true>();
  });

  it("is satisfied by the WebExtension polyfill many cross-browser apps use", () => {
    expectTypeOf<Conforms<PolyfillStorage.StorageArea>>().toEqualTypeOf<true>();
  });

  it("names the areas as a union of literals, not a bare string", () => {
    expectTypeOf<ExtensionStorageAreaName>().toEqualTypeOf<"local" | "sync" | "session">();
  });
});

describe("@platform-storage/extension entry point", () => {
  it("re-exports the core API, so an app installs one package", () => {
    expectTypeOf(jsonSerializer).toEqualTypeOf<Serializer<string>>();
  });
});
