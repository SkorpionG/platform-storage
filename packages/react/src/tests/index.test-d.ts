import { describe, expectTypeOf, it } from "vitest";

import {
  createStorageHooks,
  STORED_VALUE_STATUS,
  useAsyncStorageValue,
  useAsyncStorageWriter,
  useHydrated,
  useStorageErrors,
  useStorageValue,
  useStorageWriter,
} from "../index";
import type * as entry from "../index";
import type { AsyncStoredValue, StorageErrorEntry, StoredValueStatus } from "../index";
import { readDeclaredValue } from "../server";

describe("@platform-storage/react entry point", () => {
  it("exports the hooks an application reaches for", () => {
    expectTypeOf(useStorageValue).toBeFunction();
    expectTypeOf(useStorageWriter).toBeFunction();
    expectTypeOf(useAsyncStorageValue).toBeFunction();
    expectTypeOf(useAsyncStorageWriter).toBeFunction();
    expectTypeOf(createStorageHooks).toBeFunction();
    expectTypeOf(useHydrated).returns.toEqualTypeOf<boolean>();
    expectTypeOf(useStorageErrors).returns.toEqualTypeOf<ReadonlyArray<StorageErrorEntry>>();
  });

  it("keeps the declared read on its own entry, where no client directive reaches it", () => {
    expectTypeOf(readDeclaredValue).toBeFunction();
  });

  it("re-exports nothing from core, because a platform package already provides it", () => {
    expectTypeOf<typeof entry>().not.toHaveProperty("defineStorageSchema");
    expectTypeOf<typeof entry>().not.toHaveProperty("createStorage");
    expectTypeOf<typeof entry>().not.toHaveProperty("PlatformStorageError");
  });
});

describe("STORED_VALUE_STATUS", () => {
  /*
    Ties the exported names to the union they describe. Renaming a member of one without the other stops compiling here, rather than leaving an application comparing against a string the hook never reports.
  */
  it("names every status an asynchronous read can report, and no others", () => {
    expectTypeOf<StoredValueStatus>().toEqualTypeOf<AsyncStoredValue<never>["status"]>();
  });

  it("is the union the type derives from", () => {
    expectTypeOf(STORED_VALUE_STATUS.Loading).toEqualTypeOf<"loading">();
    expectTypeOf(STORED_VALUE_STATUS.Ready).toEqualTypeOf<"ready">();
    expectTypeOf(STORED_VALUE_STATUS.Failed).toEqualTypeOf<"failed">();
  });
});
