import { createStorage, defineStorageSchema, memoryAdapter } from "@platform-storage/core";
import type { SyncPlatformStorage } from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act, useLayoutEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import * as z from "zod";

import { syncStorage } from "../../../tests/fakes/storages";
import type { TestDefinition, TestKey } from "../../../tests/fakes/schema";
import { notifyStorageChanged } from "../../store/changes";
import { useStorageValue, useStorageWriter } from "../use-storage-value";

afterEach(cleanup);

interface ShowProps {
  readonly storage: SyncPlatformStorage<TestDefinition>;
  readonly storageKey: TestKey;
  readonly label?: string | undefined;
  readonly onRender?: (() => void) | undefined;
}

function Show({ storage, storageKey, label = "value", onRender }: ShowProps) {
  const [value] = useStorageValue(storage, storageKey);

  onRender?.();

  return <span data-testid={label}>{JSON.stringify(value) ?? "undefined"}</span>;
}

describe("useStorageValue", () => {
  it("renders the schema's default when the key holds nothing", () => {
    render(<Show storage={syncStorage()} storageKey="theme" />);

    expect(screen.getByTestId("value").textContent).toBe('"system"');
  });

  it("renders what is already stored", () => {
    const storage = syncStorage();
    storage.setSync("theme", "dark");

    render(<Show storage={storage} storageKey="theme" />);

    expect(screen.getByTestId("value").textContent).toBe('"dark"');
  });

  it("re-renders when the key is written through the writer", () => {
    const storage = syncStorage();

    function Widget() {
      const [theme, writer] = useStorageValue(storage, "theme");

      return (
        <button type="button" onClick={() => writer.set("dark")}>
          {theme}
        </button>
      );
    }

    render(<Widget />);
    act(() => screen.getByRole("button").click());

    expect(screen.getByRole("button").textContent).toBe("dark");
  });

  it("returns the key to its default when the writer removes it", () => {
    const storage = syncStorage();
    storage.setSync("theme", "dark");

    function Widget() {
      const [theme, writer] = useStorageValue(storage, "theme");

      return (
        <button type="button" onClick={() => writer.remove()}>
          {theme}
        </button>
      );
    }

    render(<Widget />);
    act(() => screen.getByRole("button").click());

    expect(screen.getByRole("button").textContent).toBe("system");
  });

  it("does not settle into a loop for a value built fresh on every read", () => {
    let renders = 0;
    const storage = syncStorage();

    render(
      <Show
        storage={storage}
        storageKey="recentSearches"
        onRender={() => {
          renders += 1;
        }}
      />,
    );

    /* A factory default answers with a new array each time. Without the identity cache React would re-read until it gave up. */
    expect(renders).toBe(1);
    expect(screen.getByTestId("value").textContent).toBe("[]");
  });

  it("leaves a component reading another key alone", () => {
    let themeRenders = 0;
    let visitRenders = 0;
    const storage = syncStorage();

    render(
      <>
        <Show
          storage={storage}
          storageKey="theme"
          label="theme"
          onRender={() => {
            themeRenders += 1;
          }}
        />
        <Show
          storage={storage}
          storageKey="visitCount"
          label="visits"
          onRender={() => {
            visitRenders += 1;
          }}
        />
      </>,
    );

    const before = visitRenders;
    act(() => {
      storage.setSync("theme", "dark");
      notifyStorageChanged(storage, "theme");
    });

    expect(themeRenders).toBeGreaterThan(1);
    expect(visitRenders).toBe(before);
  });

  it("leaves a component reading another storage alone, even over the same schema", () => {
    const local = syncStorage();
    const session = syncStorage();

    render(
      <>
        <Show storage={local} storageKey="theme" label="local" />
        <Show storage={session} storageKey="theme" label="session" />
      </>,
    );

    act(() => {
      local.setSync("theme", "dark");
      notifyStorageChanged(local, "theme");
    });

    expect(screen.getByTestId("local").textContent).toBe('"dark"');
    expect(screen.getByTestId("session").textContent).toBe('"system"');
  });

  it("re-reads after a change the library never made", () => {
    const storage = syncStorage();

    render(<Show storage={storage} storageKey="theme" />);

    act(() => {
      storage.setSync("theme", "light");
      notifyStorageChanged(storage);
    });

    expect(screen.getByTestId("value").textContent).toBe('"light"');
  });
});

describe("useStorageWriter", () => {
  it("does not re-render the component that only writes", () => {
    let renders = 0;
    const storage = syncStorage();

    function WriteOnly({ onRender }: { readonly onRender: () => void }) {
      const writer = useStorageWriter(storage, "theme");

      onRender();

      return (
        <button type="button" onClick={() => writer.set("dark")}>
          set
        </button>
      );
    }

    render(
      <WriteOnly
        onRender={() => {
          renders += 1;
        }}
      />,
    );
    act(() => screen.getByRole("button").click());

    expect(renders).toBe(1);
    expect(storage.getSync("theme")).toBe("dark");
  });

  it("announces nothing when the schema refuses the write", () => {
    const storage = syncStorage();
    let renders = 0;

    function Widget({ onRender }: { readonly onRender: () => void }) {
      const [theme, writer] = useStorageValue(storage, "theme");

      onRender();

      return (
        <button
          type="button"
          onClick={() => {
            // @ts-expect-error - the point of the test is a value the schema rejects at runtime.
            expect(() => writer.set("solarized")).toThrow();
          }}
        >
          {theme}
        </button>
      );
    }

    render(
      <Widget
        onRender={() => {
          renders += 1;
        }}
      />,
    );
    const before = renders;
    act(() => screen.getByRole("button").click());

    expect(renders).toBe(before);
    expect(storage.getSync("theme")).toBe("system");
  });
});

describe("useStorageValue over a key that moved", () => {
  it("settles on the moved value without rendering again because of the move", () => {
    const adapter = memoryAdapter({ initial: { "old-theme": '"dark"' } });
    const storage = createStorage({
      schema: defineStorageSchema({
        theme: { schema: z.enum(["light", "dark"]), key: "new-theme", readFrom: ["old-theme"] },
      }),
      adapter,
    });
    let renders = 0;

    function Moved({ onRender }: { readonly onRender: () => void }) {
      const [value] = useStorageValue(storage, "theme");

      onRender();

      return <span data-testid="moved">{value}</span>;
    }

    render(
      <Moved
        onRender={() => {
          renders += 1;
        }}
      />,
    );

    expect(screen.getByTestId("moved").textContent).toBe("dark");
    expect(renders).toBe(1);
    expect(Object.fromEntries(adapter.entries)).toEqual({ "new-theme": '"dark"' });
  });
});

describe("values changed outside the hooks", () => {
  it("follows a write made directly through the storage", () => {
    const storage = syncStorage();

    render(<Show storage={storage} storageKey="theme" />);
    act(() => {
      storage.setSync("theme", "dark");
    });

    expect(screen.getByTestId("value").textContent).toBe('"dark"');
  });

  it("shows a write made while nothing was reading it once something mounts again", () => {
    const storage = syncStorage();
    const { unmount } = render(<Show storage={storage} storageKey="theme" />);

    unmount();

    function WriteOnly() {
      const writer = useStorageWriter(storage, "theme");

      return (
        <button type="button" onClick={() => writer.set("dark")}>
          write
        </button>
      );
    }

    const writing = render(<WriteOnly />);

    act(() => screen.getByRole("button").click());
    writing.unmount();
    render(<Show storage={storage} storageKey="theme" />);

    expect(screen.getByTestId("value").textContent).toBe('"dark"');
  });

  it("shows a write made in a layout effect, before anything is listening", () => {
    const storage = syncStorage();

    function WritesEarly() {
      const [theme, writer] = useStorageValue(storage, "theme");

      useLayoutEffect(() => {
        writer.set("dark");
      }, [writer]);

      return <span data-testid="early">{theme}</span>;
    }

    render(<WritesEarly />);

    expect(screen.getByTestId("early").textContent).toBe("dark");
  });
});

describe("a change made while nothing was reading", () => {
  it("appears when something mounts again", () => {
    const adapter = memoryAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ theme: { schema: z.string(), default: "light" } }),
      adapter,
    });

    function Theme() {
      const [theme] = useStorageValue(storage, "theme");

      return <span data-testid="theme">{theme}</span>;
    }

    render(<Theme />).unmount();
    adapter.setSync("theme", '"dark"');
    render(<Theme />);

    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });
});

describe("writer.update", () => {
  it("works out the next value from the current one and re-renders readers", () => {
    const storage = syncStorage();

    function Counter() {
      const [count, writer] = useStorageValue(storage, "visitCount");

      return (
        <button type="button" onClick={() => writer.update((current) => current + 1)}>
          {count}
        </button>
      );
    }

    render(<Counter />);
    act(() => screen.getByRole("button").click());
    act(() => screen.getByRole("button").click());

    expect(screen.getByRole("button").textContent).toBe("2");
  });
});
