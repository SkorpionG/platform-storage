import { describe, expect, it, vi } from "vitest";

import { asyncStorage, syncStorage } from "../../../tests/fakes/storages";
import { generationOf, notifyStorageChanged, subscribeToStorage } from "../changes";

describe("subscribeToStorage", () => {
  it("calls a key's listener when that key changes", () => {
    const storage = syncStorage();
    const listener = vi.fn();

    subscribeToStorage(storage, listener, "theme");
    notifyStorageChanged(storage, "theme");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("leaves a listener on another key alone", () => {
    const storage = syncStorage();
    const theme = vi.fn();
    const visits = vi.fn();

    subscribeToStorage(storage, theme, "theme");
    subscribeToStorage(storage, visits, "visitCount");
    notifyStorageChanged(storage, "theme");

    expect(theme).toHaveBeenCalledTimes(1);
    expect(visits).not.toHaveBeenCalled();
  });

  it("leaves a listener on another storage alone, even over the same schema", () => {
    const local = syncStorage();
    const session = syncStorage();
    const listener = vi.fn();

    subscribeToStorage(session, listener, "theme");
    notifyStorageChanged(local, "theme");

    expect(listener).not.toHaveBeenCalled();
  });

  it("calls every listener when the change names no key, which is what clearing is", () => {
    const storage = syncStorage();
    const theme = vi.fn();
    const visits = vi.fn();
    const everything = vi.fn();

    subscribeToStorage(storage, theme, "theme");
    subscribeToStorage(storage, visits, "visitCount");
    subscribeToStorage(storage, everything);
    notifyStorageChanged(storage);

    expect(theme).toHaveBeenCalledTimes(1);
    expect(visits).toHaveBeenCalledTimes(1);
    expect(everything).toHaveBeenCalledTimes(1);
  });

  it("calls a keyless listener for a change to any key", () => {
    const storage = syncStorage();
    const everything = vi.fn();

    subscribeToStorage(storage, everything);
    notifyStorageChanged(storage, "theme");

    expect(everything).toHaveBeenCalledTimes(1);
  });

  it("stops calling a listener once it unsubscribes", () => {
    const storage = syncStorage();
    const listener = vi.fn();

    const unsubscribe = subscribeToStorage(storage, listener, "theme");
    unsubscribe();
    notifyStorageChanged(storage, "theme");

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops calling a keyless listener once it unsubscribes", () => {
    const storage = syncStorage();
    const listener = vi.fn();

    const unsubscribe = subscribeToStorage(storage, listener);
    unsubscribe();
    notifyStorageChanged(storage, "theme");

    expect(listener).not.toHaveBeenCalled();
  });

  it("survives a listener that unsubscribes while being called", () => {
    const storage = syncStorage();
    const second = vi.fn();

    const unsubscribeFirst = subscribeToStorage(storage, () => unsubscribeFirst(), "theme");
    subscribeToStorage(storage, second, "theme");

    expect(() => notifyStorageChanged(storage, "theme")).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("works on a storage with no synchronous half", () => {
    const storage = asyncStorage();
    const listener = vi.fn();

    subscribeToStorage(storage, listener, "theme");
    notifyStorageChanged(storage, "theme");

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("generationOf", () => {
  it("starts every key at the same generation", () => {
    const storage = syncStorage();

    expect(generationOf(storage, "theme")).toBe(generationOf(storage, "visitCount"));
  });

  it("moves for the key that changed and for no other", () => {
    const storage = syncStorage();
    const before = generationOf(storage, "visitCount");

    notifyStorageChanged(storage, "theme");

    expect(generationOf(storage, "visitCount")).toBe(before);
  });

  it("moves for a key nothing has read when the change names none", () => {
    const storage = syncStorage();
    const before = generationOf(storage, "nickname");

    notifyStorageChanged(storage);

    expect(generationOf(storage, "nickname")).toBeGreaterThan(before);
  });
});
