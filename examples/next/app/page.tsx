import { Code } from "@examples/ui";
import {
  HydrationPanel,
  Playground,
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
          Every panel below is rendered once on a server that has no <Code>localStorage</Code> at
          all, and again in this browser. Disable JavaScript and reload to see what the server alone
          can answer with: the schema&rsquo;s declared defaults, and nothing you have stored.
        </>
      }
      leading={
        <>
          <ServerRenderPanel />
          <ServerUnavailablePanel />
          <HydrationPanel />
        </>
      }
    />
  );
}
