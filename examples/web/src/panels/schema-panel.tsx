import { appSchema, KEY_NOTES } from "@examples/schema";
import { Badge, Card, Code, CodeBlock } from "@examples/ui";

export interface SchemaPanelProps {
  /** The definition module's own text, so what is shown can never drift from what runs. Vite has `?raw` for this and Next does not, so each app supplies it the way its own build can. */
  readonly source: string;
}

export function SchemaPanel({ source }: SchemaPanelProps) {
  return (
    <Card
      title="One schema, every platform"
      description={
        <>
          The definition below lives in its own package with no DOM types, and this app, an
          extension and a React Native app would all import it unchanged. Keys and value types are
          inferred from it, so nothing is restated at a call site.
        </>
      }
    >
      <CodeBlock code={source.trim()} />

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
    </Card>
  );
}
