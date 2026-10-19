/** Usage's server: each session's usage, counted again after each burst of new entries. */

import { Array as Arr, Duration, Effect, Option, Stream } from "effect";

import { Models } from "@liminal/models/contract";
import type { ModelInfo, SessionId } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

import { type SessionUsage, UsageRpcs } from "./contract.ts";
import { type Counted, costOf, countCalls, type ModelCalls, sentTokens } from "./server/count.ts";

/** Entries saved together, such as a reply's parts or the history on subscribing, count once. */
const SETTLE = Duration.millis(100);

interface Deps {
  readonly log: SessionLog["Service"];
  readonly models: Models["Service"];
}

/** One model's calls and its details; none where they could not be read. */
export interface Described {
  readonly calls: ModelCalls;
  readonly info: Option.Option<ModelInfo>;
}

const isSameModel = (left: ModelCalls, right: ModelCalls) =>
  left.model.provider === right.model.provider && left.model.id === right.model.id;

const priceOf = ({ info }: Described) =>
  Option.flatMap(info, (known) => Option.fromUndefinedOr(known.price));

/** The usage of `counted`, with prices and the context window from `described`. */
export const usageOf = (counted: Counted, described: ReadonlyArray<Described>): SessionUsage => {
  const { usage } = counted.latest;
  const sent = sentTokens(usage);

  const window = Option.fromUndefinedOr(
    described.find(({ calls }) => isSameModel(calls, counted.latest)),
  ).pipe(Option.flatMap(({ info }) => info));

  const costs = described.flatMap((each) =>
    Option.match(priceOf(each), {
      onNone: () => [],
      onSome: (price) => [costOf(price, each.calls.usage)],
    }),
  );

  let cost = 0;
  for (const each of costs) cost += each;

  return {
    context: sent + usage.output,
    unpriced: described.length - costs.length,
    ...Option.match(window, {
      onNone: () => ({}),
      onSome: (info) => ({ contextWindow: info.contextWindow }),
    }),
    ...Option.match(
      Option.liftPredicate(sent, (tokens) => tokens > 0),
      { onNone: () => ({}), onSome: (tokens) => ({ cacheHit: usage.cacheRead / tokens }) },
    ),
    ...Option.match(Option.liftPredicate(costs, Arr.isArrayNonEmpty), {
      onNone: () => ({}),
      onSome: () => ({ cost }),
    }),
  };
};

/** The session's usage now; none before its first reply. */
const usageNow = Effect.fn("usage.now")(function* (deps: Deps, session: SessionId) {
  const counted = countCalls(yield* deps.log.read(session, {}));
  if (Option.isNone(counted)) return [];

  const described = yield* Effect.forEach(counted.value.byModel, (calls) =>
    deps.models.describe(calls.model).pipe(
      Effect.option,
      Effect.map((info): Described => ({ calls, info })),
    ),
  );

  return [usageOf(counted.value, described)];
});

/** The session's usage now, then after each burst of new entries. */
const watchUsage = (deps: Deps, session: SessionId) =>
  deps.log.subscribe(session, {}).pipe(
    Stream.debounce(SETTLE),
    Stream.mapEffect(() => usageNow(deps, session)),
    Stream.flattenIterable,
    Stream.catch((error) =>
      Stream.fromEffect(Effect.logWarning(`usage ended: ${error.message}`)).pipe(Stream.drain),
    ),
  );

export const layer = UsageRpcs.toLayer(
  Effect.gen(function* () {
    const deps: Deps = { log: yield* SessionLog, models: yield* Models };

    return UsageRpcs.of({ "usage/session": ({ session }) => watchUsage(deps, session) });
  }),
);
