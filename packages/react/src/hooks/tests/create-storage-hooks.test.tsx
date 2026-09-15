import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { asyncStorage, syncStorage } from "../../../tests/fakes/storages";
import { createStorageHooks } from "../create-storage-hooks";

afterEach(cleanup);

function settled(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("createStorageHooks over a storage that answers immediately", () => {
  it("reads through the bound hook", () => {
    const storage = syncStorage();
    storage.setSync("theme", "dark");
    const { useValue } = createStorageHooks(storage);

    function Widget() {
      const [theme] = useValue("theme");

      return <span data-testid="value">{theme}</span>;
    }

    render(<Widget />);

    expect(screen.getByTestId("value").textContent).toBe("dark");
  });

  it("writes through the bound writer and re-renders", () => {
    const storage = syncStorage();
    const { useValue } = createStorageHooks(storage);

    function Widget() {
      const [theme, writer] = useValue("theme");

      return (
        <button type="button" onClick={() => writer.set("light")}>
          {theme}
        </button>
      );
    }

    render(<Widget />);
    act(() => screen.getByRole("button").click());

    expect(screen.getByRole("button").textContent).toBe("light");
    expect(storage.getSync("theme")).toBe("light");
  });

  it("hands a write-only component a writer that does not subscribe", () => {
    const storage = syncStorage();
    const { useWriter } = createStorageHooks(storage);
    let renders = 0;

    function WriteOnly({ onRender }: { readonly onRender: () => void }) {
      const writer = useWriter("visitCount");

      onRender();

      return (
        <button type="button" onClick={() => writer.set(1)}>
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
    expect(storage.getSync("visitCount")).toBe(1);
  });

  it("re-reads after a change it is told about", () => {
    const storage = syncStorage();
    const { useValue, notifyChanged } = createStorageHooks(storage);

    function Widget() {
      const [theme] = useValue("theme");

      return <span data-testid="value">{theme}</span>;
    }

    render(<Widget />);
    act(() => {
      storage.setSync("theme", "light");
      notifyChanged();
    });

    expect(screen.getByTestId("value").textContent).toBe("light");
  });

  it("removes through the bound writer", () => {
    const storage = syncStorage();
    storage.setSync("theme", "dark");
    const { useValue } = createStorageHooks(storage);

    function Widget() {
      const [theme, writer] = useValue("theme");

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
});

describe("createStorageHooks over a storage that only answers later", () => {
  it("reports a status rather than a bare value", async () => {
    const storage = asyncStorage();
    const { useValue } = createStorageHooks(storage);

    function Widget() {
      const [result] = useValue("theme");

      return (
        <span data-testid="value">
          {result.status}:{String(result.value)}
        </span>
      );
    }

    render(<Widget />);
    expect(screen.getByTestId("value").textContent).toBe("loading:undefined");

    await settled();

    expect(screen.getByTestId("value").textContent).toBe("ready:system");
  });

  it("writes through the bound writer", async () => {
    const storage = asyncStorage();
    const { useValue } = createStorageHooks(storage);

    function Widget() {
      const [result, writer] = useValue("theme");

      return (
        <button type="button" onClick={() => void writer.set("dark")}>
          {String(result.value)}
        </button>
      );
    }

    render(<Widget />);
    await settled();

    await act(async () => {
      screen.getByRole("button").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("button").textContent).toBe("dark");
  });

  it("hands a write-only component the asynchronous writer", async () => {
    const storage = asyncStorage();
    const { useWriter } = createStorageHooks(storage);

    function WriteOnly() {
      const writer = useWriter("theme");

      return (
        <button type="button" onClick={() => void writer.remove()}>
          remove
        </button>
      );
    }

    await storage.set("theme", "dark");
    render(<WriteOnly />);

    await act(async () => {
      screen.getByRole("button").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(await storage.get("theme")).toBe("system");
  });
});
