/**
 * The keys of `/commit`'s ask. The plan scrolls with up and down when it holds more commits than
 * show at once; enter commits and esc cancels. The push question chooses with up and down, enter
 * answers and esc says no. While planning, esc stops; committing and pushing take no keys.
 */
import type { Accessor, Setter } from "solid-js";

import type { Command } from "@shanepadgett/liminal-tui";

import { type CommitFlow, CommitStep } from "./flow.ts";

/** Commits in view at once; up and down scroll the rest. */
export const SHOWN_COMMITS = 4;

/** The second push choice, Yes. */
const YES = 1;

export const KEYS = [
  { key: "up", cmd: "commit.scroll-up" },
  { key: "down", cmd: "commit.scroll-down" },
  { key: "up", cmd: "commit.choose-up" },
  { key: "down", cmd: "commit.choose-down" },
  ...["return", "kpenter"].flatMap((key) => [
    { key, cmd: "commit.commit" },
    { key, cmd: "commit.answer" },
  ]),
  { key: "escape", cmd: "commit.stop" },
  { key: "escape", cmd: "commit.cancel" },
  { key: "escape", cmd: "commit.no" },
];

/** Where the plan's view starts and which push choice is under the cursor. */
export interface Cursor {
  readonly top: Accessor<number>;
  readonly setTop: Setter<number>;
  readonly choice: Accessor<number>;
  readonly setChoice: Setter<number>;
}

const isStep = (flow: CommitFlow, tag: CommitStep["_tag"]) => () => {
  const step = flow.step();

  return step !== undefined && CommitStep.$is(tag)(step);
};

/** The plan's commits past those that fit, which the view can scroll through. */
const hiddenOf = (flow: CommitFlow) => {
  const step = flow.step();

  return step !== undefined && CommitStep.$is("Review")(step)
    ? Math.max(0, step.commits.length - SHOWN_COMMITS)
    : 0;
};

const scrollCommands = (flow: CommitFlow, cursor: Cursor): Command[] => [
  {
    name: "commit.scroll-up",
    title: "Scroll up",
    hint: { label: "scroll", keys: "↑↓" },
    enabled: () => hiddenOf(flow) > 0,
    run: () => {
      cursor.setTop((top) => Math.max(0, top - 1));
    },
  },
  {
    name: "commit.scroll-down",
    title: "Scroll down",
    enabled: () => hiddenOf(flow) > 0,
    run: () => {
      cursor.setTop((top) => Math.min(hiddenOf(flow), top + 1));
    },
  },
];

const chooseCommands = (flow: CommitFlow, cursor: Cursor): Command[] => [
  {
    name: "commit.choose-up",
    title: "Previous choice",
    hint: { label: "choose", keys: "↑↓" },
    enabled: isStep(flow, "Push"),
    run: () => {
      cursor.setChoice(0);
    },
  },
  {
    name: "commit.choose-down",
    title: "Next choice",
    enabled: isStep(flow, "Push"),
    run: () => {
      cursor.setChoice(YES);
    },
  },
];

const answerCommands = (flow: CommitFlow, cursor: Cursor): Command[] => [
  {
    name: "commit.commit",
    title: "Commit",
    hint: { label: "commit" },
    enabled: isStep(flow, "Review"),
    run: () => {
      flow.answer(true);
    },
  },
  {
    name: "commit.answer",
    title: "Answer",
    hint: { label: "answer" },
    enabled: isStep(flow, "Push"),
    run: () => {
      flow.answer(cursor.choice() === YES);
    },
  },
];

const escapeCommands = (flow: CommitFlow): Command[] =>
  [
    { name: "commit.stop", label: "stop", tag: "Planning" as const },
    { name: "commit.cancel", label: "cancel", tag: "Review" as const },
    { name: "commit.no", label: "no", tag: "Push" as const },
  ].map(({ name, label, tag }) => ({
    name,
    title: label,
    hint: { label },
    enabled: isStep(flow, tag),
    run: flow.cancel,
  }));

export const commandsOf = (flow: CommitFlow, cursor: Cursor): Command[] => [
  ...scrollCommands(flow, cursor),
  ...chooseCommands(flow, cursor),
  ...answerCommands(flow, cursor),
  ...escapeCommands(flow),
];
