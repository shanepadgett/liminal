/**
 * What the model hears about commands between calls: once per session after the server starts,
 * which commands still run from before; and each command that exited by itself, once. An exit at
 * the turn's end continues the turn.
 */

import { Effect, HashSet, Option, Predicate, Ref } from "effect";

import { BeforeCall, type BeforeCallHook, type TurnEndingHook } from "@liminal/agent-loop/contract";
import { draft, type EntryDraft, reminder } from "@liminal/sdk";

import { NoticeEntry, type ProcessExit, type ProcessSummary } from "../contract.ts";
import type { HolderClient, HolderLink } from "./link.ts";
import { stateLine } from "./tools.ts";

const noticeDraft = (text: string, line: string): EntryDraft =>
  draft(NoticeEntry, {
    data: { text },
    model: [
      {
        role: "user",
        parts: [{ type: "text", text: reminder("processes", text), providerData: {} }],
      },
    ],
    text: line,
  });

const resumedDraft = (running: ReadonlyArray<ProcessSummary>) =>
  noticeDraft(
    [
      "These commands kept running while Liminal restarted; their ids still work:",
      ...running.map((process) => `- ${process.id}: ${process.command}`),
    ].join("\n"),
    `Still running: ${running.map(({ id }) => id).join(", ")}`,
  );

const exitDraft = ({ process, tail }: ProcessExit) =>
  noticeDraft(
    tail === "" ? stateLine(process) : `${stateLine(process)} Its last lines:\n${tail}`,
    stateLine(process),
  );

/** The session's exits not reported yet; none when no holder answers. */
const exitsOf = (client: HolderClient, session: string) =>
  client["holder/exits"]({ session }).pipe(Effect.map((exits) => exits.map(exitDraft)));

const resumedOf = (client: HolderClient, session: string) =>
  client["holder/list"]({ session }).pipe(
    Effect.map((processes) =>
      processes.filter(({ state }) => Predicate.isTagged(state, "Running")),
    ),
    Effect.map((running) => (running.length === 0 ? [] : [resumedDraft(running)])),
  );

/** Runs `use` on the holder when one answers; nothing to say otherwise or when it fails. */
const fromHolder = (
  link: HolderLink,
  use: (client: HolderClient) => Effect.Effect<ReadonlyArray<EntryDraft>, Error>,
) =>
  Effect.scoped(
    Effect.flatMap(link.connect, Option.match({ onNone: () => Effect.succeed([]), onSome: use })),
  ).pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning("processes could not reach the holder", error), []),
    ),
  );

export const makeHooks = Effect.fn("processes.makeHooks")(function* (link: HolderLink) {
  /** Sessions told about their commands since this server started. */
  const told = yield* Ref.make(HashSet.empty<string>());

  const beforeCall: BeforeCallHook = ({ sessionId }) =>
    Effect.gen(function* () {
      const first = yield* Ref.modify(told, (sessions) => [
        !HashSet.has(sessions, sessionId),
        HashSet.add(sessions, sessionId),
      ]);

      const input = yield* fromHolder(link, (client) =>
        Effect.gen(function* () {
          const resumed = first ? yield* resumedOf(client, sessionId) : [];

          return [...resumed, ...(yield* exitsOf(client, sessionId))];
        }),
      );

      return BeforeCall.Proceed({ input });
    });

  const turnEnding: TurnEndingHook = ({ sessionId }) =>
    fromHolder(link, (client) => exitsOf(client, sessionId));

  return { beforeCall, turnEnding };
});
