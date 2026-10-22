import type { JSX } from "@opentui/solid";

import type { State } from "../../entries.ts";
import type { Hint } from "../../primitives/Hints.tsx";
import { Composer, type Queued } from "./Composer.tsx";
import { SLASH_COMMANDS } from "./SlashMenu.states.tsx";
import { SLASH_HINTS, SlashMenu } from "./SlashMenu.tsx";

const LONG_DRAFT = [
  "Move the session store behind its contract and keep the migration as one file.",
  "",
  "Then check that print mode still exits with 0 when the model answers.",
].join("\n");

interface ComposerSample {
  readonly draft?: string;
  readonly queued?: readonly Queued[];
  readonly isWorking?: boolean;
  readonly suggestions?: () => JSX.Element;
  readonly ask?: () => JSX.Element;
  readonly hints?: readonly Hint[];
}

/** The composer at the bottom of the frame, as it sits on the chat screen. */
export const atBottom = (sample: ComposerSample) => () => (
  <box width="100%" height="100%" justifyContent="flex-end" paddingBottom={1}>
    <Composer
      draft={sample.draft ?? ""}
      model="claude-sonnet-4.5"
      effort="high"
      queued={sample.queued ?? []}
      isWorking={sample.isWorking ?? false}
      suggestions={sample.suggestions?.()}
      ask={sample.ask?.()}
      hints={sample.hints}
    />
  </box>
);

export const composerStates: readonly [State, ...State[]] = [
  { name: "Empty", fill: "screen", view: atBottom({}) },
  { name: "Draft", fill: "screen", view: atBottom({ draft: "Why does the loop retry twice?" }) },
  { name: "Long draft", fill: "screen", view: atBottom({ draft: LONG_DRAFT }) },
  {
    name: "Working, inputs waiting",
    fill: "screen",
    view: atBottom({
      queued: [
        { kind: "steer", text: "Skip the archive folder" },
        { kind: "follow-up", text: "Also rename the store to sessions" },
      ],
      isWorking: true,
    }),
  },
  {
    name: "Slash commands",
    fill: "screen",
    view: atBottom({
      draft: "/co",
      suggestions: () => <SlashMenu commands={SLASH_COMMANDS} typed="co" under={0} />,
      hints: SLASH_HINTS,
    }),
  },
];
