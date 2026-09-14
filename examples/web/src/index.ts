/*
  Named re-exports rather than `export *`, because a module carrying `"use client"` has each of its exports turned into a client reference by name and a star crossing that boundary is fragile.
*/
export { Playground } from "./playground";
export type { PlaygroundProps } from "./playground";

/*
  Passed to `Playground` as `leading` by an app that actually renders on a server. In a client-only app every read below would succeed, which would make each panel say the opposite of what it is there to show.
*/
export { HydrationPanel } from "./panels/hydration-panel";
export { ServerRenderPanel } from "./panels/server-render-panel";
export { ServerUnavailablePanel } from "./panels/server-unavailable-panel";
