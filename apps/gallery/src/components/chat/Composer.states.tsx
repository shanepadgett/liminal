import type { State } from "../../entries.ts";
import { Composer } from "./Composer.tsx";

const LONG_DRAFT = [
  "Move the session store behind its contract and keep the migration as one file.",
  "",
  "Then check that print mode still exits with 0 when the model answers.",
].join("\n");

const composer =
  (draft: string, queued: readonly string[] = [], isWorking = false) =>
  () => (
    <box width="100%" height="100%" justifyContent="flex-end" paddingBottom={1}>
      <Composer
        draft={draft}
        model="claude-sonnet-4.5"
        effort="high"
        queued={queued}
        isWorking={isWorking}
      />
    </box>
  );

export const composerStates: readonly [State, ...State[]] = [
  { name: "Empty", fill: "screen", view: composer("") },
  { name: "Draft", fill: "screen", view: composer("Why does the loop retry twice?") },
  { name: "Long draft", fill: "screen", view: composer(LONG_DRAFT) },
  {
    name: "Working, one queued",
    fill: "screen",
    view: composer("", ["Also rename the store to sessions"], true),
  },
];
