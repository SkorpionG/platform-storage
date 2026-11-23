import type { PlatformStorageError } from "@platform-storage/core";
import { describe, expectTypeOf, it } from "vitest";

import {
  createStorageErrorLog,
  createStorageHooks,
  STORED_VALUE_STATUS,
  useAsyncStorageValue,
  useAsyncStorageValues,
  useAsyncStorageWriter,
  useHydrated,
  useStorageErrors,
  useStorageValue,
  useStorageValues,
  useStorageWriter,
} from "../index";
import type * as entry from "../index";
import type {
  AsyncStorageValuesWriter,
  AsyncStoredValue,
  AsyncStoredValues,
  StorageErrorEntry,
  StorageErrorLog,
  StoredValueStatus,
  SyncStorageValuesWriter,
} from "../index";
import type * as serverEntry from "../server";
import {
  createStorageErrorLog as createServerStorageErrorLog,
  readDeclaredValue,
  readDeclaredValues,
} from "../server";
import type { StorageErrorLog as ServerStorageErrorLog } from "../server";

describe("@platform-storage/react entry point", () => {
  it("exports the hooks an application reaches for", () => {
    expectTypeOf(useStorageValue).toBeFunction();
    expectTypeOf(useStorageWriter).toBeFunction();
    expectTypeOf(useAsyncStorageValue).toBeFunction();
    expectTypeOf(useAsyncStorageWriter).toBeFunction();
    expectTypeOf(useStorageValues).toBeFunction();
    expectTypeOf(useAsyncStorageValues).toBeFunction();
    expectTypeOf(createStorageHooks).toBeFunction();
    expectTypeOf(useHydrated).returns.toEqualTypeOf<boolean>();
    expectTypeOf(useStorageErrors).returns.toEqualTypeOf<ReadonlyArray<StorageErrorEntry>>();
  });

  it("keeps the declared read on its own entry, where no client directive reaches it", () => {
    expectTypeOf(readDeclaredValue).toBeFunction();
    expectTypeOf(readDeclaredValues).toBeFunction();
  });

  it("builds an error log of its own from either entry, and reads it through the hook", () => {
    expectTypeOf(createStorageErrorLog).returns.toEqualTypeOf<StorageErrorLog>();
    expectTypeOf(createServerStorageErrorLog).returns.toEqualTypeOf<ServerStorageErrorLog>();
    expectTypeOf(useStorageErrors).parameter(0).toEqualTypeOf<StorageErrorLog | undefined>();
    expectTypeOf<StorageErrorLog["record"]>().toEqualTypeOf<
      (error: PlatformStorageError) => void
    >();
    expectTypeOf<ReturnType<StorageErrorLog["entries"]>>().toEqualTypeOf<
      ReadonlyArray<StorageErrorEntry>
    >();
  });

  it("keeps every hook off the server entry", () => {
    expectTypeOf<typeof serverEntry>().not.toHaveProperty("useStorageValue");
    expectTypeOf<typeof serverEntry>().not.toHaveProperty("useStorageValues");
    expectTypeOf<typeof serverEntry>().not.toHaveProperty("useAsyncStorageValues");
    expectTypeOf<typeof serverEntry>().not.toHaveProperty("useStorageErrors");
  });

  it("publishes the writer types for several keys", () => {
    expectTypeOf<SyncStorageValuesWriter<never, never>["remove"]>().toBeFunction();
    expectTypeOf<AsyncStorageValuesWriter<never, never>["remove"]>().toBeFunction();
  });

  it("keeps the store internals unpublished", () => {
    expectTypeOf<typeof entry>().not.toHaveProperty("sharedStorageErrorLog");
    expectTypeOf<typeof entry>().not.toHaveProperty("getServerStorageErrors");
    expectTypeOf<typeof entry>().not.toHaveProperty("subscribeToKeys");
    expectTypeOf<typeof entry>().not.toHaveProperty("announceWrites");
    expectTypeOf<typeof entry>().not.toHaveProperty("readStorageValues");
    expectTypeOf<typeof entry>().not.toHaveProperty("getAsyncValuesSnapshot");
    expectTypeOf<typeof entry>().not.toHaveProperty("useKeyList");
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
    expectTypeOf<StoredValueStatus>().toEqualTypeOf<AsyncStoredValues<never, never>["status"]>();
  });

  it("is the union the type derives from", () => {
    expectTypeOf(STORED_VALUE_STATUS.Loading).toEqualTypeOf<"loading">();
    expectTypeOf(STORED_VALUE_STATUS.Ready).toEqualTypeOf<"ready">();
    expectTypeOf(STORED_VALUE_STATUS.Failed).toEqualTypeOf<"failed">();
  });
});
