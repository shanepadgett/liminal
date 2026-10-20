/**
 * How a group of work reads as a row: a label, what it worked on, and quieter detail after. The
 * label names the kind of work and reads the same while the group goes on and once it is over. A
 * failure is the one part said in color.
 */

import { Match } from "effect";

import { formatDuration } from "@liminal/sdk/tui";

import type { Check } from "./script.ts";
import type { Edit, Looked, Web, WorkGroup } from "./workGroups.ts";

export type Wording = {
  readonly label: string;
  readonly subject: string;
  /** Quiet detail after the subject, or empty. */
  readonly detail: string;
  /** What went wrong, or empty. */
  readonly failure: string;
  /** Cuts the subject to one line with `…`, the detail still shown. */
  readonly oneLine?: boolean;
};

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** The deepest folder every path is in, or `.` when they share none. */
const placeOf = (paths: readonly string[]) => {
  const folders = paths.map((path) => path.split("/").slice(0, -1));
  const first = folders[0] ?? [];
  let depth = first.length;

  for (const folder of folders) {
    while (depth > 0 && folder.slice(0, depth).join("/") !== first.slice(0, depth).join("/")) {
      depth -= 1;
    }
  }

  return depth === 0 ? "." : first.slice(0, depth).join("/");
};

const worded = (label: string, subject: string, detail = "", failure = ""): Wording => ({
  label,
  subject,
  detail,
  failure,
});

/** A command's wording, cut to one line. */
const cut = (wording: Wording): Wording => ({ ...wording, oneLine: true });

/** One read or search, said on its own. */
const lookedOf = (action: Looked): Wording => {
  if (action.kind === "read") return worded("Read", action.path);

  return worded("Search", action.pattern, counted(action.hits, "hit", "hits"));
};

const exploredOf = (actions: readonly Looked[]): Wording => {
  const [first] = actions;
  if (actions.length === 1 && first !== undefined) return lookedOf(first);

  const paths = actions.flatMap((action) => (action.kind === "read" ? [action.path] : []));
  const searches = actions.length - paths.length;

  const parts = [
    ...(paths.length === 0 ? [] : [placeOf(paths), counted(paths.length, "file", "files")]),
    ...(searches === 0 ? [] : [counted(searches, "search", "searches")]),
  ];

  return worded("Explore", parts.join(", "));
};

const editedOf = (edits: readonly Edit[]): Wording => {
  const paths = [...new Set(edits.map((edit) => edit.path))];
  const [only] = paths;

  if (paths.length === 1 && only !== undefined) return worded("Edit", only);

  return worded("Edit", `${placeOf(paths)}, ${counted(paths.length, "file", "files")}`);
};

const checkedOf = (checks: readonly Check[]): Wording => {
  const failed = checks.flatMap((check) => (check.hasPassed ? [] : [check.name]));

  return failed.length === 0
    ? worded("Checks", "", "all passed")
    : worded("Checks", "", "", `${failed.join(", ")} failed`);
};

const webOf = (web: Web): Wording =>
  web.kind === "websearch"
    ? worded("Web search", web.query, counted(web.sources, "source", "sources"))
    : worded("Web fetch", web.url);

export const wordingOf = (group: WorkGroup): Wording =>
  Match.value(group).pipe(
    Match.discriminatorsExhaustive("kind")({
      thought: (thought) => worded("Thought", `for ${formatDuration(Math.round(thought.seconds))}`),
      explored: (explored) => exploredOf(explored.actions),
      edited: (edited) => editedOf(edited.edits),
      ran: ({ run }) => cut(worded("Shell", run.command, "", run.hasPassed ? "" : "failed")),
      checked: (checked) => checkedOf(checked.checks),
      scripted: () => worded("Execute", ""),
      browsed: ({ web }) => webOf(web),
      managed: ({ process }) =>
        cut(worded("Process", `${process.action} ${process.subject}`, process.state)),
      recalled: ({ recall }) => worded("History", `entries ${recall.from}–${recall.through}`),
    }),
  );

const linesChanged = (edit: Edit) => {
  const added = edit.diff.filter((line) => line.change === "added").length;
  const removed = edit.diff.filter((line) => line.change === "removed").length;

  return `+${added} -${removed}`;
};

/** The rows an opened group lists, one per action; a group of one action lists none. */
export const actionWordingsOf = (group: WorkGroup): readonly Wording[] => {
  if (group.kind === "explored" && group.actions.length > 1) {
    return group.actions.map(lookedOf);
  }

  if (group.kind === "edited" && group.edits.length > 1) {
    return group.edits.map((edit) => worded("Edit", edit.path, linesChanged(edit)));
  }

  return [];
};
