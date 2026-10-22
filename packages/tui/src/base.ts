/** The plugin under every `tui` entry: the host, the renderer, the slots and the dialogs. */
import type { CliRenderer } from "@opentui/core";
import { createSolidSlotRegistry } from "@opentui/solid";
import { Context, Effect, FiberSet, Layer } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";

import { Dialogs, makeDialogs } from "./dialogs.tsx";
import { makeSlots, Slots } from "./slots.tsx";

/** The terminal the TUI draws in. */
export class Renderer extends Context.Service<Renderer, CliRenderer>()("tui/Renderer") {}

/** The slot registry; a fill that throws while it draws is logged, and its slot draws without it. */
const slotRegistry = Effect.fn("slotRegistry")(function* (renderer: CliRenderer) {
  const fork = yield* FiberSet.makeRuntime();

  return createSolidSlotRegistry(
    renderer,
    {},
    {
      onPluginError: (failure) => {
        fork(Effect.logError(`The fill ${failure.pluginId} failed to draw.`, failure.error));
      },
    },
  );
});

export const base = (host: Host["Service"], renderer: CliRenderer) =>
  definePlugin({
    name: "tui",
    provides: [Host, Renderer, Slots, Dialogs],
    requires: [],
    layer: Layer.effectContext(
      Effect.map(slotRegistry(renderer), (registry) =>
        Context.make(Host, host).pipe(
          Context.add(Renderer, renderer),
          Context.add(Slots, makeSlots(registry)),
          Context.add(Dialogs, makeDialogs()),
        ),
      ),
    ),
  });
