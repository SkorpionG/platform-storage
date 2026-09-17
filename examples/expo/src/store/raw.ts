import { DECLARED_PHYSICAL_KEYS } from "@examples/schema";
import AsyncStorage from "@react-native-async-storage/async-storage";

/*
  AsyncStorage reached directly, past the library, the way devtools reaches an origin. Two panels need it: one plants values the library would refuse to write, and one lists what the device is actually holding.
*/

export interface StoredEntry {
  readonly key: string;
  /** What the device holds, which here is JSON text rather than a value: this adapter transports strings. */
  readonly text: string;
  readonly ours: boolean;
}

/** Writes text straight under a physical key, which is what a previous version of an app or a hand edit leaves behind. */
export async function plantText(physicalKey: string, text: string): Promise<void> {
  await AsyncStorage.setItem(physicalKey, text);
}

/** The same, for a value the schema rejects but JSON can carry. */
export async function plantValue(physicalKey: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(physicalKey, JSON.stringify(value));
}

/** Everything on the device, each entry flagged against the keys this schema declares. */
export async function readEverything(): Promise<ReadonlyArray<StoredEntry>> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet([...keys]);

  /* `sort` rather than `toSorted`, which Hermes does not implement. Nothing else holds this array: `map` has just produced it. */
  return pairs
    .map(([key, text]) => ({ key, text: text ?? "", ours: DECLARED_PHYSICAL_KEYS.has(key) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}
