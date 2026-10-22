import type { Group } from "../entries.ts";
import { chipStates } from "./Chip.states.tsx";
import { choiceRowStates } from "./ChoiceRow.states.tsx";
import { gradientStates } from "./Gradient.states.tsx";
import { hatchStates } from "./Hatch.states.tsx";
import { hintsStates } from "./Hints.states.tsx";
import { inkStates } from "./Ink.states.tsx";
import { listRowStates } from "./ListRow.states.tsx";
import { logoStates } from "./Logo.states.tsx";
import { matchedTextStates } from "./MatchedText.states.tsx";
import { ruleStates } from "./Rule.states.tsx";
import { sectionStates } from "./Section.states.tsx";
import { spinnerStates } from "./Spinner.states.tsx";

export const primitives: Group = {
  title: "Primitives",
  sections: [
    {
      title: "Text",
      entries: [
        { id: "chip", title: "Chip", states: chipStates },
        { id: "hints", title: "Hints", states: hintsStates },
        { id: "matched-text", title: "Matched text", states: matchedTextStates },
        { id: "ink", title: "Ink", states: inkStates },
      ],
    },
    {
      title: "Ornament",
      entries: [
        { id: "gradient", title: "Gradient", states: gradientStates },
        { id: "hatch", title: "Hatch", states: hatchStates },
        { id: "logo", title: "Logo", states: logoStates },
        { id: "spinner", title: "Spinner", states: spinnerStates },
      ],
    },
    {
      title: "Layout",
      entries: [
        { id: "rule", title: "Rule", states: ruleStates },
        { id: "section", title: "Section", states: sectionStates },
        { id: "list-row", title: "List row", states: listRowStates },
        { id: "choice-row", title: "Choice row", states: choiceRowStates },
      ],
    },
  ],
};
