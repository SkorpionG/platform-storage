import { Badge, Value } from "@examples/ui";
import { STORED_VALUE_STATUS } from "@platform-storage/react";
import type { PlatformStorageError } from "@platform-storage/webextension";
import type { StoredValueStatus } from "@platform-storage/react";

/** Structural rather than `AsyncStoredValue<Definition>`, so one component serves every key's own type. */
export interface AsyncValueProps {
  readonly stored: {
    readonly status: StoredValueStatus;
    readonly value: unknown;
    readonly error: PlatformStorageError | undefined;
  };
}

/**
 * What an asynchronous read currently says.
 *
 * Branching on `status` rather than on `value` is the whole point: `"ready"` with a value of `undefined` means the key holds nothing, and testing the value instead would report that as still loading.
 */
export function AsyncValue({ stored }: AsyncValueProps) {
  if (stored.status === STORED_VALUE_STATUS.Loading) {
    return <span className="text-xs italic text-faint">reading…</span>;
  }

  if (stored.status === STORED_VALUE_STATUS.Failed) {
    return <Badge tone="danger">{stored.error?.code ?? "failed"}</Badge>;
  }

  return <Value value={stored.value} />;
}

/**
 * Stands in for a control that has no value to work with.
 *
 * It takes the read rather than rendering a fixed caption, because "still reading" and "the read failed" are different things to say and a control slot that says the first about the second is lying. The web examples need none of this: web storage answers during the render.
 */
export function NotReady({ stored }: AsyncValueProps) {
  if (stored.status === STORED_VALUE_STATUS.Failed) {
    return <Badge tone="danger">{stored.error?.code ?? "failed"}</Badge>;
  }

  return <span className="text-xs italic text-faint">reading…</span>;
}
