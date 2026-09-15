import { Badge, Button, Card, Code, Field, Value } from "@examples/ui";
import { isPlatformStorageError, resolveExtensionStorage } from "@platform-storage/extension";
import { useState } from "react";

import { detached, local } from "../store/storages";

/** The globals an extension API lives on, in the order the library tries them. */
const HOSTS = ["browser", "chrome"] as const;

function hasStorage(host: string): boolean {
  const api: unknown = Reflect.get(globalThis, host);

  return typeof api === "object" && api !== null && "storage" in api;
}

export function ResolverPanel() {
  const [unavailable, setUnavailable] = useState<string>();

  const chosen = HOSTS.find((host) => hasStorage(host));

  return (
    <Card
      title="Which API the library found, and what it calls things"
      description="An extension API is looked for on browser first and chrome second, because browser is promise-based everywhere it exists while chrome is a compatibility namespace on Firefox. Nothing is cached: the lookup runs on every operation, so a worker that has not finished starting is not a permanent failure."
      aside={<Badge tone={chosen === undefined ? "danger" : "success"}>{chosen ?? "none"}</Badge>}
    >
      <div className="divide-y divide-line">
        <Field
          label="Globals carrying a storage namespace"
          hint="Tried in this order. The first one holding a storage namespace wins."
        >
          {HOSTS.map((host) => (
            <Badge key={host} tone={hasStorage(host) ? "success" : "neutral"}>
              {host}
              {host === chosen ? " ✓" : ""}
            </Badge>
          ))}
        </Field>

        <Field
          label="resolveExtensionStorage()"
          hint="The library's own lookup, exported so an application can ask the same question."
        >
          <Badge tone={resolveExtensionStorage() === undefined ? "danger" : "success"}>
            {resolveExtensionStorage() === undefined ? "undefined" : "a storage namespace"}
          </Badge>
        </Field>

        <Field
          label="adapter.name"
          hint="What the adapter calls itself, which is the name every error reports."
        >
          <Badge tone="info">{local.adapter.name}</Badge>
        </Field>

        <Field
          label={`physicalKey("user")`}
          hint="The key the area actually holds, for tooling that has to address it directly. Look for this one in the inspector."
        >
          <Badge tone="info">{local.physicalKey("user")}</Badge>
        </Field>

        <Field
          label="A storage whose backend is never there"
          hint="Built with a source that answers with nothing, which is what a context without the storage permission gets. The read is reported, not fatal."
        >
          <Button
            onClick={() =>
              void detached
                .get("theme")
                .then((value) => setUnavailable(`read ${String(value)}`))
                .catch((error: unknown) => {
                  setUnavailable(
                    isPlatformStorageError(error) ? `${error.name} · ${error.code}` : "Error",
                  );
                })
            }
          >
            Read through it
          </Button>
          {unavailable === undefined ? (
            <span className="text-xs text-faint">not read yet</span>
          ) : (
            <Badge tone="danger">{unavailable}</Badge>
          )}
        </Field>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        Load the Firefox build and this panel is how you check that <Code>browser</Code> was
        preferred: Firefox defines both globals, and only the first is used. Note also that{" "}
        <Value value={undefined} /> from <Code>resolveExtensionStorage()</Code> is an answer rather
        than a throw — deciding what to do about a missing API belongs to the caller.
      </p>
    </Card>
  );
}
