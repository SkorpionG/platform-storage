import { useAsyncStorageValue } from "@platform-storage/react";
import { useEffect, useState } from "react";

import { AsyncValue } from "../components/async-value";
import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Pending } from "../components/pending";
import { Explain } from "../components/prose";
import { local } from "../store/storages";

/*
  Once per launch, and a launch is not a mount: navigation decides when a tab's screen mounts, so a counter guarded by one would be counting navigation. A module-level record is the launch, because a module is evaluated once per JavaScript runtime and a relaunch replaces the runtime.
*/
const LAUNCH: { readonly at: number; held: number | undefined; counted: boolean } = {
  at: Date.now(),
  held: undefined,
  counted: false,
};

export function RestartPanel() {
  const [visits, writer] = useAsyncStorageValue(local, "visitCount");
  /* Initialized from the record rather than from nothing, so returning to this tab shows the launch reading instead of taking another one. */
  const [held, setHeld] = useState(LAUNCH.held);

  useEffect(() => {
    if (LAUNCH.counted) return;
    LAUNCH.counted = true;

    /* Read before writing. What is worth showing is what the previous process left behind, not what this one has just done to it. */
    void local.get("visitCount").then((count) => {
      LAUNCH.held = count;
      setHeld(count);

      return writer.set(count + 1);
    });
  }, [writer]);

  return (
    <Card
      title="What survived the last launch"
      lead="Quit the app from the app switcher and open it again. The count it finds was written by the process you quit."
      how={
        <>
          <Explain text="Every other claim this app makes is about one process. This one is about two: the count was written by a process that no longer exists, and read back by this one off the device." />
          <Explain text="A reload from the developer menu bumps the counter too, because it replaces the JavaScript runtime. Only a force-quit also takes the process with it, and that is what makes the surviving value the device's rather than the runtime's." />
          <Explain text="A fake backend in a test holds its values for exactly as long as the process does, so nothing under a test runner can tell a write that reached a disk from one that never left memory. In development, saving a file can re-evaluate this module and count a launch of its own; a release build has no such thing." />
        </>
      }
      aside={<Badge tone={held === undefined ? "neutral" : "success"}>{held ?? "…"}</Badge>}
    >
      <Field
        first
        label="Already on the device at launch"
        hint="Read once, before this launch wrote anything. 0 on a fresh install: the declared default."
      >
        {held === undefined ? <Pending>reading…</Pending> : <Badge tone="info">{held}</Badge>}
      </Field>

      <Field
        label="Visit count now"
        hint="One more, written at launch. The stepper on the Values tab moves the same key."
      >
        <AsyncValue stored={visits} />
      </Field>

      <Field
        label="This launch started"
        hint="Not stored. It moves only when the runtime was really replaced."
      >
        <Badge>{new Date(LAUNCH.at).toLocaleTimeString()}</Badge>
      </Field>
    </Card>
  );
}
