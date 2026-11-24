"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useRef, useSyncExternalStore } from "react";

import { cn } from "./cn";

export interface TabDefinition {
  /** Also the URL hash that opens it, so a tab can be linked to and reloaded into. */
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export interface TabsProps {
  readonly tabs: ReadonlyArray<TabDefinition>;
  /** The tab shown when the hash names none, and the one a server renders. */
  readonly defaultId: string;
  /** Names the tab list for assistive technology. */
  readonly label: string;
}

function subscribeToHash(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);

  return () => window.removeEventListener("hashchange", listener);
}

function readHash(): string {
  return window.location.hash.slice(1);
}

/* A server has no hash, so it renders the default tab, and hydration agrees with it before the hash is read. */
function readServerHash(): string {
  return "";
}

/** Which tab a key moves to, wrapping at either end, or `undefined` for a key that moves nowhere. */
function nextIndex(key: string, index: number, count: number): number | undefined {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/**
 * Sections of one page, chosen through the URL hash.
 *
 * Every panel stays mounted and the inactive ones are only `hidden`, so a tab keeps its state when left, and server-rendered content stays in the markup whichever tab is open.
 */
export function Tabs({ tabs, defaultId, label }: TabsProps) {
  const hash = useSyncExternalStore(subscribeToHash, readHash, readServerHash);
  const active = tabs.some((tab) => tab.id === hash) ? hash : defaultId;
  const buttons = useRef<Map<string, HTMLButtonElement>>(new Map());

  const open = (id: string): void => {
    window.location.assign(`#${id}`);
    buttons.current.get(id)?.focus();
  };

  /* Arrow keys move between tabs, as the ARIA tabs pattern expects; Tab itself moves into the open panel. */
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const target = nextIndex(
      event.key,
      tabs.findIndex((tab) => tab.id === active),
      tabs.length,
    );

    if (target === undefined) return;

    event.preventDefault();
    const next = tabs[target];
    if (next !== undefined) open(next.id);
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;

          return (
            <button
              key={tab.id}
              ref={(element) => {
                if (element === null) buttons.current.delete(tab.id);
                else buttons.current.set(tab.id, element);
              }}
              type="button"
              role="tab"
              id={`${tab.id}-tab`}
              aria-selected={selected}
              aria-controls={`${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => open(tab.id)}
              onKeyDown={onKeyDown}
              className={cn(
                "-mb-px shrink-0 cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500",
                selected
                  ? "border-sky-500 text-fg"
                  : "border-transparent text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${tab.id}-panel`}
          aria-labelledby={`${tab.id}-tab`}
          hidden={tab.id !== active}
          className="space-y-4 pt-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
