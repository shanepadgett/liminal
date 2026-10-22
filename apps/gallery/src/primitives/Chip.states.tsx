import { For } from "solid-js";

import type { State } from "../entries.ts";
import { Chip, type Tone } from "./Chip.tsx";

const TONES: readonly Tone[] = ["accent", "danger", "warning", "success", "info", "quiet"];

export const chipStates: readonly [State, ...State[]] = [
  {
    name: "Tones",
    fill: "page",
    view: () => (
      <box flexDirection="row" gap={1}>
        <For each={TONES}>{(tone) => <Chip label={tone} tone={tone} />}</For>
      </box>
    ),
  },
];
