import { Badge, Card, Code, CodeBlock } from "@examples/ui";

import { local } from "../store/storages";

const REFUSED = `// @platform-storage/web hands you both halves:
const theme = webStorage.getSync("theme");        // "light" | "dark" | "system"

// @platform-storage/extension has no synchronous half, so neither line compiles.
extensionStorage.getSync("theme");
//               ~~~~~~~ Property 'getSync' does not exist on type
//                       'PlatformStorage<AppDefinition>'.

useStorageValue(extensionStorage, "theme");
//              ~~~~~~~~~~~~~~~~ Argument of type 'PlatformStorage<AppDefinition>'
//                               is not assignable to parameter of type
//                               'SyncPlatformStorage<AppDefinition>'.

// This is the one that does:
const [theme] = useAsyncStorageValue(extensionStorage, "theme");`;

export function NoSyncHalfPanel() {
  const half = Reflect.get(local, "getSync") === undefined ? "absent" : "present";

  return (
    <Card
      title="There is no synchronous half here, and the types say so"
      description="An adapter exposes what its backend can actually do rather than pretending every backend is the same. Web storage answers immediately and so grows getSync and friends; an extension area never does, so they are not there to call."
      aside={<Badge tone={half === "absent" ? "success" : "danger"}>getSync {half}</Badge>}
    >
      <CodeBlock code={REFUSED} />

      <p className="mt-3 text-xs leading-relaxed text-soft">
        The badge is a runtime check of the same fact: <Code>getSync</Code> is not a property of
        this storage. Nothing was disabled to arrange that. <Code>createStorage</Code> returns{" "}
        <Code>SyncPlatformStorage</Code> only for an adapter that declares it can answer
        immediately, and the extension adapter does not, so the synchronous methods are absent from
        the type and from the object alike.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-soft">
        That absence is what every other panel here is working around, and it is why each read shows
        a status: a read that has not landed yet is not the same answer as a key that holds nothing.
      </p>
    </Card>
  );
}
