/**
 * The plugin under every `tui` entry: the host, the renderer, the keymap, the slots, the dialogs,
 * the notifications and the pickers pipeline.
 */
import type { CliRenderer } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { createSolidSlotRegistry } from "@opentui/solid";
import { Context, Effect, FiberSet, Layer } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";

import { Keymap } from "./commands.ts";
import { Dialogs, makeDialogs } from "./dialogs.tsx";
import { makeNotifications, Notifications } from "./notifications.ts";
import { makePickers, Pickers } from "./pickers.tsx";
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

/**
 * Each `escape` binding answers `ctrl+c` too, so `ctrl+c` cancels wherever `esc` does. It comes
 * second, so hints still name `esc`.
 */
const cancelOnCtrlC = ({ input }: { readonly input: string }) =>
  input === "escape" ? [{ key: "escape" }, { key: "ctrl+c" }] : undefined;

/**
 * The default keymap, with `ctrl+c` as a second `esc` and a command's `hint` kept where hint lines
 * read it.
 */
const keymapOf = (renderer: CliRenderer) => {
  const keymap = createDefaultOpenTuiKeymap(renderer);

  keymap.appendBindingExpander(cancelOnCtrlC);

  keymap.registerCommandFields({
    hint: (value, ctx) => {
      ctx.attr("hint", value);
    },
  });

  return keymap;
};

const make = Effect.fn("tui.base")(function* (host: Host["Service"], renderer: CliRenderer) {
  const registry = yield* slotRegistry(renderer);
  const pickers = yield* makePickers;
  const notifications = yield* makeNotifications;

  return Context.make(Host, host).pipe(
    Context.add(Renderer, renderer),
    Context.add(Keymap, keymapOf(renderer)),
    Context.add(Slots, makeSlots(registry)),
    Context.add(Dialogs, makeDialogs(renderer)),
    Context.add(Pickers, pickers),
    Context.add(Notifications, notifications),
  );
});

export const base = (host: Host["Service"], renderer: CliRenderer) =>
  definePlugin({
    name: "tui",
    provides: [Host, Renderer, Keymap, Slots, Dialogs, Pickers, Notifications],
    requires: [],
    layer: Layer.effectContext(make(host, renderer)),
  });
