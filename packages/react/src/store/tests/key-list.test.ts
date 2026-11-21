import { describe, expect, it } from "vitest";

import { signatureOf, uniqueKeys } from "../key-list";

describe("uniqueKeys", () => {
  it("keeps each key once, in one order whatever order it was given in", () => {
    expect(uniqueKeys(["user", "theme", "user"])).toEqual(["theme", "user"]);
    expect(uniqueKeys(["theme", "user"])).toEqual(uniqueKeys(["user", "theme"]));
  });

  it("answers with a fresh array, leaving the one it was given alone", () => {
    const given = ["user", "theme"];

    uniqueKeys(given);

    expect(given).toEqual(["user", "theme"]);
  });

  it("answers with nothing for nothing", () => {
    expect(uniqueKeys([])).toEqual([]);
  });
});

describe("signatureOf", () => {
  it("is the same for two lists naming the same keys, so an inline list hits the cache", () => {
    expect(signatureOf(["theme", "user"])).toBe(signatureOf(["user", "theme", "theme"]));
  });

  it("differs for lists naming different keys", () => {
    expect(signatureOf(["theme"])).not.toBe(signatureOf(["theme", "user"]));
  });

  /* Joined with a separator, `a,b` alone and `a` beside `b` would collide. */
  it("keeps a key holding the separator apart from two keys", () => {
    expect(signatureOf(["a,b"])).not.toBe(signatureOf(["a", "b"]));
  });
});
