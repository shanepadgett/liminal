/**
 * How a group of work reads as a row: a verb, what it worked on, and quieter detail after. A group
 * still going on reads in the present tense on the live line; once over, in the past tense. A
 * failure is the one part said in color.
 */

import { Match } from "effect";

import { formatDuration } from "./duration.ts";
import type { Check } from "./script.ts";
import type { Edit, WorkGroup, Looked } from "./workGroups.ts";

export type Tense = "past" | "present";

export type Wording = {
  readonly verb: string;
  readonly subject: string;
  /** Quiet detail after the subject, or empty. */
  readonly detail: string;
  /** What went wrong, or empty. */
  readonly failure: string;
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

const worded = (verb: string, subject: string, detail = "", failure = ""): Wording => ({
  verb,
  subject,
  detail,
  failure,
});

/** One read or search, said on its own. */
const lookedOf = (action: Looked, tense: Tense): Wording => {
  const isPast = tense === "past";

  if (action.kind === "read") return worded(isPast ? "Read" : "Reading", action.path);

  return isPast
    ? worded("Searched for", action.pattern, counted(action.hits, "hit", "hits"))
    : worded("Searching for", action.pattern);
};

const exploredOf = (actions: readonly Looked[], tense: Tense): Wording => {
  const [first] = actions;
  if (actions.length === 1 && first !== undefined) return lookedOf(first, tense);

  const paths = actions.flatMap((action) => (action.kind === "read" ? [action.path] : []));
  const searches = actions.length - paths.length;

  const parts = [
    ...(paths.length === 0 ? [] : [placeOf(paths), counted(paths.length, "file", "files")]),
    ...(searches === 0 ? [] : [counted(searches, "search", "searches")]),
  ];

  return worded(tense === "past" ? "Explored" : "Exploring", parts.join(", "));
};

const editedOf = (edits: readonly Edit[], tense: Tense): Wording => {
  const verb = tense === "past" ? "Edited" : "Editing";
  const paths = [...new Set(edits.map((edit) => edit.path))];
  const [only] = paths;

  if (paths.length === 1 && only !== undefined) return worded(verb, only);

  return worded(verb, `${placeOf(paths)}, ${counted(paths.length, "file", "files")}`);
};

const checkedOf = (checks: readonly Check[], tense: Tense): Wording => {
  if (tense === "present") return worded("Running", "checks");

  const failed = checks.flatMap((check) => (check.hasPassed ? [] : [check.name]));

  return failed.length === 0
    ? worded("Ran", "checks", "all passed")
    : worded("Ran", "checks", "", `${failed.join(", ")} failed`);
};

export const wordingOf = (group: WorkGroup, tense: Tense): Wording =>
  Match.value(group).pipe(
    Match.discriminatorsExhaustive("kind")({
      thought: (thought) =>
        tense === "past"
          ? worded("Thought", `for ${formatDuration(Math.round(thought.seconds))}`)
          : worded("Thinking", ""),
      explored: (explored) => exploredOf(explored.actions, tense),
      edited: (edited) => editedOf(edited.edits, tense),
      ran: ({ run }) => {
        if (tense === "present") return worded("Running", run.command);

        return worded("Ran", run.command, "", run.hasPassed ? "" : "failed");
      },
      checked: (checked) => checkedOf(checked.checks, tense),
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
    return group.actions.map((action) =>
      action.kind === "read"
        ? worded("Read", action.path)
        : worded("Search", action.pattern, counted(action.hits, "hit", "hits")),
    );
  }

  if (group.kind === "edited" && group.edits.length > 1) {
    return group.edits.map((edit) => worded("Edit", edit.path, linesChanged(edit)));
  }

  return [];
};
