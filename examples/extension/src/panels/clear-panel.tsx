import { Button, Card, Code } from "@examples/ui";
import { browser } from "wxt/browser";

import { local } from "../store/storages";

const FOREIGN_KEY = "analytics:session";

export function ClearPanel() {
  return (
    <Card
      title="clear() removes only what the schema declares"
      description="An area is shared. Another part of the same extension, a second storage over a different schema, or a value written before this schema existed may all be keeping things beside yours, and wiping the area would take all of it."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() =>
            void browser.storage.local.set({ [FOREIGN_KEY]: "belongs to someone else" })
          }
        >
          Plant a foreign key
        </Button>
        <Button tone="danger" onClick={() => void local.clear()}>
          clear()
        </Button>
        <Button tone="danger" onClick={() => void local.clear("undeclared")}>
          clear("undeclared")
        </Button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        Plant <Code>{FOREIGN_KEY}</Code>, fill some values above, then clear. Every schema key
        disappears from the inspector and the foreign key stays exactly where it was. The library
        removes the keys it declared, naming them in one call, rather than calling{" "}
        <Code>storage.local.clear()</Code>. No button goes through the change bridge on its own
        account — the browser reports every one, which is what moves the inspector.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-soft">
        <Code>clear("undeclared")</Code> does the opposite: it lists the area and removes every name
        the schema does not declare. This storage has no prefix to stay inside, so that takes the
        foreign key too — which is why anything wider than the default has to be asked for by name.
      </p>
    </Card>
  );
}
