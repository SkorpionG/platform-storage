import type { PlatformStorage } from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { asyncStorage, failingStorage } from "../../../tests/fakes/storages";
import type { TestDefinition, TestKey } from "../../../tests/fakes/schema";
import { useAsyncStorageValue, useAsyncStorageWriter } from "../use-async-storage-value";

afterEach(cleanup);

/* The read starts once the component is mounted and settles on its own, so a test waits for the browser rather than for a promise it does not hold. */
function settled(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

interface ShowProps {
  readonly storage: PlatformStorage<TestDefinition>;
  readonly storageKey: TestKey;
}

function Show({ storage, storageKey }: ShowProps) {
  const [result] = useAsyncStorageValue(storage, storageKey);

  return (
    <span data-testid="value">
      {result.status}:{JSON.stringify(result.value) ?? "undefined"}
    </span>
  );
}

describe("useAsyncStorageValue", () => {
  it("says it is still loading on the first render", () => {
    render(<Show storage={asyncStorage()} storageKey="theme" />);

    expect(screen.getByTestId("value").textContent).toBe("loading:undefined");
  });

  it("answers with the schema's default once the read lands", async () => {
    render(<Show storage={asyncStorage()} storageKey="theme" />);
    await settled();

    expect(screen.getByTestId("value").textContent).toBe('ready:"system"');
  });

  it("reports a key holding nothing as ready, not as still loading", async () => {
    render(<Show storage={asyncStorage()} storageKey="displayName" />);
    await settled();

    /* The distinction the library exists to keep: an answer of `undefined` is an answer. */
    expect(screen.getByTestId("value").textContent).toBe("ready:undefined");
  });

  it("reports a refused read as failed", async () => {
    render(<Show storage={failingStorage()} storageKey="theme" />);
    await settled();

    expect(screen.getByTestId("value").textContent).toBe("failed:undefined");
  });

  it("shows a written value without ever going back to loading", async () => {
    const storage = asyncStorage();
    const seen: Array<string> = [];

    function Widget() {
      const [result, writer] = useAsyncStorageValue(storage, "theme");
      seen.push(result.status);

      return (
        <button type="button" onClick={() => void writer.set("dark")}>
          {JSON.stringify(result.value) ?? "undefined"}
        </button>
      );
    }

    render(<Widget />);
    await settled();

    await act(async () => {
      screen.getByRole("button").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("button").textContent).toBe('"dark"');
    expect(seen.slice(1)).not.toContain("loading");
  });

  it("returns the key to its default when the writer removes it", async () => {
    const storage = asyncStorage();
    await storage.set("theme", "dark");

    function Widget() {
      const [result, writer] = useAsyncStorageValue(storage, "theme");

      return (
        <button type="button" onClick={() => void writer.remove()}>
          {JSON.stringify(result.value) ?? "undefined"}
        </button>
      );
    }

    render(<Widget />);
    await settled();
    expect(screen.getByRole("button").textContent).toBe('"dark"');

    await act(async () => {
      screen.getByRole("button").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("button").textContent).toBe('"system"');
  });

  it("leaves a component reading another key alone", async () => {
    const storage = asyncStorage();

    render(
      <>
        <Show storage={storage} storageKey="theme" />
        <span data-testid="other">
          <Show storage={storage} storageKey="visitCount" />
        </span>
      </>,
    );
    await settled();

    expect(screen.getAllByTestId("value")[0]?.textContent).toBe('ready:"system"');
    expect(screen.getAllByTestId("value")[1]?.textContent).toBe("ready:0");
  });
});

describe("useAsyncStorageWriter", () => {
  it("rejects exactly as the storage does, rather than reporting a success", async () => {
    const storage = failingStorage("no permission");
    let rejection: unknown;

    function WriteOnly() {
      const writer = useAsyncStorageWriter(storage, "theme");

      return (
        <button
          type="button"
          onClick={() => {
            void writer.set("dark").catch((error: unknown) => {
              rejection = error;
            });
          }}
        >
          set
        </button>
      );
    }

    render(<WriteOnly />);
    await act(async () => {
      screen.getByRole("button").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(rejection).toBeInstanceOf(Error);
  });
});
