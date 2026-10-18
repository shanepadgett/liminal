/**
 * Notices' contract: the notice entry kind and `notice()`, the draft a server plugin appends
 * through the session log. Writing a notice needs only this contract, so it saves with the plugin
 * off.
 */

import { Array as Arr, Effect, Ref, Schema } from "effect";

import { defineEntry, draft, type EntryDraft, type SessionId } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

export const NoticeKind = Schema.Literals(["info", "success", "warning", "error"]);
export type NoticeKind = typeof NoticeKind.Type;

export const Notice = Schema.Struct({
  kind: NoticeKind,
  title: Schema.String,
  body: Schema.optionalKey(Schema.String),
});

export type Notice = typeof Notice.Type;

/** Saved and shown in the transcript; never sent to the model. */
export const NoticeEntry = defineEntry({
  kind: "notices/notice",
  data: Notice,
  model: false,
  user: "shown",
});

/** The notice as plain text: the title, a blank line, the body. */
export const noticeText = (value: Notice): string =>
  value.body === undefined ? value.title : `${value.title}\n\n${value.body}`;

/** The draft a server plugin appends; its text is the notice as plain text. */
export const notice = (value: Notice): EntryDraft<Notice> =>
  draft(NoticeEntry, { data: value, text: noticeText(value) });

/** Notices a session is told about each problem once; see `makeProblemNotices`. */
export type ProblemNotices = (
  session: SessionId,
  problems: ReadonlyArray<Notice>,
) => Effect.Effect<void>;

/**
 * Tells a session about each of the current `problems` it was not told about at the last call, so a
 * lasting problem shows once and one that goes away and comes back shows again. A failed append is
 * logged.
 */
export const makeProblemNotices = Effect.fn("makeProblemNotices")(function* (
  log: SessionLog["Service"],
) {
  const told = yield* Ref.make<ReadonlyMap<SessionId, ReadonlySet<string>>>(new Map());

  const tell: ProblemNotices = (session, problems) =>
    Ref.modify(
      told,
      (map): readonly [ReadonlyArray<Notice>, ReadonlyMap<SessionId, ReadonlySet<string>>] => {
        const before = map.get(session) ?? new Set<string>();
        const fresh = problems.filter((problem) => !before.has(noticeText(problem)));
        const now = new Set(problems.map(noticeText));

        return [fresh, new Map(map).set(session, now)];
      },
    ).pipe(
      Effect.flatMap((fresh) => {
        const drafts = fresh.map(notice);

        return Arr.isArrayNonEmpty(drafts)
          ? Effect.asVoid(log.append(session, drafts))
          : Effect.void;
      }),
      Effect.catch((error) => Effect.logWarning(`notice not saved: ${error.message}`)),
    );

  return tell;
});
