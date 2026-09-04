import type { KeyDefinition, KeyOf } from "./key-definition";

export type StorageSchemaDefinition = Readonly<Record<string, KeyDefinition>>;

/** The property that marks a value as one of this library's schemas, mirroring Standard Schema's own `~standard`. */
export const SCHEMA_BRAND = "~platformStorage";

export interface StorageSchemaBrand {
  /** Names what this brand marks, so two differently shaped branded objects can never be mistaken for each other. */
  readonly kind: "schema";
  readonly version: 1;
}

/**
 * A validated storage schema.
 *
 * `createStorage` takes one of these rather than a plain object, so what it receives has already been checked: every entry carries a real validator, and no two keys write to the same place. The brand is what makes the difference visible, since a plain object literal has the same shape.
 */
export interface StorageSchema<
  Definition extends StorageSchemaDefinition = StorageSchemaDefinition,
> {
  readonly [SCHEMA_BRAND]: StorageSchemaBrand;
  readonly definition: Definition;
  /** Declared keys, in declaration order. */
  readonly keys: ReadonlyArray<KeyOf<Definition>>;
  /** Each logical key resolved to the key its backend stores under. */
  readonly physicalKeys: { readonly [Key in KeyOf<Definition>]: string };
}

/** Whether a value was produced by `defineStorageSchema`. */
export function isStorageSchema(value: unknown): value is StorageSchema {
  if (typeof value !== "object" || value === null) return false;
  if (!(SCHEMA_BRAND in value)) return false;

  const brand: unknown = value[SCHEMA_BRAND];
  if (typeof brand !== "object" || brand === null) return false;

  return "kind" in brand && brand.kind === "schema" && "version" in brand && brand.version === 1;
}
