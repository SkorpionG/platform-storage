import { describe, expect, it } from "vitest";

import { requireBackend, STORAGE_ERROR_CODE, StorageUnavailableError } from "../../index";

const context = { adapter: "test", operation: "get", physicalKey: "theme" } as const;

describe("requireBackend", () => {
  it("answers with the handle when the backend is there", () => {
    const handle = { name: "backend" };

    expect(requireBackend(() => handle, context)).toBe(handle);
  });

  it("resolves on every call rather than keeping the first answer", () => {
    let calls = 0;

    const source = (): number => {
      calls += 1;
      return calls;
    };

    expect(requireBackend(source, context)).toBe(1);
    expect(requireBackend(source, context)).toBe(2);
  });

  it("reports a backend that cannot be reached, keeping what went wrong as the cause", () => {
    const cause = new Error("access denied");
    const reach = (): never => {
      throw cause;
    };

    expect(() => requireBackend(reach, context)).toThrow(StorageUnavailableError);
    expect(() => requireBackend(reach, context)).toThrow(expect.objectContaining({ cause }));
  });

  it("treats a backend that answers with nothing as one that is not there", () => {
    expect(() => requireBackend(() => undefined, context)).toThrow(StorageUnavailableError);
    expect(() => requireBackend(() => null, context)).toThrow(StorageUnavailableError);
  });

  it("names the adapter, the operation and the key, so the report says where it happened", () => {
    expect(() => requireBackend(() => undefined, context)).toThrow(
      expect.objectContaining({
        code: STORAGE_ERROR_CODE.Unavailable,
        adapter: "test",
        operation: "get",
        physicalKey: "theme",
      }),
    );
  });

  it("takes a context with no key, for an operation that addresses none", () => {
    expect(() => requireBackend(() => undefined, { adapter: "test", operation: "clear" })).toThrow(
      expect.objectContaining({ physicalKey: undefined }),
    );
  });

  it("keeps a value the backend legitimately holds, rather than reading it as absence", () => {
    expect(requireBackend(() => 0, context)).toBe(0);
    expect(requireBackend(() => "", context)).toBe("");
    expect(requireBackend(() => false, context)).toBe(false);
  });
});
