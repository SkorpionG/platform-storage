import { StorageValidationError, UnknownStorageKeyError } from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { syncStorage, unfollowable } from "../../../tests/fakes/storages";
import { notifyStorageChanged } from "../../store/changes";
import { useStorageValue } from "../use-storage-value";
import { useStorageValues } from "../use-storage-values";

afterEach(cleanup);

const ada = { id: "u_1", name: "Ada" };

describe("useStorageValues", () => {
  it("renders every key, each defaulted as one key's read would be", () => {
    const storage = syncStorage();
    storage.setSync("user", ada);

    function Show() {
      const [values] = useStorageValues(storage, ["theme", "user", "displayName"]);

      return <span data-testid="values">{JSON.stringify(values)}</span>;
    }

    render(<Show />);

    expect(JSON.parse(screen.getByTestId("values").textContent ?? "")).toEqual({
      theme: "system",
      user: ada,
    });
  });

  it("does not settle into a loop for a value built fresh on every read", () => {
    const storage = syncStorage();

    function Show() {
      const [{ recentSearches }] = useStorageValues(storage, ["recentSearches", "theme"]);

      return <span data-testid="values">{recentSearches.length}</span>;
    }

    render(<Show />);

    expect(screen.getByTestId("values").textContent).toBe("0");
  });

  it("keeps one answer through a re-render with a new inline list", () => {
    const storage = syncStorage();
    const answers: Array<unknown> = [];
    const subscribing = vi.spyOn(storage, "onChange");

    function Show() {
      const [count, setCount] = useState(0);
      const [values] = useStorageValues(storage, ["theme", "recentSearches"]);

      answers.push(values);

      return (
        <button type="button" onClick={() => setCount(count + 1)}>
          {count}
        </button>
      );
    }

    render(<Show />);
    act(() => screen.getByRole("button").click());
    act(() => screen.getByRole("button").click());

    expect(answers.length).toBeGreaterThanOrEqual(3);
    expect(new Set(answers).size).toBe(1);
    expect(subscribing).toHaveBeenCalledOnce();
  });

  it("re-renders for a change to any of its keys, and not for another key", () => {
    const storage = syncStorage();
    const rendered = vi.fn();

    function Show() {
      const [values] = useStorageValues(storage, ["theme", "visitCount"]);

      rendered();

      return <span data-testid="values">{`${values.theme}:${String(values.visitCount)}`}</span>;
    }

    render(<Show />);
    rendered.mockClear();

    act(() => storage.setSync("visitCount", 3));

    expect(screen.getByTestId("values").textContent).toBe("system:3");
    expect(rendered).toHaveBeenCalledTimes(1);

    act(() => storage.setSync("displayName", "Ada"));

    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it("follows a change naming no key, which is what a clear is", () => {
    const storage = syncStorage();

    function Show() {
      const [values] = useStorageValues(storage, ["theme", "visitCount"]);

      return <span data-testid="values">{`${values.theme}:${String(values.visitCount)}`}</span>;
    }

    render(<Show />);
    act(() => {
      storage.setSync("theme", "dark");
      storage.setSync("visitCount", 4);
    });

    expect(screen.getByTestId("values").textContent).toBe("dark:4");

    act(() => storage.clearSync());

    expect(screen.getByTestId("values").textContent).toBe("system:0");
  });

  it("re-reads after a change the library never made", () => {
    const storage = syncStorage();

    function Show() {
      const [{ theme }] = useStorageValues(storage, ["theme"]);

      return <span data-testid="values">{theme}</span>;
    }

    render(<Show />);
    act(() => {
      storage.setSync("theme", "dark");
      notifyStorageChanged(storage, "theme");
    });

    expect(screen.getByTestId("values").textContent).toBe("dark");
  });

  it("shares a key's answer with a hook reading that key alone", () => {
    const storage = syncStorage();
    const seen: Array<unknown> = [];

    function Show() {
      const [{ recentSearches }] = useStorageValues(storage, ["recentSearches", "theme"]);
      const [alone] = useStorageValue(storage, "recentSearches");

      seen.push(recentSearches, alone);

      return null;
    }

    render(<Show />);

    expect(new Set(seen).size).toBe(1);
  });
});

describe("a list that changes between renders", () => {
  it("reads and follows the keys it is given now, not the ones it was given first", () => {
    const storage = syncStorage();

    function Show({
      keys,
    }: {
      readonly keys: ReadonlyArray<"theme" | "visitCount" | "displayName">;
    }) {
      const [values] = useStorageValues(storage, keys);

      return <span data-testid="values">{JSON.stringify(values)}</span>;
    }

    const { rerender } = render(<Show keys={["theme"]} />);

    expect(JSON.parse(screen.getByTestId("values").textContent ?? "")).toEqual({ theme: "system" });

    rerender(<Show keys={["theme", "visitCount"]} />);

    expect(JSON.parse(screen.getByTestId("values").textContent ?? "")).toEqual({
      theme: "system",
      visitCount: 0,
    });

    rerender(<Show keys={["visitCount"]} />);
    act(() => storage.setSync("visitCount", 9));

    expect(JSON.parse(screen.getByTestId("values").textContent ?? "")).toEqual({ visitCount: 9 });
  });

  it("throws during the render for a key the schema does not declare", () => {
    const storage = syncStorage();
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});

    function Show() {
      useStorageValues(storage, ["theme", "nope" as "theme"]);

      return null;
    }

    expect(() => render(<Show />)).toThrow(UnknownStorageKeyError);
    reported.mockRestore();
  });
});

describe("the writer useStorageValues hands back", () => {
  it("writes several keys at once, re-rendering each reader of a key it wrote", () => {
    const storage = syncStorage();
    const visits = vi.fn();

    function Pair() {
      const [values, writer] = useStorageValues(storage, ["theme", "user"]);

      return (
        <button type="button" onClick={() => writer.set({ theme: "dark", user: ada })}>
          {`${values.theme}:${values.user?.name ?? "nobody"}`}
        </button>
      );
    }

    function Visits() {
      const [count] = useStorageValue(storage, "visitCount");

      visits();

      return <span>{count}</span>;
    }

    render(
      <>
        <Pair />
        <Visits />
      </>,
    );
    visits.mockClear();
    act(() => screen.getByRole("button").click());

    expect(screen.getByRole("button").textContent).toBe("dark:Ada");
    expect(visits).not.toHaveBeenCalled();
  });

  it("announces only the keys it wrote, over a stand-in that cannot be followed", () => {
    const storage = unfollowable(syncStorage());
    const users = vi.fn();

    /* A stored object, so that a needless re-read parses a new one and re-renders its reader. */
    storage.setSync("user", ada);

    function Pair() {
      const [values, writer] = useStorageValues(storage, ["theme", "user"]);

      return (
        <button type="button" onClick={() => writer.set({ theme: "dark" })}>
          {values.theme}
        </button>
      );
    }

    function User() {
      const [user] = useStorageValue(storage, "user");

      users();

      return <span>{user?.name}</span>;
    }

    render(
      <>
        <Pair />
        <User />
      </>,
    );
    users.mockClear();
    act(() => screen.getByRole("button").click());

    expect(screen.getByRole("button").textContent).toBe("dark");
    expect(users).not.toHaveBeenCalled();
  });

  it("announces every key it wrote, over a stand-in that cannot be followed", () => {
    const storage = unfollowable(syncStorage());

    function Pair() {
      const [, writer] = useStorageValues(storage, ["theme", "visitCount"]);

      return (
        <button type="button" onClick={() => writer.set({ theme: "dark", visitCount: 5 })}>
          write
        </button>
      );
    }

    function Readers() {
      const [theme] = useStorageValue(storage, "theme");
      const [visits] = useStorageValue(storage, "visitCount");

      return <span data-testid="readers">{`${theme}:${String(visits)}`}</span>;
    }

    render(
      <>
        <Pair />
        <Readers />
      </>,
    );
    act(() => screen.getByRole("button").click());

    expect(screen.getByTestId("readers").textContent).toBe("dark:5");
  });

  it("removes every key the hook reads, or only those given", () => {
    const storage = syncStorage();
    storage.setManySync({ theme: "dark", user: ada });

    function Pair() {
      const [values, writer] = useStorageValues(storage, ["theme", "user"]);

      return (
        <>
          <span data-testid="values">{`${values.theme}:${values.user?.name ?? "nobody"}`}</span>
          <button type="button" onClick={() => writer.remove(["user"])}>
            some
          </button>
          <button type="button" onClick={() => writer.remove()}>
            all
          </button>
        </>
      );
    }

    render(<Pair />);
    act(() => screen.getByRole("button", { name: "some" }).click());

    expect(screen.getByTestId("values").textContent).toBe("dark:nobody");

    act(() => screen.getByRole("button", { name: "all" }).click());

    expect(screen.getByTestId("values").textContent).toBe("system:nobody");
  });

  it("throws for a value the schema refuses, writing and announcing nothing", () => {
    /* Over a stand-in that cannot be followed, where the writer's own announcement is all a reader hears, so announcing despite the refusal would show. */
    const storage = unfollowable(syncStorage());
    const rendered = vi.fn();
    let write: (() => void) | undefined;

    function Pair() {
      const [values, writer] = useStorageValues(storage, ["theme", "visitCount"]);

      rendered();
      write = () => {
        writer.set({ theme: "dark", visitCount: -1 });
      };

      return <span>{values.theme}</span>;
    }

    render(<Pair />);
    rendered.mockClear();

    expect(() => {
      write?.();
    }).toThrow(StorageValidationError);
    expect(storage.getSync("theme")).toBe("system");
    expect(rendered).not.toHaveBeenCalled();
  });

  it("keeps its identity across renders", () => {
    const storage = syncStorage();
    const writers: Array<unknown> = [];

    function Pair() {
      const [count, setCount] = useState(0);
      const [, writer] = useStorageValues(storage, ["theme", "user"]);

      writers.push(writer);

      return (
        <button type="button" onClick={() => setCount(count + 1)}>
          {count}
        </button>
      );
    }

    render(<Pair />);
    act(() => screen.getByRole("button").click());

    expect(new Set(writers).size).toBe(1);
  });
});
