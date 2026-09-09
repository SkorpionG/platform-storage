import { KEY_NOTES } from "@examples/schema";
import type { AppKey } from "@examples/schema";
import {
  Button,
  Card,
  Divider,
  Field,
  SegmentedControl,
  Slider,
  Stepper,
  Switch,
  TagInput,
  TextField,
  Value,
} from "@examples/ui";
import { useState } from "react";

import { local } from "../storage";
import { useStoredValue, useWrite } from "../use-storage";

interface RowProps {
  readonly storageKey: AppKey;
  readonly value: unknown;
  readonly children: React.ReactNode;
  /** How to work the control, where that is not obvious from looking at it. */
  readonly usage?: string | undefined;
}

function Row({ storageKey, value, children, usage }: RowProps) {
  const note = KEY_NOTES[storageKey];

  return (
    <Field
      label={note.label}
      hint={
        <>
          <span className="font-mono text-soft">{note.readType}</span>
          <span className="mx-1.5 text-faint">·</span>
          <Value value={value} />
          <p className="mt-1 text-soft">{note.note}</p>
          {usage === undefined ? null : <p className="mt-1 text-faint">{usage}</p>}
        </>
      }
    >
      {children}
    </Field>
  );
}

export function ValuesPanel() {
  const write = useWrite();

  const theme = useStoredValue(local, "theme");
  const displayName = useStoredValue(local, "displayName");
  const reducedMotion = useStoredValue(local, "reducedMotion");
  const fontScale = useStoredValue(local, "fontScale");
  const visitCount = useStoredValue(local, "visitCount");
  const recentSearches = useStoredValue(local, "recentSearches");
  const user = useStoredValue(local, "user");
  const lastDismissed = useStoredValue(local, "lastDismissed");
  const nickname = useStoredValue(local, "nickname");

  const [draftName, setDraftName] = useState(user?.name ?? "");

  return (
    <Card
      title="Every value kind the library supports"
      description="Each control writes through the typed API and reads straight back. The caption under each one is the type that read returns, and why. Theme is wired to the page, so writing it repaints everything."
    >
      <div className="divide-y divide-line">
        <Row storageKey="theme" value={theme}>
          <SegmentedControl
            label="Theme"
            value={theme}
            options={["light", "dark", "system"]}
            onChange={(next) => write(() => local.setSync("theme", next))}
          />
        </Row>

        <Row storageKey="displayName" value={displayName}>
          <TextField
            label="Display name"
            value={displayName ?? ""}
            placeholder="unset"
            onChange={(next) =>
              write(() => {
                if (next === "") local.removeSync("displayName");
                else local.setSync("displayName", next);
              })
            }
          />
        </Row>

        <Row storageKey="reducedMotion" value={reducedMotion}>
          <Switch
            label="Reduced motion"
            checked={reducedMotion}
            onChange={(next) => write(() => local.setSync("reducedMotion", next))}
          />
        </Row>

        <Row storageKey="fontScale" value={fontScale}>
          <Slider
            label="Font scale"
            value={fontScale}
            min={0.75}
            max={2}
            step={0.05}
            onChange={(next) => write(() => local.setSync("fontScale", next))}
          />
        </Row>

        <Row storageKey="visitCount" value={visitCount}>
          <Stepper
            label="Visit count"
            value={visitCount}
            onChange={(next) => write(() => local.setSync("visitCount", next))}
          />
        </Row>

        <Row
          storageKey="recentSearches"
          value={recentSearches}
          usage="Type a term, then press Add or Enter. Click an entry to remove it."
        >
          <TagInput
            label="Recent searches"
            values={recentSearches}
            onChange={(next) => write(() => local.setSync("recentSearches", next))}
          />
        </Row>

        <Row storageKey="user" value={user}>
          <TextField
            label="User name"
            value={draftName}
            placeholder="name"
            width="w-28"
            onChange={setDraftName}
          />
          <Button
            tone="primary"
            onClick={() =>
              write(() => local.setSync("user", { id: "u_1", name: draftName || "Ada" }))
            }
          >
            Save
          </Button>
          <Button onClick={() => write(() => local.removeSync("user"))}>Remove</Button>
        </Row>

        <Row storageKey="lastDismissed" value={lastDismissed}>
          <Button onClick={() => write(() => local.setSync("lastDismissed", "banner-a"))}>
            Set text
          </Button>
          <Button onClick={() => write(() => local.setSync("lastDismissed", null))}>
            Store null
          </Button>
          <Button onClick={() => write(() => local.removeSync("lastDismissed"))}>Remove</Button>
        </Row>

        <Row storageKey="nickname" value={nickname}>
          <TextField
            label="Nickname"
            value={nickname ?? ""}
            placeholder="unset"
            onChange={(next) =>
              write(() => local.setSync("nickname", next === "" ? undefined : next))
            }
          />
        </Row>
      </div>

      <Divider />
      <p className="pt-3 text-xs leading-relaxed text-soft">
        Storing <span className="font-mono text-muted">null</span> under Last dismissed and then
        removing it shows the difference the library insists on: a stored{" "}
        <span className="font-mono text-muted">null</span> reads back as{" "}
        <span className="font-mono text-muted">null</span>, and only an absent key reads as{" "}
        <span className="font-mono text-muted">undefined</span>.
      </p>
    </Card>
  );
}
