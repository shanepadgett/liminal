/**
 * Session name: the model names its session with `name_session`, offered while the session has no
 * name and withdrawn once it has one. The name is a `session/name` event, which session lists show
 * and `session-name/name` streams.
 */
import { Effect, Layer, Option, Schema, Stream } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { BeforeCall, type Turn } from "@shanepadgett/liminal-loop/contract";
import { type SessionId, SessionLog, SessionNamed } from "@shanepadgett/liminal-session/contract";
import { ToolList } from "@shanepadgett/liminal-tool-definitions/contract";
import { defineTool, noAccess, ToolFailed, Tools } from "@shanepadgett/liminal-tools/contract";

import { nameSessionName, SessionNameRpc } from "./contract.ts";

const DESCRIPTION = [
  "Names this session in the user's list of sessions. Call it as soon as you know what the session is about: at once when the request is clear, or once you have asked what you need when it is not. Do not wait for the work to finish.",
  "",
  'The name is 3 to 8 words in sentence case saying what the session is about, with no quotes and no trailing period, such as "Why the loop retries twice".',
  "",
  "Call it alongside your other work. Never mention the name or the naming to the user.",
].join("\n");

const Input = Schema.Struct({ name: Schema.String });

/** Whether `session`'s log holds a name. */
const isNamed = (log: SessionLog["Service"], session: SessionId) =>
  Effect.map(log.read(session), (events) =>
    events.some((event) => event.kind === SessionNamed.kind),
  );

const makeNameSession = (log: SessionLog["Service"]) =>
  defineTool({
    name: nameSessionName,
    description: DESCRIPTION,
    input: Input,
    deferred: true,
    access: () => noAccess,
    run: Effect.fn("name_session")(function* ({ name }, { session }) {
      const trimmed = name.trim();
      if (trimmed === "") return yield* new ToolFailed({ message: "The name is empty. Give one." });

      yield* log
        .append(session, [yield* SessionNamed.make({ name: trimmed })])
        .pipe(Effect.mapError((error) => new ToolFailed({ message: error.message })));

      return { content: [{ type: "text", text: "Named." }] };
    }),
  });

const register = Effect.gen(function* () {
  const log = yield* SessionLog;
  const toolList = yield* ToolList;

  yield* (yield* Tools).add(makeNameSession(log));

  yield* (yield* BeforeCall).add(({ session }: Turn) =>
    Effect.flatMap(isNamed(log, session), (named) =>
      named
        ? toolList.withdraw(session, [nameSessionName])
        : toolList.offer(session, [nameSessionName]),
    ),
  );
});

/** Each name `session` has had, from its saved events on. */
const namesOf = (log: SessionLog["Service"], session: SessionId) =>
  log.live(session).pipe(
    Stream.filter((item) => item.kind === SessionNamed.kind),
    Stream.mapEffect(SessionNamed.decode),
    Stream.filter(Option.isSome),
    Stream.map((named) => named.value.name),
  );

const rpc = SessionNameRpc.toLayer(
  Effect.gen(function* () {
    const log = yield* SessionLog;

    return SessionNameRpc.of({ "session-name/name": ({ session }) => namesOf(log, session) });
  }),
);

export default definePlugin({
  name: "session-name",
  provides: [],
  requires: [SessionLog, ToolList, Tools, BeforeCall],
  layer: Layer.mergeAll(Layer.effectDiscard(register), rpc),
  entries: { tui: () => import("./tui/index.tsx") },
});
