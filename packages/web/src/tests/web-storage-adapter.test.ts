import { beforeEach, describe, expect, it } from "vitest";

import { isWebStorageAvailable } from "../web-storage-adapter";
import { throwingStorage } from "../../tests/fakes/throwing-storage";

describe("isWebStorageAvailable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reports a usable storage as available", () => {
    expect(isWebStorageAvailable(() => localStorage)).toBe(true);
  });

  it("leaves no probe key behind", () => {
    isWebStorageAvailable(() => localStorage);

    expect(localStorage.length).toBe(0);
  });

  it("reports a storage whose writes throw as unavailable", () => {
    expect(isWebStorageAvailable(throwingStorage)).toBe(false);
  });

  it("reports unavailable when reaching for the storage itself throws", () => {
    expect(
      isWebStorageAvailable(() => {
        throw new Error("access denied");
      }),
    ).toBe(false);
  });
});
