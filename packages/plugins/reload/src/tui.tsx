/**
 * Reload's TUI part: a chat header item showing a reload that waits for ctrl+r, or why the last
 * check failed; ctrl+r applies a ready reload.
 */

import { Effect } from "effect";

import { ChatSlots } from "@liminal/chat/contract";
import { KernelRpcs, ReloadCurrent } from "@liminal/sdk";
import { defineTui, makeBridge, TuiHost, useBindings, useColor } from "@liminal/sdk/tui";

import { ReloadStatus } from "./tui/ReloadStatus.tsx";

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const kernel = yield* host.client(KernelRpcs);
    const state = bridge.watch(kernel["kernel/reload"](), ReloadCurrent.make({}));

    function Reload() {
      const color = useColor();

      useBindings(() => ({
        commands: [
          {
            name: "reload.now",
            run: () => {
              bridge.run(kernel["kernel/reload-now"]());
            },
          },
        ],
        bindings: [{ key: "ctrl+r", cmd: "reload.now" }],
      }));

      return <ReloadStatus color={color} state={state()} />;
    }

    yield* host.register(ChatSlots.header, { id: "reload", order: 10 }, Reload);
  }),
});
