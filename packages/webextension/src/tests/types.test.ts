import { describe, expect, it } from "vitest";

import { WEB_EXTENSION_STORAGE_AREA } from "../types";

describe("WEB_EXTENSION_STORAGE_AREA", () => {
  it("names every area an extension can address", () => {
    expect(Object.values(WEB_EXTENSION_STORAGE_AREA)).toEqual(["local", "sync", "session"]);
  });

  it("uses the area names the browser API itself uses", () => {
    // These strings index the `storage` namespace directly, so a rename here would resolve to a bucket that does not exist.
    expect(WEB_EXTENSION_STORAGE_AREA.Local).toBe("local");
    expect(WEB_EXTENSION_STORAGE_AREA.Sync).toBe("sync");
    expect(WEB_EXTENSION_STORAGE_AREA.Session).toBe("session");
  });
});
