/**
 * Logs the tool list at session start, a change when tools are added, changed, offered or removed,
 * and fails calls to tools the session was not offered.
 */
import { Effect, Layer, Option } from "effect";

import { definePlugin, Pipeline } from "@shanepadgett/liminal-core";
import { Converters, defineConverter } from "@shanepadgett/liminal-history/contract";
import type { ToolDefinition, ToolResult } from "@shanepadgett/liminal-model/contract";
import { type SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";
import {
  type Tool,
  ToolCall,
  type ToolCallRequest,
  Tools,
} from "@shanepadgett/liminal-tools/contract";

import { ToolDefinitions, ToolList, ToolListChange, ToolListRecord } from "./contract.ts";
import { declared, diff, offeredOf, replay } from "./replay.ts";

const definitions = Layer.effect(
  ToolDefinitions,
  Pipeline.make(({ name, description, input }: Tool) =>
    Effect.succeed<ToolDefinition>({ name, description, input }),
  ),
);

const notOffered = ({ call }: ToolCallRequest): ToolResult => ({
  type: "tool-result",
  callId: call.id,
  name: call.name,
  content: [
    {
      type: "text",
      text: `${call.name} is not available now. Call only the tools in your tool list.`,
    },
  ],
  isFailure: true,
});

/** Of two tools with one name, the last added wins. */
const byName = (tools: ReadonlyArray<Tool>) => new Map(tools.map((tool) => [tool.name, tool]));

/** The names of the tools withheld until offered. */
const deferredOf = (tools: ReadonlyArray<Tool>) =>
  new Set(tools.flatMap((tool) => (tool.deferred === true ? [tool.name] : [])));

/** The tools offered in `session` now. */
const offeredIn = (log: SessionLog["Service"], session: SessionId) =>
  Effect.map(Effect.flatMap(log.read(session), replay), offeredOf);

/** Changes reach the model as `tool-change` parts; calls to tools not offered fail. */
const guard = Effect.gen(function* () {
  const log = yield* SessionLog;

  yield* (yield* Converters).add(
    defineConverter(ToolListChange, ({ added, removed }) => [
      { role: "user", parts: [{ type: "tool-change", added, removed }] },
    ]),
  );

  yield* (yield* ToolCall).wrap((request, next) =>
    offeredIn(log, request.session).pipe(
      Effect.flatMap((now) =>
        now.has(request.call.name) ? next(request) : Effect.succeed(notOffered(request)),
      ),
      Effect.catch((error) =>
        Effect.as(
          Effect.logError("The tool list could not be read for a call", error),
          notOffered(request),
        ),
      ),
    ),
  );
});

const make = Effect.gen(function* () {
  const tools = yield* Tools;
  const pipeline = yield* ToolDefinitions;
  const log = yield* SessionLog;

  const offered = (session: SessionId) => offeredIn(log, session);

  /** The tools offered from the start: every tool that is not deferred. */
  const build = Effect.flatMap(tools.list, (all) =>
    Effect.forEach(
      [...byName(all).values()].filter((tool) => tool.deferred !== true),
      (tool) => pipeline.run(tool),
    ),
  );

  const logChange = Effect.fn("ToolList.logChange")(function* (
    session: SessionId,
    added: ReadonlyArray<ToolDefinition>,
    removed: ReadonlyArray<string>,
  ) {
    if (added.length === 0 && removed.length === 0) return;

    yield* log.append(session, [yield* ToolListChange.make({ added, removed })]);
  });

  const fold = (session: SessionId) =>
    Effect.asVoid(
      Effect.flatMap(
        Effect.flatMap(build, (built) => ToolListRecord.make({ tools: built })),
        (event) => log.append(session, [event]),
      ),
    );

  const sync = Effect.fn("ToolList.sync")(function* (session: SessionId) {
    const known = yield* Effect.flatMap(log.read(session), replay);

    if (Option.isNone(known)) {
      yield* fold(session);

      return;
    }

    const { added, removed } = diff(known.value, yield* build, deferredOf(yield* tools.list));
    yield* logChange(session, added, removed);
  });

  const offer = Effect.fn("ToolList.offer")(function* (
    session: SessionId,
    names: ReadonlyArray<string>,
  ) {
    const now = yield* offered(session);
    const registered = byName(yield* tools.list);
    const fresh = names.flatMap((name) => (now.has(name) ? [] : (registered.get(name) ?? [])));

    yield* logChange(session, yield* Effect.forEach(fresh, pipeline.run), []);
  });

  const withdraw = Effect.fn("ToolList.withdraw")(function* (
    session: SessionId,
    names: ReadonlyArray<string>,
  ) {
    const now = yield* offered(session);

    yield* logChange(
      session,
      [],
      names.filter((name) => now.has(name)),
    );
  });

  yield* guard;

  return { sync, current: declared, fold, offer, withdraw };
});

export default definePlugin({
  name: "tool-definitions",
  provides: [ToolDefinitions, ToolList],
  requires: [Tools, ToolCall, SessionLog, Converters],
  layer: Layer.effect(ToolList, make).pipe(Layer.provideMerge(definitions)),
});
