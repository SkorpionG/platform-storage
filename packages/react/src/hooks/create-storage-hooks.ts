"use client";

import type {
  GetResult,
  KeyOf,
  PlatformStorage,
  StorageSchemaDefinition,
  SyncPlatformStorage,
} from "@platform-storage/core";

import { notifyStorageChanged } from "../store/changes";
import type { AsyncStorageWriter, AsyncStoredValue, SyncStorageWriter } from "../types/hooks";
import { useAsyncStorageValue, useAsyncStorageWriter } from "./use-async-storage-value";
import { useStorageValue, useStorageWriter } from "./use-storage-value";

/** The hooks of a storage that answers immediately, already bound to it. */
export interface SyncStorageHooks<Definition extends StorageSchemaDefinition> {
  useValue<Key extends KeyOf<Definition>>(
    key: Key,
  ): readonly [GetResult<Definition[Key]>, SyncStorageWriter<Definition[Key]>];
  useWriter<Key extends KeyOf<Definition>>(key: Key): SyncStorageWriter<Definition[Key]>;
  /** For a change this storage made without the hooks, such as being cleared. */
  notifyChanged(key?: KeyOf<Definition>): void;
}

/** The same, for a storage that only answers later. */
export interface AsyncStorageHooks<Definition extends StorageSchemaDefinition> {
  useValue<Key extends KeyOf<Definition>>(
    key: Key,
  ): readonly [AsyncStoredValue<Definition[Key]>, AsyncStorageWriter<Definition[Key]>];
  useWriter<Key extends KeyOf<Definition>>(key: Key): AsyncStorageWriter<Definition[Key]>;
  notifyChanged(key?: KeyOf<Definition>): void;
}

/* Reading the property rather than narrowing the value keeps this free of a cast: `Reflect.get` answers with `unknown` whatever the storage is declared as. */
function answersImmediately<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
): storage is SyncPlatformStorage<Definition> {
  return typeof Reflect.get(storage, "getSync") === "function";
}

/**
 * The hooks for one storage, so it is not repeated at every call site and each key keeps its own type.
 *
 * Declare it beside the schema, not inside a component: it builds hooks, it is not one.
 *
 * @example
 * ```ts
 * export const { useValue, useWriter } = createStorageHooks(storage);
 *
 * const [theme, writer] = useValue("theme");
 * ```
 */
export function createStorageHooks<Definition extends StorageSchemaDefinition>(
  storage: SyncPlatformStorage<Definition>,
): SyncStorageHooks<Definition>;
/**
 * The same, for a storage that only answers later, such as an extension area or AsyncStorage.
 *
 * `useValue` then reports a status beside the value, because a read that has not landed yet is not the same as a key holding nothing.
 */
export function createStorageHooks<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
): AsyncStorageHooks<Definition>;
export function createStorageHooks<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
): SyncStorageHooks<Definition> | AsyncStorageHooks<Definition> {
  function notifyChanged(key?: KeyOf<Definition>): void {
    notifyStorageChanged(storage, key);
  }

  if (answersImmediately(storage)) {
    /* A binding of its own, because narrowing a parameter does not reach inside a function declared under it: the compiler has to assume a parameter can be reassigned. */
    const immediate = storage;

    /* Named declarations rather than object properties, so each is recognizable as a hook to the reader and to the linter. */
    function useSyncValue<Key extends KeyOf<Definition>>(
      key: Key,
    ): readonly [GetResult<Definition[Key]>, SyncStorageWriter<Definition[Key]>] {
      return useStorageValue(immediate, key);
    }

    function useSyncWriter<Key extends KeyOf<Definition>>(
      key: Key,
    ): SyncStorageWriter<Definition[Key]> {
      return useStorageWriter(immediate, key);
    }

    return { useValue: useSyncValue, useWriter: useSyncWriter, notifyChanged };
  }

  function useAsyncValue<Key extends KeyOf<Definition>>(
    key: Key,
  ): readonly [AsyncStoredValue<Definition[Key]>, AsyncStorageWriter<Definition[Key]>] {
    return useAsyncStorageValue(storage, key);
  }

  function useAsyncWriter<Key extends KeyOf<Definition>>(
    key: Key,
  ): AsyncStorageWriter<Definition[Key]> {
    return useAsyncStorageWriter(storage, key);
  }

  return { useValue: useAsyncValue, useWriter: useAsyncWriter, notifyChanged };
}
