import { describe, expect, it } from "vitest";

import { syncStorage } from "../../../tests/fakes/storages";
import { notifyStorageChanged } from "../changes";
import { readStorageValue } from "../snapshot";

describe("readStorageValue", () => {
  it("answers with the same reference until something writes", () => {
    const storage = syncStorage();

    /* A factory default answers with a new array on every read, so an uncached snapshot would never settle. */
    expect(readStorageValue(storage, "recentSearches")).toBe(
      readStorageValue(storage, "recentSearches"),
    );
  });

  it("holds its identity for a value parsed out of the backend too", () => {
    const storage = syncStorage();
    storage.setSync("user", { id: "u_1", name: "Ada" });

    expect(readStorageValue(storage, "user")).toBe(readStorageValue(storage, "user"));
  });

  it("answers again once the key has changed", () => {
    const storage = syncStorage();
    const before = readStorageValue(storage, "recentSearches");

    notifyStorageChanged(storage, "recentSearches");

    expect(readStorageValue(storage, "recentSearches")).not.toBe(before);
  });

  it("reads the value that was written", () => {
    const storage = syncStorage();
    storage.setSync("theme", "dark");
    notifyStorageChanged(storage, "theme");

    expect(readStorageValue(storage, "theme")).toBe("dark");
  });

  it("keeps a key's answer when another key changes", () => {
    const storage = syncStorage();
    const before = readStorageValue(storage, "recentSearches");

    notifyStorageChanged(storage, "theme");

    expect(readStorageValue(storage, "recentSearches")).toBe(before);
  });

  it("answers again for every key when the change names none", () => {
    const storage = syncStorage();
    const before = readStorageValue(storage, "recentSearches");

    notifyStorageChanged(storage);

    expect(readStorageValue(storage, "recentSearches")).not.toBe(before);
  });

  it("keeps two storages over one schema apart", () => {
    const local = syncStorage();
    const session = syncStorage();

    local.setSync("theme", "dark");
    notifyStorageChanged(local, "theme");

    expect(readStorageValue(local, "theme")).toBe("dark");
    expect(readStorageValue(session, "theme")).toBe("system");
  });
});
