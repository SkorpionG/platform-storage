import {
  createStorage,
  defineStorageSchema,
  memoryAdapter,
  PlatformStorageError,
  STORAGE_ERROR_CODE,
} from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import {
  clearStorageErrors,
  createStorageErrorLog,
  recordStorageError,
} from "../../store/error-log";
import type { StorageErrorLog } from "../../types/hooks";
import { useStorageErrors } from "../use-storage-errors";
import { useStorageValue } from "../use-storage-value";

afterEach(cleanup);
beforeEach(clearStorageErrors);

function Failures({ log }: { readonly log?: StorageErrorLog }) {
  const errors = useStorageErrors(log);

  return (
    <ul data-testid="failures">
      {errors.map((entry) => (
        <li key={entry.id}>
          {entry.error.code} ×{entry.count}
        </li>
      ))}
    </ul>
  );
}

describe("useStorageErrors", () => {
  it("shows nothing before anything has failed", () => {
    render(<Failures />);

    expect(screen.getByTestId("failures").children).toHaveLength(0);
  });

  it("shows a failure once the batch is flushed", async () => {
    render(<Failures />);

    await act(async () => {
      recordStorageError(new PlatformStorageError(STORAGE_ERROR_CODE.Validation, "bad value"));
      await Promise.resolve();
    });

    expect(screen.getByTestId("failures").textContent).toBe("VALIDATION ×1");
  });

  it("counts an identical repeat rather than listing it twice", async () => {
    render(<Failures />);

    await act(async () => {
      recordStorageError(new PlatformStorageError(STORAGE_ERROR_CODE.Validation, "same"));
      recordStorageError(new PlatformStorageError(STORAGE_ERROR_CODE.Validation, "same"));
      await Promise.resolve();
    });

    expect(screen.getByTestId("failures").children).toHaveLength(1);
    expect(screen.getByTestId("failures").textContent).toBe("VALIDATION ×2");
  });

  it("empties when the log is cleared", async () => {
    render(<Failures />);

    await act(async () => {
      recordStorageError(new PlatformStorageError(STORAGE_ERROR_CODE.Adapter, "refused"));
      await Promise.resolve();
    });

    act(() => clearStorageErrors());

    expect(screen.getByTestId("failures").children).toHaveLength(0);
  });
});

describe("useStorageErrors with a log of its own", () => {
  it("follows that log and not the shared one", async () => {
    const log = createStorageErrorLog();
    render(<Failures log={log} />);

    await act(async () => {
      recordStorageError(new PlatformStorageError(STORAGE_ERROR_CODE.Adapter, "shared"));
      log.record(new PlatformStorageError(STORAGE_ERROR_CODE.Validation, "own"));
      await Promise.resolve();
    });

    expect(screen.getByTestId("failures").textContent).toBe("VALIDATION ×1");

    act(() => log.clear());

    expect(screen.getByTestId("failures").children).toHaveLength(0);
  });

  it("prints nothing on a server, whatever the log holds", () => {
    const log = createStorageErrorLog();
    log.record(new PlatformStorageError(STORAGE_ERROR_CODE.Validation, "bad value"));

    expect(renderToString(<Failures log={log} />)).toBe('<ul data-testid="failures"></ul>');
    expect(log.entries()).toHaveLength(1);
  });

  it("settles on what a first render's failing read recorded, before anything listened, without a warning", () => {
    const warned = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createStorageErrorLog();
    const storage = createStorage({
      schema: defineStorageSchema({
        theme: { schema: z.enum(["light", "dark"]), default: "light" },
      }),
      adapter: memoryAdapter({ initial: { theme: '"purple"' } }),
      onError: log.record,
    });

    function Theme() {
      const [theme] = useStorageValue(storage, "theme");

      return <span data-testid="theme">{theme}</span>;
    }

    render(
      <>
        <Failures log={log} />
        <Theme />
        <Failures log={log} />
      </>,
    );

    const lists = screen.getAllByTestId("failures");

    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(lists.map((list) => list.textContent)).toEqual(["VALIDATION ×1", "VALIDATION ×1"]);
    expect(warned).not.toHaveBeenCalled();
    warned.mockRestore();
  });
});
