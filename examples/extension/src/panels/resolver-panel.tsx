import { Badge, Button, Card, Code, Field, Value } from "@examples/ui";
import { isPlatformStorageError, resolveWebExtensionStorage } from "@platform-storage/webextension";
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
      title="Which API the library found"
      lead="The global the library chose, the names it uses, and a read through a storage with no API at all."
      how={
        <>
          <p>
            An extension API is looked for on <Code>browser</Code> first and <Code>chrome</Code>{" "}
            second, because <Code>browser</Code> is promise-based everywhere it exists while{" "}
            <Code>chrome</Code> is a compatibility namespace on Firefox. Load the Firefox build to
            check: it defines both, and only the first is used.
          </p>
          <p>
            Nothing is cached, so a worker that has not finished starting is not a permanent
            failure. <Value value={undefined} /> from <Code>resolveWebExtensionStorage()</Code> is
            an answer rather than a throw: what to do about a missing API is the caller&rsquo;s to
            decide. The storage with no API reads the way a context without the <Code>storage</Code>{" "}
            permission would, and its failure lands in the Error log.
          </p>
        </>
      }
      aside={<Badge tone={chosen === undefined ? "danger" : "success"}>{chosen ?? "none"}</Badge>}
    >
      <div className="divide-y divide-line">
        <Field
          label="Globals carrying a storage namespace"
          hint="Tried in this order; the first wins."
        >
          {HOSTS.map((host) => (
            <Badge key={host} tone={hasStorage(host) ? "success" : "neutral"}>
              {host}
              {host === chosen ? " ✓" : ""}
            </Badge>
          ))}
        </Field>

        <Field label="resolveWebExtensionStorage()" hint="The library's own lookup, exported.">
          <Badge tone={resolveWebExtensionStorage() === undefined ? "danger" : "success"}>
            {resolveWebExtensionStorage() === undefined ? "undefined" : "a storage namespace"}
          </Badge>
        </Field>

        <Field label="adapter.name" hint="The name every error reports.">
          <Badge tone="info">{local.adapter.name}</Badge>
        </Field>

        <Field
          label={`physicalKey("user")`}
          hint="The name the area holds. Look for it in the inspector."
        >
          <Badge tone="info">{local.physicalKey("user")}</Badge>
        </Field>

        <Field
          label="A storage whose backend is never there"
          hint="Its backend answers with nothing. Reported, not fatal."
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
    </Card>
  );
}
