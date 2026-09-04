import type { JsonValue } from "../types/json";
import type { Serializer } from "./serializer";

/**
 * The serializer for backends that store JSON values natively, such as the extension storage areas.
 *
 * Values are handed over untouched. The backend owns the structured clone, so encoding here would store a JSON string inside a JSON value: twice the bytes against a quota, and unreadable to code that stored the key without this library.
 */
export const passthroughSerializer: Serializer<JsonValue> = {
  serialize(value: unknown): JsonValue {
    return value as JsonValue;
  },
  deserialize(wire: JsonValue): unknown {
    return wire;
  },
};
