import type { MaybePromise } from "../types/utils";

/**
 * Whether a value has to be awaited.
 *
 * Structural rather than an `instanceof Promise` check, because a backend may hand back a thenable from another realm or another promise implementation entirely.
 */
export function isPromiseLike<Value>(
  value: MaybePromise<Value>,
): value is PromiseLike<Value> & MaybePromise<Value> {
  if (typeof value !== "object" && typeof value !== "function") return false;
  if (value === null) return false;

  return "then" in value && typeof value.then === "function";
}

/**
 * Continues with a value that may or may not have to be awaited, staying synchronous when it does not.
 *
 * This is what lets one implementation serve both halves of the API. The synchronous path never produces a promise, so it never has to unwrap one, and the asynchronous path is a normal chain.
 */
export function chain<Value, Next>(
  value: MaybePromise<Value>,
  next: (value: Value) => MaybePromise<Next>,
): MaybePromise<Next> {
  return isPromiseLike(value) ? Promise.resolve(value).then(next) : next(value);
}

/**
 * Unwraps a value the synchronous path produced.
 *
 * Every stage of that path is synchronous by construction, so this should never fire. It is a real check rather than an assertion because the one thing that could break the invariant is an adapter that claims it can answer immediately and then does not, and a promise handed back as though it were the value would be far harder to diagnose than this.
 */
export function expectSync<Value>(value: MaybePromise<Value>, onAsync: () => Error): Value {
  if (isPromiseLike(value)) throw onAsync();

  return value;
}
