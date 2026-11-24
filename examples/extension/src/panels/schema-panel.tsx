import { appSchema, KEY_NOTES } from "@examples/schema";
// The definition module itself, read as text. WXT builds with Vite, so this is the same one-line import the Vite example uses.
import schemaSource from "@examples/schema/schema-source?raw";
import { Badge, Card, Code, CodeBlock, Disclosure } from "@examples/ui";

import { local } from "../store/storages";

const REFUSED = `// @platform-storage/web hands you both halves:
const theme = webStorage.getSync("theme");        // "light" | "dark" | "system"

// @platform-storage/webextension has no synchronous half, so neither line compiles.
webExtensionStorage.getSync("theme");
//                  ~~~~~~~ Property 'getSync' does not exist on type
//                          'PlatformStorage<AppDefinition>'.

useStorageValue(webExtensionStorage, "theme");
//              ~~~~~~~~~~~~~~~~~~~ Argument of type 'PlatformStorage<AppDefinition>'
//                                  is not assignable to parameter of type
//                                  'SyncPlatformStorage<AppDefinition>'.

// This is the one that does:
const [theme] = useAsyncStorageValue(webExtensionStorage, "theme");`;

/** The schema, and the one thing it does not decide: whether a read answers now or later, which is the adapter's to say. */
export function SchemaPanel() {
  const half = Reflect.get(local, "getSync") === undefined ? "absent" : "present";

  return (
    <Card
      title="The schema"
      lead="Every key, the name it is stored under, and what a read returns."
      aside={<Badge tone={half === "absent" ? "success" : "danger"}>getSync {half}</Badge>}
      how={
        <>
          <p>
            The definition lives in a package of its own with no DOM types, and the two browser
            examples import the very same file. Nothing in it knows these values live in an
            extension area rather than in <Code>localStorage</Code>.
          </p>
          <p>
            What the schema does not decide is whether a read answers now or later. The adapter
            does, and an area only ever answers later, so this storage has no <Code>getSync</Code>:
            the badge checks it at runtime, and the types refuse it before that.
          </p>
          <CodeBlock code={REFUSED} />
        </>
      }
    >
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-soft">
            <th className="pb-2 font-medium">Key</th>
            <th className="pb-2 font-medium">Stored as</th>
            <th className="pb-2 font-medium">A read returns</th>
          </tr>
        </thead>
        <tbody>
          {appSchema.keys.map((key) => {
            const physical = appSchema.physicalKeys[key];

            return (
              <tr key={key} className="border-t border-line">
                <td className="py-1.5 pr-3 align-top">
                  <Code>{key}</Code>
                </td>
                <td className="py-1.5 pr-3 align-top">
                  {physical === key ? (
                    <span className="text-xs text-faint">same</span>
                  ) : (
                    <Badge tone="info">{physical}</Badge>
                  )}
                </td>
                <td className="py-1.5 align-top font-mono text-[11px] text-muted">
                  {KEY_NOTES[key].readType}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Closed by default: the table answers what a reader usually wants, and the source is there for the rest. */}
      <Disclosure summary="Show the source" className="mt-4">
        <CodeBlock code={schemaSource.trim()} />
      </Disclosure>
    </Card>
  );
}
