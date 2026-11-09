/** The storage areas an extension can address. */
export const WEB_EXTENSION_STORAGE_AREA = {
  Local: "local",
  Sync: "sync",
  Session: "session",
} as const;

/** Any one of the areas in {@link WEB_EXTENSION_STORAGE_AREA}. */
export type WebExtensionStorageAreaName =
  (typeof WEB_EXTENSION_STORAGE_AREA)[keyof typeof WEB_EXTENSION_STORAGE_AREA];

/**
 * The part of a WebExtension storage area this package uses.
 *
 * Declared structurally rather than imported from a browser type package, so none of them reaches a consumer's type graph. It is the common denominator of the promise-based API as Chrome, Firefox and the WebExtension polyfill each declare it, and conformance tests check it against all of them.
 *
 * Values are `unknown` rather than JSON values because the polyfill declares them that way, and narrowing here would stop it conforming. The array form is `Array<string>` rather than `ReadonlyArray<string>` for the same reason: it is what every one of those declarations accepts.
 */
export interface WebExtensionStorageArea {
  /** `null` answers with everything the area holds. */
  get(keys: string | Array<string> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | Array<string>): Promise<void>;
  /** Optional because only newer browsers have it. It lists the names without reading every value. */
  getKeys?(): Promise<Array<string>>;
}

/** One key's change as `storage.onChanged` reports it. Values are `unknown` for the reason {@link WebExtensionStorageArea} gives. */
export interface WebExtensionStorageChange {
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

/** The part of `storage.onChanged` this package uses. */
export interface WebExtensionStorageChangeEvent {
  addListener(
    listener: (changes: Record<string, WebExtensionStorageChange>, areaName: string) => void,
  ): void;
  removeListener(
    listener: (changes: Record<string, WebExtensionStorageChange>, areaName: string) => void,
  ): void;
}

/**
 * The `storage` namespace. `session` is optional because Manifest V2 and older browser versions do not have it, and `onChanged` so that a stand-in need not provide one.
 */
export interface WebExtensionStorageNamespace {
  readonly local: WebExtensionStorageArea;
  readonly sync: WebExtensionStorageArea;
  readonly session?: WebExtensionStorageArea;
  readonly onChanged?: WebExtensionStorageChangeEvent;
}
