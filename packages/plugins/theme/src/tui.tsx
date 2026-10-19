/**
 * Theme's TUI part: starts the TUI in the saved palette, and `/theme` opens a picker that shows
 * each palette as the highlight reaches it. Enter saves the palette; esc puts the old one back.
 */

import { Effect } from "effect";

import {
  DEFAULT_PALETTE_ID,
  type DialogProps,
  defineTui,
  makeBridge,
  PALETTES,
  SelectDialog,
  TuiCommands,
  TuiDialogs,
  TuiHost,
  TuiTheme,
  TuiToasts,
} from "@liminal/sdk/tui";

import { ThemeRpcs } from "./contract.ts";

const options = PALETTES.map((palette) => ({
  title: palette.name,
  value: palette.id,
  description: palette.mood,
}));

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const dialogs = yield* TuiDialogs;
    const toasts = yield* TuiToasts;
    const theme = yield* TuiTheme;
    const commands = yield* TuiCommands;
    const bridge = yield* makeBridge;
    const client = yield* host.client(ThemeRpcs);

    // A settings file that cannot be read leaves the default palette; the picker still works.
    const saved = yield* client["theme/get"]().pipe(
      Effect.tapError((error) => Effect.logWarning(`theme settings ignored: ${error.message}`)),
      Effect.orElseSucceed(() => DEFAULT_PALETTE_ID),
    );

    theme.select(saved);

    const save = (palette: string) =>
      client["theme/set"]({ palette }).pipe(
        Effect.catchTag("ThemeError", (error) =>
          Effect.sync(() => {
            toasts.show({ kind: "error", title: "Theme not saved", message: error.message });
          }),
        ),
      );

    const pick = () => {
      const before = theme.palette().id;

      dialogs.show((props: DialogProps) => (
        <SelectDialog
          title="Theme"
          options={options}
          current={before}
          // Closing puts the old palette back; a pick closes first, so it then sets its own.
          close={() => {
            theme.select(before);
            props.close();
          }}
          onHighlight={theme.select}
          onSelect={(palette) => {
            theme.select(palette);
            bridge.run(save(palette));
          }}
        />
      ));
    };

    yield* commands.register([
      {
        name: "theme.pick",
        title: "Theme",
        desc: "Pick the color palette",
        category: "Session",
        slash: { name: "theme" },
        palette: true,
        run: pick,
      },
    ]);
  }),
});
