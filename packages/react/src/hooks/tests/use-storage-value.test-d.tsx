import { describe, expectTypeOf, it } from "vitest";

import { asyncStorage, syncStorage } from "../../../tests/fakes/storages";
import { useStorageValue, useStorageWriter } from "../use-storage-value";

/*
  Every assertion sits inside a component, because a hook called anywhere else is not a hook. Nothing here runs: a `test-d` file is typechecked and never executed.
*/
const sync = syncStorage();
const withoutSyncHalf = asyncStorage();

describe("useStorageValue", () => {
  it("drops undefined from a key that declares a default", () => {
    function Probe() {
      const [theme] = useStorageValue(sync, "theme");

      expectTypeOf(theme).toEqualTypeOf<"light" | "dark" | "system">();

      return null;
    }

    void Probe;
  });

  it("keeps undefined for a key that declares none", () => {
    function Probe() {
      const [displayName] = useStorageValue(sync, "displayName");

      expectTypeOf(displayName).toEqualTypeOf<string | undefined>();

      return null;
    }

    void Probe;
  });

  it("keeps null and undefined apart, because a stored null is a value", () => {
    function Probe() {
      const [lastDismissed] = useStorageValue(sync, "lastDismissed");

      expectTypeOf(lastDismissed).toEqualTypeOf<string | null>();

      return null;
    }

    void Probe;
  });

  it("refuses a storage with no synchronous half", () => {
    function Probe() {
      // @ts-expect-error - the synchronous hook needs `getSync`, which an extension or an AsyncStorage storage does not have.
      useStorageValue(withoutSyncHalf, "theme");

      return null;
    }

    void Probe;
  });

  it("refuses a key the schema does not declare", () => {
    function Probe() {
      // @ts-expect-error - "nope" is not one of the keys the schema declares.
      useStorageValue(sync, "nope");

      return null;
    }

    void Probe;
  });
});

describe("useStorageWriter", () => {
  it("takes only what the key can hold", () => {
    function Probe() {
      const writer = useStorageWriter(sync, "theme");

      writer.set("dark");
      // @ts-expect-error - "solarized" is a string, but not one of the three the enum allows.
      writer.set("solarized");

      return null;
    }

    void Probe;
  });

  it("refuses a storage with no synchronous half", () => {
    function Probe() {
      // @ts-expect-error - writing synchronously needs `setSync`, which an asynchronous storage does not have.
      useStorageWriter(withoutSyncHalf, "theme");

      return null;
    }

    void Probe;
  });
});
