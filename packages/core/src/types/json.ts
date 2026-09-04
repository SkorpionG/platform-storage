/** A value that survives a JSON round trip unchanged. */
export type JsonPrimitive = string | number | boolean | null;

/** Any value representable in JSON. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type JsonArray = Array<JsonValue>;

export interface JsonObject {
  [key: string]: JsonValue;
}
