/** The tools the log says the model has, and what changed against the current tools. */
import { Effect, Option } from "effect";

import type { ToolDefinition } from "@shanepadgett/liminal-model/contract";
import type { SessionEvent } from "@shanepadgett/liminal-session/contract";

import { ToolListChange, ToolListRecord } from "./contract.ts";

/** A logged tool; a removed one is still sent until the next fold. */
interface Known {
  readonly definition: ToolDefinition;
  readonly removed: boolean;
}

/** The latest list with every later change applied, by name in first-logged order. */
export const replay = Effect.fn("replay")(function* (events: ReadonlyArray<SessionEvent>) {
  const index = events.findLastIndex((event) => event.kind === ToolListRecord.kind);
  const event = events[index];
  if (event === undefined) return Option.none<ReadonlyMap<string, Known>>();

  const listed = yield* ToolListRecord.decode(event);
  const known = new Map<string, Known>();

  for (const definition of Option.match(listed, {
    onNone: () => [],
    onSome: ({ tools }) => tools,
  })) {
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

const same = (left: ToolDefinition, right: ToolDefinition) =>
  JSON.stringify(left) === JSON.stringify(right);

/** Tools that are new or changed, and logged tools that are gone. */
export const diff = (known: ReadonlyMap<string, Known>, current: ReadonlyArray<ToolDefinition>) => {
  const names = new Set(current.map(({ name }) => name));

  const added = current.filter((definition) => {
    const tool = known.get(definition.name);

    return tool === undefined || tool.removed || !same(tool.definition, definition);
  });

  const removed = [...known].flatMap(([name, tool]) =>
    tool.removed || names.has(name) ? [] : [name],
  );

  return { added, removed };
};

/** A change note as the model reads it. */
export const changeText = (
  added: ReadonlyArray<ToolDefinition>,
  removed: ReadonlyArray<string>,
) => {
  const lines = [
    ...(added.length > 0
      ? [
          `Tools added or changed: ${added.map(({ name }) => name).join(", ")}. Their definitions are in your tool list.`,
        ]
      : []),
    ...(removed.length > 0 ? [`Tools removed: ${removed.join(", ")}. Do not call them.`] : []),
  ];

  return `<tool-update>\n${lines.join("\n")}\n</tool-update>`;
};
