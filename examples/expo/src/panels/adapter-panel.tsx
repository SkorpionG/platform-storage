import { useAsyncStorageValue } from "@platform-storage/react";
import { hasFallback } from "@platform-storage/react-native";
import { Text } from "react-native";

import { AsyncValue } from "../components/async-value";
import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Explain } from "../components/prose";
import { usePalette } from "../hooks/use-palette";
import { failing, local, withoutDevice } from "../store/storages";
import { MONO, RADIUS } from "../theme";

const REFUSED = `// @platform-storage/web hands you both halves:
const theme = webStorage.getSync("theme");

// This storage has no synchronous half, so neither line compiles.
storage.getSync("theme");
//      ~~~~~~~ Property 'getSync' does not exist on type
//              'PlatformStorage<AppDefinition>'.

useStorageValue(storage, "theme");
//              ~~~~~~~ Argument of type 'PlatformStorage<AppDefinition>'
//                      is not assignable to parameter of type
//                      'SyncPlatformStorage<AppDefinition>'.

// This is the one that does:
const [theme] = useAsyncStorageValue(storage, "theme");`;

/* `undefined` until the hook's first read decides it and renders this again, since asking never forces the choice. */
function WithoutDevice() {
  const [theme] = useAsyncStorageValue(withoutDevice, "theme");
  const chosen = hasFallback(withoutDevice.adapter) ? withoutDevice.adapter.chosen() : undefined;

  return (
    <>
      <AsyncValue stored={theme} />
      {chosen === undefined ? null : <Badge tone="info">{`chose ${chosen}`}</Badge>}
    </>
  );
}

/** What the adapter is and is not: handed its device rather than looking for one, transporting text, and answering only later. */
export function AdapterPanel() {
  const palette = usePalette();
  const wire = local.adapter.serializer.serialize("dark");
  const half = Reflect.get(local, "getSync") === undefined ? "absent" : "present";

  return (
    <Card
      title="The adapter"
      lead="What the AsyncStorage adapter calls itself, what it hands the device, and what it cannot do."
      aside={<Badge tone={half === "absent" ? "success" : "danger"}>getSync {half}</Badge>}
      how={
        <>
          <Explain text="The extension package looks for a global on every operation, because an extension API may not have arrived yet. This one is handed the AsyncStorage instance instead, so there is nothing to resolve, and nothing here imports a native module, which is what keeps the package loadable under a test runner." />
          <Explain text="That is also what lets a storage be built over a refusing stub, as the Resilience tab does: three methods and nothing behind them, which the library cannot tell from the real thing." />
          <Explain text="AsyncStorage only ever answers later, so the storage has no `getSync`, and the types refuse it before the badge does:" />
          <Text
            style={{
              backgroundColor: palette.inset,
              borderRadius: RADIUS.inset,
              color: palette.body,
              fontFamily: MONO,
              fontSize: 10,
              lineHeight: 15,
              padding: 10,
            }}
          >
            {REFUSED}
          </Text>
        </>
      }
    >
      <Field first stacked label="adapter.name" hint="The name every error reports.">
        <Badge tone="info">{local.adapter.name}</Badge>
      </Field>

      <Field stacked label="Over a refusing stub" hint="The library cannot tell it from a device.">
        <Badge tone="info">{failing.adapter.name}</Badge>
      </Field>

      <Field
        stacked
        label="Over no device, with a fallback"
        hint='asyncStorage: null, fallback: "memory", as on Expo web.'
      >
        <WithoutDevice />
      </Field>

      <Field stacked label='serialize("dark")' hint="The device is handed text, not the value.">
        <Badge tone="info">{typeof wire}</Badge>
        <Text style={{ fontFamily: MONO, fontSize: 12, color: palette.success }}>
          {String(wire)}
        </Text>
      </Field>

      <Field stacked label='physicalKey("user")' hint="The name the device stores it under.">
        <Badge tone="info">{local.physicalKey("user")}</Badge>
      </Field>
    </Card>
  );
}
