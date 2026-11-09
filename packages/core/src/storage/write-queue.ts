import type { MaybePromise } from "../types/utils";
import { isPromiseLike } from "./maybe-promise";

/** Runs the writes to a key one at a time. */
export interface WriteQueue {
  /** Runs the task once the key's earlier tasks have finished, however they finished. With nothing ahead of it, starts immediately. */
  run<Value>(key: string, task: () => MaybePromise<Value>): MaybePromise<Value>;
  /** Settles when the tasks already started on this key have finished, or answers immediately if there are none. */
  settled(key: string): MaybePromise<void>;
}

/** Builds an empty queue. A task that never settles holds up every later task on its key. */
export function createWriteQueue(): WriteQueue {
  const tails = new Map<string, Promise<void>>();

  return {
    run<Value>(key: string, task: () => MaybePromise<Value>): MaybePromise<Value> {
      const ahead = tails.get(key);
      const result = ahead === undefined ? task() : ahead.then(task);

      if (!isPromiseLike(result)) return result;

      /* The tail swallows a failure because the caller holding `result` is the one to hear about it, and the next task should run regardless. */
      const finish = (): void => {
        if (tails.get(key) === tail) tails.delete(key);
      };
      const tail: Promise<void> = Promise.resolve(result).then(finish, finish);

      tails.set(key, tail);

      return result;
    },

    settled: (key) => tails.get(key),
  };
}
