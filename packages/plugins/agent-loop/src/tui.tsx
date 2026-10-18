/**
 * Agent-loop's TUI part: `/model` lists every signed-in provider's models, then the picked model's
 * thinking options, and sets both as the default for new turns. A provider whose list failed shows
 * the failure. It draws the streaming reply and the retry line at the transcript's end.
 */

import { Effect, Predicate } from "effect";

import { ChatSlots } from "@liminal/chat/contract";
import { ModelsRpcs } from "@liminal/models/contract";
import {
  type DialogProps,
  defineTui,
  makeBridge,
  SelectDialog,
  TuiCommands,
  TuiDialogs,
  TuiHost,
} from "@liminal/sdk/tui";

import {
  AgentLoopRpcs,
  DefaultsMissing,
  type DefaultsView,
  LiveReply,
  LiveRetry,
} from "./contract.ts";
import { Reply, Retry } from "./tui/live.tsx";
import {
  currentThinking,
  listAll,
  modelKey,
  modelOf,
  modelOptions,
  type PickedModel,
  type ProviderModels,
  thinkingOptions,
} from "./tui/models.ts";

/** The default model's key, if one is set. */
const currentKey = (view: DefaultsView) =>
  Predicate.isTagged(view, "DefaultsSet") ? modelKey(view.settings.model) : undefined;

/** The saved thinking option, if one is set. */
const savedThinking = (view: DefaultsView) =>
  Predicate.isTagged(view, "DefaultsSet") ? view.settings.thinking : undefined;

/** Picking a model runs `pickModel`; picking a failure row does nothing. */
const pickOf =
  (listed: ReadonlyArray<ProviderModels>, pickModel: (model: PickedModel) => void) =>
  (key: string) => {
    const model = modelOf(listed, key);
    if (model !== undefined) pickModel(model);
  };

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;
    const loop = yield* host.client(AgentLoopRpcs);
    const models = yield* host.client(ModelsRpcs);

    const defaults = bridge.watch(
      loop["agent-loop/defaults"](),
      DefaultsMissing.make({ message: "" }),
    );

    const listing = listAll(models["models/providers"](), (provider) =>
      models["models/list"]({ provider: provider.id }),
    );

    /** Asks for a thinking option when the model offers any, then sets both. */
    const pickThinking = ({ ref, info }: PickedModel) => {
      if (info.thinking.length === 0) {
        bridge.run(loop["agent-loop/set-default"]({ model: ref }));

        return;
      }

      dialogs.show((props: DialogProps) => (
        <SelectDialog
          title={`Thinking · ${info.name}`}
          options={thinkingOptions(info)}
          current={currentThinking(info, savedThinking(defaults()))}
          close={props.close}
          onSelect={(thinking) => {
            bridge.run(loop["agent-loop/set-default"]({ model: ref, thinking }));
          }}
        />
      ));
    };

    const show = (listed: ReadonlyArray<ProviderModels>) => {
      dialogs.show((props: DialogProps) => (
        <SelectDialog
          title="Models"
          options={modelOptions(listed)}
          current={currentKey(defaults())}
          close={props.close}
          onSelect={pickOf(listed, pickThinking)}
        />
      ));
    };

    yield* commands.register([
      {
        name: "model.switch",
        title: "Switch model",
        desc: "Switch the model",
        category: "Model",
        slash: { name: "model" },
        palette: true,
        run: () => {
          bridge.run(listing.pipe(Effect.map(show)));
        },
      },
    ]);

    yield* host.register(ChatSlots.live, { key: LiveReply.kind, meta: {} }, Reply);
    yield* host.register(ChatSlots.live, { key: LiveRetry.kind, meta: {} }, Retry);
  }),
});
