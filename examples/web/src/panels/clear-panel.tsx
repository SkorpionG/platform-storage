"use client";

import { Button, Card, Code } from "@examples/ui";

import { notifyStorageChanged } from "@platform-storage/react";

import { local } from "../store/storage";

const FOREIGN_KEY = "analytics:session";

export function ClearPanel() {
  return (
    <Card
      title="clear() removes only what the schema declares"
      description="An origin is shared. Another script, another library, or another storage over a different schema may be keeping things beside yours, and wiping the origin would take all of it."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            window.localStorage.setItem(FOREIGN_KEY, '"belongs to someone else"');
            notifyStorageChanged(local);
          }}
        >
          Plant a foreign key
        </Button>
        <Button
          tone="danger"
          onClick={() => {
            local.clearSync();
            notifyStorageChanged(local);
          }}
        >
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
