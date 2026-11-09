import { describe, expect, it, vi } from "vitest";

import { asyncStorage, syncStorage } from "../../../tests/fakes/storages";
import { announceWrite, generationOf, notifyStorageChanged, subscribeToStorage } from "../changes";

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

describe("following the storage while something listens", () => {
  it("passes a change made directly through the storage on to a listener", () => {
    const storage = syncStorage();
    const listener = vi.fn();

    subscribeToStorage(storage, listener, "theme");
    storage.setSync("theme", "dark");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("wakes every key's listeners for a change to no particular key", () => {
    const storage = syncStorage();
    const onChange = vi.spyOn(storage, "onChange");
    const listener = vi.fn();

    subscribeToStorage(storage, listener, "theme");
    onChange.mock.calls[0]?.[0](undefined);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("follows once, however many listen, and stops after the last leaves", () => {
    const storage = syncStorage();
    const stop = vi.fn();
    const onChange = vi.spyOn(storage, "onChange").mockReturnValue(stop);
    const first = subscribeToStorage(storage, vi.fn(), "theme");
    const second = subscribeToStorage(storage, vi.fn());

    expect(onChange).toHaveBeenCalledOnce();

    first();
    expect(stop).not.toHaveBeenCalled();

    second();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("keeps working over a stand-in that cannot be followed", () => {
    const storage = { ...syncStorage(), onChange: undefined } as never;
    const listener = vi.fn();
    const stop = subscribeToStorage(storage, listener);

    notifyStorageChanged(storage);

    expect(listener).toHaveBeenCalledOnce();
    expect(stop).not.toThrow();
  });
});

describe("a stretch with nothing listening", () => {
  it("makes the next reader look again, since changes went unheard", () => {
    const storage = syncStorage();
    const stop = subscribeToStorage(storage, vi.fn());
    const before = generationOf(storage, "theme");

    stop();
    expect(generationOf(storage, "theme")).toBe(before);

    subscribeToStorage(storage, vi.fn());
    expect(generationOf(storage, "theme")).toBeGreaterThan(before);
  });

  it("costs the very first listener nothing, since nothing was missed", () => {
    const storage = syncStorage();
    const before = generationOf(storage, "theme");

    subscribeToStorage(storage, vi.fn());

    expect(generationOf(storage, "theme")).toBe(before);
  });
});

describe("stopping twice", () => {
  it("keeps following for the listeners still attached", () => {
    const storage = syncStorage();
    const stop = vi.fn();

    vi.spyOn(storage, "onChange").mockReturnValue(stop);

    const first = subscribeToStorage(storage, vi.fn());

    subscribeToStorage(storage, vi.fn());
    first();
    first();

    expect(stop).not.toHaveBeenCalled();
  });
});

describe("announceWrite", () => {
  it("moves the generation while nothing is listening, so a later reader is not stale", () => {
    const storage = syncStorage();
    const before = generationOf(storage, "theme");

    announceWrite(storage, "theme");

    expect(generationOf(storage, "theme")).toBeGreaterThan(before);
  });

  it("stays quiet while the storage is being followed, so a write is announced once", () => {
    const storage = syncStorage();
    const listener = vi.fn();

    subscribeToStorage(storage, listener, "theme");
    announceWrite(storage, "theme");

    expect(listener).not.toHaveBeenCalled();
  });

  it("announces for a stand-in that cannot be followed", () => {
    const storage = { ...syncStorage(), onChange: undefined } as never;
    const listener = vi.fn();

    subscribeToStorage(storage, listener);
    announceWrite(storage, "theme" as never);

    expect(listener).toHaveBeenCalledOnce();
  });
});
