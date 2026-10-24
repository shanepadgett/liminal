/** Logs the system prompt built from the sections, and a note when a section changes. */
import { Effect, Layer, Option } from "effect";

import { definePlugin, Registry } from "@shanepadgett/liminal-core";
import { Converters, defineConverter, History } from "@shanepadgett/liminal-history/contract";
import {
  type SessionEvent,
  type SessionId,
  SessionLog,
} from "@shanepadgett/liminal-session/contract";

import { PromptChange, PromptRecord, type Section, Sections, SystemPrompt } from "./contract.ts";
import { changeText, diff, latestPrompt, promptText, replay } from "./replay.ts";

/** The events without change notes logged before the latest record, which already holds them. */
const withoutFoldedChanges = (events: ReadonlyArray<SessionEvent>) => {
  const record = events.findLast((event) => event.kind === PromptRecord.kind);
  if (record === undefined) return events;

  return events.filter((event) => event.kind !== PromptChange.kind || event.seq > record.seq);
};

const make = Effect.gen(function* () {
  const sections = yield* Sections;
  const log = yield* SessionLog;

  const build = (session: SessionId) =>
    Effect.flatMap(sections.list, (current) =>
      Effect.map(
        Effect.forEach(current, ({ name, text }) =>
          Effect.map(text(session), (value) => ({ name, text: value })),
        ),
        (built) => built.filter(({ text }) => text.length > 0),
      ),
    );

  const fold = (session: SessionId) =>
    build(session).pipe(
      Effect.flatMap((built) => PromptRecord.make({ sections: built })),
      Effect.flatMap((event) => log.append(session, [event])),
      Effect.asVoid,
    );

  const sync = Effect.fn("SystemPrompt.sync")(function* (session: SessionId) {
    const prompt = yield* Effect.flatMap(log.read(session), latestPrompt);

    if (Option.isNone(prompt)) {
      yield* fold(session);

      return;
    }

    const known = yield* replay(prompt.value.sections, prompt.value.after);
    const changed = diff(known, yield* build(session));

    if (changed.length > 0) {
      yield* log.append(session, [yield* PromptChange.make({ sections: changed })]);
    }
  });

  yield* (yield* Converters).add(
    defineConverter(PromptChange, ({ sections: changed }) => [
      { role: "user", parts: [{ type: "text", text: changeText(changed) }] },
    ]),
  );

  yield* (yield* History).wrap((events, next) => next(withoutFoldedChanges(events)));

  return { sync, current: promptText, fold };
});

export default definePlugin({
  name: "system-prompt",
  provides: [Sections, SystemPrompt],
  requires: [SessionLog, Converters, History],
  layer: Layer.effect(SystemPrompt, make).pipe(
    Layer.provideMerge(Layer.effect(Sections, Registry.make<Section>())),
  ),
});
