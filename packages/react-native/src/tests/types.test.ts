import { describe, expect, it } from "vitest";

import { fakeAsyncStorage } from "../../tests/fakes/fake-async-storage";

describe("AsyncStorageLike", () => {
  it("is satisfied by a plain in-memory object, so no native module is needed", async () => {
    const storage = fakeAsyncStorage();

    await storage.setItem("theme", "dark");

    expect(await storage.getItem("theme")).toBe("dark");
  });

  it("reports a missing key as null, the value the real AsyncStorage returns", async () => {
    const storage = fakeAsyncStorage();

    expect(await storage.getItem("absent")).toBeNull();
  });
});
