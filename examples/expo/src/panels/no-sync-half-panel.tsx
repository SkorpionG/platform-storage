import { Text } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Note } from "../components/note";
import { usePalette } from "../hooks/use-palette";
import { local } from "../store/storages";
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

export function NoSyncHalfPanel() {
  const palette = usePalette();
  const half = Reflect.get(local, "getSync") === undefined ? "absent" : "present";

  return (
    <Card
      title="There is no synchronous half here, and the types say so"
      description="An adapter exposes what its backend can actually do rather than pretending every backend is the same. Web storage answers immediately and so grows getSync and friends; AsyncStorage never does, so they are not there to call."
      aside={<Badge tone={half === "absent" ? "success" : "danger"}>getSync {half}</Badge>}
    >
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

      <Field
        label="Checked at runtime too"
        hint="Nothing was disabled to arrange that. createStorage returns the synchronous type only for an adapter that declares it can answer immediately, and this one does not, so the methods are absent from the type and from the object alike."
      />

      <Note>
        That absence is what every other panel here works around, and it is why each read reports a
        status: a read that has not landed yet is not the same answer as a key that holds nothing.
      </Note>
    </Card>
  );
}
