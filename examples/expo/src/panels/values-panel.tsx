import { appSchema, KEY_NOTES } from "@examples/schema";
import type { AppKey } from "@examples/schema";
import { Button, Picker, Row, Slider, Switch } from "@expo/ui";
import { notifyStorageChanged, useAsyncStorageValue } from "@platform-storage/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AsyncValue, NotReady } from "../components/async-value";
import type { AsyncValueProps } from "../components/async-value";
import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Field } from "../components/field";
import { Explain, Prose } from "../components/prose";
import { TextRow } from "../components/text-row";
import { usePalette } from "../hooks/use-palette";
import { plantValue, readText, removeRaw } from "../store/raw";
import { local } from "../store/storages";
import { MONO, RADIUS } from "../theme";

/** The rows this card has, in the order shown. `layout` and `accent` are on the Resilience tab, where planting old data is what shows them working. */
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

/*
  Writes past the library, the way a release from before the rename left it, then reads the key. AsyncStorage reports no changes, so the page is told by hand, and the read is what moves the value to its new name.
*/
async function plantLegacyUser(): Promise<boolean> {
  await removeRaw(local.physicalKey("user"));
  await plantValue(LEGACY_USER, { id: "u_legacy", name: "Grace" });
  notifyStorageChanged(local, "user");
  await local.get("user");

  return (await readText(LEGACY_USER)) === undefined;
}

interface RowProps {
  readonly storageKey: AppKey;
  readonly stored: AsyncValueProps["stored"];
  readonly children: ReactNode;
  readonly first?: boolean;
  /** For a row whose controls are too wide to sit beside the label. */
  readonly stacked?: boolean;
}

function ValueRow({ storageKey, stored, children, first = false, stacked = false }: RowProps) {
  const note = KEY_NOTES[storageKey];
  const palette = usePalette();

  return (
    <Field
      first={first}
      stacked={stacked}
      label={note.label}
      hint={
        <View style={{ gap: 3 }}>
          <Prose text={note.hint} style={{ color: palette.soft, fontSize: 12, lineHeight: 17 }} />
          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.faint }}>
              {note.readType} →
            </Text>
            <AsyncValue stored={stored} />
          </View>
        </View>
      }
    >
      {children}
    </Field>
  );
}

export function ValuesPanel() {
  const palette = usePalette();

  const [theme, themeWriter] = useAsyncStorageValue(local, "theme");
  const [displayName, displayNameWriter] = useAsyncStorageValue(local, "displayName");
  const [reducedMotion, reducedMotionWriter] = useAsyncStorageValue(local, "reducedMotion");
  const [fontScale, fontScaleWriter] = useAsyncStorageValue(local, "fontScale");
  const [visitCount, visitCountWriter] = useAsyncStorageValue(local, "visitCount");
  const [recentSearches, recentSearchesWriter] = useAsyncStorageValue(local, "recentSearches");
  const [user, userWriter] = useAsyncStorageValue(local, "user");
  const [lastDismissed, lastDismissedWriter] = useAsyncStorageValue(local, "lastDismissed");
  const [nickname, nicknameWriter] = useAsyncStorageValue(local, "nickname");
  const [legacyMoved, setLegacyMoved] = useState<boolean>();

  return (
    <Card
      title="Every kind of value"
      lead="Change any control. The line under it is what a read returns now."
      how={
        <>
          {ROWS.map((key) => (
            <Explain key={key} text={`${KEY_NOTES[key].label}. ${KEY_NOTES[key].note}`} />
          ))}
          <Explain text="Store `null` under Last dismissed, then remove it: a stored `null` reads back as `null`, and only an absent key reads as `undefined`." />
          <Explain text="Every value here reports a status, because AsyncStorage only ever answers later. Theme repaints the app once its read lands." />
        </>
      }
    >
      <ValueRow first storageKey="theme" stored={theme}>
        {theme.status === "ready" ? (
          <Control>
            <Picker
              selectedValue={theme.value}
              onValueChange={(next) => void themeWriter.set(next as typeof theme.value)}
            >
              <Picker.Item label="Light" value="light" />
              <Picker.Item label="Dark" value="dark" />
              <Picker.Item label="System" value="system" />
            </Picker>
          </Control>
        ) : (
          <NotReady stored={theme} />
        )}
      </ValueRow>

      <ValueRow storageKey="displayName" stored={displayName}>
        {displayName.status === "ready" ? (
          <TextRow
            value={displayName.value ?? ""}
            onCommit={(next) => {
              if (next === "") void displayNameWriter.remove();
              else void displayNameWriter.set(next);
            }}
          />
        ) : (
          <NotReady stored={displayName} />
        )}
      </ValueRow>

      <ValueRow storageKey="reducedMotion" stored={reducedMotion}>
        {reducedMotion.status === "ready" ? (
          <Control>
            <Switch
              value={reducedMotion.value}
              onValueChange={(next) => void reducedMotionWriter.set(next)}
            />
          </Control>
        ) : (
          <NotReady stored={reducedMotion} />
        )}
      </ValueRow>

      <ValueRow storageKey="fontScale" stored={fontScale}>
        {fontScale.status === "ready" ? (
          <Control width={170}>
            <Slider
              value={fontScale.value}
              min={0.75}
              max={2}
              step={0.05}
              onValueChange={(next) => void fontScaleWriter.set(Math.round(next * 100) / 100)}
            />
          </Control>
        ) : (
          <NotReady stored={fontScale} />
        )}
      </ValueRow>

      <ValueRow storageKey="visitCount" stored={visitCount}>
        {visitCount.status === "ready" ? (
          /*
            Three siblings rather than one `Host` around a row of them. A host sizes itself to the native tree it holds, so a count in there re-measures the whole row every time the number gains a digit, which moves the buttons and clips their labels. Keeping the count outside leaves each button a host of its own with a width that never changes, and the row it sits in centers it.
          */
          <>
            <Control>
              <Button
                variant="outlined"
                label="−"
                onPress={() => void visitCountWriter.set(Math.max(0, visitCount.value - 1))}
              />
            </Control>
            <Text style={[styles.count, { color: palette.fg }]}>{visitCount.value}</Text>
            <Control>
              <Button
                variant="outlined"
                label="+"
                onPress={() => void visitCountWriter.set(visitCount.value + 1)}
              />
            </Control>
          </>
        ) : (
          <NotReady stored={visitCount} />
        )}
      </ValueRow>

      <ValueRow storageKey="recentSearches" stored={recentSearches}>
        {recentSearches.status === "ready" ? (
          <TextRow
            value=""
            placeholder="add a term"
            onCommit={(next) => {
              if (next === "") return;
              void recentSearchesWriter.set([...recentSearches.value, next]);
            }}
          />
        ) : (
          <NotReady stored={recentSearches} />
        )}
      </ValueRow>

      {recentSearches.status === "ready" && recentSearches.value.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingBottom: 10 }}>
          {recentSearches.value.map((term, index) => (
            <Pressable
              key={`${term}-${String(index)}`}
              onPress={() =>
                void recentSearchesWriter.set(
                  recentSearches.value.filter((_unused, at) => at !== index),
                )
              }
              style={{
                backgroundColor: palette.raised,
                borderRadius: RADIUS.badge,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 12, color: palette.body }}>{term} ✕</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ValueRow storageKey="user" stored={user}>
        {user.status === "ready" ? (
          <TextRow
            value={user.value?.name ?? ""}
            placeholder="name"
            onCommit={(next) => {
              if (next === "") void userWriter.remove();
              else void userWriter.set({ id: "u_1", name: next });
            }}
          />
        ) : (
          <NotReady stored={user} />
        )}
      </ValueRow>

      {/* A row of its own, because the user row's field already takes the width a button would need. */}
      <Field
        label={`Plant ${LEGACY_USER}`}
        hint={
          legacyMoved === undefined ? (
            "Stores a user under its old name; the read moves it."
          ) : (
            <Badge tone={legacyMoved ? "success" : "warning"}>
              {legacyMoved
                ? `moved from ${LEGACY_USER} to ${local.physicalKey("user")} ✓`
                : `${LEGACY_USER} still there`}
            </Badge>
          )
        }
      >
        <Control>
          <Button
            variant="outlined"
            label="Plant"
            onPress={() => void plantLegacyUser().then(setLegacyMoved)}
          />
        </Control>
      </Field>

      <ValueRow stacked storageKey="lastDismissed" stored={lastDismissed}>
        <Control>
          <Row spacing={8}>
            <Button
              variant="outlined"
              label="Text"
              onPress={() => void lastDismissedWriter.set("banner-a")}
            />
            <Button
              variant="outlined"
              label="null"
              onPress={() => void lastDismissedWriter.set(null)}
            />
            <Button
              variant="outlined"
              label="Remove"
              onPress={() => void lastDismissedWriter.remove()}
            />
          </Row>
        </Control>
      </ValueRow>

      <ValueRow storageKey="nickname" stored={nickname}>
        {nickname.status === "ready" ? (
          <TextRow
            value={nickname.value ?? ""}
            onCommit={(next) => void nicknameWriter.set(next === "" ? undefined : next)}
          />
        ) : (
          <NotReady stored={nickname} />
        )}
      </ValueRow>
    </Card>
  );
}

const styles = StyleSheet.create({
  /* Tabular figures in a slot wide enough for the counts this demo reaches, so a number gaining a digit never shifts the buttons. */
  count: { fontSize: 15, fontVariant: ["tabular-nums"], minWidth: 26, textAlign: "center" },
});
