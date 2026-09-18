import { describe, expectTypeOf, it } from "vitest";

import { asyncStorage, syncStorage } from "../../../tests/fakes/storages";
import type { StorageErrorEntry } from "../../types/hooks";
import { useAsyncStorageValue, useAsyncStorageWriter } from "../use-async-storage-value";

/*
  Every assertion sits inside a component, because a hook called anywhere else is not a hook. Nothing here runs: a `test-d` file is typechecked and never executed.
*/
const storage = asyncStorage();
const withSyncHalf = syncStorage();

describe("useAsyncStorageValue", () => {
  it("reports a status beside the value, rather than a value alone", () => {
    function Probe() {
      const [result] = useAsyncStorageValue(storage, "theme");

      expectTypeOf(result.status).toEqualTypeOf<"loading" | "ready" | "failed">();

      return null;
    }

    void Probe;
  });

  /*
    The distinction this shape exists to keep: a value is reachable only through `"ready"`, so a key holding nothing cannot be mistaken for a read that has not landed.
  */
  it("hides the value behind the status", () => {
    function Probe() {
      const [result] = useAsyncStorageValue(storage, "displayName");

      if (result.status === "loading") expectTypeOf(result.value).toEqualTypeOf<undefined>();
      if (result.status === "failed") expectTypeOf(result.value).toEqualTypeOf<undefined>();
      if (result.status === "ready") {
        expectTypeOf(result.value).toEqualTypeOf<string | undefined>();
        expectTypeOf(result.error).toEqualTypeOf<undefined>();
      }

      return null;
    }

    void Probe;
  });

  it("drops undefined from a ready read of a key that declares a default", () => {
    function Probe() {
      const [result] = useAsyncStorageValue(storage, "theme");

      if (result.status === "ready") {
        expectTypeOf(result.value).toEqualTypeOf<"light" | "dark" | "system">();
      }

      return null;
    }

    void Probe;
  });

  it("keeps null and undefined apart, because a stored null is a value", () => {
    function Probe() {
      const [result] = useAsyncStorageValue(storage, "lastDismissed");

      if (result.status === "ready") expectTypeOf(result.value).toEqualTypeOf<string | null>();

      return null;
    }

    void Probe;
  });

  it("carries one of this library's errors when a read fails", () => {
    function Probe() {
      const [result] = useAsyncStorageValue(storage, "theme");

      if (result.status === "failed") {
        expectTypeOf(result.error.code).toExtend<StorageErrorEntry["error"]["code"]>();
      }

      return null;
    }

    void Probe;
  });

  /* Unlike the synchronous hook, this one takes any storage, which is what lets one component serve every platform. */
  it("accepts a storage that could have answered immediately", () => {
    function Probe() {
      const [result] = useAsyncStorageValue(withSyncHalf, "theme");

      expectTypeOf(result.status).toEqualTypeOf<"loading" | "ready" | "failed">();

      return null;
    }

    void Probe;
  });

  it("refuses a key the schema does not declare", () => {
    function Probe() {
      // @ts-expect-error - "nope" is not one of the keys the schema declares.
      useAsyncStorageValue(storage, "nope");

      return null;
    }

    void Probe;
  });
});

describe("useAsyncStorageWriter", () => {
  it("answers with promises, because the storage only ever settles later", () => {
    function Probe() {
      const writer = useAsyncStorageWriter(storage, "theme");

      expectTypeOf(writer.set("dark")).toEqualTypeOf<Promise<void>>();
      expectTypeOf(writer.remove()).toEqualTypeOf<Promise<void>>();

      return null;
    }

    void Probe;
  });

  it("takes only what the key can hold", () => {
    function Probe() {
      const writer = useAsyncStorageWriter(storage, "theme");

      void writer.set("dark");
      // @ts-expect-error - "solarized" is a string, but not one of the three the enum allows.
      void writer.set("solarized");

      return null;
    }

    void Probe;
  });

  it("takes undefined only where the schema produces it", () => {
    function Probe() {
      void useAsyncStorageWriter(storage, "nickname").set(undefined);
      // @ts-expect-error - this key's schema never produces undefined.
      void useAsyncStorageWriter(storage, "displayName").set(undefined);

      return null;
    }

    void Probe;
  });
});
