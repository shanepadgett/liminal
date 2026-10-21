/** Kept values: one per name, handed to the next process encoded, and read back from a handoff. */

import { describe, expect, test } from "bun:test";

import { Schema } from "effect";

import { makeKeptStore } from "../src/kept.ts";

const Count = Schema.Struct({ count: Schema.Finite });

describe("makeKeptStore", () => {
  test("a name keeps one value, which goes into the handoff encoded", () => {
    const store = makeKeptStore({});
    store.keep("chat/count", Count, () => ({ count: 1 })).set({ count: 2 });

    expect(store.keep("chat/count", Count, () => ({ count: 1 })).get()).toEqual({ count: 2 });
    expect(store.handoff()).toEqual({ "chat/count": { count: 2 } });
  });

  test("a value starts from the handoff, or from its initial value when that does not decode", () => {
    const store = makeKeptStore({ "chat/count": { count: 5 }, "chat/other": "not a count" });

    expect(store.keep("chat/count", Count, () => ({ count: 1 })).get()).toEqual({ count: 5 });
    expect(store.keep("chat/other", Count, () => ({ count: 1 })).get()).toEqual({ count: 1 });
  });
});
