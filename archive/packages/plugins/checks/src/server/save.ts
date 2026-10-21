/** Appends drafts to a session's log; a failure is logged, not raised, so checks never end a turn. */

import { Effect } from "effect";

import type { EntryDraft, SessionId } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

export const save = (
  log: SessionLog["Service"],
  session: SessionId,
  drafts: ReadonlyArray<EntryDraft>,
) => {
  const [first, ...rest] = drafts;
  if (first === undefined) return Effect.void;

  return log.append(session, [first, ...rest]).pipe(
    Effect.asVoid,
    Effect.catch((error) => Effect.logWarning("checks could not save its entries", error)),
  );
};
