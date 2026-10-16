/** Each placement of the fade ornament, one under another so they can be compared. */

import { For } from "solid-js";

import { CHROME } from "../shell/chrome.ts";
import type { RoleColor } from "../tokens/roles.ts";
import { Cells } from "./Cells.tsx";
import { PLACEMENTS } from "./fade.ts";

const ROW_COLUMNS = 60;

export function OrnamentView(props: { readonly color: RoleColor }) {
  return (
    <box flexDirection="column">
      <For each={PLACEMENTS}>
        {(placement) => (
          <box flexDirection="column" marginBottom={1}>
            <text>
              <span style={{ fg: CHROME.warm }}>{placement.name}</span>
              <span style={{ fg: CHROME.muted }}>{`  ${placement.note}`}</span>
            </text>
            <box flexDirection="row">
              <box backgroundColor={props.color("surface.base")} paddingX={1}>
                <Cells cells={placement.draw(props.color, ROW_COLUMNS)} />
              </box>
            </box>
          </box>
        )}
      </For>
    </box>
  );
}
