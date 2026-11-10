import { createStorage, defineStorageSchema, memoryAdapter } from "@platform-storage/core";
import type { SyncPlatformStorage } from "@platform-storage/core";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import * as z from "zod";

import { useStorageValue } from "../src/hooks/use-storage-value";
import { readDeclaredValue } from "../src/store/declared";

const schema = defineStorageSchema({
  note: { schema: z.string(), default: "none" },
});

type Definition = typeof schema.definition;

afterEach(cleanup);

function Note({
  storage,
  label,
}: {
  readonly storage: SyncPlatformStorage<Definition>;
  readonly label: string;
}) {
  const [note, writer] = useStorageValue(storage, "note");

  return (
    <button
      type="button"
      data-testid={label}
      onClick={() => {
        writer.set(`${label} wrote`);
      }}
    >
      {note}
    </button>
  );
}

describe("hooks over storages under different prefixes", () => {
  it("keep two storages on one backend apart", () => {
    const adapter = memoryAdapter();
    const first = createStorage({ schema, adapter, prefix: "a:" });
    const second = createStorage({ schema, adapter, prefix: "b:" });

    render(
      <>
        <Note storage={first} label="first" />
        <Note storage={second} label="second" />
      </>,
    );

    act(() => {
      screen.getByTestId("first").click();
    });

    expect(screen.getByTestId("first").textContent).toBe("first wrote");
    expect(screen.getByTestId("second").textContent).toBe("none");
    expect([...adapter.entries.keys()]).toEqual(["a:note"]);
  });

  it("move a bare value in under the prefix during the render that reads it", () => {
    const adapter = memoryAdapter({ initial: { note: '"from before"' } });
    const storage = createStorage({ schema, adapter, prefix: "app:", readUnprefixed: true });

    render(<Note storage={storage} label="adopting" />);

    expect(screen.getByTestId("adopting").textContent).toBe("from before");
    expect([...adapter.entries]).toEqual([["app:note", '"from before"']]);
  });

  it("answer a server render the same whatever the prefix", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter(), prefix: "app:" });

    expect(readDeclaredValue(storage, "note")).toBe("none");
  });
});
