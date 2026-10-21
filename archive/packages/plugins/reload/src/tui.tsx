/**
 * Reload's TUI part: a chat footer item showing a reload that waits for ctrl+r, or why the last
 * check failed; ctrl+r applies a ready reload.
 */

import { Effect } from "effect";

import { ChatSlots } from "@liminal/chat/contract";
import { KernelRpcs, ReloadCurrent } from "@liminal/sdk";
import { defineTui, makeBridge, TuiCommands, TuiHost, useColor } from "@liminal/sdk/tui";

import { ReloadStatus } from "./tui/ReloadStatus.tsx";

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const kernel = yield* host.client(KernelRpcs);
    const state = bridge.watch(kernel["kernel/reload"](), ReloadCurrent.make({}));
    const commands = yield* TuiCommands;

    yield* commands.register(
      [
        {
          name: "reload.now",
          title: "Reload",
          desc: "Apply a reload that waits",
          category: "Liminal",
          slash: { name: "reload" },
          palette: true,
          run: () => {
            bridge.run(kernel["kernel/reload-now"]());
          },
        },
      ],
      [{ key: "ctrl+r", cmd: "reload.now" }],
    );

    function Reload() {
      const color = useColor();

      return <ReloadStatus color={color} state={state()} />;
    }

    yield* host.register(ChatSlots.footer, { id: "reload", order: 10 }, Reload);
  }),
});
