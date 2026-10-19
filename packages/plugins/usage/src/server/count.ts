/** Counts a session's model calls from its log: each reply's finish, on the model its turn ran. */

import { Option } from "effect";

import type { Entry, ModelInfo, ModelRef, Usage } from "@liminal/sdk";
import { finishOf, turnModelOf } from "@liminal/session-log/contract";

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

/** The session's calls; none before its first reply. */
export const countCalls = (entries: ReadonlyArray<Entry>): Option.Option<Counted> => {
  const byModel = new Map<string, ModelCalls>();
  let model: Option.Option<ModelRef> = Option.none();
  let latest: Option.Option<ModelCalls> = Option.none();

  for (const entry of entries) {
    model = Option.orElse(turnModelOf(entry), () => model);

    const call = Option.zipWith(model, finishOf(entry), (ref, finish) => ({
      model: ref,
      usage: finish.usage,
    }));

    if (Option.isNone(call)) continue;

    const key = `${call.value.model.provider}/${call.value.model.id}`;
    const before = byModel.get(key);

    byModel.set(key, {
      model: call.value.model,
      usage: before === undefined ? call.value.usage : sum(before.usage, call.value.usage),
    });

    latest = call;
  }

  return Option.map(latest, (last) => ({ latest: last, byModel: [...byModel.values()] }));
};

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
