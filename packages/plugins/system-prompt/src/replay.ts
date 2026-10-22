/** The sections the log says the model has, and what changed against the current sections. */
import { Effect, Option } from "effect";

import type { SessionEvent } from "@shanepadgett/liminal-session/contract";

import { PromptChange, PromptRecord } from "./contract.ts";

export interface SectionText {
  readonly name: string;
  readonly text: string;
}

export interface SectionChange {
  readonly name: string;
  readonly text: string | null;
}

/** The latest prompt record and the events after it; none when the log has no prompt. */
export const latestPrompt = (events: ReadonlyArray<SessionEvent>) => {
  const index = events.findLastIndex((event) => event.kind === PromptRecord.kind);
  const event = events[index];
  if (event === undefined) return Effect.succeedNone;

  return Effect.map(
    PromptRecord.decode(event),
    Option.map(({ sections }) => ({ sections, after: events.slice(index + 1) })),
  );
};

/** The text of the latest logged prompt; empty when the log has none. */
export const promptText = (events: ReadonlyArray<SessionEvent>) =>
  Effect.map(
    latestPrompt(events),
    Option.match({
      onNone: () => "",
      onSome: ({ sections }) => sections.map(({ text }) => text).join("\n\n"),
    }),
  );

/** The prompt's sections with every later change applied, by name. */
export const replay = Effect.fn("replay")(function* (
  sections: ReadonlyArray<SectionText>,
  after: ReadonlyArray<SessionEvent>,
) {
  const known = new Map(sections.map(({ name, text }) => [name, text]));

  for (const event of after) {
    const change = yield* PromptChange.decode(event);
    if (Option.isNone(change)) continue;

    for (const { name, text } of change.value.sections) {
      if (text === null) known.delete(name);
      else known.set(name, text);
    }
  }

  return known;
});

/** Each section whose text differs from `known`, and each known section that is gone. */
export const diff = (
  known: ReadonlyMap<string, string>,
  current: ReadonlyArray<SectionText>,
): ReadonlyArray<SectionChange> => {
  const names = new Set(current.map(({ name }) => name));
  const changed = current.filter(({ name, text }) => known.get(name) !== text);

  const removed = [...known.keys()].flatMap((name) =>
    names.has(name) ? [] : [{ name, text: null }],
  );

  return [...changed, ...removed];
};

/** A change note as the model reads it. */
export const changeText = (sections: ReadonlyArray<SectionChange>) => {
  const body = sections.map(({ name, text }) =>
    text === null
      ? `Removed system prompt section "${name}".`
      : `Updated system prompt section "${name}":\n\n${text}`,
  );

  return `<system-prompt-update>\n${body.join("\n\n")}\n</system-prompt-update>`;
};
