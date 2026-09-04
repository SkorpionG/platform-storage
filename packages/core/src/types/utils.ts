/** A value that may or may not have to be awaited. The storage engine runs one implementation over both. */
export type MaybePromise<Value> = Value | Promise<Value>;

/**
 * A deeply readonly view of a type.
 *
 * Declaring a schema through `defineStorageSchema` infers its literals with a `const` type parameter, which makes every array and object in a declared default readonly. Defaults are therefore checked against this rather than against the schema's own output type, which is mutable.
 */
export type Immutable<Value> = Value extends (...args: Array<never>) => unknown
  ? Value
  : Value extends ReadonlyArray<infer Element>
    ? ReadonlyArray<Immutable<Element>>
    : Value extends object
      ? { readonly [Key in keyof Value]: Immutable<Value[Key]> }
      : Value;
