import { Effect, Layer, PubSub, Stream } from "effect";
/** The session log over `SqlClient`, with live updates within this process. */
import type { NonEmptyReadonlyArray } from "effect/Array";
import { SqlClient } from "effect/sql";

import { type Attributes, definePlugin } from "@shanepadgett/liminal-core";

import {
  type Delta,
  type LiveItem,
  type NewEvent,
  type Seq,
  type SessionId,
  SessionLog,
  SessionRpc,
} from "./contract.ts";
import { makeWatch } from "./live.ts";
import { migrate } from "./migrations.ts";
import * as Store from "./store.ts";

/** How many events a page holds. */
const pageSize = 100;

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* migrate;
  const watch = yield* makeWatch;

  const append = Effect.fn("SessionLog.append")(function* (
    session: SessionId,
    events: NonEmptyReadonlyArray<NewEvent>,
  ) {
    const { lock, updates, deltas } = yield* watch(session);

    return yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const saved = yield* Store.insert(sql, session, events);
        deltas.length = 0;
        yield* PubSub.publishAll(updates, saved);

        return saved;
      }),
    );
  });

  const publish = Effect.fn("SessionLog.publish")(function* (session: SessionId, delta: Delta) {
    const { lock, updates, deltas } = yield* watch(session);
    const item: Delta = { kind: delta.kind, data: delta.data };

    yield* lock.withPermits(1)(
      Effect.suspend(() => {
        deltas.push(item);

        return PubSub.publish(updates, item);
      }),
    );
  });

  const live = (session: SessionId, after: Seq = 0) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const { lock, updates, deltas } = yield* watch(session);

        const [subscription, saved, pending] = yield* lock.withPermits(1)(
          Effect.all([
            PubSub.subscribe(updates),
            Store.after(sql, session, after),
            Effect.sync(() => [...deltas]),
          ]),
        );

        const caughtUp: ReadonlyArray<LiveItem> = [...saved, ...pending];

        return Stream.concat(Stream.fromIterable(caughtUp), Stream.fromSubscription(subscription));
      }),
    );

  return SessionLog.of({
    open: (attributes: Attributes = {}) => Store.create(sql, attributes),
    append,
    read: (session, after = 0) => Store.after(sql, session, after),
    page: (session, before) => Store.before(sql, session, before, pageSize),
    live,
    publish,
  });
});

const rpc = SessionRpc.toLayer(
  Effect.map(SessionLog, (log) =>
    SessionRpc.of({
      "session/open": () => log.open(),
      "session/live": ({ session, after }) => log.live(session, after),
    }),
  ),
);

export default definePlugin({
  name: "session",
  provides: [SessionLog],
  requires: [SqlClient.SqlClient],
  layer: Layer.provideMerge(rpc, Layer.effect(SessionLog, make)),
});
