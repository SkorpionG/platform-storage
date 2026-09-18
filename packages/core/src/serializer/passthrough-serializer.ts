import type { JsonValue } from "../types/json";
import { findNonJsonValue } from "./json-value";
import type { Serializer } from "./serializer";

/**
 * The serializer for backends that store JSON values natively, such as the extension storage areas.
 *
 * Values are handed over untouched. The backend owns the structured clone, so encoding here would store a JSON string inside a JSON value: twice the bytes against a quota, and unreadable to code that stored the key without this library.
 *
 * Handing over is the whole point, which is why a write is checked first. Nothing downstream would report a value that is not JSON: a backend that cannot hold one stores something else in its place, so a `Date` comes back as a string and a `Map` as an empty object.
 */
export const passthroughSerializer: Serializer<JsonValue> = {
  serialize(value: unknown): JsonValue {
    const problem = findNonJsonValue(value);

    if (problem !== undefined) throw new TypeError(problem);

    // Checked by the walk above, which is what the assertion rests on.
    return value as JsonValue;
  },
  deserialize(wire: JsonValue): unknown {
    return wire;
  },
};
