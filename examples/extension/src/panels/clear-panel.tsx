import { storedNamesOf } from "@examples/schema";
import { Badge, Button, Card, Code, Outcome } from "@examples/ui";
import { useState } from "react";
import { browser } from "wxt/browser";

import { useAreaContents } from "../hooks/use-area-contents";
import { local } from "../store/storages";

const FOREIGN_KEY = "analytics:session";
const DECLARED = storedNamesOf([local]);

interface LastRun {
  readonly call: string;
  readonly removed: ReadonlyArray<string>;
}

async function namesInLocal(): Promise<ReadonlySet<string>> {
  return new Set((await local.adapter.keys?.()) ?? []);
}

/** Runs a clear and reports which names it took, by listing the area either side of it. */
async function measure(call: string, run: () => Promise<void>): Promise<LastRun> {
  const before = await namesInLocal();
  await run();
  const after = await namesInLocal();

  return { call, removed: [...before].filter((name) => !after.has(name)) };
}

export function ClearPanel() {
  const { entries } = useAreaContents("local");
  const [last, setLast] = useState<LastRun | undefined>();

  const declared = entries.filter((entry) => DECLARED.has(entry.key)).length;
  const foreign = entries.some((entry) => entry.key === FOREIGN_KEY);

  const clear = (call: string, run: () => Promise<void>): void => {
    void measure(call, run).then(setLast);
  };

  return (
    <Card
      title="Clear"
      lead="Plant a key that belongs to someone else, then try each clear and see what it took."
      how={
        <>
          <p>
            An area is shared. Another part of the extension, a second storage over a different
            schema, or a value written before this schema existed may all sit beside yours, so
            anything wider than the schema has to be asked for by name.
          </p>
          <p>
            <Code>clear()</Code> removes the declared names in one call rather than calling{" "}
            <Code>storage.local.clear()</Code>. <Code>&quot;undeclared&quot;</Code> lists the area
            and removes every name the schema does not declare; this storage has no prefix to stay
            inside, so that takes the foreign key too. <Code>&quot;everything&quot;</Code> is one{" "}
            <Code>storage.local.clear()</Code>. The browser reports each removal, so every page
            following the area hears it.
          </p>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-line bg-inset px-3 py-2">
        <Outcome label="Schema keys in storage.local">
          <Badge>{declared}</Badge>
        </Outcome>
        <Outcome label={FOREIGN_KEY}>
          <Badge tone={foreign ? "info" : "neutral"}>{foreign ? "present" : "absent"}</Badge>
        </Outcome>
        {last === undefined ? null : (
          <div className="w-full border-t border-line pt-1.5">
            <Outcome label={<Code>{last.call}</Code>}>
              <output aria-label="Clear removed" className="flex flex-wrap items-center gap-1.5">
                {last.removed.length === 0 ? (
                  <span className="text-faint">removed nothing</span>
                ) : (
                  <>
                    <span className="text-soft">removed {last.removed.length}:</span>
                    {last.removed.map((name) => (
                      <Badge key={name}>{name}</Badge>
                    ))}
                  </>
                )}
              </output>
            </Outcome>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() =>
            void browser.storage.local.set({ [FOREIGN_KEY]: "belongs to someone else" })
          }
        >
          Plant a foreign key
        </Button>
        <Button tone="danger" onClick={() => clear("clear()", () => local.clear())}>
          clear()
        </Button>
        <Button
          tone="danger"
          onClick={() => clear('clear("undeclared")', () => local.clear("undeclared"))}
        >
          clear(&quot;undeclared&quot;)
        </Button>
        <Button
          tone="danger"
          onClick={() => clear('clear("everything")', () => local.clear("everything"))}
        >
          clear(&quot;everything&quot;)
        </Button>
      </div>
    </Card>
  );
}
