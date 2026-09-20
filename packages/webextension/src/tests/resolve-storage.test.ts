import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveWebExtensionStorage } from "../resolve-storage";
import { fakeStorageNamespace } from "../../tests/fakes/fake-web-extension-storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveWebExtensionStorage", () => {
  it("answers with nothing where no extension API exists, as in a plain page or on a server", () => {
    expect(resolveWebExtensionStorage()).toBeUndefined();
  });

  it("finds chrome.storage", () => {
    const storage = fakeStorageNamespace();
    vi.stubGlobal("chrome", { storage });

    expect(resolveWebExtensionStorage()).toBe(storage);
  });

  it("finds browser.storage", () => {
    const storage = fakeStorageNamespace();
    vi.stubGlobal("browser", { storage });

    expect(resolveWebExtensionStorage()).toBe(storage);
  });

  it("prefers browser over chrome where both exist, since browser is promise-based everywhere it exists", () => {
    const preferred = fakeStorageNamespace();
    vi.stubGlobal("browser", { storage: preferred });
    vi.stubGlobal("chrome", { storage: fakeStorageNamespace() });

    expect(resolveWebExtensionStorage()).toBe(preferred);
  });

  it("answers with nothing where the API exists but storage does not, as without the storage permission", () => {
    vi.stubGlobal("chrome", { runtime: {} });

    expect(resolveWebExtensionStorage()).toBeUndefined();
  });

  it("moves on to chrome when browser exists without storage", () => {
    const storage = fakeStorageNamespace();
    vi.stubGlobal("browser", { runtime: {} });
    vi.stubGlobal("chrome", { storage });

    expect(resolveWebExtensionStorage()).toBe(storage);
  });

  it("ignores something under the storage name that is not a namespace", () => {
    vi.stubGlobal("chrome", { storage: "not a namespace" });

    expect(resolveWebExtensionStorage()).toBeUndefined();
  });
});
