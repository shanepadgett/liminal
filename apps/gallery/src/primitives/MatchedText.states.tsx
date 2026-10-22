import type { State } from "../entries.ts";
import { MatchedText } from "./MatchedText.tsx";

export const matchedTextStates: readonly [State, ...State[]] = [
  {
    name: "Matched",
    fill: "page",
    view: () => <MatchedText text="Switch model" matches={[0, 7, 8]} role="text.base" />,
  },
  {
    name: "No match",
    fill: "page",
    view: () => <MatchedText text="Switch model" matches={[]} role="text.muted" />,
  },
];
