import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { startChangeBridge } from "../store/changes";
import { WORKER_REQUEST } from "../store/messages";
import type { WorkerReport } from "../store/messages";
import { local, session } from "../store/storages";

const ALARM = "platform-storage:tick";

export default defineBackground(() => {
  /*
    Module scope in a Manifest V3 service worker runs again on every respawn, so this counter measures the life of one worker instance while `visitCount` measures the life of the installation. Showing both is what makes a respawn visible.
  */
  const startedAt = Date.now();
  let ticksThisWorker = 0;

  /*
    The storages were built when this module loaded, before the worker had finished starting. They work anyway because the adapter resolves the extension API on every operation rather than capturing it once, which is the claim this entrypoint exists to exercise.
  */
  async function tick(): Promise<void> {
    const seen = await local.get("visitCount");

    await local.set("visitCount", seen + 1);
    ticksThisWorker += 1;

    /* Written to `session` so it is gone when the browser closes, which is the difference between the two areas stated as behavior rather than as prose. */
    await session.set("lastDismissed", new Date().toISOString());
  }

  function report(): WorkerReport {
    return { ticksThisWorker, visitCount: 0, startedAt };
  }

  browser.runtime.onInstalled.addListener(async () => {
    await local.set("user", { id: "u_worker", name: "Seeded by the worker" });
    await local.set("visitCount", 0);
  });

  browser.alarms.create(ALARM, { periodInMinutes: 1 });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM) return;

    await tick();
  });

  /*
    Answering asynchronously means returning the promise, so the read of `visitCount` is part of the reply rather than a value the page has to fetch separately and might see at a different moment.
  */
  browser.runtime.onMessage.addListener(async (request: unknown) => {
    if (request === WORKER_REQUEST.TickNow) await tick();
    else if (request !== WORKER_REQUEST.Report) return undefined;

    return { ...report(), visitCount: await local.get("visitCount") };
  });

  /* The worker reads nothing live, but relaying keeps one bridge per context rather than one per page, and proves the feed reaches a worker at all. */
  startChangeBridge();
});
