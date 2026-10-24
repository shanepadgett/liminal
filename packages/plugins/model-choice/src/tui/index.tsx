/**
 * Model choice's `tui` entry. `/model` opens the models picker; the pick waits on the screen it was
 * made on and goes with that screen's next send. `shift+tab` steps the line's thinking level while
 * the model takes more than one. The model line fills chat's `status` slot; while no provider is
 * connected, it says to run `/connect`.
 */
import { Effect, Layer } from "effect";
import { createEffect, createRoot, on } from "solid-js";

import { ChatScreen, ChatSend, status } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { Attribute, definePlugin } from "@shanepadgett/liminal-core";
import {
  Dialogs,
  type EntryRun,
  Keymap,
  makeEntryRun,
  Notifications,
  openPicker,
  Pickers,
  registerCommands,
  Slots,
} from "@shanepadgett/liminal-tui";

import { ModelPick } from "../contract.ts";
import { ModelLine } from "./ModelLine.tsx";
import { choiceFor, modelsPicker } from "./picker.ts";
import { choiceOf, makeState, type ModelState } from "./state.ts";

/** The thinking levels of the line's model, when it takes more than one. */
const levelsOf = (state: ModelState) => {
  const model = state.line()?.model;
  const levels = model === undefined ? [] : (state.listingOf(model)?.thinking ?? []);

  return levels.length > 1 ? levels : [];
};

/** The line's model at its next thinking level, wrapping round; from none, the first. */
const stepThinking = (state: ModelState) => {
  const line = state.line();
  const levels = levelsOf(state);
  if (line === undefined || levels.length === 0) return;

  const at = line.thinking === undefined ? -1 : levels.indexOf(line.thinking);
  state.pick(choiceOf(line.model, levels[(at + 1) % levels.length]));
};

/**
 * Reloads what the line shows each time the screen changes, and the line and models once the last
 * dialog closes, since a provider connects or disconnects in one; until the scope closes.
 */
const followScreen = (chat: ChatScreen["Service"], state: ModelState, run: EntryRun) =>
  Effect.acquireRelease(
    Effect.map(Dialogs, (dialogs) =>
      createRoot((dispose) => {
        createEffect(
          on(chat.session, (session) => {
            run(state.reloadShown(session));
          }),
        );

        createEffect(
          on(
            () => dialogs.top() === undefined,
            (isClear) => {
              if (!isClear) return;
              run(state.reloadShown(chat.session()));
              run(state.reloadList);
            },
            { defer: true },
          ),
        );

        return dispose;
      }),
    ),
    (dispose) => Effect.sync(dispose),
  );

/** Adds the screen's waiting pick to each send from it, then shows what the session runs. */
const wrapSend = (chat: ChatScreen["Service"], state: ModelState, run: EntryRun) =>
  Effect.flatMap(ChatSend, (chatSend) =>
    chatSend.wrap((request, next) =>
      Effect.gen(function* () {
        const screen = chat.session();
        const pick = state.waiting();

        const attributes =
          pick === undefined
            ? request.input.attributes
            : yield* Attribute.set(request.input.attributes, ModelPick, pick);

        yield* next({ ...request, input: { ...request.input, attributes } });

        run(
          Effect.andThen(
            state.reloadShown(request.session),
            Effect.sync(() => {
              state.sent(screen);
            }),
          ),
        );
      }),
    ),
  );

const make = Effect.gen(function* () {
  const chat = yield* ChatScreen;
  const slots = yield* Slots;
  const run = yield* makeEntryRun("Model choice failed.");

  const state = makeState(chat);

  // Opens at once with the models known; the rows follow the list as it loads again.
  const openModels = Effect.gen(function* () {
    run(state.reloadList);

    yield* openPicker(
      modelsPicker(state, (row) => {
        run(
          Effect.andThen(
            state.saveDefault(choiceFor(state, row)),
            state.reloadShown(chat.session()),
          ),
        );
      }),
    );
  });

  run(state.reloadList);
  run(state.reloadDefault);
  yield* followScreen(chat, state, run);
  yield* wrapSend(chat, state, run);

  yield* registerCommands([
    {
      name: "model-choice.pick",
      title: "Switch model",
      category: "Model",
      slash: { name: "model" },
      run: () => {
        run(openModels);
      },
    },
  ]);

  yield* chat.registerDraftCommands(
    [
      {
        name: "model-choice.thinking",
        title: "Next thinking level",
        category: "Model",
        hint: { label: "thinking" },
        enabled: () => levelsOf(state).length > 0,
        run: () => {
          stepThinking(state);
        },
      },
    ],
    [{ key: "shift+tab", cmd: "model-choice.thinking" }],
  );

  yield* slots.fill(status, () => <ModelLine state={state} />);
});

export default definePlugin({
  name: "model-choice-tui",
  provides: [],
  requires: [Host, Keymap, Dialogs, Pickers, Notifications, ChatScreen, ChatSend, Slots],
  layer: Layer.effectDiscard(make),
});
