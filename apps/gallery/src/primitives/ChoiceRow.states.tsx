import type { State } from "../entries.ts";
import { ChoiceRow, labelColumnsOf } from "./ChoiceRow.tsx";

const LABELS = ["Spans overlap", "Starts close together", "Neither waits"];

const COLUMNS = labelColumnsOf(LABELS);

const commands = () => (
  <box width={64}>
    <ChoiceRow
      label="/model"
      detail="Switch the model"
      labelColumns={10}
      isUnder
      matches={[1, 2]}
    />
    <ChoiceRow
      label="/compact"
      detail="Fold the session to free context"
      labelColumns={10}
      isUnder={false}
      matches={[1]}
    />
  </box>
);

const answers = () => (
  <box width={64}>
    <ChoiceRow
      label="Spans overlap"
      detail="each starts before the other finishes"
      labelColumns={COLUMNS}
      isUnder={false}
      pick="picked"
    />
    <ChoiceRow
      label="Starts close together"
      detail="both start within a few milliseconds"
      labelColumns={COLUMNS}
      isUnder
      pick="unpicked"
    />
    <ChoiceRow
      label="Neither waits"
      detail="no plugin awaits another's start"
      labelColumns={COLUMNS}
      isUnder={false}
      pick="unpicked"
    />
  </box>
);

export const choiceRowStates: readonly [State, ...State[]] = [
  { name: "Commands", fill: "center", view: commands },
  { name: "Answers", fill: "center", view: answers },
];
