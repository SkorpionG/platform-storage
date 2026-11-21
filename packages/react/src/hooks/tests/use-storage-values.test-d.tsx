import type { PlatformStorageError } from "@platform-storage/core";
import { describe, expectTypeOf, it } from "vitest";

import type { TestDefinition } from "../../../tests/fakes/schema";
import { asyncStorage, syncStorage } from "../../../tests/fakes/storages";
import type { AsyncStorageValuesWriter, SyncStorageValuesWriter } from "../../types/hooks";
import { useAsyncStorageValues } from "../use-async-storage-values";
import { useStorageValues } from "../use-storage-values";

/*
  Every assertion sits inside a component, because a hook called anywhere else is not a hook. Nothing here runs: a `test-d` file is typechecked and never executed.
*/
const sync = syncStorage();
const withoutSyncHalf = asyncStorage();

describe("useStorageValues", () => {
  it("types each key as one key's hook would, keyed by the keys given", () => {
    function Probe() {
      const [values] = useStorageValues(sync, ["theme", "displayName"]);

      expectTypeOf(values).toEqualTypeOf<{
        readonly theme: "light" | "dark" | "system";
        readonly displayName: string | undefined;
      }>();

      // @ts-expect-error `user` was not asked for.
      void values.user;

      return null;
    }

    void Probe;
  });

  it("hands back a writer limited to its keys", () => {
    function Probe() {
      const [, writer] = useStorageValues(sync, ["theme", "visitCount"]);

      expectTypeOf(writer).toEqualTypeOf<
        SyncStorageValuesWriter<TestDefinition, "theme" | "visitCount">
      >();

      writer.set({ theme: "dark" });
      writer.set({ theme: "dark", visitCount: 2 });
      writer.remove();
      writer.remove(["theme"]);

      // @ts-expect-error The theme is one of three names.
      writer.set({ theme: "neon" });
      // @ts-expect-error `user` is not one of the hook's keys.
      writer.set({ user: { id: "u_1", name: "Ada" } });
      // @ts-expect-error `user` is not one of the hook's keys.
      writer.remove(["user"]);

      return null;
    }

    void Probe;
  });

  it("refuses a storage that cannot answer immediately", () => {
    function Probe() {
      // @ts-expect-error A storage with no synchronous half needs the asynchronous hook.
      useStorageValues(withoutSyncHalf, ["theme"]);

      return null;
    }

    void Probe;
  });

  it("refuses a key the schema does not declare", () => {
    function Probe() {
      // @ts-expect-error "nope" is not one of the declared keys.
      useStorageValues(sync, ["theme", "nope"]);

      return null;
    }

    void Probe;
  });
});

describe("useAsyncStorageValues", () => {
  it("narrows on the status, with the values only once ready", () => {
    function Probe() {
      const [result, writer] = useAsyncStorageValues(withoutSyncHalf, ["theme", "user"]);

      expectTypeOf(writer).toEqualTypeOf<
        AsyncStorageValuesWriter<TestDefinition, "theme" | "user">
      >();
      expectTypeOf(writer.set({ theme: "dark" })).toEqualTypeOf<Promise<void>>();
      expectTypeOf(writer.remove()).toEqualTypeOf<Promise<void>>();

      if (result.status === "ready") {
        expectTypeOf(result.values.theme).toEqualTypeOf<"light" | "dark" | "system">();
        expectTypeOf(result.values.user).toEqualTypeOf<{ id: string; name: string } | undefined>();
      }

      if (result.status === "loading") expectTypeOf(result.values).toEqualTypeOf<undefined>();
      if (result.status === "failed") {
        expectTypeOf(result.error).toEqualTypeOf<PlatformStorageError>();
      }

      return null;
    }

    void Probe;
  });

  it("works over a storage that could have answered immediately too", () => {
    function Probe() {
      const [result] = useAsyncStorageValues(sync, ["theme"]);

      if (result.status === "ready") {
        expectTypeOf(result.values).toEqualTypeOf<{
          readonly theme: "light" | "dark" | "system";
        }>();
      }

      return null;
    }

    void Probe;
  });
});
