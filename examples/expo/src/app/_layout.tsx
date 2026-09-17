import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { useAppliedScheme } from "../hooks/use-theme";

/*
  The tabs are the root, with no navigation stack around them. A stack would be the tidier way to present the schema over a tab, but on iOS its screens capture the first responder before a transition and restore it afterwards, which brings the keyboard back on any screen a text field has been used on. The schema is a modal instead.

  iOS repaints its own tab bar from the theme this app applies. Android's follows the operating system, so it stays light under a stored dark theme unless it is handed the palette.
*/
export default function RootLayout() {
  const scheme = useAppliedScheme();
  const palette = usePalette();

  const androidBar =
    Platform.OS === "android"
      ? { backgroundColor: palette.surface, tintColor: palette.accent, iconColor: palette.muted }
      : {};

  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <NativeTabs {...androidBar}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="slider.horizontal.3" md="tune" />
          <NativeTabs.Trigger.Label>Values</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="resilience">
          <NativeTabs.Trigger.Icon sf="exclamationmark.shield" md="shield" />
          <NativeTabs.Trigger.Label>Resilience</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="inspector">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
          <NativeTabs.Trigger.Label>Inspector</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
