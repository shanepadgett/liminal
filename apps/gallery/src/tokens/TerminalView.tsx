/**
 * What the terminal reports about its own theme, and the Liminal palette built from it. Shows how
 * following the system theme borrows hues without giving up Liminal's ramps and roles.
 */

import { useRenderer } from "@opentui/solid";
import { createResource, For, Match, Switch } from "solid-js";

import { CHROME } from "../shell/chrome.ts";
import { PaletteView } from "./PaletteView.tsx";
import { ANSI_NAMES, terminalPalette } from "./terminal-palette.ts";

const SWATCH = "    ";

/** Terminals answer palette queries within milliseconds; slow links such as SSH may not. */
const QUERY_MILLISECONDS = 500;

function AnsiRow(props: { readonly label: string; readonly hexes: readonly (string | null)[] }) {
  return (
    <text>
      <span style={{ fg: CHROME.muted }}>{props.label.padEnd(10)}</span>
      <For each={props.hexes}>
        {(hex) => (
          <>
            <span style={{ bg: hex ?? CHROME.background }}>{hex === null ? " ?? " : SWATCH}</span>
            <span> </span>
          </>
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
          <box flexDirection="column">
            <text fg={CHROME.muted}>REPORTED BY THE TERMINAL</text>
            <text fg={CHROME.faint}>
              {" ".repeat(10) + ANSI_NAMES.map((name) => name.slice(0, 4).padEnd(5)).join("")}
            </text>
            <AnsiRow label="normal" hexes={reported().palette.slice(0, 8)} />
            <AnsiRow label="bright" hexes={reported().palette.slice(8, 16)} />
            <AnsiRow
              label="default"
              hexes={[reported().defaultForeground, reported().defaultBackground]}
            />
            <text fg={CHROME.faint}>{" ".repeat(10)}fg bg</text>
            <text> </text>
            <Switch
              fallback={
                <text fg={CHROME.warm}>
                  Some colors are missing, so no palette can be built. Liminal would fall back to
                  ANSI slots and let the terminal draw them.
                </text>
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
