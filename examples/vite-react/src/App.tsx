import { Code } from "@examples/ui";
import { Playground } from "@examples/web";
// The definition module itself, read as text. Vite is what makes this a one-line import.
import schemaSource from "@examples/schema/schema-source?raw";

export function App() {
  return (
    <Playground
      eyebrow="@platform-storage/web"
      title="Schema-first storage, in a real browser"
      schemaSource={schemaSource}
      intro={
        <>
          Everything below runs against the actual <Code>localStorage</Code> of this page. Open
          devtools and watch the two panels on the right: the inspector shows the raw text on the
          origin, and the log shows every failure the library handled on your behalf.
        </>
      }
    />
  );
}
