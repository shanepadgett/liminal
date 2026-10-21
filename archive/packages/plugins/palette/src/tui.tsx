/**
 * Palette's TUI part: ctrl+p opens a dialog listing every reachable command marked `palette`,
 * grouped by category with the keys that run it; picking one runs it.
 */

import { Effect } from "effect";

import {
  type DialogProps,
  defineTui,
  SelectDialog,
  TuiCommands,
  TuiDialogs,
} from "@liminal/sdk/tui";

import { paletteOptions } from "./tui/options.ts";

export default defineTui({
  setup: Effect.gen(function* () {
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;

    const open = () => {
      const options = paletteOptions(commands.listed());

      dialogs.show((props: DialogProps) => (
        <SelectDialog
          title="Commands"
          options={options}
          close={props.close}
          onSelect={(name) => {
            commands.run(name, "");
          }}
        />
      ));
    };

    yield* commands.register(
      [{ name: "palette.open", title: "Commands", run: open }],
      [{ key: "ctrl+p", cmd: "palette.open" }],
    );
  }),
});
