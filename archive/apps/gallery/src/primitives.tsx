/**
 * The small pieces the chat components are built from, each shown alone so a change to one can be
 * judged across themes before it shows up everywhere it is used.
 */

import { For } from "solid-js";

import {
  HeaderRule,
  type Hint,
  Hints,
  matchIndices,
  type RoleColor,
  type RoleName,
} from "@liminal/sdk/tui";

import { Chip } from "./chat/Chip.tsx";
import { ListRow } from "./chat/ListRow.tsx";
import { MatchedText } from "./chat/MatchedText.tsx";
import { Section } from "./chat/Section.tsx";
import { only, withRoles } from "./entryViews.ts";
import type { EntryState, Group } from "./shell/entries.ts";

const ruleState = (name: string, isWorking: boolean): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <box flexDirection="row" paddingX={2} backgroundColor={color("surface.base")}>
      <HeaderRule color={color} surface="surface.base" isWorking={isWorking} />
    </box>
  )),
});

const ROWS = ["New session", "Switch session", "Rename session"] as const;

const listRowsState = (name: string, selected: number): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <box flexDirection="column" paddingX={2} backgroundColor={color("surface.raised")}>
      <For each={ROWS}>
        {(label, index) => (
          <ListRow color={color} isSelected={index() === selected}>
            <text wrapMode="none" fg={color(index() === selected ? "text.base" : "text.muted")}>
              {label}
            </text>
          </ListRow>
        )}
      </For>
    </box>
  )),
});

const HINTS: readonly Hint[] = [
  ["enter", "send"],
  ["shift+enter", "newline"],
  ["esc", "interrupt"],
];

const PATH = "plugins/annex/src/internal/instructions/loadPluginInstructions.ts";

const matchedState = (name: string, columns: number): EntryState => ({
  name,
  fill: "content",
  view: withRoles((color) => (
    <MatchedText
      color={color}
      text={PATH}
      matches={matchIndices("plugins", PATH) ?? new Set()}
      columns={columns}
      isSelected={false}
    />
  )),
});

const CHIPS: readonly (readonly [label: string, fill: RoleName])[] = [
  ["PLAN", "fill.accent"],
  ["DONE", "fill.success"],
  ["WAIT", "fill.warning"],
  ["ERROR", "fill.danger"],
  ["INFO", "fill.info"],
];

const chips = (color: RoleColor) => (
  <text>
    <For each={CHIPS}>
      {([label, fill], index) => (
        <>
          {index() === 0 ? "" : " "}
          <Chip color={color} label={label} fill={fill} />
        </>
      )}
    </For>
  </text>
);

export const PRIMITIVES: Group = {
  title: "Primitives",
  sections: [
    {
      title: "Ornament",
      entries: [
        {
          id: "header-rule",
          title: "Header rule",
          states: [ruleState("Resting", false), ruleState("Working", true)],
        },
      ],
    },
    {
      title: "Text",
      entries: [
        {
          id: "section",
          title: "Section title",
          states: only(
            "content",
            withRoles((color) => <Section color={color} title="Session" />),
          ),
        },
        {
          id: "hints",
          title: "Key hints",
          states: only(
            "content",
            withRoles((color) => <Hints color={color} hints={HINTS} />),
          ),
        },
        { id: "chips", title: "Chips", states: only("content", withRoles(chips)) },
        {
          id: "matched-text",
          title: "Matched text",
          states: [matchedState("Fits", PATH.length), matchedState("Cut in the middle", 40)],
        },
      ],
    },
    {
      title: "Lists",
      entries: [
        {
          id: "list-row",
          title: "List row",
          states: [listRowsState("First selected", 0), listRowsState("Middle selected", 1)],
        },
      ],
    },
  ],
};
