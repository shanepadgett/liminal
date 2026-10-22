import type { Group } from "../entries.ts";
import { chipStates } from "./Chip.states.tsx";
import { hintsStates } from "./Hints.states.tsx";
import { listRowStates } from "./ListRow.states.tsx";
import { matchedTextStates } from "./MatchedText.states.tsx";
import { ruleStates } from "./Rule.states.tsx";
import { sectionStates } from "./Section.states.tsx";

export const primitives: Group = {
  title: "Primitives",
  sections: [
    {
      title: "Text",
      entries: [
        { id: "chip", title: "Chip", states: chipStates },
        { id: "hints", title: "Hints", states: hintsStates },
        { id: "matched-text", title: "Matched text", states: matchedTextStates },
      ],
    },
    {
      title: "Layout",
      entries: [
        { id: "rule", title: "Rule", states: ruleStates },
        { id: "section", title: "Section", states: sectionStates },
        { id: "list-row", title: "List row", states: listRowStates },
      ],
    },
  ],
};
