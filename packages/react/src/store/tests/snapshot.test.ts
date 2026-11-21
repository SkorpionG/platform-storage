import { describe, expect, it, vi } from "vitest";

import { syncStorage } from "../../../tests/fakes/storages";
import { notifyStorageChanged } from "../changes";
import { readStorageValue, readStorageValues } from "../snapshot";

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

describe("readStorageValues", () => {
  it("answers with each key, typed and defaulted as one key's read would be", () => {
    const storage = syncStorage();
    storage.setSync("user", { id: "u_1", name: "Ada" });

    expect(readStorageValues(storage, ["theme", "user", "displayName"])).toEqual({
      theme: "system",
      user: { id: "u_1", name: "Ada" },
      displayName: undefined,
    });
  });

  it("answers with the same object until one of its keys changes", () => {
    const storage = syncStorage();

    expect(readStorageValues(storage, ["recentSearches", "user"])).toBe(
      readStorageValues(storage, ["recentSearches", "user"]),
    );
  });

  it("answers with one object for the same keys however they are listed", () => {
    const storage = syncStorage();

    expect(readStorageValues(storage, ["user", "theme"])).toBe(
      readStorageValues(storage, ["theme", "user", "theme"]),
    );
  });

  it("answers again once one of its keys changes, keeping the others as they were", () => {
    const storage = syncStorage();
    const before = readStorageValues(storage, ["theme", "recentSearches"]);

    storage.setSync("theme", "dark");
    notifyStorageChanged(storage, "theme");

    const after = readStorageValues(storage, ["theme", "recentSearches"]);

    expect(after).not.toBe(before);
    expect(after.theme).toBe("dark");
    expect(after.recentSearches).toBe(before.recentSearches);
  });

  it("keeps its answer when a key outside it changes", () => {
    const storage = syncStorage();
    const before = readStorageValues(storage, ["theme", "recentSearches"]);

    notifyStorageChanged(storage, "visitCount");

    expect(readStorageValues(storage, ["theme", "recentSearches"])).toBe(before);
  });

  it("reads only the keys that moved, several of them in one call", () => {
    const storage = syncStorage();
    readStorageValues(storage, ["theme", "user", "visitCount"]);
    const many = vi.spyOn(storage, "getManySync");
    const one = vi.spyOn(storage, "getSync");

    notifyStorageChanged(storage, "theme");
    notifyStorageChanged(storage, "user");
    readStorageValues(storage, ["theme", "user", "visitCount"]);

    expect(many).toHaveBeenCalledOnce();
    expect(many).toHaveBeenCalledWith(["theme", "user"]);
    expect(one).not.toHaveBeenCalled();
  });

  it("reads a single key that moved on its own", () => {
    const storage = syncStorage();
    readStorageValues(storage, ["theme", "user"]);
    const many = vi.spyOn(storage, "getManySync");
    const one = vi.spyOn(storage, "getSync");

    notifyStorageChanged(storage, "user");
    readStorageValues(storage, ["theme", "user"]);

    expect(many).not.toHaveBeenCalled();
    expect(one).toHaveBeenCalledExactlyOnceWith("user");
  });

  it("shares each key's answer with a single key's read, so neither reads it twice", () => {
    const storage = syncStorage();
    const alone = readStorageValue(storage, "recentSearches");
    const many = vi.spyOn(storage, "getManySync");
    const one = vi.spyOn(storage, "getSync");

    const together = readStorageValues(storage, ["recentSearches"]);

    expect(together.recentSearches).toBe(alone);
    expect(many).not.toHaveBeenCalled();
    expect(one).not.toHaveBeenCalled();
    expect(readStorageValue(storage, "recentSearches")).toBe(together.recentSearches);
  });

  it("answers again for every key when the change names none", () => {
    const storage = syncStorage();
    const before = readStorageValues(storage, ["recentSearches", "theme"]);
    const many = vi.spyOn(storage, "getManySync");

    notifyStorageChanged(storage);

    expect(readStorageValues(storage, ["recentSearches", "theme"])).not.toBe(before);
    expect(many).toHaveBeenCalledWith(["recentSearches", "theme"]);
  });

  it("answers with one empty object for no keys, reading nothing", () => {
    const storage = syncStorage();
    const many = vi.spyOn(storage, "getManySync");

    expect(readStorageValues(storage, [])).toEqual({});
    expect(readStorageValues(storage, [])).toBe(readStorageValues(storage, []));
    expect(many).not.toHaveBeenCalled();
  });

  it("keeps two storages over one schema apart", () => {
    const local = syncStorage();
    const session = syncStorage();

    local.setSync("theme", "dark");
    notifyStorageChanged(local, "theme");

    expect(readStorageValues(local, ["theme"]).theme).toBe("dark");
    expect(readStorageValues(session, ["theme"]).theme).toBe("system");
  });
});
