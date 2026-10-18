/**
 * Draws the frontend's slot tree on an OpenTUI renderer: the tree is a Solid signal kept current
 * from the frontend. The keymap, its commands and the dialog stack exist before the frontend
 * starts, so every part's setup registers into them.
 */

import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { Context, Deferred, Effect, Stream } from "effect";
import { createSignal } from "solid-js";

import type { Frontend } from "@liminal/frontend";
import type { FrontendHost } from "@liminal/sdk";
import {
  makeTuiCommands,
  makeTuiDialogs,
  makeTuiToasts,
  type SolidKind,
  TuiCommands,
  type TuiCommandsService,
  TuiDialogs,
  type TuiDialogsService,
  TuiHost,
  TuiToasts,
  type TuiToastsService,
  type TuiKeymap,
} from "@liminal/sdk/tui";

import { App } from "./App.tsx";

/** The renderer and what parts share across it. */
export interface Terminal {
  readonly renderer: CliRenderer;
  readonly keymap: TuiKeymap;
  readonly commands: TuiCommandsService;
  readonly dialogs: TuiDialogsService;
  readonly toasts: TuiToastsService;
}

/** The terminal's renderer, destroyed when the caller's Scope closes. */
export const openRenderer = Effect.acquireRelease(
  Effect.promise(() => createCliRenderer({ exitOnCtrlC: false })),
  (renderer) =>
    Effect.sync(() => {
      renderer.destroy();
    }),
);

/** The keymap, its commands, an empty dialog stack and no toast over `renderer`. */
export const makeTerminal = Effect.fn("makeTerminal")(function* (renderer: CliRenderer) {
  const keymap = createDefaultOpenTuiKeymap(renderer);
  const commands = yield* makeTuiCommands(keymap);
  const toasts = yield* makeTuiToasts;
  const terminal: Terminal = { renderer, keymap, commands, dialogs: makeTuiDialogs(), toasts };

  return terminal;
});

/** What each part's setup reads: its own host and the terminal's commands, dialogs and toasts. */
export const tuiServices = (terminal: Terminal) => (host: FrontendHost<SolidKind>) =>
  Context.make(TuiHost, host).pipe(
    Context.add(TuiCommands, terminal.commands),
    Context.add(TuiDialogs, terminal.dialogs),
    Context.add(TuiToasts, terminal.toasts),
  );

/**
 * Renders `frontend` on the terminal until the caller's Scope closes; quitting completes the
 * result.
 */
export const mount = Effect.fn("mount")(function* (
  frontend: Frontend<SolidKind["component"]>,
  terminal: Terminal,
) {
  // The tree is a SubscriptionRef's changes, which always start with the current tree.
  const first = yield* Stream.runHead(frontend.tree).pipe(Effect.flatMap(Effect.fromOption));
  const [tree, setTree] = createSignal(first);

  yield* frontend.tree.pipe(
    Stream.runForEach((next) => Effect.sync(() => setTree(() => next))),
    Effect.forkScoped,
  );

  const quit = yield* Deferred.make<void>();

  yield* terminal.commands.register(
    [
      {
        name: "app.quit",
        title: "Quit",
        category: "Liminal",
        slash: { name: "quit", aliases: ["exit"] },
        palette: true,
        run: () => Deferred.doneUnsafe(quit, Effect.void),
      },
    ],
    [{ key: "ctrl+c", cmd: "app.quit" }],
  );

  yield* Effect.promise(() =>
    render(
      () => (
        <KeymapProvider keymap={terminal.keymap}>
          <App tree={tree} dialogs={terminal.dialogs} />
        </KeymapProvider>
      ),
      terminal.renderer,
    ),
  );

  return quit;
});
