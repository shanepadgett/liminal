/**
 * The references each session has attached: saved as `references/attached` entries, kept in memory
 * once read, and told to the model as a prompt section.
 */

import { Effect, Option, Schema, Stream, SubscriptionRef } from "effect";

import { definePromptSection, Lines, type SectionRead } from "@liminal/context/contract";
import { draft, type SessionId } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

import { AttachedEntry } from "../contract.ts";

const decodeAttached = Schema.decodeUnknownOption(AttachedEntry.data);

type Names = ReadonlyArray<string>;

const NONE: Names = [];

/** The names in the session's newest `references/attached` entry; none for a session not saved yet. */
const savedNames = (log: SessionLog["Service"], session: SessionId) =>
  log.read(session, {}).pipe(
    Effect.map((entries) =>
      Option.match(
        Option.fromUndefinedOr(entries.findLast((entry) => entry.kind === AttachedEntry.kind)),
        {
          onNone: () => NONE,
          onSome: (entry) =>
            Option.match(decodeAttached(entry.data), {
              onNone: () => NONE,
              onSome: ({ names }) => names,
            }),
        },
      ),
    ),
    Effect.catchTag("SessionNotFound", () => Effect.succeed(NONE)),
  );

const isSame = (left: Names, right: Names) => left.join("\0") === right.join("\0");

const attachedText = (folder: string, heading: string, names: Names) =>
  [
    `Reference repositories are read-only git clones in ${folder}/<name>.`,
    "When the user names one, read it there. Never change them.",
    `${heading}:`,
    ...names.map((name) => `- ${name}`),
  ].join("\n");

export const makeAttached = Effect.fn("references.attached")(function* (
  log: SessionLog["Service"],
) {
  const known = yield* SubscriptionRef.make<ReadonlyMap<SessionId, Names>>(new Map());

  /** The session's names, read from its log the first time. */
  const namesOf = Effect.fn("references.namesOf")(function* (session: SessionId) {
    const held = (yield* SubscriptionRef.get(known)).get(session);
    if (held !== undefined) return held;
    const saved = yield* savedNames(log, session);

    yield* SubscriptionRef.update(known, (map) =>
      map.has(session) ? map : new Map(map).set(session, saved),
    );

    return saved;
  });

  /** Saves `names` for the session, creating it when it has no entries yet. */
  const attach = Effect.fn("references.attach")(function* (session: SessionId, names: Names) {
    const append = log.append(session, [
      draft(AttachedEntry, {
        data: { names },
        text: names.length === 0 ? "No references attached" : `References: ${names.join(", ")}`,
      }),
    ]);

    yield* append.pipe(
      Effect.catchTag("SessionNotFound", () => Effect.andThen(log.create(session), append)),
    );

    yield* SubscriptionRef.update(known, (map) => new Map(map).set(session, names));
  });

  /** The session's names, then each change. */
  const watch = (session: SessionId) =>
    Stream.unwrap(
      Effect.as(
        namesOf(session),
        SubscriptionRef.changes(known).pipe(
          Stream.map((map) => map.get(session) ?? NONE),
          Stream.changesWith(isSame),
        ),
      ),
    );

  /** The prompt section naming the attached clones that still have a folder. */
  const section = (folder: string, library: Effect.Effect<Names>) =>
    definePromptSection<Lines>({
      key: "references/attached",
      order: 230,
      codec: Lines,
      read: ({ sessionId }) =>
        Effect.gen(function* () {
          const present = new Set(yield* library);
          const names = (yield* namesOf(sessionId)).filter((name) => present.has(name));

          return names.length === 0
            ? ({ type: "removed" } satisfies SectionRead<Lines>)
            : ({ type: "present", value: names } satisfies SectionRead<Lines>);
        }).pipe(Effect.orElseSucceed((): SectionRead<Lines> => ({ type: "unavailable" }))),
      render: {
        initial: (names) => attachedText(folder, "Attached", names),
        changed: (_before, names) => attachedText(folder, "Attached now", names),
        removed: () => "No reference repositories are attached any more.",
      },
    });

  return { attach, watch, section };
});
