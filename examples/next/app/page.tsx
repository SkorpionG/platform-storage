import { Code } from "@examples/ui";
import {
  HydrationPanel,
  Playground,
  SECTION,
  RequestLogPanel,
  ServerRenderPanel,
  ServerUnavailablePanel,
} from "@examples/web";

import { readSchemaSource } from "./schema-source";

export default async function Page() {
  const schemaSource = await readSchemaSource();

  return (
    <Playground
      eyebrow="@platform-storage/web · Next.js App Router"
      title="Schema-first storage, rendered on a server"
      schemaSource={schemaSource}
      intro={
        <>
          Every panel is rendered once on a server with no <Code>localStorage</Code>, and again in
          this browser. The Server tab shows the difference; disable JavaScript and reload to see
          the server&rsquo;s half alone.
        </>
      }
      defaultTab={SECTION.Server}
      platformTab={{
        id: SECTION.Server,
        content: (
          <>
            <ServerRenderPanel />
            <HydrationPanel />
            <RequestLogPanel />
            <ServerUnavailablePanel />
          </>
        ),
      }}
    />
  );
}
