"use client";

import { useMemo } from "react";

import { keysOfSignature, signatureOf } from "../store/key-list";

/** A hook's keys, each once and in one order, keeping one identity for as long as they name the same keys, so a list written inline neither resubscribes nor rebuilds anything. */
export function useKeyList<Key extends string>(keys: ReadonlyArray<Key>): ReadonlyArray<Key> {
  const signature = signatureOf(keys);

  return useMemo(() => keysOfSignature<Key>(signature), [signature]);
}
