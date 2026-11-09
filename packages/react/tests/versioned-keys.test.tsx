import {
  createStorage,
  defineKey,
  defineStorageSchema,
  defineVersions,
  jsonSerializer,
  memoryAdapter,
} from "@platform-storage/core";
import type {
  AdapterChange,
  PlatformStorage,
  PlatformStorageError,
  StorageAdapter,
  SyncPlatformStorage,
} from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { useAsyncStorageValue } from "../src/hooks/use-async-storage-value";
import { useStorageValue } from "../src/hooks/use-storage-value";
import { notifyStorageChanged, subscribeToStorage } from "../src/store/changes";
import { readDeclaredValue } from "../src/store/declared";

const v1 = z.object({ compact: z.boolean() });
const v2 = z.object({ density: z.enum(["compact", "comfortable"]) });

const up = vi.fn((previous: { compact: boolean }) => ({
  density: previous.compact ? ("compact" as const) : ("comfortable" as const),
}));

const schema = defineStorageSchema({
  layout: defineVersions(v1)
    .next(v2, up)
    .options({ default: { density: "comfortable" } }),
  accent: defineKey(z.enum(["blue", "green"]), {
    default: "blue",
    recover: (raw) => (raw === "GREEN" ? "green" : undefined),
  }),
});

type Definition = typeof schema.definition;

const bareLayout = JSON.stringify({ compact: true });
const savedLayout = JSON.stringify({ v: 2, d: { density: "compact" } });
const newerLayout = JSON.stringify({ v: 9, d: { density: "tight" } });

afterEach(() => {
  cleanup();
  up.mockClear();
});

function Layout({ storage }: { readonly storage: SyncPlatformStorage<Definition> }) {
  const [layout] = useStorageValue(storage, "layout");

  return <span data-testid="layout">{layout.density}</span>;
}

function storageHolding(initial: Readonly<Record<string, string>>) {
  const adapter = memoryAdapter({ initial });
  const errors: Array<PlatformStorageError> = [];
  const storage = createStorage({
    schema,
    adapter,
    onError: (error) => {
      errors.push(error);
    },
  });

  return { adapter, storage, errors };
}

describe("a versioned key read during a render", () => {
  it("shows the latest shape and saves it", () => {
    const { adapter, storage } = storageHolding({ layout: bareLayout });

    render(<Layout storage={storage} />);

    expect(screen.getByTestId("layout").textContent).toBe("compact");
    expect(adapter.entries.get("layout")).toBe(savedLayout);
  });

  it("renders the value once and settles rather than looping", () => {
    const { storage } = storageHolding({ layout: bareLayout });
    const rendered = vi.fn();

    function Counted() {
      const [layout] = useStorageValue(storage, "layout");

      rendered();

      return <span>{layout.density}</span>;
    }

    render(<Counted />);

    expect(rendered).toHaveBeenCalledOnce();
    expect(up).toHaveBeenCalledOnce();
  });

  it("settles under strict mode, which renders and subscribes twice", () => {
    const complaints = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { adapter, storage } = storageHolding({ layout: bareLayout });

    render(
      <StrictMode>
        <Layout storage={storage} />
      </StrictMode>,
    );

    expect(screen.getByTestId("layout").textContent).toBe("compact");
    expect(adapter.entries.get("layout")).toBe(savedLayout);
    expect(up).toHaveBeenCalledOnce();
    expect(complaints).not.toHaveBeenCalled();

    complaints.mockRestore();
  });

  it("announces nothing, so nothing else re-renders", () => {
    const { storage } = storageHolding({ layout: bareLayout });
    const listener = vi.fn();
    const stop = subscribeToStorage(storage, listener);

    render(<Layout storage={storage} />);

    expect(listener).not.toHaveBeenCalled();

    stop();
  });

  it("still shows the value when saving it fails, and tries once", () => {
    const memory = memoryAdapter({ initial: { layout: bareLayout } });
    const setSync = vi.fn(() => {
      throw new Error("full");
    });
    const errors: Array<PlatformStorageError> = [];
    const storage = createStorage({
      schema,
      adapter: { ...memory, setSync },
      onError: (error) => {
        errors.push(error);
      },
    });

    render(
      <StrictMode>
        <Layout storage={storage} />
      </StrictMode>,
    );

    expect(screen.getByTestId("layout").textContent).toBe("compact");
    expect(setSync).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(1);
  });

  it("falls back for data newer than the code, leaving it stored", () => {
    const { adapter, storage, errors } = storageHolding({ layout: newerLayout });

    render(<Layout storage={storage} />);

    expect(screen.getByTestId("layout").textContent).toBe("comfortable");
    expect(adapter.entries.get("layout")).toBe(newerLayout);
    expect(errors).toHaveLength(1);
  });

  it("saves what recover repaired, without looping", () => {
    const { adapter, storage, errors } = storageHolding({ accent: "GREEN" });

    function Accent() {
      const [accent] = useStorageValue(storage, "accent");

      return <span data-testid="accent">{accent}</span>;
    }

    render(<Accent />);

    expect(screen.getByTestId("accent").textContent).toBe("green");
    expect(adapter.entries.get("accent")).toBe('"green"');
    expect(errors).toEqual([]);
  });

  it("writes the latest version through the writer", () => {
    const { adapter, storage } = storageHolding({ layout: bareLayout });

    function Widget() {
      const [layout, writer] = useStorageValue(storage, "layout");

      return (
        <button
          type="button"
          onClick={() => {
            writer.set({ density: "comfortable" });
          }}
        >
          {layout.density}
        </button>
      );
    }

    render(<Widget />);
    act(() => {
      screen.getByRole("button").click();
    });

    expect(screen.getByRole("button").textContent).toBe("comfortable");
    expect(adapter.entries.get("layout")).toBe(
      JSON.stringify({ v: 2, d: { density: "comfortable" } }),
    );
  });

  it("re-reads a change it is told about through the chain", () => {
    const { adapter, storage } = storageHolding({});

    render(<Layout storage={storage} />);

    expect(screen.getByTestId("layout").textContent).toBe("comfortable");

    act(() => {
      adapter.setSync("layout", bareLayout);
      notifyStorageChanged(storage, "layout");
    });

    expect(screen.getByTestId("layout").textContent).toBe("compact");
    expect(adapter.entries.get("layout")).toBe(savedLayout);
  });
});

describe("a server render of a versioned key", () => {
  it("answers with the declared default and never runs a step", () => {
    const { storage } = storageHolding({ layout: bareLayout });

    expect(readDeclaredValue(storage, "layout")).toEqual({ density: "comfortable" });
    expect(up).not.toHaveBeenCalled();
  });

  it("hydrates to the default, then shows and saves the migrated value", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

    const { adapter, storage } = storageHolding({ layout: bareLayout });
    const element = <Layout storage={storage} />;
    const server = renderToString(element);

    expect(server).toContain("comfortable");
    expect(adapter.entries.get("layout")).toBe(bareLayout);

    const container = document.createElement("div");

    container.innerHTML = server;
    document.body.append(container);

    const complaints = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const roots: Array<Root> = [];

    await act(async () => {
      roots.push(hydrateRoot(container, element));
      await Promise.resolve();
    });

    expect(complaints).not.toHaveBeenCalled();
    expect(container.textContent).toBe("compact");
    expect(adapter.entries.get("layout")).toBe(savedLayout);

    complaints.mockRestore();
    act(() => {
      for (const root of roots) root.unmount();
    });
    container.remove();
  });
});

/** A backend that answers later and echoes its own writes, as an extension area does. */
function echoingAdapter(initial: Readonly<Record<string, string>>): StorageAdapter<string> & {
  readonly gets: () => number;
} {
  const entries = new Map(Object.entries(initial));
  const listeners = new Set<(change: AdapterChange<string>) => void>();
  let gets = 0;

  return {
    name: "echoing",
    serializer: jsonSerializer,
    gets: () => gets,
    get: (key) => {
      gets += 1;

      return Promise.resolve(entries.get(key));
    },
    set: (key, value) => {
      const oldValue = entries.get(key);

      entries.set(key, value);

      for (const listener of listeners) listener({ key, oldValue, newValue: value });

      return Promise.resolve();
    },
    remove: (key) => {
      entries.delete(key);

      return Promise.resolve();
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return {
        stop: () => {
          listeners.delete(listener);
        },
        reportsOwnWrites: true,
      };
    },
  };
}

function AsyncLayout({ storage }: { readonly storage: PlatformStorage<Definition> }) {
  const [result] = useAsyncStorageValue(storage, "layout");

  return <span data-testid="layout">{result.status === "ready" ? result.value.density : "…"}</span>;
}

describe("a versioned key over a backend that answers later", () => {
  it("does not read again when its own saved migration echoes back", async () => {
    const adapter = echoingAdapter({ layout: bareLayout });
    const storage = createStorage({ schema, adapter });

    render(<AsyncLayout storage={storage} />);

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });

    expect(screen.getByTestId("layout").textContent).toBe("compact");

    /* The read itself, and the repair checking the data is unchanged. A third would be the hook reading again because it was told of a change. */
    expect(adapter.gets()).toBe(2);
  });
});
