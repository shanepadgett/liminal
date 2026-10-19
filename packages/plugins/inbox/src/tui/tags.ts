/**
 * The composer's `@` list: the rows matching the tag at the cursor, its highlight, and its keys. Up
 * and down move, enter tags the row, tab opens a folder or tags anything else, esc closes the list
 * until the cursor leaves the tag.
 */

import type { TextareaRenderable } from "@opentui/core";
import { type Accessor, createEffect, createMemo, createSignal, on } from "solid-js";

import { enterKeys, moveKeys, type MovingList } from "@liminal/sdk/tui";

import { type TagAt, tagAt, type TagRow, tagText } from "../contract.ts";

export interface TagsDeps {
  readonly draft: Accessor<string>;
  /** Where the cursor is in the draft. */
  readonly cursor: Accessor<number>;
  readonly input: () => TextareaRenderable | undefined;
  /** Asks the sources for `query`'s rows, calling `found` with them. */
  readonly find: (query: string, found: (rows: ReadonlyArray<TagRow>) => void) => void;
}

/** A tag as typed so far: an opened folder keeps its quote open, so typing goes on inside it. */
const openText = (path: string) => (/\s/.test(path) ? `@"${path}` : `@${path}`);

const tagKeys = (actions: {
  readonly list: MovingList;
  readonly pick: () => void;
  readonly open: () => void;
  readonly close: () => void;
}) => {
  const moves = moveKeys("inbox.tag", actions.list);

  return {
    commands: [
      ...moves.commands,
      { name: "inbox.tag-pick", run: actions.pick },
      { name: "inbox.tag-open", run: actions.open },
      { name: "inbox.tag-close", run: actions.close },
    ],
    bindings: [
      ...moves.bindings,
      ...enterKeys("inbox.tag-pick"),
      { key: "tab", cmd: "inbox.tag-open" },
      { key: "escape", cmd: "inbox.tag-close" },
    ],
  };
};

/** Puts `text` in place of the tag, leaving the cursor after it. */
const replaceTag = (input: () => TextareaRenderable | undefined, at: TagAt, text: string) => {
  const target = input();
  if (target === undefined) return;
  const draft = target.plainText;
  target.replaceText(draft.slice(0, at.start) + text + draft.slice(at.end));
  target.cursorOffset = at.start + text.length;
};

export const useTags = (deps: TagsDeps) => {
  const [rows, setRows] = createSignal<ReadonlyArray<TagRow>>([]);
  const [selected, setSelected] = createSignal(0);
  const [closedAt, setClosedAt] = createSignal<number>();
  const at = createMemo(() => tagAt(deps.draft(), deps.cursor()));
  const query = createMemo(() => at()?.query);

  createEffect(
    on(query, (typed) => {
      setSelected(0);

      if (typed === undefined) {
        setRows([]);

        return;
      }

      deps.find(typed, (found) => {
        if (query() === typed) setRows(found);
      });
    }),
  );

  // Esc closes the list for this tag only.
  createEffect(
    on(
      () => at()?.start,
      (start) => {
        if (start !== closedAt()) setClosedAt(undefined);
      },
    ),
  );

  const open = createMemo(
    () => at() !== undefined && closedAt() === undefined && rows().length > 0,
  );

  /** Tags the highlighted row, or opens it when it is a folder and `openFolder` holds. */
  const choose = (openFolder: boolean) => {
    const row = rows()[selected()];
    const tag = at();
    if (row === undefined || tag === undefined) return;
    const isOpening = openFolder && row.kind === "folder";
    replaceTag(deps.input, tag, isOpening ? openText(row.tag) : `${tagText(row.tag)} `);
  };

  const keys = tagKeys({
    list: { count: () => rows().length, select: setSelected },
    pick: () => {
      choose(false);
    },
    open: () => {
      choose(true);
    },
    close: () => setClosedAt(at()?.start),
  });

  return { rows, selected, open, query: () => query() ?? "", ...keys };
};
