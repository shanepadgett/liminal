/**
 * Usage's server: each session's usage and today's cost across every session, counted again after
 * each burst of the session's new entries.
 */

import { Array as Arr, DateTime, Duration, Effect, Option, Stream } from "effect";

import { AgentLoop } from "@liminal/agent-loop/contract";
import { Models } from "@liminal/models/contract";
import type { ModelInfo, SessionId } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

import { idleUsage, type SessionUsage, type UsageReport, UsageRpcs } from "./contract.ts";
import {
  callKinds,
  callsSince,
  type Counted,
  costOf,
  countCalls,
  type ModelCalls,
  sentTokens,
} from "./server/count.ts";

/** Entries saved together, such as a reply's parts or the history on subscribing, count once. */
const SETTLE = Duration.millis(100);

interface Deps {
  readonly log: SessionLog["Service"];
  readonly models: Models["Service"];
  /** The session's next model, which sizes the window before its first reply; absent without it. */
  readonly loop: Option.Option<AgentLoop["Service"]>;
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

/** The cost of the calls in `described` whose model has a price. */
const pricedCosts = (described: ReadonlyArray<Described>) =>
  described.flatMap((each) =>
    Option.match(priceOf(each), {
      onNone: () => [],
      onSome: (price) => [costOf(price, each.calls.usage)],
    }),
  );

const total = (costs: ReadonlyArray<number>) => {
  let sum = 0;
  for (const each of costs) sum += each;

  return sum;
};

/** Each model's calls with its details; none where they could not be read. */
const describeAll = (deps: Deps, calls: ReadonlyArray<ModelCalls>) =>
  Effect.forEach(calls, (each) =>
    deps.models.describe(each.model).pipe(
      Effect.option,
      Effect.map((info): Described => ({ calls: each, info })),
    ),
  );

/** The usage of `counted`, with prices and the context window from `described`. */
export const usageOf = (counted: Counted, described: ReadonlyArray<Described>): SessionUsage => {
  const { usage } = counted.latest;
  const sent = sentTokens(usage);

  const window = Option.fromUndefinedOr(
    described.find(({ calls }) => isSameModel(calls, counted.latest)),
  ).pipe(Option.flatMap(({ info }) => info));

  const costs = pricedCosts(described);
  const cost = total(costs);

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

/** The window of the model the session's next turn would use; none when it cannot be told. */
const nextWindow = Effect.fn("usage.window")(
  function* (deps: Deps, session: SessionId) {
    if (Option.isNone(deps.loop)) return Option.none<number>();
    const settings = yield* deps.loop.value.sessionSettings(session);
    const info = yield* deps.models.describe(settings.model);

    return Option.some(info.contextWindow);
  },
  Effect.orElseSucceed(() => Option.none<number>()),
);

/** The session's usage now: its calls', or nothing used in its next model's window. */
const sessionNow = Effect.fn("usage.session")(function* (deps: Deps, session: SessionId) {
  const entries = yield* deps.log
    .read(session, {})
    .pipe(Effect.catchTag("SessionNotFound", () => Effect.succeed([])));

  const counted = countCalls(entries);

  if (Option.isSome(counted)) {
    return usageOf(counted.value, yield* describeAll(deps, counted.value.byModel));
  }

  return idleUsage(Option.getOrUndefined(yield* nextWindow(deps, session)));
});

/** Local midnight today. */
const midnight = Effect.map(DateTime.now, (now) =>
  DateTime.toUtc(DateTime.startOf(DateTime.setZone(now, DateTime.zoneMakeLocal()), "day")),
);

/** What every session's priced calls cost since local midnight; none when no call has a price. */
const todayNow = Effect.fn("usage.today")(function* (deps: Deps) {
  const since = yield* midnight;
  const entries = yield* deps.log.recentOfKinds(callKinds, since);
  const costs = pricedCosts(yield* describeAll(deps, callsSince(entries, since)));

  return Option.liftPredicate(costs, Arr.isArrayNonEmpty).pipe(Option.map(total));
});

/** The session's report now. */
const usageNow = Effect.fn("usage.now")(function* (deps: Deps, session: SessionId) {
  const [usage, today] = yield* Effect.all([sessionNow(deps, session), todayNow(deps)]);

  const report: UsageReport = {
    session: usage,
    ...Option.match(today, { onNone: () => ({}), onSome: (cost) => ({ today: cost }) }),
  };

  return [report];
});

/** A signal for each new entry, and each pick of the session's next model. */
const changes = (deps: Deps, session: SessionId) => {
  const entries = Stream.map(deps.log.subscribe(session, {}), () => {});
  if (Option.isNone(deps.loop)) return entries;

  return Stream.merge(
    entries,
    Stream.map(deps.loop.value.sessionDefaults(session), () => {}),
  );
};

/**
 * The session's report now, then after each burst of new entries; a failed count is skipped. A
 * session followed before its first prompt reads as having no calls until it exists.
 */
const watchUsage = (deps: Deps, session: SessionId) =>
  changes(deps, session).pipe(
    Stream.debounce(SETTLE),
    Stream.mapEffect(() =>
      usageNow(deps, session).pipe(
        Effect.catch((error) =>
          Effect.as(Effect.logWarning(`usage count skipped: ${error.message}`), []),
        ),
      ),
    ),
    Stream.flattenIterable,
    Stream.catch((error) =>
      Stream.fromEffect(Effect.logWarning(`usage ended: ${error.message}`)).pipe(Stream.drain),
    ),
  );

export const layer = UsageRpcs.toLayer(
  Effect.gen(function* () {
    const deps: Deps = {
      log: yield* SessionLog,
      models: yield* Models,
      loop: yield* Effect.serviceOption(AgentLoop),
    };

    return UsageRpcs.of({ "usage/session": ({ session }) => watchUsage(deps, session) });
  }),
);
