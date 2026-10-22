/** Logs the system prompt built from the sections, and a note when a section changes. */
import { Effect, Layer, Option } from "effect";

import { definePlugin, Registry } from "@shanepadgett/liminal-core";
import { Converters, defineConverter } from "@shanepadgett/liminal-history/contract";
import { type SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";

import { PromptChange, PromptRecord, type Section, Sections, SystemPrompt } from "./contract.ts";
import { changeText, diff, latestPrompt, promptText, replay } from "./replay.ts";

const make = Effect.gen(function* () {
  const sections = yield* Sections;
  const log = yield* SessionLog;

  const build = Effect.flatMap(sections.list, (current) =>
    Effect.map(
      Effect.forEach(current, ({ name, text }) =>
        Effect.map(text, (value) => ({ name, text: value })),
      ),
      (built) => built.filter(({ text }) => text.length > 0),
    ),
  );

  const fold = (session: SessionId) =>
    build.pipe(
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
    const changed = diff(known, yield* build);

    if (changed.length > 0) {
      yield* log.append(session, [yield* PromptChange.make({ sections: changed })]);
    }
  });

  yield* (yield* Converters).add(
    defineConverter(PromptChange, ({ sections: changed }) => [
      { role: "user", parts: [{ type: "text", text: changeText(changed) }] },
    ]),
  );

  return { sync, current: promptText, fold };
});

export default definePlugin({
  name: "system-prompt",
  provides: [Sections, SystemPrompt],
  requires: [SessionLog, Converters],
  layer: Layer.effect(SystemPrompt, make).pipe(
    Layer.provideMerge(Layer.effect(Sections, Registry.make<Section>())),
  ),
});
