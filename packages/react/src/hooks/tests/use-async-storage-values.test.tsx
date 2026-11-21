import { StorageValidationError } from "@platform-storage/core";
import type { PlatformStorage } from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TestDefinition } from "../../../tests/fakes/schema";
import { asyncStorage, failingStorage, unfollowable } from "../../../tests/fakes/storages";
import { useAsyncStorageValue } from "../use-async-storage-value";
import { useAsyncStorageValues } from "../use-async-storage-values";

afterEach(cleanup);

const ada = { id: "u_1", name: "Ada" };

/* The read starts once the component is mounted and settles on its own, so a test waits for the browser rather than for a promise it does not hold. */
function settled(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function Show({ storage }: { readonly storage: PlatformStorage<TestDefinition> }) {
  const [result] = useAsyncStorageValues(storage, ["theme", "user"]);

  return (
    <span data-testid="values">
      {result.status}:
      {result.status === "ready"
        ? `${result.values.theme}:${result.values.user?.name ?? "nobody"}`
        : (result.error?.code ?? "")}
    </span>
  );
}

describe("useAsyncStorageValues", () => {
  it("says it is still loading on the first render", () => {
    render(<Show storage={asyncStorage()} />);

    expect(screen.getByTestId("values").textContent).toBe("loading:");
  });

  it("answers with every key from one read once it lands", async () => {
    const storage = asyncStorage();
    await storage.set("user", ada);
    const reads = vi.spyOn(storage, "getMany");

    render(<Show storage={storage} />);
    await settled();

    expect(screen.getByTestId("values").textContent).toBe("ready:system:Ada");
    expect(reads).toHaveBeenCalledOnce();
  });

  it("reports a refused read as failed, with the error's code", async () => {
    render(<Show storage={failingStorage()} />);
    await settled();

    expect(screen.getByTestId("values").textContent).toBe("failed:ADAPTER");
  });

  it("follows a write made through the storage", async () => {
    const storage = asyncStorage();

    render(<Show storage={storage} />);
    await settled();
    await act(() => storage.set("theme", "dark"));
    await settled();

    expect(screen.getByTestId("values").textContent).toBe("ready:dark:nobody");
  });

  it("reads once for a clear, however many keys it shows", async () => {
    const storage = asyncStorage();

    render(<Show storage={storage} />);
    await settled();
    const reads = vi.spyOn(storage, "getMany");

    await act(() => storage.clear());
    await settled();

    expect(reads).toHaveBeenCalledOnce();
  });

  it("reads once for two components showing the same keys", async () => {
    const storage = asyncStorage();
    const reads = vi.spyOn(storage, "getMany");

    function Both() {
      const [first] = useAsyncStorageValues(storage, ["theme", "user"]);
      const [second] = useAsyncStorageValues(storage, ["user", "theme"]);

      return <span data-testid="same">{String(first === second)}</span>;
    }

    render(<Both />);
    await settled();

    expect(reads).toHaveBeenCalledOnce();
    expect(screen.getByTestId("same").textContent).toBe("true");
  });

  it("does not go back to loading while it reads again after a write", async () => {
    const storage = asyncStorage(5);
    const statuses: Array<string> = [];

    function Watch() {
      const [result] = useAsyncStorageValues(storage, ["theme"]);

      statuses.push(result.status);

      return null;
    }

    render(<Watch />);
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 20);
        }),
    );
    await act(() => storage.set("theme", "dark"));
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 20);
        }),
    );

    expect(statuses.lastIndexOf("loading")).toBe(statuses.indexOf("loading"));
    expect(statuses.at(-1)).toBe("ready");
  });
});

/* Renders the hook's keys and a button for each write, so a test drives the writer the way a user would. */
function Pair({
  storage,
  failures,
}: {
  readonly storage: PlatformStorage<TestDefinition>;
  readonly failures?: Array<unknown>;
}) {
  const [result, writer] = useAsyncStorageValues(storage, ["theme", "user", "visitCount"]);
  const keep = (pending: Promise<void>): void => {
    pending.catch((error: unknown) => failures?.push(error));
  };

  return (
    <>
      <span data-testid="values">
        {result.status === "ready"
          ? `${result.values.theme}:${result.values.user?.name ?? "nobody"}`
          : ""}
      </span>
      <button type="button" onClick={() => keep(writer.set({ theme: "dark", user: ada }))}>
        set
      </button>
      <button type="button" onClick={() => keep(writer.set({ visitCount: -1 }))}>
        refused
      </button>
      <button type="button" onClick={() => keep(writer.remove(["user"]))}>
        some
      </button>
      <button type="button" onClick={() => keep(writer.remove())}>
        all
      </button>
    </>
  );
}

async function press(name: string): Promise<void> {
  act(() => screen.getByRole("button", { name }).click());
  await settled();
}

describe("a list that changes between renders", () => {
  it("reads the keys it is given now, not the ones it was given first", async () => {
    const storage = asyncStorage();
    await storage.set("visitCount", 4);

    function ShowKeys({ keys }: { readonly keys: ReadonlyArray<"theme" | "visitCount"> }) {
      const [result] = useAsyncStorageValues(storage, keys);

      return (
        <span data-testid="values">
          {result.status === "ready" ? JSON.stringify(result.values) : result.status}
        </span>
      );
    }

    const { rerender } = render(<ShowKeys keys={["theme"]} />);
    await settled();

    expect(JSON.parse(screen.getByTestId("values").textContent ?? "")).toEqual({ theme: "system" });

    rerender(<ShowKeys keys={["visitCount"]} />);
    await settled();

    expect(JSON.parse(screen.getByTestId("values").textContent ?? "")).toEqual({ visitCount: 4 });
  });
});

describe("the writer useAsyncStorageValues hands back", () => {
  it("writes several keys at once, and shows them once they are written", async () => {
    render(<Pair storage={asyncStorage()} />);
    await settled();
    await press("set");

    expect(screen.getByTestId("values").textContent).toBe("dark:Ada");
  });

  it("keeps its identity across renders", async () => {
    const storage = asyncStorage();
    const writers: Array<unknown> = [];

    function Watch() {
      const [, writer] = useAsyncStorageValues(storage, ["theme", "user"]);

      writers.push(writer);

      return null;
    }

    render(<Watch />);
    await settled();
    await act(() => storage.set("theme", "dark"));
    await settled();

    expect(writers.length).toBeGreaterThan(1);
    expect(new Set(writers).size).toBe(1);
  });

  it("announces every key it wrote, over a stand-in that cannot be followed", async () => {
    render(<Pair storage={unfollowable(asyncStorage())} />);
    await settled();
    await press("set");

    expect(screen.getByTestId("values").textContent).toBe("dark:Ada");
  });

  it("removes every key the hook reads, or only those given", async () => {
    render(<Pair storage={asyncStorage()} />);
    await settled();
    await press("set");
    await press("some");

    expect(screen.getByTestId("values").textContent).toBe("dark:nobody");

    await press("all");

    expect(screen.getByTestId("values").textContent).toBe("system:nobody");
  });

  it("rejects a value the schema refuses, announcing nothing", async () => {
    /* Over a stand-in that cannot be followed, where the writer's own announcement is all a reader hears, so announcing despite the refusal would show. */
    const storage = unfollowable(asyncStorage());
    const failures: Array<unknown> = [];
    const rendered = vi.fn();

    function Count() {
      const [single] = useAsyncStorageValue(storage, "visitCount");

      rendered(single.status);

      return null;
    }

    render(
      <>
        <Pair storage={storage} failures={failures} />
        <Count />
      </>,
    );
    await settled();
    rendered.mockClear();
    await press("refused");

    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(StorageValidationError);
    expect(rendered).not.toHaveBeenCalled();
  });
});
