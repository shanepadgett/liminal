/**
 * Agent-loop's TUI part: `/model` lists every active provider's models, then the picked model's
 * thinking options, and sets both as the default for new turns.
 */

import { Effect, Predicate } from "effect";

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

import { AgentLoopRpcs, DefaultsMissing, type DefaultsView } from "./contract.ts";
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

    const pick = (listed: ReadonlyArray<ProviderModels>) => (key: string) => {
      const model = modelOf(listed, key);
      if (model !== undefined) pickThinking(model);
    };

    const show = (listed: ReadonlyArray<ProviderModels>) => {
      dialogs.show((props: DialogProps) => (
        <SelectDialog
          title="Models"
          options={modelOptions(listed)}
          current={currentKey(defaults())}
          close={props.close}
          onSelect={pick(listed)}
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
  }),
});
