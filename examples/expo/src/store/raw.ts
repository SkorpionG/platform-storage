import { storedNamesOf } from "@examples/schema";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { local } from "./storages";

/*
  AsyncStorage reached directly, the way devtools reaches an origin. Two panels need it: one plants values the library would refuse to write, and one reads what the device is actually holding, once the adapter has named the keys.
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

/* Asked of the storage rather than read off the schema, because a storage's prefix is part of every name it stores under. */
const OURS = storedNamesOf([local]);

/** Everything on the device, each entry flagged against the names this storage stores under. */
export async function readEverything(): Promise<ReadonlyArray<StoredEntry>> {
  const keys = (await local.adapter.keys?.()) ?? [];
  const pairs = await AsyncStorage.multiGet([...keys]);

  /* `sort` rather than `toSorted`, which Hermes does not implement. Nothing else holds this array: `map` has just produced it. */
  return pairs
    .map(([key, text]) => ({ key, text: text ?? "", ours: OURS.has(key) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}
