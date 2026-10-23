/** The tools the log says the model has, and what changed against the current tools. */
import { Effect, Option } from "effect";

import type { ToolDefinition } from "@shanepadgett/liminal-model/contract";
import type { SessionEvent } from "@shanepadgett/liminal-session/contract";

import { ToolListChange, ToolListRecord } from "./contract.ts";

/** A logged tool; a removed one is still sent until the next fold, but it is not offered. */
interface Known {
  readonly definition: ToolDefinition;
  readonly removed: boolean;
}

const lastListIndex = (events: ReadonlyArray<SessionEvent>) =>
  events.findLastIndex((event) => event.kind === ToolListRecord.kind);

/** The tools the latest list declared; none before the first list. */
export const declared = Effect.fn("declared")(function* (events: ReadonlyArray<SessionEvent>) {
  const event = events[lastListIndex(events)];
  if (event === undefined) return [];

  const listed = yield* ToolListRecord.decode(event);

  return Option.match(listed, {
    onNone: (): ReadonlyArray<ToolDefinition> => [],
    onSome: ({ tools }) => tools,
  });
});

/** The latest list with every later change applied, by name in first-logged order. */
export const replay = Effect.fn("replay")(function* (events: ReadonlyArray<SessionEvent>) {
  const index = lastListIndex(events);
  if (index < 0) return Option.none<ReadonlyMap<string, Known>>();

  const known = new Map<string, Known>();

  for (const definition of yield* declared(events)) {
    known.set(definition.name, { definition, removed: false });
  }

  for (const later of events.slice(index + 1)) {
    const change = yield* ToolListChange.decode(later);
    if (Option.isNone(change)) continue;

    for (const definition of change.value.added) {
      known.set(definition.name, { definition, removed: false });
    }

    for (const name of change.value.removed) {
      const tool = known.get(name);
      if (tool !== undefined) known.set(name, { ...tool, removed: true });
    }
  }

  return Option.some<ReadonlyMap<string, Known>>(known);
});

/** The names of the tools offered now: logged and not removed. */
export const offeredOf = (known: Option.Option<ReadonlyMap<string, Known>>) =>
  new Set(
    Option.match(known, {
      onNone: () => [],
      onSome: (tools) => [...tools].flatMap(([name, tool]) => (tool.removed ? [] : [name])),
    }),
  );

const same = (left: ToolDefinition, right: ToolDefinition) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * Tools that are new or changed, and logged tools that are gone; tools in `kept`, such as offered
 * deferred tools, are never gone.
 */
export const diff = (
  known: ReadonlyMap<string, Known>,
  current: ReadonlyArray<ToolDefinition>,
  kept: ReadonlySet<string>,
) => {
  const names = new Set(current.map(({ name }) => name));

  const added = current.filter((definition) => {
    const tool = known.get(definition.name);

    return tool === undefined || tool.removed || !same(tool.definition, definition);
  });

  const removed = [...known].flatMap(([name, tool]) =>
    tool.removed || names.has(name) || kept.has(name) ? [] : [name],
  );

  return { added, removed };
};
