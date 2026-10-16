/** The token explorer for one palette: its ramps, the roles that pick from them, and a sample. */

import { For, Show } from "solid-js";

import { CHROME } from "../shell/chrome.ts";
import { buildAnsi } from "./ansi.ts";
import { AnsiHeader, AnsiRow } from "./AnsiSwatches.tsx";
import { hexToOklch } from "./oklch.ts";
import { type Palette, RAMP_NAMES } from "./palettes.ts";
import { buildRamp, FINE_STEPS, type Swatch } from "./ramp.ts";
import { type RoleColor, ROLES, resolveRoles } from "./roles.ts";
import { Sample } from "./Sample.tsx";

const STEP_COLUMNS = 6;

/** Wide enough to print a hex code inside the swatch. */
const CELL_COLUMNS = 9;

const SWATCH = "    ";

const GAP = " ";

/** Lightness above which a swatch is light enough to need dark text. */
const LIGHT_SWATCH = 0.65;

function Heading(props: { readonly children: string }) {
  return (
    <text fg={CHROME.muted} marginTop={1}>
      {props.children.toUpperCase()}
    </text>
  );
}

function SwatchCell(props: { readonly swatch: Swatch | undefined }) {
  return (
    <Show when={props.swatch} fallback={<span>{" ".repeat(CELL_COLUMNS) + GAP}</span>}>
      {(swatch) => (
        <>
          <span
            style={{
              bg: swatch().hex,
              fg: hexToOklch(swatch().hex).lightness > LIGHT_SWATCH ? "#1a1a1a" : "#e8e8e8",
            }}
          >
            {` ${swatch().hex} `}
          </span>
          <span>{GAP}</span>
        </>
      )}
    </Show>
  );
}

/** Steps run down the side and ramps across the top, with a blank cell where a ramp skips a step. */
function Ramps(props: { readonly palette: Palette }) {
  const ramps = () => RAMP_NAMES.map((name) => buildRamp(props.palette.ramps[name]));
  const header = RAMP_NAMES.map((name) => name.padEnd(CELL_COLUMNS + GAP.length)).join("");

  return (
    <box flexDirection="column">
      <Heading>Ramps</Heading>
      <text fg={CHROME.text} wrapMode="none">
        {" ".repeat(STEP_COLUMNS) + header}
      </text>
      <For each={FINE_STEPS}>
        {(step) => (
          <text wrapMode="none">
            <span style={{ fg: CHROME.faint }}>{String(step).padEnd(STEP_COLUMNS)}</span>
            <For each={ramps()}>
              {(swatches) => <SwatchCell swatch={swatches.find((each) => each.step === step)} />}
            </For>
          </text>
        )}
      </For>
    </box>
  );
}

const ROLE_COLUMNS = 26;

function Roles(props: { readonly color: RoleColor }) {
  return (
    <box flexDirection="column">
      <Heading>Roles</Heading>
      <For each={ROLES}>
        {(role) => (
          <text wrapMode="none">
            <span style={{ bg: props.color(role.name) }}>{SWATCH}</span>
            <span style={{ fg: CHROME.text }}>{`  ${role.name.padEnd(ROLE_COLUMNS)}`}</span>
            <span style={{ fg: CHROME.muted }}>{`${role.ramp}.${role.step}`.padEnd(14)}</span>
            <span style={{ fg: CHROME.faint }}>{props.color(role.name)}</span>
          </text>
        )}
      </For>
    </box>
  );
}

/** The ANSI colors this palette remaps terminal output onto. */
function Ansi(props: { readonly palette: Palette }) {
  const hexes = () => buildAnsi(props.palette);

  return (
    <box flexDirection="column">
      <Heading>Terminal output</Heading>
      <AnsiHeader />
      <AnsiRow label="normal" hexes={hexes().slice(0, 8)} />
      <AnsiRow label="bright" hexes={hexes().slice(8, 16)} />
    </box>
  );
}

export function PaletteView(props: { readonly palette: Palette }) {
  const color = () => resolveRoles(props.palette);

  return (
    <box flexDirection="column">
      <text fg={CHROME.warm}>{props.palette.name}</text>
      <text fg={CHROME.text}>{props.palette.mood}</text>
      <text fg={CHROME.muted} maxWidth={96}>
        {props.palette.rationale}
      </text>
      <Ramps palette={props.palette} />
      <Roles color={color()} />
      <Ansi palette={props.palette} />
      <Heading>Sample</Heading>
      <Sample color={color()} />
    </box>
  );
}
