import type { MaybePromise } from "../types/utils";
import { isPromiseLike } from "./maybe-promise";

/** Runs the writes to a key one at a time. */
export interface WriteQueue {
  /** Runs the task once the key's earlier tasks have finished, however they finished. With nothing ahead of it, starts immediately. */
  run<Value>(key: string, task: () => MaybePromise<Value>): MaybePromise<Value>;
  /**
   * Runs the task once every one of these keys' earlier tasks has finished, holding all of their turns until it finishes.
   *
   * It only ever waits on tasks already started and never on another key while holding a turn, so two of these over overlapping keys cannot wait on each other.
   */
  runAll<Value>(keys: ReadonlyArray<string>, task: () => MaybePromise<Value>): MaybePromise<Value>;
  /** Settles when the tasks already started on this key have finished, or answers immediately if there are none. */
  settled(key: string): MaybePromise<void>;
}

/** Builds an empty queue. A task that never settles holds up every later task on its key. */
export function createWriteQueue(): WriteQueue {
  const tails = new Map<string, Promise<void>>();

  function runAll<Value>(
    keys: ReadonlyArray<string>,
    task: () => MaybePromise<Value>,
  ): MaybePromise<Value> {
    const ahead = keys.flatMap((key) => {
      const tail = tails.get(key);

      return tail === undefined ? [] : [tail];
    });
    const result = ahead.length === 0 ? task() : Promise.all(ahead).then(task);

    if (!isPromiseLike(result)) return result;

    /* The tail swallows a failure because the caller holding `result` is the one to hear about it, and the next task should run regardless. */
    const finish = (): void => {
      for (const key of keys) if (tails.get(key) === tail) tails.delete(key);
    };
    const tail: Promise<void> = Promise.resolve(result).then(finish, finish);

    for (const key of keys) tails.set(key, tail);

    return result;
  }

  return {
    run: (key, task) => runAll([key], task),
    runAll,
    settled: (key) => tails.get(key),
  };
}
