/** The plugin under every `tui` entry: the host, the renderer, the slots and the dialogs. */
import type { CliRenderer } from "@opentui/core";
import { createSolidSlotRegistry } from "@opentui/solid";
import { Context, Effect, Layer } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";

import { Dialogs, makeDialogs } from "./dialogs.tsx";
import { makeSlots, Slots } from "./slots.tsx";

/** The terminal the TUI draws in. */
export class Renderer extends Context.Service<Renderer, CliRenderer>()("tui/Renderer") {}

export const base = (host: Host["Service"], renderer: CliRenderer) =>
  definePlugin({
    name: "tui",
    provides: [Host, Renderer, Slots, Dialogs],
    requires: [],
    layer: Layer.effectContext(
      Effect.sync(() =>
        Context.make(Host, host).pipe(
          Context.add(Renderer, renderer),
          Context.add(Slots, makeSlots(createSolidSlotRegistry(renderer, {}))),
          Context.add(Dialogs, makeDialogs()),
        ),
      ),
    ),
  });
