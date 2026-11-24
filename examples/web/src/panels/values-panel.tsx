"use client";

import { appSchema, KEY_NOTES } from "@examples/schema";
import type { AppKey } from "@examples/schema";
import {
  Badge,
  Button,
  Card,
  Field,
  Prose,
  SegmentedControl,
  Slider,
  Stepper,
  Switch,
  TagInput,
  TextField,
  Value,
} from "@examples/ui";
import { notifyStorageChanged, useHydrated, useStorageValue } from "@platform-storage/react";
import { isSyncStorageAdapter } from "@platform-storage/web";
import { useState } from "react";

import { local } from "../store/storage";

/** The rows this card has, in the order shown. `layout` and `accent` are on the Bad data tab, where planting old data is what shows them working. */
const ROWS: ReadonlyArray<AppKey> = [
  "theme",
  "displayName",
  "reducedMotion",
  "fontScale",
  "visitCount",
  "recentSearches",
  "user",
  "lastDismissed",
  "nickname",
];

/** The name `user` was stored under before it moved to `app:user`. */
const LEGACY_USER = appSchema.definition.user.readFrom[0];

interface RowProps {
  readonly storageKey: AppKey;
  readonly value: unknown;
  readonly children: React.ReactNode;
  /** What the row's last action did, where that is more than the value itself shows. */
  readonly outcome?: React.ReactNode;
}

function Row({ storageKey, value, children, outcome }: RowProps) {
  const note = KEY_NOTES[storageKey];

  return (
    <Field
      label={note.label}
      hint={
        <>
          <Prose text={note.hint} />
          <span className="mx-1.5 text-faint">·</span>
          <span className="font-mono text-faint">{note.readType}</span>
          <span className="mx-1.5 text-faint">→</span>
          <Value value={value} />
          {outcome === undefined ? null : <span className="ml-2">{outcome}</span>}
        </>
      }
    >
      {children}
    </Field>
  );
}

/* Writes past the library, the way a release from before the rename left it, then tells the page, whose next read moves it. */
function plantLegacyUser(): void {
  const { adapter } = local;

  if (!isSyncStorageAdapter(adapter)) return;

  try {
    adapter.removeSync(local.physicalKey("user"));
    adapter.setSync(LEGACY_USER, JSON.stringify({ id: "u_legacy", name: "Grace" }));
  } catch {
    return;
  }

  notifyStorageChanged(local, "user");
}

/* Read after the hooks, whose read is what moves the value, and only once hydrated: a server has nothing stored to look at. */
function holdsLegacyUser(): boolean {
  const { adapter } = local;

  if (!isSyncStorageAdapter(adapter)) return false;

  try {
    return adapter.getSync(LEGACY_USER) !== undefined;
  } catch {
    return false;
  }
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
  const [plantedLegacy, setPlantedLegacy] = useState(false);
  const hydrated = useHydrated();

  return (
    <Card
      title="Every kind of value"
      lead="Change any control. The line under it is what a read returns now."
      how={
        <>
          <dl className="space-y-1.5">
            {ROWS.map((key) => (
              <div key={key}>
                <dt className="inline font-medium text-muted">{KEY_NOTES[key].label}. </dt>
                <dd className="inline">
                  <Prose text={KEY_NOTES[key].note} />
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Store <Prose text="`null`" /> under Last dismissed, then remove it: a stored{" "}
            <Prose text="`null`" /> reads back as <Prose text="`null`" />, and only an absent key
            reads as <Prose text="`undefined`" />. Theme is wired to the page, so writing it
            repaints everything.
          </p>
        </>
      }
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
          <Button onClick={() => visitCountWriter.update((count) => count + 1)}>
            Count a visit
          </Button>
        </Row>

        <Row storageKey="recentSearches" value={recentSearches}>
          <TagInput
            label="Recent searches"
            values={recentSearches}
            onChange={(next) => recentSearchesWriter.set(next)}
          />
        </Row>

        <Row
          storageKey="user"
          value={user}
          outcome={
            plantedLegacy && hydrated ? (
              <output aria-label="Legacy user">
                {holdsLegacyUser() ? (
                  <Badge tone="warning">{LEGACY_USER} still there</Badge>
                ) : (
                  <Badge tone="success">moved from {LEGACY_USER} ✓</Badge>
                )}
              </output>
            ) : undefined
          }
        >
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
          <Button
            onClick={() => {
              plantLegacyUser();
              setPlantedLegacy(true);
            }}
            title={`Store a user under ${LEGACY_USER}, the name it had before`}
          >
            Plant {LEGACY_USER}
          </Button>
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
    </Card>
  );
}
