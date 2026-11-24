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
} from "@examples/ui";
import { useAsyncStorageValue } from "@platform-storage/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { browser } from "wxt/browser";

import { AsyncValue, NotReady } from "../async-value";
import { useAreaContents } from "../hooks/use-area-contents";
import { local } from "../store/storages";

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
  readonly stored: React.ComponentProps<typeof AsyncValue>["stored"];
  readonly children: ReactNode;
  /** What the row's last action did, where that is more than the value itself shows. */
  readonly outcome?: ReactNode;
}

function Row({ storageKey, stored, children, outcome }: RowProps) {
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
          <AsyncValue stored={stored} />
          {outcome === undefined ? null : <span className="ml-2">{outcome}</span>}
        </>
      }
    >
      {children}
    </Field>
  );
}

/* Writes past the library, the way a release from before the rename left it. The browser reports the change, and the hook's next read moves it. */
async function plantLegacyUser(): Promise<void> {
  await browser.storage.local.remove(local.physicalKey("user"));
  await browser.storage.local.set({ [LEGACY_USER]: { id: "u_legacy", name: "Grace" } });
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
  const [plantedLegacy, setPlantedLegacy] = useState(false);
  const area = useAreaContents("local");
  const legacyHeld = area.entries.some((entry) => entry.key === LEGACY_USER);

  return (
    <Card
      title="Every kind of value"
      lead="Change any control. The line under it is what a read of storage.local returns now."
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
            reads as <Prose text="`undefined`" />. An area keeps that distinction natively, because
            it stores the value rather than text.
          </p>
          <p>
            Theme is wired to the page, so writing it repaints everything, including the popup once
            the change reaches it. Every value here reports a status, because an area only ever
            answers later.
          </p>
        </>
      }
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

        <Row storageKey="recentSearches" stored={recentSearches}>
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

        <Row
          storageKey="user"
          stored={user}
          outcome={
            plantedLegacy ? (
              <output aria-label="Legacy user">
                {legacyHeld ? (
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
            onClick={() => void userWriter.set({ id: "u_1", name: draftName || "Ada" })}
          >
            Save
          </Button>
          <Button onClick={() => void userWriter.remove()}>Remove</Button>
          <Button
            onClick={() => {
              setPlantedLegacy(true);
              void plantLegacyUser();
            }}
            title={`Store a user under ${LEGACY_USER}, the name it had before`}
          >
            Plant {LEGACY_USER}
          </Button>
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
    </Card>
  );
}
