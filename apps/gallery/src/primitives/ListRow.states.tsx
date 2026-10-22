import type { State } from "../entries.ts";
import { ListRow } from "./ListRow.tsx";

const rows = () => (
  <box width={48}>
    <ListRow title="New session" detail="ctrl+n" isSelected={false} />
    <ListRow title="Switch model" detail="ctrl+m" matches={[0, 7, 8]} isSelected />
    <ListRow title="Connect a provider" isSelected={false} />
  </box>
);

export const listRowStates: readonly [State, ...State[]] = [
  { name: "Selected", fill: "center", view: rows },
];
