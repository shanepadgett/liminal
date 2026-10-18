/**
 * The part loader over a fake graph: a part that registers before its slot's owner runs once the
 * owner declares it, a clash fails only the later part, and reloading the owner runs the parts it
 * dropped again.
 */

import { describe, expect } from "bun:test";

import { Context, Effect, Layer, Predicate, type Scope, Stream, SubscriptionRef } from "effect";

import {
  type ComponentKind,
  type FrontendHost,
  type GraphMember,
  RootSlot,
  Slot,
  type SlotConflict,
  type SlotUndeclared,
} from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";

import { type PartStatus, startFrontend } from "../src/index.ts";

interface Named extends ComponentKind {
  readonly component: string;
}

class TestHost extends Context.Service<TestHost, FrontendHost<Named>>()("test/TestHost") {}

const tool = Slot.keyed<{}, string>("chat/tool", { scope: "session" });

type Setup = Effect.Effect<void, SlotConflict | SlotUndeclared, TestHost | Scope.Scope>;

const ownerSetup: Setup = Effect.gen(function* () {
  const host = yield* TestHost;
  yield* host.register(RootSlot, {}, "chat", [tool]);
});

const toolSetup = (plugin: string, runs: Array<string>): Setup =>
  Effect.gen(function* () {
    const host = yield* TestHost;
    runs.push(plugin);
    yield* host.register(tool, { key: "read", meta: plugin }, plugin);
  });

const member = (name: string, build: number, setup: Setup) => {
  const loaded: GraphMember = { name, build, parts: { tui: { default: { setup } } } };

  return loaded;
};

const boot = Effect.fn("boot")(function* (members: ReadonlyArray<GraphMember>) {
  const graph = yield* SubscriptionRef.make(members);

  const frontend = yield* startFrontend({
    graph: SubscriptionRef.changes(graph),
    connect: Effect.die("the tests never call the kernel"),
    services: (host) => Context.make(TestHost, host),
    part: (each) => each.parts.tui,
  });

  const settled = (check: (statuses: ReadonlyMap<string, PartStatus>) => boolean) =>
    frontend.statuses.pipe(Stream.filter(check), Stream.runHead, Effect.asVoid);

  const tree = Stream.runHead(frontend.tree).pipe(Effect.flatMap(Effect.fromOption));

  return { graph, settled, tree };
});

const tagOf = (statuses: ReadonlyMap<string, PartStatus>, name: string) => {
  const status = statuses.get(name);
  if (status === undefined) return "missing";
  if (Predicate.isTagged(status, "Running")) return "Running";

  const conflict =
    Predicate.isTagged(status, "Failed") && Predicate.isTagged(status.failure, "Conflict");

  return conflict ? "Conflict" : "Failed";
};

const allRunning =
  (...names: ReadonlyArray<string>) =>
  (statuses: ReadonlyMap<string, PartStatus>) =>
    names.every((name) => tagOf(statuses, name) === "Running");

describe("startFrontend", () => {
  effectTest(
    "a part waiting on an undeclared slot runs once its owner declares it",
    Effect.gen(function* () {
      const runs: Array<string> = [];

      const { settled, tree } = yield* boot([
        member("tools", 1, toolSetup("tools", runs)),
        member("chat", 1, ownerSetup),
      ]);

      yield* settled(allRunning("tools", "chat"));

      expect(runs).toEqual(["tools", "tools"]);
      expect((yield* tree).entries.map((entry) => entry.component)).toEqual(["chat", "tools"]);
    }),
    Layer.empty,
  );

  effectTest(
    "a same-priority clash fails only the later part",
    Effect.gen(function* () {
      const { settled, tree } = yield* boot([
        member("chat", 1, ownerSetup),
        member("tools", 1, toolSetup("tools", [])),
        member("other", 1, toolSetup("other", [])),
      ]);

      yield* settled(
        (statuses) =>
          allRunning("chat", "tools")(statuses) && tagOf(statuses, "other") === "Conflict",
      );

      expect((yield* tree).entries.map((entry) => entry.component)).toEqual(["chat", "tools"]);
    }),
    Layer.empty,
  );

  effectTest(
    "reloading an owner runs the parts it dropped again",
    Effect.gen(function* () {
      const runs: Array<string> = [];
      const tools = member("tools", 1, toolSetup("tools", runs));
      const { graph, settled, tree } = yield* boot([member("chat", 1, ownerSetup), tools]);
      yield* settled(allRunning("chat", "tools"));

      yield* SubscriptionRef.set(graph, [member("chat", 2, ownerSetup), tools]);
      yield* settled((statuses) => allRunning("chat", "tools")(statuses) && runs.length === 2);

      expect(runs).toEqual(["tools", "tools"]);
      expect((yield* tree).entries.map((entry) => entry.component)).toEqual(["chat", "tools"]);
    }),
    Layer.empty,
  );
});
