/** Counts model calls from session logs: each reply's finish, on the model its turn ran. */

import { DateTime, Option } from "effect";

import type { Entry, EntryDefinition, ModelInfo, ModelRef, Usage } from "@liminal/sdk";
import {
  finishOf,
  ReasoningEntry,
  TextEntry,
  ToolCallEntry,
  TurnStartedEntry,
  turnModelOf,
} from "@liminal/session-log/contract";

/** The kinds counting reads: the turn starts that name models and the reply parts that finish. */
export const callKinds: ReadonlyArray<EntryDefinition> = [
  TurnStartedEntry,
  TextEntry,
  ReasoningEntry,
  ToolCallEntry,
];

/** One model's calls in a session, their tokens summed. */
export interface ModelCalls {
  readonly model: ModelRef;
  readonly usage: Usage;
}

/** A session's calls: the latest one, and every model's calls summed. */
export interface Counted {
  readonly latest: ModelCalls;
  readonly byModel: ReadonlyArray<ModelCalls>;
}

const sum = (left: Usage, right: Usage): Usage => ({
  input: left.input + right.input,
  output: left.output + right.output,
  cacheRead: left.cacheRead + right.cacheRead,
  cacheWrite: left.cacheWrite + right.cacheWrite,
  reasoning: left.reasoning + right.reasoning,
});

/** Adds `call` to its model's sum in `byModel`. */
const add = (byModel: Map<string, ModelCalls>, call: ModelCalls) => {
  const key = `${call.model.provider}/${call.model.id}`;
  const before = byModel.get(key);

  byModel.set(key, {
    model: call.model,
    usage: before === undefined ? call.usage : sum(before.usage, call.usage),
  });
};

/**
 * The calls among `entries`, each session's in seq order, whose entry `counts` keeps: every model's
 * calls summed, and the last one. Each session's turns name its models.
 */
const tally = (entries: ReadonlyArray<Entry>, counts: (entry: Entry) => boolean) => {
  const byModel = new Map<string, ModelCalls>();
  let session: string | undefined;
  let model: Option.Option<ModelRef> = Option.none();
  let latest: Option.Option<ModelCalls> = Option.none();

  for (const entry of entries) {
    if (entry.sessionId !== session) model = Option.none();
    session = entry.sessionId;
    model = Option.orElse(turnModelOf(entry), () => model);

    const call = Option.zipWith(model, finishOf(entry), (ref, finish) => ({
      model: ref,
      usage: finish.usage,
    }));

    if (Option.isNone(call) || !counts(entry)) continue;

    add(byModel, call.value);
    latest = call;
  }

  return { byModel: [...byModel.values()], latest };
};

/** The session's calls; none before its first reply. */
export const countCalls = (entries: ReadonlyArray<Entry>): Option.Option<Counted> => {
  const { byModel, latest } = tally(entries, () => true);

  return Option.map(latest, (last) => ({ latest: last, byModel }));
};

/** Every model's calls finished at or after `since`, from entries ordered by session, then seq. */
export const callsSince = (
  entries: ReadonlyArray<Entry>,
  since: DateTime.Utc,
): ReadonlyArray<ModelCalls> =>
  tally(entries, (entry) => DateTime.isGreaterThanOrEqualTo(entry.at, since)).byModel;

/** Tokens a request sent: the uncached input and what the cache read and wrote. */
export const sentTokens = (usage: Usage): number =>
  usage.input + usage.cacheRead + usage.cacheWrite;

const PER_MILLION = 1_000_000;

/** What `usage` cost in US dollars at `price`, which is per million tokens. */
export const costOf = (price: NonNullable<ModelInfo["price"]>, usage: Usage): number =>
  (usage.input * price.input
    + usage.cacheRead * price.cacheRead
    + usage.cacheWrite * price.cacheWrite
    + usage.output * price.output)
  / PER_MILLION;
