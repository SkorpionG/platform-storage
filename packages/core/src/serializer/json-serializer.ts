import type { Serializer } from "./serializer";

/**
 * The serializer for backends that store strings.
 *
 * `serialize` is never called with `undefined`: no JSON text represents it, so the storage engine removes the entry instead of writing one.
 */
export const jsonSerializer: Serializer<string> = {
  serialize(value: unknown): string {
    return JSON.stringify(value);
  },
  deserialize(wire: string): unknown {
    return JSON.parse(wire);
  },
};
