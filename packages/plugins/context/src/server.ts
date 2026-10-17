/** Context's server: builds each request from the session's entries and saves system changes. */

import { Effect, Layer, Option } from "effect";

import {
  draft,
  KeyedRegistry,
  type ModelRef,
  type ModelTool,
  Registry,
  type SessionId,
} from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tool-registry/contract";

import {
  Context,
  ContextRpcs,
  MessageEntry,
  PromptSections,
  SystemEntry,
  ViewSteps,
} from "./contract.ts";
import {
  diff,
  fold,
  type FoldEntry,
  replay,
  sortSections,
  systemModel,
  systemText,
} from "./server/system.ts";

const make = Effect.gen(function* () {
  const log = yield* SessionLog;
  const entryKinds = yield* EntryKinds;
  const sections = yield* PromptSections;
  const viewSteps = yield* ViewSteps;
  const tools = yield* Effect.serviceOption(Tools);

  yield* entryKinds.register(SystemEntry);
  yield* entryKinds.register(MessageEntry);

  /** Every registered tool, declared as offered at the start or not. */
  const currentTools = Option.match(tools, {
    onNone: () => Effect.succeed<ReadonlyArray<ModelTool>>([]),
    onSome: (registry) =>
      Effect.map(registry.list, (all) =>
        all.map((tool): ModelTool => ({ ...tool.spec, offered: tool.offeredAtStart })),
      ),
  });

  const view = Effect.fn("Context.view")(function* (sessionId: SessionId) {
    let entries = yield* log.read(sessionId, {});
    for (const step of yield* viewSteps.list) entries = yield* step(sessionId, entries);

    return entries;
  });

  const run = Effect.fn("Context.run")(function* (
    sessionId: SessionId,
    model: ModelRef,
    save: boolean,
  ) {
    const entries = yield* view(sessionId);

    const read = yield* Effect.forEach(
      yield* sections.list,
      (section) => Effect.map(section.read({ sessionId, model }), (state) => ({ section, state })),
      { concurrency: "unbounded" },
    );

    const change = diff(replay(entries), sortSections(read), yield* currentTools);
    if (change === undefined) return fold(entries, model);

    const system = draft(SystemEntry, {
      data: change,
      model: systemModel(change),
      text: systemText(change),
    });

    const [saved]: readonly [FoldEntry, ...Array<FoldEntry>] = save
      ? yield* log.append(sessionId, [system])
      : [{ kind: SystemEntry.kind, data: change, model: systemModel(change) }];

    return fold([...entries, saved], model);
  });

  return Context.of({
    build: (sessionId, model) => run(sessionId, model, true),
    preview: (sessionId, model) => run(sessionId, model, false),
  });
});

const rpcs = ContextRpcs.toLayer(
  Effect.gen(function* () {
    const context = yield* Context;

    return ContextRpcs.of({
      "context/preview": ({ session, model }) => context.preview(session, model),
    });
  }),
);

export const layer = rpcs.pipe(
  Layer.provideMerge(Layer.effect(Context, make)),
  Layer.provideMerge(KeyedRegistry.layer(PromptSections, (section) => section.key)),
  Layer.provideMerge(Registry.layer(ViewSteps)),
);
