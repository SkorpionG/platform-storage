/**
 * Converts between the value an application holds and the wire value a storage backend physically stores.
 *
 * The wire type is part of the adapter's contract rather than a global choice, because backends disagree: web storage and React Native transport strings, while extension storage areas transport JSON values natively. Encoding a string for a backend that already stores objects would double-encode it.
 *
 * A serializer never reports its own failures. The storage engine wraps a throw from either method so the error carries the key it happened on.
 */
export interface Serializer<Wire> {
  serialize(value: unknown): Wire;
  deserialize(wire: Wire): unknown;
}

/**
 * Which way a conversion was going when it failed.
 *
 * Derived from the serializer rather than written out, so renaming a method cannot leave an error reporting a direction that no longer exists.
 */
export type SerializationDirection = keyof Serializer<unknown>;
