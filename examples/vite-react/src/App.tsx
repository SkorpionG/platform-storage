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
          Every tab runs against this page&rsquo;s real <Code>localStorage</Code>. Start with the
          tour; the inspector and the error log beside each tab show what happened.
        </>
      }
    />
  );
}
