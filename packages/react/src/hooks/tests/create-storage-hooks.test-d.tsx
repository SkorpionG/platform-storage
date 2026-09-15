import { describe, expectTypeOf, it } from "vitest";

import { asyncStorage, syncStorage } from "../../../tests/fakes/storages";
import type { TestDefinition } from "../../../tests/fakes/schema";
import type { AsyncStorageWriter, AsyncStoredValue, SyncStorageWriter } from "../../types/hooks";
import { createStorageHooks } from "../create-storage-hooks";
import { useAsyncStorageValue } from "../use-async-storage-value";
import type { AsyncStorageHooks, SyncStorageHooks } from "../create-storage-hooks";

/* Nothing here runs: a `test-d` file is typechecked and never executed. */
const immediateStorage = syncStorage();
const immediate = createStorageHooks(immediateStorage);
const eventual = createStorageHooks(asyncStorage());

describe("createStorageHooks", () => {
  it("hands a storage that answers immediately the synchronous hooks", () => {
    expectTypeOf(immediate).toEqualTypeOf<SyncStorageHooks<TestDefinition>>();
  });

  it("hands a storage that only answers later the asynchronous ones", () => {
    expectTypeOf(eventual).toEqualTypeOf<AsyncStorageHooks<TestDefinition>>();
  });

  it("keeps each key's own type through the bound hook", () => {
    function Probe() {
      const [theme, writer] = immediate.useValue("theme");

      expectTypeOf(theme).toEqualTypeOf<"light" | "dark" | "system">();
      expectTypeOf(writer).toEqualTypeOf<SyncStorageWriter<TestDefinition["theme"]>>();

      return null;
    }

    void Probe;
  });

  it("keeps undefined where the key declares no default", () => {
    function Probe() {
      const [displayName] = immediate.useValue("displayName");

      expectTypeOf(displayName).toEqualTypeOf<string | undefined>();

      return null;
    }

    void Probe;
  });

  it("wraps the value in a status when the storage answers later", () => {
    function Probe() {
      const [result, writer] = eventual.useValue("theme");

      expectTypeOf(result).toEqualTypeOf<AsyncStoredValue<TestDefinition["theme"]>>();
      expectTypeOf(writer).toEqualTypeOf<AsyncStorageWriter<TestDefinition["theme"]>>();

      return null;
    }

    void Probe;
  });

  it("narrows to the value itself once the status says it is ready", () => {
    function Probe() {
      const [result] = eventual.useValue("theme");

      if (result.status === "ready") {
        expectTypeOf(result.value).toEqualTypeOf<"light" | "dark" | "system">();
      }

      return null;
    }

    void Probe;
  });

  it("refuses a key the schema does not declare", () => {
    function Probe() {
      // @ts-expect-error - "nope" is not one of the keys the schema declares.
      immediate.useValue("nope");

      return null;
    }

    void Probe;
  });

  it("refuses a value the key cannot hold", () => {
    function Probe() {
      const writer = immediate.useWriter("theme");

      // @ts-expect-error - "solarized" is a string, but not one of the three the enum allows.
      writer.set("solarized");

      return null;
    }

    void Probe;
  });
});

describe("useAsyncStorageValue", () => {
  it("accepts a storage that could have answered immediately", () => {
    function Probe() {
      /* The asynchronous half is the common denominator, so a component written against it runs on every platform. */
      const [result] = useAsyncStorageValue(immediateStorage, "theme");

      expectTypeOf(result).toEqualTypeOf<AsyncStoredValue<TestDefinition["theme"]>>();

      return null;
    }

    void Probe;
  });
});
