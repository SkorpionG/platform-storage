import { KEY_NOTES } from "@examples/schema";
import type { AppKey } from "@examples/schema";
import { Button, Picker, Row, Slider, Switch } from "@expo/ui";
import { useAsyncStorageValue } from "@platform-storage/react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AsyncValue, NotReady } from "../components/async-value";
import type { AsyncValueProps } from "../components/async-value";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Field } from "../components/field";
import { TextRow } from "../components/text-row";
import { Note } from "../components/note";
import { usePalette } from "../hooks/use-palette";
import { local } from "../store/storages";
import { MONO, RADIUS } from "../theme";

interface RowProps {
  readonly storageKey: AppKey;
  readonly stored: AsyncValueProps["stored"];
  readonly children: ReactNode;
  /** How to work the control, where that is not obvious from looking at it. */
  readonly usage?: string;
}

function ValueRow({ storageKey, stored, children, usage }: RowProps) {
  const note = KEY_NOTES[storageKey];
  const palette = usePalette();

  return (
    <Field
      label={note.label}
      hint={
        <View style={{ gap: 3 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.soft }}>
              {note.readType}
            </Text>
            <AsyncValue stored={stored} />
          </View>
          <Text style={{ fontSize: 12, lineHeight: 17, color: palette.soft }}>{note.note}</Text>
          {usage === undefined ? null : (
            <Text style={{ fontSize: 12, lineHeight: 17, color: palette.faint }}>{usage}</Text>
          )}
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

  return (
    <Card
      title="Every value kind the library supports"
      description="Each control writes through the typed API and reads straight back. The caption under each one is the type that read returns, and why."
    >
      <ValueRow storageKey="theme" stored={theme}>
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

      <ValueRow
        storageKey="fontScale"
        stored={fontScale}
        usage="Drag to change; it writes as you go."
      >
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

      <ValueRow
        storageKey="recentSearches"
        stored={recentSearches}
        usage="Type a term and press return to add it. Tap one to remove it."
      >
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

      <ValueRow storageKey="user" stored={user} usage="Stored under app:user, not under user.">
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

      <ValueRow storageKey="lastDismissed" stored={lastDismissed}>
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

      <Note>
        Storing null under Last dismissed and then removing it shows the difference the library
        insists on: a stored null reads back as null, and only an absent key reads as undefined.
      </Note>
    </Card>
  );
}

const styles = StyleSheet.create({
  /* Tabular figures in a slot wide enough for the counts this demo reaches, so a number gaining a digit never shifts the buttons. */
  count: { fontSize: 15, fontVariant: ["tabular-nums"], minWidth: 26, textAlign: "center" },
});
