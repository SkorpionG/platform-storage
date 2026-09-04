import { describe, expect, it } from "vitest";

import { EXTENSION_STORAGE_AREA } from "../types";

describe("EXTENSION_STORAGE_AREA", () => {
  it("names every area an extension can address", () => {
    expect(Object.values(EXTENSION_STORAGE_AREA)).toEqual(["local", "sync", "session"]);
  });

  it("uses the area names the browser API itself uses", () => {
    // These strings index the `storage` namespace directly, so a rename here would resolve to a bucket that does not exist.
    expect(EXTENSION_STORAGE_AREA.Local).toBe("local");
    expect(EXTENSION_STORAGE_AREA.Sync).toBe("sync");
    expect(EXTENSION_STORAGE_AREA.Session).toBe("session");
  });
});
