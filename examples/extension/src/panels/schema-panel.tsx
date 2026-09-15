import { appSchema, KEY_NOTES } from "@examples/schema";
// The definition module itself, read as text. WXT builds with Vite, so this is the same one-line import the Vite example uses.
import schemaSource from "@examples/schema/schema-source?raw";
import { Badge, Card, Code, CodeBlock } from "@examples/ui";

export function SchemaPanel() {
  return (
    <Card
      title="One schema, every platform"
      description={
        <>
          The definition below lives in its own package with no DOM types, and the two browser
          examples in this repository import the very same file. Nothing in it knows that these
          values are about to live in an extension area rather than in <Code>localStorage</Code>.
        </>
      }
    >
      <CodeBlock code={schemaSource.trim()} />

      <table className="mt-4 w-full border-separate border-spacing-0 text-left">
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

      <p className="mt-3 text-xs leading-relaxed text-soft">
        Every read on this page returns a promise, so each one reports a status beside its value.
        That is the one thing the schema does not decide: the adapter does, and an extension area
        only ever answers later.
      </p>
    </Card>
  );
}
