import { PlatformStorageError, STORAGE_ERROR_CODE } from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearStorageErrors, recordStorageError } from "../../store/error-log";
import { useStorageErrors } from "../use-storage-errors";

afterEach(cleanup);
beforeEach(clearStorageErrors);

function Failures() {
  const errors = useStorageErrors();

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
