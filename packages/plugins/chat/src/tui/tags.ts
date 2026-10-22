/**
 * The `@` list: the tag being typed before the cursor, the rows that match it, and the keys that
 * pick one. A row ranks by its `fuzzysort` match times one plus its frecency, so tags sent often
 * rise; with nothing typed yet, frecency alone orders them. The list loads once each time it opens.
 * A picked tag becomes a virtual extmark, so the cursor steps over it and one backspace removes
 * it.
 */
import type { ExtmarkOptions, TextareaRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { Effect } from "effect";
import fuzzysort from "fuzzysort";
import { type Accessor, createMemo, createSignal } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { type ListedTag, tagText, TagsRpc } from "@shanepadgett/liminal-tags/contract";
import { useRun, useSyntax } from "@shanepadgett/liminal-tui";

/** A tag being typed: where its `@` sits in the text before the cursor, and what follows it. */
interface Typing {
  readonly index: number;
  readonly query: string;
}

/** An `@` at the start or after whitespace, with no whitespace up to the cursor. */
const TYPING = /(?:^|\s)@(\S*)$/;

const typingIn = (before: string): Typing | undefined => {
  const query = TYPING.exec(before)?.[1];
  if (query === undefined) return undefined;

  return { index: before.length - query.length - 1, query };
};

export interface Ranked {
  readonly row: ListedTag;
  /** Indexes of the matched letters in the tag. */
  readonly matches: readonly number[];
}

/** How many rows the list holds. */
const MAX_ROWS = 50;

const rank = (rows: readonly ListedTag[], query: string): readonly Ranked[] => {
  if (query === "") {
    return rows
      .toSorted((a, b) => b.frecency - a.frecency)
      .slice(0, MAX_ROWS)
      .map((row) => ({ row, matches: [] }));
  }

  return fuzzysort
    .go(query, rows, { key: "tag" })
    .map((result) => ({
      row: result.obj,
      matches: result.indexes,
      score: result.score * (1 + result.obj.frecency),
    }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, MAX_ROWS)
    .map(({ row, matches }) => ({ row, matches }));
};

/** The open list: the editor offset of its `@`, and what follows it. */
interface Open {
  readonly at: number;
  readonly query: string;
}

const listTags = Effect.gen(function* () {
  const tags = yield* (yield* Host).client(TagsRpc);

  return yield* tags["tags/list"]();
}).pipe(Effect.scoped);

/** The style tags show in: the syntax style's inline code. */
const TAG_STYLE = "markup.raw.inline";

export interface TagList {
  /** The matching rows; undefined while the list is closed. */
  readonly rows: Accessor<readonly Ranked[] | undefined>;
  readonly under: Accessor<number>;
  /** Opens, updates or closes the list from the text before the cursor. */
  readonly refresh: () => void;
}

const useTagKeys = (
  isOpen: () => boolean,
  actions: { readonly move: (by: number) => void; readonly pick: (opens: boolean) => void },
  dismiss: () => void,
) => {
  // Above the composer's own keys and the stop on `escape`.
  useBindings(() => ({
    priority: 1,
    commands: [
      {
        name: "chat.tags.up",
        title: "Previous tag",
        run: () => {
          actions.move(-1);
        },
      },
      {
        name: "chat.tags.down",
        title: "Next tag",
        run: () => {
          actions.move(1);
        },
      },
      {
        name: "chat.tags.pick",
        title: "Tag",
        run: () => {
          actions.pick(false);
        },
      },
      {
        name: "chat.tags.open",
        title: "Open folder",
        run: () => {
          actions.pick(true);
        },
      },
      { name: "chat.tags.close", title: "Close tags", run: dismiss },
    ],
    bindings: isOpen()
      ? [
          { key: "up", cmd: "chat.tags.up" },
          { key: "down", cmd: "chat.tags.down" },
          { key: "return", cmd: "chat.tags.pick" },
          { key: "tab", cmd: "chat.tags.open" },
          { key: "escape", cmd: "chat.tags.close" },
        ]
      : [],
  }));
};

/** The list's state: where it is open, the rows loaded and ranked, and the row under the cursor. */
const useTagRows = () => {
  const run = useRun();
  const [open, setOpen] = createSignal<Open>();
  const [listed, setListed] = createSignal<readonly ListedTag[]>([]);
  const [under, setUnder] = createSignal(0);

  const rows = createMemo(() => {
    const current = open();

    return current === undefined ? undefined : rank(listed(), current.query);
  });

  /** Opens the list at `next`, or closes it with none. */
  const show = (next?: Open) => {
    if (next !== undefined && open() === undefined) {
      setListed([]);
      run(Effect.map(listTags, (tags) => setListed(tags)));
    }

    if (open()?.query !== next?.query) setUnder(0);
    setOpen(next);
  };

  const move = (by: number) => {
    const count = rows()?.length ?? 0;
    if (count > 0) setUnder((index) => (index + by + count) % count);
  };

  return { open, rows, under, show, move };
};

/** Edits to the draft that write tags; the cursor moves midway, so `isEditing` marks them. */
const useTagEdits = (draft: () => TextareaRenderable | undefined) => {
  const syntax = useSyntax();
  const state = { isEditing: false };

  /** Replaces the text from editor offset `at` to the cursor with `text`. */
  const replace = (at: number, text: string) => {
    const input = draft();
    if (input === undefined) return;

    state.isEditing = true;
    const end = input.cursorOffset;
    input.cursorOffset = at;
    const start = input.logicalCursor;
    input.cursorOffset = end;
    const stop = input.logicalCursor;
    input.deleteRange(start.row, start.col, stop.row, stop.col);
    input.insertText(text);
    state.isEditing = false;
  };

  /** Writes `tag` from `at` as one unit, then a space. */
  const writeTag = (at: number, tag: string) => {
    const text = tagText(tag);
    replace(at, `${text} `);

    const input = draft();
    if (input === undefined) return;

    const mark: ExtmarkOptions = {
      start: at,
      end: at + input.editBuffer.measureText(text),
      virtual: true,
    };

    const styleId = syntax().getStyleId(TAG_STYLE);
    if (styleId !== null) mark.styleId = styleId;
    input.extmarks.create(mark);
  };

  return { state, replace, writeTag };
};

export const useTagList = (draft: () => TextareaRenderable | undefined): TagList => {
  const list = useTagRows();
  const edits = useTagEdits(draft);
  // The `@` whose list `esc` closed; it stays closed until the cursor leaves that tag.
  let dismissed: number | undefined;

  const refresh = () => {
    const input = draft();
    if (input === undefined || edits.state.isEditing) return;

    const before = input.getTextRange(0, input.cursorOffset);
    const typing = typingIn(before);
    if (typing === undefined) dismissed = undefined;

    const at = typing && input.editBuffer.measureText(before.slice(0, typing.index));
    const isShown = typing !== undefined && at !== undefined && at !== dismissed;
    list.show(isShown ? { at, query: typing.query } : undefined);
  };

  const pick = (opens: boolean) => {
    const current = list.open();
    const row = list.rows()?.[list.under()]?.row;
    if (current === undefined || row === undefined) return;

    if (opens && row.kind === "folder") edits.replace(current.at, `@${row.tag}`);
    else edits.writeTag(current.at, row.tag);

    refresh();
  };

  useTagKeys(
    () => list.open() !== undefined,
    { move: list.move, pick },
    () => {
      dismissed = list.open()?.at;
      list.show();
    },
  );

  return { rows: list.rows, under: list.under, refresh };
};
