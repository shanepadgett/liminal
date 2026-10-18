/**
 * Draws the frontend's slot tree on an OpenTUI renderer: the tree is a Solid signal kept current
 * from the frontend, and the keymap reads the renderer's keys.
 */

import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { Deferred, Effect, Stream } from "effect";
import { createSignal } from "solid-js";

import type { Frontend } from "@liminal/frontend";
import type { SolidKind } from "@liminal/sdk/tui";

import { App } from "./App.tsx";

/** Renders `frontend` on `renderer` until the caller's Scope closes; ctrl+c completes `quit`. */
export const mount = Effect.fn("mount")(function* (
  frontend: Frontend<SolidKind["component"]>,
  renderer: CliRenderer,
) {
  // The tree is a SubscriptionRef's changes, which always start with the current tree.
  const first = yield* Stream.runHead(frontend.tree).pipe(Effect.flatMap(Effect.fromOption));
  const [tree, setTree] = createSignal(first);

  yield* frontend.tree.pipe(
    Stream.runForEach((next) => Effect.sync(() => setTree(() => next))),
    Effect.forkScoped,
  );

  const quit = yield* Deferred.make<void>();
  const keymap = createDefaultOpenTuiKeymap(renderer);
  const done = () => Deferred.doneUnsafe(quit, Effect.void);

  yield* Effect.promise(() =>
    render(
      () => (
        <KeymapProvider keymap={keymap}>
          <App tree={tree} quit={done} />
        </KeymapProvider>
      ),
      renderer,
    ),
  );

  return quit;
});

/** Runs the TUI in the terminal until the user quits. */
export const runTui = Effect.fn("runTui")(function* (frontend: Frontend<SolidKind["component"]>) {
  const renderer = yield* Effect.acquireRelease(
    Effect.promise(() => createCliRenderer({ exitOnCtrlC: false })),
    (each) =>
      Effect.sync(() => {
        each.destroy();
      }),
  );

  yield* Deferred.await(yield* mount(frontend, renderer));
});
