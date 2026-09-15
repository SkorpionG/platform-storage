"use client";

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

import { useStorageValue } from "@platform-storage/react";

import { local } from "../store/storage";

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
  const [theme, themeWriter] = useStorageValue(local, "theme");
  const [displayName, displayNameWriter] = useStorageValue(local, "displayName");
  const [reducedMotion, reducedMotionWriter] = useStorageValue(local, "reducedMotion");
  const [fontScale, fontScaleWriter] = useStorageValue(local, "fontScale");
  const [visitCount, visitCountWriter] = useStorageValue(local, "visitCount");
  const [recentSearches, recentSearchesWriter] = useStorageValue(local, "recentSearches");
  const [user, userWriter] = useStorageValue(local, "user");
  const [lastDismissed, lastDismissedWriter] = useStorageValue(local, "lastDismissed");
  const [nickname, nicknameWriter] = useStorageValue(local, "nickname");

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
            onChange={(next) => themeWriter.set(next)}
          />
        </Row>

        <Row storageKey="displayName" value={displayName}>
          <TextField
            label="Display name"
            value={displayName ?? ""}
            placeholder="unset"
            onChange={(next) => {
              if (next === "") displayNameWriter.remove();
              else displayNameWriter.set(next);
            }}
          />
        </Row>

        <Row storageKey="reducedMotion" value={reducedMotion}>
          <Switch
            label="Reduced motion"
            checked={reducedMotion}
            onChange={(next) => reducedMotionWriter.set(next)}
          />
        </Row>

        <Row storageKey="fontScale" value={fontScale}>
          <Slider
            label="Font scale"
            value={fontScale}
            min={0.75}
            max={2}
            step={0.05}
            onChange={(next) => fontScaleWriter.set(next)}
          />
        </Row>

        <Row storageKey="visitCount" value={visitCount}>
          <Stepper
            label="Visit count"
            value={visitCount}
            onChange={(next) => visitCountWriter.set(next)}
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
            onChange={(next) => recentSearchesWriter.set(next)}
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
            onClick={() => userWriter.set({ id: "u_1", name: draftName || "Ada" })}
          >
            Save
          </Button>
          <Button onClick={() => userWriter.remove()}>Remove</Button>
        </Row>

        <Row storageKey="lastDismissed" value={lastDismissed}>
          <Button onClick={() => lastDismissedWriter.set("banner-a")}>Set text</Button>
          <Button onClick={() => lastDismissedWriter.set(null)}>Store null</Button>
          <Button onClick={() => lastDismissedWriter.remove()}>Remove</Button>
        </Row>

        <Row storageKey="nickname" value={nickname}>
          <TextField
            label="Nickname"
            value={nickname ?? ""}
            placeholder="unset"
            onChange={(next) => nicknameWriter.set(next === "" ? undefined : next)}
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
