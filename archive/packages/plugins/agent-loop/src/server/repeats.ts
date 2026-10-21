/**
 * The loop guard: ends a turn when the model sent the same failing call several times in a row.
 * Each failure already told the model what was wrong, so another try would only repeat it.
 */

import { Array as Arr, Effect, Equal, Option, Schema } from "effect";

import type { Entry } from "@liminal/sdk";
import {
  type SessionLog,
  ToolCallEntry,
  ToolResultEntry,
  TurnStartedEntry,
} from "@liminal/session-log/contract";

import { BeforeCall, type BeforeCallHook } from "../contract.ts";

/** Failures of one call in a row that end the turn. */
const LIMIT = 3;

const decodeCall = Schema.decodeUnknownOption(ToolCallEntry.data);
const decodeResult = Schema.decodeUnknownOption(ToolResultEntry.data);

const proceed = BeforeCall.Proceed({ input: [] });

/** The entries after the latest turn start. */
const thisTurn = (entries: ReadonlyArray<Entry>) => {
  const start = entries.findLastIndex((entry) => entry.kind === TurnStartedEntry.kind);

  return entries.slice(start + 1);
};

const decodedOf = <A>(
  entries: ReadonlyArray<Entry>,
  kind: string,
  decode: (data: Entry["data"]) => Option.Option<A>,
) => entries.flatMap((entry) => (entry.kind === kind ? Option.toArray(decode(entry.data)) : []));

/** The name of the call whose last `LIMIT` results this turn all failed, if they are one call. */
export const repeatedCall = (entries: ReadonlyArray<Entry>): Option.Option<string> => {
  const turn = thisTurn(entries);
  const results = decodedOf(turn, ToolResultEntry.kind, decodeResult).slice(-LIMIT);

  if (results.length < LIMIT || results.some(({ status }) => status === "done"))
    return Option.none();

  const calls = new Map(
    decodedOf(turn, ToolCallEntry.kind, decodeCall).map((call) => [call.id, call]),
  );

  const repeated = Arr.getSomes(
    results.map(({ callId }) => Option.fromUndefinedOr(calls.get(callId))),
  );

  const [first] = repeated;
  if (first === undefined || repeated.length < LIMIT) return Option.none();

  const isSame = repeated.every(
    (call) => call.name === first.name && Equal.equals(call.params, first.params),
  );

  return isSame ? Option.some(first.name) : Option.none();
};

/** The hook: ends the turn once one call failed `LIMIT` times in a row. */
export const repeatsOf =
  (log: SessionLog["Service"]): BeforeCallHook =>
  ({ sessionId }) =>
    log.read(sessionId, {}).pipe(
      Effect.map((entries) =>
        Option.match(repeatedCall(entries), {
          onNone: () => proceed,
          onSome: (name) =>
            BeforeCall.EndTurn({ reason: `The same ${name} call failed ${LIMIT} times in a row.` }),
        }),
      ),
      Effect.catch((error) =>
        Effect.as(Effect.logWarning("the loop guard could not read the log", error), proceed),
      ),
    );
