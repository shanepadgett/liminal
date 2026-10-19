/**
 * The state of an open references dialog, kept outside it so a dialog shown over it, such as the
 * clone URL prompt, leaves it as it was: the clones, the clones still cloning, a note per row and
 * the marked names.
 */

import { type Accessor, createSignal } from "solid-js";

import type { Reference } from "../contract.ts";

/** A row of the dialog: a clone, or a clone not finished, which cannot be marked. */
export interface PanelRow {
  readonly reference: Reference;
  readonly isCloned: boolean;
}

export interface Panel {
  readonly rows: Accessor<ReadonlyArray<PanelRow>>;
  readonly setReferences: (references: ReadonlyArray<Reference>) => void;
  /** Progress, a check or a failure said at the row's right; its branch when none. */
  readonly noteOf: (name: string) => string | undefined;
  readonly setNote: (name: string, note?: string) => void;
  readonly addPending: (name: string) => void;
  readonly dropPending: (name: string) => void;
  readonly marked: Accessor<ReadonlySet<string>>;
  readonly toggle: (name: string) => void;
  readonly unmark: (name: string) => void;
  readonly selected: Accessor<number>;
  readonly select: (next: (index: number) => number) => void;
}

export const makePanel = (
  initial: ReadonlyArray<Reference>,
  attached: ReadonlyArray<string>,
): Panel => {
  const [references, setReferences] = createSignal(initial);
  const [pending, setPending] = createSignal<ReadonlyArray<string>>([]);
  const [notes, setNotes] = createSignal<ReadonlyMap<string, string>>(new Map());
  const [marked, setMarked] = createSignal<ReadonlySet<string>>(new Set(attached));
  const [selected, setSelected] = createSignal(0);

  const rows = () => {
    const cloned = new Set(references().map(({ name }) => name));

    const unfinished = pending().flatMap((name) =>
      cloned.has(name) ? [] : [{ reference: { name }, isCloned: false }],
    );

    return [
      ...references().map((reference) => ({ reference, isCloned: true })),
      ...unfinished,
    ].toSorted((left, right) => left.reference.name.localeCompare(right.reference.name));
  };

  return {
    rows,
    setReferences,
    noteOf: (name) => notes().get(name),
    setNote: (name, note) => {
      setNotes((map) => {
        const next = new Map(map);

        if (note === undefined) next.delete(name);
        else next.set(name, note);

        return next;
      });
    },
    addPending: (name) => setPending((names) => [...names.filter((each) => each !== name), name]),
    dropPending: (name) => setPending((names) => names.filter((each) => each !== name)),
    marked,
    toggle: (name) => {
      setMarked((names) => {
        const next = new Set(names);
        if (!next.delete(name)) next.add(name);

        return next;
      });
    },
    unmark: (name) => {
      setMarked((names) => new Set([...names].filter((each) => each !== name)));
    },
    selected,
    select: (next) => {
      const count = rows().length;
      setSelected((index) => (count === 0 ? 0 : Math.min(Math.max(next(index), 0), count - 1)));
    },
  };
};
