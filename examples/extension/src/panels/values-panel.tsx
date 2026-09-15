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
} from "@examples/ui";
import { useAsyncStorageValue } from "@platform-storage/react";
import { useState } from "react";
import type { ReactNode } from "react";

import { AsyncValue, NotReady } from "../async-value";
import { local } from "../store/storages";

interface RowProps {
  readonly storageKey: AppKey;
  readonly stored: React.ComponentProps<typeof AsyncValue>["stored"];
  readonly children: ReactNode;
  /** How to work the control, where that is not obvious from looking at it. */
  readonly usage?: string | undefined;
}

function Row({ storageKey, stored, children, usage }: RowProps) {
  const note = KEY_NOTES[storageKey];

  return (
    <Field
      label={note.label}
      hint={
        <>
          <span className="font-mono text-soft">{note.readType}</span>
          <span className="mx-1.5 text-faint">·</span>
          <AsyncValue stored={stored} />
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
  const [theme, themeWriter] = useAsyncStorageValue(local, "theme");
  const [displayName, displayNameWriter] = useAsyncStorageValue(local, "displayName");
  const [reducedMotion, reducedMotionWriter] = useAsyncStorageValue(local, "reducedMotion");
  const [fontScale, fontScaleWriter] = useAsyncStorageValue(local, "fontScale");
  const [visitCount, visitCountWriter] = useAsyncStorageValue(local, "visitCount");
  const [recentSearches, recentSearchesWriter] = useAsyncStorageValue(local, "recentSearches");
  const [user, userWriter] = useAsyncStorageValue(local, "user");
  const [lastDismissed, lastDismissedWriter] = useAsyncStorageValue(local, "lastDismissed");
  const [nickname, nicknameWriter] = useAsyncStorageValue(local, "nickname");

  const [draftName, setDraftName] = useState("");

  return (
    <Card
      title="Every value kind the library supports"
      description="Each control writes through the typed API and reads straight back, over storage.local. The caption under each one is the type that read returns, and why. Theme is wired to the page, so writing it repaints everything — including the popup, once the change reaches it."
    >
      <div className="divide-y divide-line">
        <Row storageKey="theme" stored={theme}>
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
        </Row>

        <Row storageKey="displayName" stored={displayName}>
          {displayName.status === "ready" ? (
            <TextField
              label="Display name"
              value={displayName.value ?? ""}
              placeholder="unset"
              onChange={(next) => {
                if (next === "") void displayNameWriter.remove();
                else void displayNameWriter.set(next);
              }}
            />
          ) : (
            <NotReady stored={displayName} />
          )}
        </Row>

        <Row storageKey="reducedMotion" stored={reducedMotion}>
          {reducedMotion.status === "ready" ? (
            <Switch
              label="Reduced motion"
              checked={reducedMotion.value}
              onChange={(next) => void reducedMotionWriter.set(next)}
            />
          ) : (
            <NotReady stored={reducedMotion} />
          )}
        </Row>

        <Row storageKey="fontScale" stored={fontScale}>
          {fontScale.status === "ready" ? (
            <Slider
              label="Font scale"
              value={fontScale.value}
              min={0.75}
              max={2}
              step={0.05}
              onChange={(next) => void fontScaleWriter.set(next)}
            />
          ) : (
            <NotReady stored={fontScale} />
          )}
        </Row>

        <Row storageKey="visitCount" stored={visitCount}>
          {visitCount.status === "ready" ? (
            <Stepper
              label="Visit count"
              value={visitCount.value}
              onChange={(next) => void visitCountWriter.set(next)}
            />
          ) : (
            <NotReady stored={visitCount} />
          )}
        </Row>

        <Row
          storageKey="recentSearches"
          stored={recentSearches}
          usage="Type a term, then press Add or Enter. Click an entry to remove it."
        >
          {recentSearches.status === "ready" ? (
            <TagInput
              label="Recent searches"
              values={recentSearches.value}
              onChange={(next) => void recentSearchesWriter.set(next)}
            />
          ) : (
            <NotReady stored={recentSearches} />
          )}
        </Row>

        <Row storageKey="user" stored={user}>
          <TextField
            label="User name"
            value={draftName}
            placeholder="name"
            width="w-28"
            onChange={setDraftName}
          />
          <Button
            tone="primary"
            onClick={() => void userWriter.set({ id: "u_1", name: draftName || "Ada" })}
          >
            Save
          </Button>
          <Button onClick={() => void userWriter.remove()}>Remove</Button>
        </Row>

        <Row storageKey="lastDismissed" stored={lastDismissed}>
          <Button onClick={() => void lastDismissedWriter.set("banner-a")}>Set text</Button>
          <Button onClick={() => void lastDismissedWriter.set(null)}>Store null</Button>
          <Button onClick={() => void lastDismissedWriter.remove()}>Remove</Button>
        </Row>

        <Row storageKey="nickname" stored={nickname}>
          {nickname.status === "ready" ? (
            <TextField
              label="Nickname"
              value={nickname.value ?? ""}
              placeholder="unset"
              onChange={(next) => void nicknameWriter.set(next === "" ? undefined : next)}
            />
          ) : (
            <NotReady stored={nickname} />
          )}
        </Row>
      </div>

      <Divider />
      <p className="pt-3 text-xs leading-relaxed text-soft">
        Storing <span className="font-mono text-muted">null</span> under Last dismissed and then
        removing it shows the difference the library insists on: a stored{" "}
        <span className="font-mono text-muted">null</span> reads back as{" "}
        <span className="font-mono text-muted">null</span>, and only an absent key reads as{" "}
        <span className="font-mono text-muted">undefined</span>. An extension area keeps that
        distinction natively, because it stores the value rather than text.
      </p>
    </Card>
  );
}
