/**
 * The plugin after every `tui` entry: it draws the screen slot and the dialogs over it. It requires
 * `Colors`, so a composition without a theme fails to start.
 */
import { KeymapProvider, useBindings } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { Effect, FiberSet, Layer } from "effect";
import { createSignal } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";

import { Renderer } from "./base.ts";
import { ForkProvider, type Services } from "./bridge.ts";
import { Colors, ColorsProvider, useColor } from "./colors.ts";
import { Keymap } from "./commands.ts";
import { DialogLayer, Dialogs } from "./dialogs.tsx";
import { HintsExpandedProvider } from "./kit/Hints.tsx";
import { Pickers } from "./pickers.tsx";
import { RegistryProvider, screen, Slots, SlotView } from "./slots.tsx";

/** What shows while no plugin fills the screen; `ctrl+c` quits, as the screen would let it. */
function Empty(props: { readonly quit: () => void }) {
  const color = useColor();

  useBindings(() => ({
    commands: [{ name: "app.quit", title: "Quit", run: props.quit }],
    bindings: [{ key: "ctrl+c", cmd: "app.quit" }],
  }));

  return <text fg={color("text.faint")}>No plugin fills the screen.</text>;
}

/**
 * The whole screen. The plugin that fills it binds its own keys, quitting among them. `ctrl+g`
 * shows every hint on lines too narrow for them, under dialogs too.
 */
function Screen(props: { readonly dialogs: Dialogs["Service"]; readonly quit: () => void }) {
  const color = useColor();
  const [isExpanded, setExpanded] = createSignal(false);

  useBindings(() => ({
    commands: [
      {
        name: "hints.toggle",
        title: "Show all keys",
        run: () => {
          setExpanded((was) => !was);
        },
      },
    ],
    bindings: [{ key: "ctrl+g", cmd: "hints.toggle" }],
  }));

  return (
    <HintsExpandedProvider value={isExpanded}>
      <box width="100%" height="100%" backgroundColor={color("surface.base")}>
        <SlotView slot={screen}>
          <Empty quit={props.quit} />
        </SlotView>
        <DialogLayer dialogs={props.dialogs} />
      </box>
    </HintsExpandedProvider>
  );
}

const draw = Effect.gen(function* () {
  const renderer = yield* Renderer;
  const colors = yield* Colors;
  const slots = yield* Slots;
  const dialogs = yield* Dialogs;
  const fork = yield* FiberSet.makeRuntime<Services>();
  const keymap = yield* Keymap;

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
  requires: [Host, Renderer, Keymap, Colors, Slots, Dialogs, Pickers],
  layer: Layer.effectDiscard(draw),
});
