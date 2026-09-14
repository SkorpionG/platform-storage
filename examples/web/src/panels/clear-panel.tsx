"use client";

import { Button, Card, Code } from "@examples/ui";

import { local } from "../store/storage";
import { useWrite } from "../hooks/use-storage";

const FOREIGN_KEY = "analytics:session";

export function ClearPanel() {
  const write = useWrite();

  return (
    <Card
      title="clear() removes only what the schema declares"
      description="An origin is shared. Another script, another library, or another storage over a different schema may be keeping things beside yours, and wiping the origin would take all of it."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() =>
            write(() => window.localStorage.setItem(FOREIGN_KEY, '"belongs to someone else"'))
          }
        >
          Plant a foreign key
        </Button>
        <Button tone="danger" onClick={() => write(() => local.clearSync())}>
          clearSync()
        </Button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        Plant <Code>{FOREIGN_KEY}</Code>, fill some values above, then clear. Every schema key
        disappears from the inspector and the foreign key stays exactly where it was. The library
        removes the keys it declared, one at a time, rather than calling{" "}
        <Code>localStorage.clear()</Code>.
      </p>
    </Card>
  );
}
