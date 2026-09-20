import { Badge, Button, Code, Field, SegmentedControl, Stepper, TextField } from "@examples/ui";
import { useAsyncStorageValue, useStorageErrors } from "@platform-storage/react";
import { useSyncExternalStore } from "react";
import { browser } from "wxt/browser";

import { AppliedTheme } from "./applied-theme";
import { AsyncValue, NotReady } from "./async-value";
import { getObservedChange, subscribeToObservedChanges } from "./store/changes";
import { local } from "./store/storages";

/**
 * The popup: a second context over the same storage, not a second copy of the options page.
 *
 * It declares its own storage from the same schema, and everything it shows is a value the options page and the background worker are reading at the same moment. Leave both open and write in either.
 */
export function PopupApp() {
  const [theme, themeWriter] = useAsyncStorageValue(local, "theme");
  const [displayName, displayNameWriter] = useAsyncStorageValue(local, "displayName");
  const [visitCount, visitCountWriter] = useAsyncStorageValue(local, "visitCount");

  const change = useSyncExternalStore(subscribeToObservedChanges, getObservedChange);
  const errors = useStorageErrors();

  return (
    /* Generous top and bottom padding: a popup is its own window, so its first and last rows have nothing else to sit against. */
    <div className="bg-canvas px-4 pb-6 pt-5 text-fg">
      <AppliedTheme />

      <header className="mb-3">
        <p className="font-mono text-[11px] text-sky-600 dark:text-sky-400">
          @platform-storage/webextension
        </p>
        <h1 className="text-sm font-semibold tracking-tight">Same schema, second context</h1>
      </header>

      {/* `Field` zeroes its own first and last padding because it expects to sit inside a `Card`, whose body supplies the vertical space. This is not one, so it supplies it here instead. */}
      <div className="divide-y divide-line rounded-xl border border-line bg-surface px-4 py-3">
        <Field label="Theme" hint={<AsyncValue stored={theme} />}>
          {theme.status === "ready" ? (
            <SegmentedControl
              label="Theme"
              value={theme.value}
              options={["light", "dark", "system"]}
              onChange={(next) => void themeWriter.set(next)}
            />
          ) : (
            <NotReady stored={theme} />
          )}
        </Field>

        <Field label="Display name" hint={<AsyncValue stored={displayName} />}>
          {displayName.status === "ready" ? (
            <TextField
              label="Display name"
              value={displayName.value ?? ""}
              placeholder="unset"
              width="w-32"
              onChange={(next) => {
                if (next === "") void displayNameWriter.remove();
                else void displayNameWriter.set(next);
              }}
            />
          ) : (
            <NotReady stored={displayName} />
          )}
        </Field>

        <Field
          label="Visit count"
          hint="The background worker writes this one too, on an alarm every minute."
        >
          {visitCount.status === "ready" ? (
            <Stepper
              label="Visit count"
              value={visitCount.value}
              onChange={(next) => void visitCountWriter.set(next)}
            />
          ) : (
            <NotReady stored={visitCount} />
          )}
        </Field>

        <Field
          label="Last change seen"
          hint="Relayed from the browser's own feed, wherever it was made."
        >
          {change === undefined ? (
            <span className="text-xs text-faint">nothing yet</span>
          ) : (
            <>
              <Badge tone="info">storage.{change.area}</Badge>
              <Badge>{change.key ?? change.physicalKey}</Badge>
            </>
          )}
        </Field>

        <Field label="Failures" hint="This popup's own log. The options page keeps a separate one.">
          <Badge tone={errors.length === 0 ? "success" : "warning"}>{errors.length}</Badge>
        </Field>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-faint">
          Values live in <Code>storage.local</Code>, shared with every other context.
        </p>
        <Button tone="primary" onClick={() => void browser.runtime.openOptionsPage()}>
          Open the playground
        </Button>
      </div>
    </div>
  );
}
