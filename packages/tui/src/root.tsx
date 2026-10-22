/**
 * The plugin after every `tui` entry: it draws the screen slot and the dialogs over it. It requires
 * `Colors`, so a composition without a theme fails to start.
 */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider, useBindings } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { Effect, FiberSet, Layer } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";

import { Renderer } from "./base.ts";
import { ForkProvider, type Services } from "./bridge.ts";
import { Colors, ColorsProvider, useColor } from "./colors.ts";
import { DialogLayer, Dialogs } from "./dialogs.tsx";
import { RegistryProvider, screen, Slots, SlotView } from "./slots.tsx";

/** The whole screen. `ctrl+c` quits until a screen takes it over. */
function Screen(props: { readonly dialogs: Dialogs["Service"]; readonly quit: () => void }) {
  const color = useColor();

  useBindings(() => ({
    commands: [{ name: "app.quit", title: "Quit", run: props.quit }],
    bindings: [{ key: "ctrl+c", cmd: "app.quit" }],
  }));

  return (
    <box width="100%" height="100%" backgroundColor={color("surface.base")}>
      <SlotView slot={screen}>
        <text fg={color("text.faint")}>No plugin fills the screen.</text>
      </SlotView>
      <DialogLayer dialogs={props.dialogs} />
    </box>
  );
}

const draw = Effect.gen(function* () {
  const renderer = yield* Renderer;
  const colors = yield* Colors;
  const slots = yield* Slots;
  const dialogs = yield* Dialogs;
  const fork = yield* FiberSet.makeRuntime<Services>();
  const keymap = createDefaultOpenTuiKeymap(renderer);

  const quit = () => {
    renderer.destroy();
  };

  const app = () => (
    <ForkProvider value={fork}>
      <ColorsProvider value={colors}>
        <RegistryProvider value={slots.registry}>
          <KeymapProvider keymap={keymap}>
            <Screen dialogs={dialogs} quit={quit} />
          </KeymapProvider>
        </RegistryProvider>
      </ColorsProvider>
    </ForkProvider>
  );

  yield* Effect.promise(() => render(app, renderer));
});

export const root = definePlugin({
  name: "tui-root",
  provides: [],
  requires: [Host, Renderer, Colors, Slots, Dialogs],
  layer: Layer.effectDiscard(draw),
});
