/** What the terminal reports about its colors, and the palette Liminal would build from them. */

import { useRenderer } from "@opentui/solid";
import { createResource, For, Match, Switch } from "solid-js";

import { CHROME } from "../shell/chrome.ts";
import { PaletteView } from "./PaletteView.tsx";
import { terminalPalette } from "./terminal-palette.ts";

/** Terminals answer within milliseconds; a slow link such as SSH may not answer at all. */
const QUERY_MILLISECONDS = 500;

function Swatches(props: { readonly label: string; readonly hexes: readonly (string | null)[] }) {
  return (
    <text wrapMode="none">
      <span style={{ fg: CHROME.muted }}>{props.label.padEnd(8)}</span>
      <For each={props.hexes}>
        {(hex) => (
          <span style={{ bg: hex ?? CHROME.background }}>{hex === null ? " ?? " : "    "}</span>
        )}
      </For>
    </text>
  );
}

export function TerminalView() {
  const renderer = useRenderer();

  const [colors] = createResource(() =>
    renderer.getPalette({ size: 16, timeout: QUERY_MILLISECONDS }),
  );

  return (
    <Switch fallback={<text fg={CHROME.muted}>Asking the terminal for its colors…</text>}>
      <Match when={colors.error !== undefined}>
        <text fg={CHROME.warm}>The terminal did not report its colors.</text>
      </Match>
      <Match when={colors()}>
        {(reported) => (
          <box>
            <text fg={CHROME.muted}>REPORTED BY THE TERMINAL</text>
            <Swatches label="normal" hexes={reported().palette.slice(0, 8)} />
            <Swatches label="bright" hexes={reported().palette.slice(8, 16)} />
            <Swatches
              label="fg bg"
              hexes={[reported().defaultForeground, reported().defaultBackground]}
            />
            <text> </text>
            <Switch
              fallback={
                <text fg={CHROME.warm}>Some colors are missing, so no palette can be built.</text>
              }
            >
              <Match when={terminalPalette(reported())}>
                {(palette) => <PaletteView palette={palette()} />}
              </Match>
            </Switch>
          </box>
        )}
      </Match>
    </Switch>
  );
}
