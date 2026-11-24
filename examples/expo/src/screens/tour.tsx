import { runTour, TOUR_CHECK, TOUR_CHECKS } from "@examples/schema";
import type { TourBackend, TourCheckId, TourResult } from "@examples/schema";
import { Button } from "@expo/ui";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "../components/badge";
import { InfoButton } from "../components/info-button";
import { Control } from "../components/control";
import { Explain, Prose } from "../components/prose";
import { Screen } from "../components/screen";
import { Sheet } from "../components/sheet";
import { usePalette } from "../hooks/use-palette";
import { plantValue, readText, removeRaw } from "../store/raw";
import { failuresSoFar, tour } from "../store/storages";
import { MONO, RADIUS } from "../theme";

/** Where each behavior is shown in full, so a row can send you there. */
const SHOWN_ON: { readonly [Id in TourCheckId]: { readonly href: Href; readonly label: string } } =
  {
    [TOUR_CHECK.Default]: { href: "/values", label: "Values" },
    [TOUR_CHECK.Refused]: { href: "/values", label: "Values" },
    [TOUR_CHECK.Fallback]: { href: "/resilience", label: "Resilience" },
    [TOUR_CHECK.Logged]: { href: "/inspector", label: "Inspector" },
    [TOUR_CHECK.Throw]: { href: "/resilience", label: "Resilience" },
    [TOUR_CHECK.Clear]: { href: "/resilience", label: "Resilience" },
    [TOUR_CHECK.Physical]: { href: "/inspector", label: "Inspector" },
  };

/* AsyncStorage holds text, so a plant writes the value's JSON, as the library's own serializer would. */
const backend: TourBackend = {
  plant: (name, value) => plantValue(name, value),
  holds: async (name) => (await readText(name)) !== undefined,
  remove: (name) => removeRaw(name),
  failures: failuresSoFar,
};

type Run =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | {
      readonly status: "done";
      readonly results: ReadonlyMap<TourCheckId, TourResult>;
      /** What went wrong around the checks, which the rows cannot show. */
      readonly problem: string | undefined;
    };

/**
 * The first tab: the seven checks, run against the device, with no card around them.
 *
 * The screen's own header carries the result and the explanation, because a card titled "Quick tour" under a screen titled "Tour" says the same thing twice.
 */
export function Tour() {
  const palette = usePalette();
  const router = useRouter();
  const [run, setRun] = useState<Run>({ status: "idle" });
  const [explaining, setExplaining] = useState(false);
  const results = run.status === "done" ? run.results : undefined;
  const passed = results === undefined ? 0 : [...results.values()].filter((r) => r.ok).length;

  const start = (): void => {
    setRun({ status: "running" });

    void runTour(tour, backend)
      .then((outcome) => {
        setRun({
          status: "done",
          results: new Map(outcome.results.map((result) => [result.id, result])),
          problem: outcome.problem,
        });
      })
      /* `runTour` reports a backend's refusal itself; this catches anything else, so the button never stays on "Running…". */
      .catch((error: unknown) => {
        setRun({
          status: "done",
          results: new Map(),
          problem: error instanceof Error ? error.message : String(error),
        });
      });
  };

  return (
    <>
      <Screen
        title="Tour"
        intro="Run every check against this device's real AsyncStorage, then tap a row's tab to see it in full."
        action={
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            {results === undefined ? null : (
              <Badge tone={passed === TOUR_CHECKS.length ? "success" : "danger"}>
                {`${String(passed)} / ${String(TOUR_CHECKS.length)} passed`}
              </Badge>
            )}
            <InfoButton label="How the tour works" onPress={() => setExplaining(true)} />
          </View>
        }
      >
        <View style={{ alignItems: "flex-start" }}>
          <Control>
            <Button
              variant="filled"
              label={
                run.status === "running"
                  ? "Running…"
                  : results === undefined
                    ? "Run all checks"
                    : "Run again"
              }
              onPress={() => {
                if (run.status !== "running") start();
              }}
            />
          </Control>
        </View>

        {run.status === "done" && run.problem !== undefined ? (
          <Text
            accessibilityRole="alert"
            style={{ color: palette.danger, fontSize: 13, lineHeight: 19 }}
          >
            {run.problem}
          </Text>
        ) : null}

        <View style={{ gap: 8 }}>
          {TOUR_CHECKS.map((check) => {
            const result = results?.get(check.id);
            const shown = SHOWN_ON[check.id];

            return (
              <View
                key={check.id}
                style={{
                  alignItems: "center",
                  backgroundColor: palette.surface,
                  borderColor: palette.line,
                  borderRadius: RADIUS.inset,
                  borderWidth: StyleSheet.hairlineWidth,
                  flexDirection: "row",
                  gap: 10,
                  padding: 12,
                }}
              >
                <Text
                  style={{
                    color:
                      result === undefined
                        ? palette.faint
                        : result.ok
                          ? palette.success
                          : palette.danger,
                    fontSize: 15,
                    width: 16,
                  }}
                >
                  {result === undefined ? "·" : result.ok ? "✓" : "✗"}
                </Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Prose text={check.label} style={{ color: palette.fg, fontSize: 14 }} />
                  {result === undefined ? null : (
                    <Text style={{ color: palette.soft, fontFamily: MONO, fontSize: 11 }}>
                      {result.detail}
                    </Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  onPress={() => router.navigate(shown.href)}
                >
                  <Text style={{ color: palette.accent, fontSize: 13, fontWeight: "500" }}>
                    {shown.label} →
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Screen>

      <Sheet title="How the tour works" visible={explaining} onClose={() => setExplaining(false)}>
        <View style={{ gap: 12, padding: 4 }}>
          <Explain text="The checks run through a storage of their own, under the `tour:` prefix, and clear it when they finish, so nothing another tab shows is touched. The failures they provoke on purpose are real, and land in the error log on the Inspector tab." />
          <Explain text='Two claims cannot be run, because the compiler makes them before the app starts: autocomplete on every key, and `set("theme", "solarized")` refused while you type. Try either in `examples/schema`.' />
        </View>
      </Sheet>
    </>
  );
}
