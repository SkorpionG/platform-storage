import { describe, expect, it } from "vitest";

import { asyncStorage, syncStorage } from "../../../tests/fakes/storages";
import { notifyStorageChanged } from "../changes";
import { readDeclaredValue } from "../declared";

describe("readDeclaredValue", () => {
  it("answers with the schema's default, whatever the storage holds", () => {
    const storage = syncStorage();
    storage.setSync("theme", "dark");

    expect(readDeclaredValue(storage, "theme")).toBe("system");
  });

  it("answers with undefined for a key that declares no default", () => {
    const storage = syncStorage();
    storage.setSync("displayName", "Ada");

    expect(readDeclaredValue(storage, "displayName")).toBeUndefined();
  });

  it("answers with a declared null, which is not the same as holding nothing", () => {
    expect(readDeclaredValue(syncStorage(), "lastDismissed")).toBeNull();
  });

  it("holds its identity, so it can be the answer a server render is matched against", () => {
    const storage = syncStorage();

    expect(readDeclaredValue(storage, "recentSearches")).toBe(
      readDeclaredValue(storage, "recentSearches"),
    );
  });

  it("is not disturbed by a write, because the first client render still has to match it", () => {
    const storage = syncStorage();
    const before = readDeclaredValue(storage, "recentSearches");

    storage.setSync("recentSearches", ["coffee"]);
    notifyStorageChanged(storage, "recentSearches");

    expect(readDeclaredValue(storage, "recentSearches")).toBe(before);
  });

  it("answers for a storage with no synchronous half, because the empty backend is memory", () => {
    expect(readDeclaredValue(asyncStorage(), "theme")).toBe("system");
  });

  it("shares one answer between storages over the same schema", () => {
    expect(readDeclaredValue(syncStorage(), "recentSearches")).toBe(
      readDeclaredValue(asyncStorage(), "recentSearches"),
    );
  });
});
