/** One palette laid out: its story, its ramps step by step, and the roles that pick from them. */

import { For, Show } from "solid-js";

import { CHROME } from "../shell/chrome.ts";
import { hexToOklch } from "../theme/oklch.ts";
import { type Palette, RAMP_NAMES } from "../theme/palettes.ts";
import { buildRamp, FINE_STEPS, type Swatch } from "../theme/ramp.ts";
import { resolveRoles, ROLES } from "../theme/roles.ts";

/** Wide enough to print a hex code inside the swatch. */
const CELL_COLUMNS = 10;

const STEP_COLUMNS = 6;

const ROLE_COLUMNS = 26;

/** Lightness above which a swatch needs dark text. */
const LIGHT_SWATCH = 0.65;

function Heading(props: { readonly title: string }) {
  return (
    <text fg={CHROME.muted} marginTop={1}>
      {props.title.toUpperCase()}
    </text>
  );
}

function SwatchCell(props: { readonly swatch: Swatch | undefined }) {
  return (
    <Show when={props.swatch} fallback={<span>{" ".repeat(CELL_COLUMNS)}</span>}>
      {(swatch) => (
        <span
          style={{
            bg: swatch().hex,
            fg: hexToOklch(swatch().hex).lightness > LIGHT_SWATCH ? "#1a1a1a" : "#e8e8e8",
          }}
        >
          {` ${swatch().hex} `.padEnd(CELL_COLUMNS)}
        </span>
      )}
    </Show>
  );
}

/** Steps run down the side and ramps across the top; a ramp that skips a step leaves a gap. */
function Ramps(props: { readonly palette: Palette }) {
  const ramps = () => RAMP_NAMES.map((name) => buildRamp(props.palette.ramps[name]));

  return (
    <box>
      <Heading title="Ramps" />
      <text fg={CHROME.text} wrapMode="none">
        {" ".repeat(STEP_COLUMNS) + RAMP_NAMES.map((name) => name.padEnd(CELL_COLUMNS)).join("")}
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

function Roles(props: { readonly palette: Palette }) {
  const color = () => resolveRoles(props.palette);

  return (
    <box>
      <Heading title="Roles" />
      <For each={ROLES}>
        {(role) => (
          <text wrapMode="none">
            <span style={{ bg: color()(role.name) }}>{"    "}</span>
            <span style={{ fg: CHROME.text }}>{`  ${role.name.padEnd(ROLE_COLUMNS)}`}</span>
            <span style={{ fg: CHROME.muted }}>{`${role.ramp}.${role.step}`.padEnd(14)}</span>
            <span style={{ fg: CHROME.faint }}>{color()(role.name)}</span>
          </text>
        )}
      </For>
    </box>
  );
}

export function PaletteView(props: { readonly palette: Palette }) {
  return (
    <box>
      <text fg={CHROME.warm}>{props.palette.name}</text>
      <text fg={CHROME.text}>{props.palette.mood}</text>
      <text fg={CHROME.muted} maxWidth={96}>
        {props.palette.rationale}
      </text>
      <Ramps palette={props.palette} />
      <Roles palette={props.palette} />
    </box>
  );
}
