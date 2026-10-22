/** Logs the tool list at session start and a change when tools are added, changed or removed. */
import { Effect, Layer, Option } from "effect";

import { definePlugin, Pipeline } from "@shanepadgett/liminal-core";
import { Converters, defineConverter } from "@shanepadgett/liminal-history/contract";
import type { ToolDefinition } from "@shanepadgett/liminal-model/contract";
import {
  type SessionEvent,
  type SessionId,
  SessionLog,
} from "@shanepadgett/liminal-session/contract";
import { type Tool, Tools } from "@shanepadgett/liminal-tools/contract";

import { ToolDefinitions, ToolList, ToolListChange, ToolListRecord } from "./contract.ts";
import { changeText, diff, replay } from "./replay.ts";

const definitions = Layer.effect(
  ToolDefinitions,
  Pipeline.make(({ name, description, input }: Tool) =>
    Effect.succeed<ToolDefinition>({ name, description, input }),
  ),
);

const current = (events: ReadonlyArray<SessionEvent>) =>
  Effect.map(
    replay(events),
    Option.match({
      onNone: (): ReadonlyArray<ToolDefinition> => [],
      onSome: (known) => [...known.values()].map(({ definition }) => definition),
    }),
  );

const make = Effect.gen(function* () {
  const tools = yield* Tools;
  const pipeline = yield* ToolDefinitions;
  const log = yield* SessionLog;

  /** Deferred tools stay out until tools-search; of two with one name, the last added wins. */
  const build = Effect.flatMap(tools.list, (all) => {
    const byName = new Map(
      all.flatMap((tool) => (tool.deferred === true ? [] : [[tool.name, tool] as const])),
    );

    return Effect.forEach([...byName.values()], (tool) => pipeline.run(tool));
  });

  const fold = (session: SessionId) =>
    build.pipe(
      Effect.flatMap((built) => ToolListRecord.make({ tools: built })),
      Effect.flatMap((event) => log.append(session, [event])),
      Effect.asVoid,
    );

  const sync = Effect.fn("ToolList.sync")(function* (session: SessionId) {
    const known = yield* Effect.flatMap(log.read(session), replay);

    if (Option.isNone(known)) {
      yield* fold(session);

      return;
    }

    const { added, removed } = diff(known.value, yield* build);

    if (added.length > 0 || removed.length > 0) {
      yield* log.append(session, [yield* ToolListChange.make({ added, removed })]);
    }
  });

  yield* (yield* Converters).add(
    defineConverter(ToolListChange, ({ added, removed }) => [
      { role: "user", parts: [{ type: "text", text: changeText(added, removed) }] },
    ]),
  );

  return { sync, current, fold };
});

export default definePlugin({
  name: "tool-definitions",
  provides: [ToolDefinitions, ToolList],
  requires: [Tools, SessionLog, Converters],
  layer: Layer.effect(ToolList, make).pipe(Layer.provideMerge(definitions)),
});
