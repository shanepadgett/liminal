/**
 * Draft triggers: a character in the draft that opens a menu above it, such as `@` for tags and `/`
 * for commands. A trigger gives the menu's rows for what follows its character, and keys that pick
 * a row and edit the draft. The menu's own keys are up, down and esc.
 */
import type { TextareaRenderable } from "@opentui/core";
import type { Effect } from "effect";

import { Registry } from "@shanepadgett/liminal-core";

/** The trigger being typed: what follows its character, and editor offsets from it to the cursor. */
export interface DraftToken {
  readonly query: string;
  readonly start: number;
  readonly end: number;
}

export interface DraftRow {
  readonly id: string;
  readonly label: string;
  /** Drawn dimmed after the label, such as the text a command takes. */
  readonly suffix?: string;
  readonly detail?: string;
  /** Indexes of the letters the query matched in the label. */
  readonly matches: ReadonlyArray<number>;
}

export interface DraftKey {
  /** In the keymap's key syntax, such as `return` or `tab`. */
  readonly key: string;
  /** What the key does, as the keymap names its command. */
  readonly title: string;
  /** The hint beside the key; none for a key every user expects, such as enter. */
  readonly hint?: string;
  /** Whether the key acts on `row`; without it, on every row. Otherwise the key passes on. */
  readonly enabled?: (row: DraftRow) => boolean;
  /** Edits the draft itself, such as putting a tag in place of the token or clearing it. */
  readonly run: (row: DraftRow, draft: TextareaRenderable, token: DraftToken) => void;
}

export interface OpenTrigger {
  readonly rows: (query: string) => ReadonlyArray<DraftRow>;
  readonly keys: ReadonlyArray<DraftKey>;
  /** Shown when no row matches. */
  readonly empty: string;
}

export interface DraftTrigger {
  readonly char: string;
  /** `any-word`: wherever a word starts; `draft-start`: only as the draft's first character. */
  readonly where: "any-word" | "draft-start";
  /** Runs each time the menu opens, so a trigger can load its list then. */
  readonly open: Effect.Effect<OpenTrigger>;
}

/** Read when the composer first draws, so add to it from a `tui` entry. */
export class DraftTriggers extends Registry.Service<DraftTriggers, DraftTrigger>()(
  "chat/DraftTriggers",
) {}

/** Puts `text` in place of `token` in `draft`, leaving the cursor after it. */
export const replaceToken = (draft: TextareaRenderable, token: DraftToken, text: string) => {
  const from = draft.editBuffer.offsetToPosition(token.start);
  const to = draft.editBuffer.offsetToPosition(token.end);
  if (from === null || to === null) return;

  draft.deleteRange(from.row, from.col, to.row, to.col);
  draft.insertText(text);
};
