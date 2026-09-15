import type { SyncPlatformStorage } from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

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
