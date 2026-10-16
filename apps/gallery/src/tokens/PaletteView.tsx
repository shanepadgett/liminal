/** The token explorer for one palette: its ramps, the roles that pick from them, and a sample. */

import { For, Show } from "solid-js";

import { CHROME } from "../shell/chrome.ts";
import { hexToOklch } from "./oklch.ts";
import { type Palette, RAMP_NAMES } from "./palettes.ts";
import { buildRamp, FINE_STEPS, type Swatch } from "./ramp.ts";
import { type RoleColor, type RoleName, ROLES, resolveRoles } from "./roles.ts";

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

const ROLE_COLUMNS = 20;

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

/** A slice of an imagined Liminal session drawn only with roles, to judge the palette in use. */
function Sample(props: { readonly color: RoleColor }) {
  const color = (name: RoleName) => props.color(name);

  return (
    <box flexDirection="column">
      <Heading>Sample</Heading>
      <box backgroundColor={color("surface.base")} padding={1} width={64} flexDirection="column">
        <box
          border
          borderStyle="rounded"
          borderColor={color("border.base")}
          backgroundColor={color("surface.raised")}
          title=" session "
          flexDirection="column"
          paddingX={1}
        >
          <text fg={color("text.base")}>
            <span style={{ fg: color("text.accent") }}>{"› "}</span>
            explain how the plugin host boots
          </text>
          <text fg={color("text.muted")}>{"  reading kernel/src/kernel.ts"}</text>
          <text>
            <span style={{ fg: color("feedback.success") }}>{"  ✓ 3 files  "}</span>
            <span style={{ fg: color("feedback.warning") }}>{"! 1 warning  "}</span>
            <span style={{ fg: color("feedback.danger") }}>{"✗ 1 error  "}</span>
            <span style={{ fg: color("feedback.info") }}>{"i 2 notes"}</span>
          </text>
          <text bg={color("surface.selected")} fg={color("text.base")}>
            {"▌ the selected row in a list"}
          </text>
          <text fg={color("text.faint")}>{"  a quiet, unselected row"}</text>
        </box>
        <box
          border
          borderStyle="rounded"
          borderColor={color("border.focus")}
          backgroundColor={color("surface.overlay")}
          marginTop={1}
          paddingX={1}
        >
          <text fg={color("text.base")}>
            type a message
            <span style={{ fg: color("text.faint") }}>{"   enter send · esc cancel"}</span>
          </text>
        </box>
      </box>
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
      <Sample color={color()} />
    </box>
  );
}
