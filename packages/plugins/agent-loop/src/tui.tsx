/**
 * Agent-loop's TUI part: `/model` lists every active provider's models and sets the one picked as
 * the default for new turns.
 */

import { Effect, Predicate } from "effect";

import { ModelsRpcs } from "@liminal/models/contract";
import type { ProviderInfo } from "@liminal/sdk";
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
import { modelKey, modelOf, modelOptions, type ProviderModels } from "./tui/models.ts";

/** The default model's key, if one is set. */
const currentKey = (view: DefaultsView) =>
  Predicate.isTagged(view, "DefaultsSet") ? modelKey(view.settings.model) : undefined;

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

    // A provider that cannot list its models, such as one not logged in, is left out.
    const listOne = (provider: ProviderInfo) =>
      models["models/list"]({ provider: provider.id }).pipe(
        Effect.map((listed): ReadonlyArray<ProviderModels> => [{ provider, models: listed }]),
        Effect.catch((error) =>
          Effect.logWarning(`${provider.name} lists no models`, error).pipe(Effect.as([])),
        ),
      );

    const listAll = models["models/providers"]().pipe(
      Effect.flatMap((providers) => Effect.forEach(providers, listOne)),
      Effect.map((each) => each.flat()),
    );

    const pick = (listed: ReadonlyArray<ProviderModels>) => (key: string) => {
      const model = modelOf(listed, key);
      if (model !== undefined) bridge.run(loop["agent-loop/set-default"]({ model }));
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
          bridge.run(listAll.pipe(Effect.map(show)));
        },
      },
    ]);
  }),
});
