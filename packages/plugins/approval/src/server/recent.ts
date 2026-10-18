/** What the decision model and the reviewer read of a session besides the call. */

import { Array as Arr, Effect, Option, Schema } from "effect";

import type { Entry, SessionId } from "@liminal/sdk";
import {
  type SessionLog,
  TextEntry,
  TurnSettings,
  TurnStartedEntry,
  UserEntry,
} from "@liminal/session-log/contract";

/** The last two user prompts and assistant texts, and the provider of the newest turn. */
export interface Recent {
  readonly prompts: ReadonlyArray<string>;
  readonly replies: ReadonlyArray<string>;
  readonly provider: Option.Option<string>;
}

const decodeSettings = Schema.decodeUnknownOption(TurnSettings);

const lastTexts = (entries: ReadonlyArray<Entry>, kind: string) =>
  entries.flatMap((entry) => (entry.kind === kind ? [entry.text] : [])).slice(-2);

const recentIn = (entries: ReadonlyArray<Entry>): Recent => ({
  prompts: lastTexts(entries, UserEntry.kind),
  replies: lastTexts(entries, TextEntry.kind),
  provider: Arr.findLast(entries, (entry) => entry.kind === TurnStartedEntry.kind).pipe(
    Option.flatMap((entry) => decodeSettings(entry.data)),
    Option.map((settings) => settings.model.provider),
  ),
});

const nothing: Recent = { prompts: [], replies: [], provider: Option.none() };

/** The session's recent texts; a session that cannot be read has none. */
export const recentOf = (log: SessionLog["Service"], session: SessionId) =>
  log.read(session, {}).pipe(
    Effect.map(recentIn),
    Effect.orElseSucceed(() => nothing),
  );
