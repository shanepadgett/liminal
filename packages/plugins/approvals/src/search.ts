/**
 * `session_search`, the reviewer's look into the session: a literal search over the user's messages
 * and the agent's tool-call inputs. Never tool results, so a file the agent read cannot talk the
 * reviewer into a yes.
 */
import { Effect, Option, Schema } from "effect";

import type { StepTool } from "@shanepadgett/liminal-model/contract";
import type { SessionEvent } from "@shanepadgett/liminal-session/contract";

import { messagesOf, textOf } from "./state.ts";

const MAX_EXCERPTS = 10;
const AROUND = 100;

const Input = Schema.Struct({ query: Schema.String });

const decodeInput = Schema.decodeUnknownOption(Input);

/** What can be searched, each labelled with where it came from. */
const sourcesOf = (events: ReadonlyArray<SessionEvent>) =>
  messagesOf(events).flatMap((message) => {
    if (message.role === "user") return [{ label: "user", text: textOf(message) }];

    return message.parts.flatMap((part) =>
      part.type === "tool-call"
        ? [{ label: `call ${part.name}`, text: JSON.stringify(part.params) }]
        : [],
    );
  });

/** Every match of `query` in `text`, case-insensitive, with the text around it. */
const excerptsOf = (text: string, query: string): ReadonlyArray<string> => {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, at + query.length)) {
    found.push(text.slice(Math.max(0, at - AROUND), at + query.length + AROUND));
  }

  return found;
};

export const search = (events: ReadonlyArray<SessionEvent>, query: string): string => {
  const needle = query.toLowerCase();
  if (needle === "") return "Give a query.";

  const excerpts = sourcesOf(events)
    .flatMap(({ label, text }) => excerptsOf(text, needle).map((each) => `[${label}] ${each}`))
    .slice(-MAX_EXCERPTS);

  return excerpts.length === 0 ? `Nothing matches "${query}".` : excerpts.join("\n\n");
};

/** The tool over the session's events as they were when the review began. */
export const searchTool = (events: ReadonlyArray<SessionEvent>): StepTool => ({
  definition: {
    name: "session_search",
    description:
      "Search this session's user messages and earlier tool-call inputs for literal text, case-insensitive. Returns up to 10 short excerpts, latest last.",
    input: {
      type: "object",
      properties: { query: { type: "string", description: "The text to find." } },
      required: ["query"],
    },
  },
  run: (params) =>
    Effect.succeed(
      Option.match(decodeInput(params), {
        onNone: () => "Give a query.",
        onSome: ({ query }) => search(events, query),
      }),
    ),
});
