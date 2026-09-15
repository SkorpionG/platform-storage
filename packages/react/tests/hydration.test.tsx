import type { PlatformStorage, SyncPlatformStorage } from "@platform-storage/core";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAsyncStorageValue } from "../src/hooks/use-async-storage-value";
import { useHydrated } from "../src/hooks/use-hydrated";
import { useStorageValue } from "../src/hooks/use-storage-value";
import type { TestDefinition } from "./fakes/schema";
import { asyncStorage, syncStorage } from "./fakes/storages";

/* React only allows `act` where a test environment says so. The other suites get this from their rendering library; this one drives the renderer itself. */
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const roots: Array<{ unmount: () => void }> = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

/**
 * Renders on a server, hands the markup to the browser, and hydrates it, collecting anything React complains about on the way.
 *
 * A mismatch is reported through `console.error` rather than thrown, so a test that does not watch for it passes while the page it describes is broken.
 */
async function hydrate(element: React.ReactElement): Promise<{
  readonly server: string;
  readonly hydrated: string;
  readonly complaints: ReadonlyArray<string>;
}> {
  const server = renderToString(element);

  const container = document.createElement("div");
  container.innerHTML = server;
  document.body.append(container);

  const complaints: Array<string> = [];
  const reported = vi.spyOn(console, "error").mockImplementation((...args: Array<unknown>) => {
    complaints.push(args.map(String).join(" "));
  });

  await act(async () => {
    roots.push(hydrateRoot(container, element));
    await Promise.resolve();
  });

  reported.mockRestore();

  return { server, hydrated: container.textContent ?? "", complaints };
}

function Theme({ storage }: { readonly storage: SyncPlatformStorage<TestDefinition> }) {
  const [theme] = useStorageValue(storage, "theme");

  return <span>{theme}</span>;
}

function AsyncTheme({ storage }: { readonly storage: PlatformStorage<TestDefinition> }) {
  const [result] = useAsyncStorageValue(storage, "theme");

  return <span>{result.status}</span>;
}

function Hydrated() {
  return <span>{useHydrated() ? "hydrated" : "server"}</span>;
}

describe("a synchronous read across the hydration boundary", () => {
  it("renders what the schema declares on the server, whatever is stored", () => {
    const storage = syncStorage();
    storage.setSync("theme", "dark");

    expect(renderToString(<Theme storage={storage} />)).toContain("system");
  });

  it("hydrates without a mismatch, then shows the stored value", async () => {
    const storage = syncStorage();
    storage.setSync("theme", "dark");

    const { server, hydrated, complaints } = await hydrate(<Theme storage={storage} />);

    expect(server).toContain("system");
    expect(hydrated).toBe("dark");
    expect(complaints.filter((line) => /hydrat|did not match|server/i.test(line))).toStrictEqual(
      [],
    );
  });

  it("hydrates without a mismatch when nothing is stored either", async () => {
    const { hydrated, complaints } = await hydrate(<Theme storage={syncStorage()} />);

    expect(hydrated).toBe("system");
    expect(complaints).toStrictEqual([]);
  });

  it("hydrates a value that is rebuilt on every read without settling into a loop", async () => {
    const storage = syncStorage();
    storage.setSync("recentSearches", ["coffee"]);

    function Searches() {
      const [searches] = useStorageValue(storage, "recentSearches");

      return <span>{searches.join(",")}</span>;
    }

    const { hydrated, complaints } = await hydrate(<Searches />);

    expect(hydrated).toBe("coffee");
    expect(complaints).toStrictEqual([]);
  });
});

describe("an asynchronous read across the hydration boundary", () => {
  it("says it is still loading on the server, and hydrates without a mismatch", async () => {
    const storage = asyncStorage();
    await storage.set("theme", "dark");

    const { server, complaints } = await hydrate(<AsyncTheme storage={storage} />);

    /* A server cannot wait for a backend it has no access to, so `loading` is the honest answer and the one the browser's first pass has to repeat. */
    expect(server).toContain("loading");
    expect(complaints).toStrictEqual([]);
  });
});

describe("useHydrated", () => {
  it("reports the server on the server and the browser afterwards", async () => {
    const { server, hydrated, complaints } = await hydrate(<Hydrated />);

    expect(server).toContain("server");
    expect(hydrated).toBe("hydrated");
    expect(complaints).toStrictEqual([]);
  });
});
