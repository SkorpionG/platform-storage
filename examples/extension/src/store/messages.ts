import { browser } from "wxt/browser";

/**
 * What a page may ask the background service worker to do.
 *
 * The worker is the one context a page cannot read directly, so everything it knows about itself comes back through here.
 */
export const WORKER_REQUEST = {
  /** Answer with the current report and change nothing. */
  Report: "report",
  /** Do a tick now, rather than waiting for the alarm. */
  TickNow: "tick-now",
} as const;

export type WorkerRequest = (typeof WORKER_REQUEST)[keyof typeof WORKER_REQUEST];

export interface WorkerReport {
  /** Ticks this service worker has written since it started. A respawned worker counts from zero again. */
  readonly ticksThisWorker: number;
  /** What the persisted counter holds. Nothing about a respawn touches it, which is the point of showing the two together. */
  readonly visitCount: number;
  /** When this worker instance started, in epoch milliseconds. */
  readonly startedAt: number;
}

function isReport(value: unknown): value is WorkerReport {
  return (
    typeof value === "object" &&
    value !== null &&
    "ticksThisWorker" in value &&
    "visitCount" in value &&
    "startedAt" in value
  );
}

/**
 * Asks the worker for a report, starting it if it had been torn down.
 *
 * Answers with nothing rather than rejecting where the worker cannot be reached, which is an ordinary occurrence and not an error: the browser refuses the message where no context is listening, and there is no extension API at all on a page opened outside one.
 */
export async function askWorker(request: WorkerRequest): Promise<WorkerReport | undefined> {
  try {
    const answer: unknown = await browser.runtime.sendMessage(request);

    return isReport(answer) ? answer : undefined;
  } catch {
    return undefined;
  }
}
