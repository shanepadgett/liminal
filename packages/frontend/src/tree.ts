/**
 * The slot tree as a value: which slots are declared and by whom, and every registration. Each
 * change returns a new tree; the host keeps the current one.
 */

import { Result } from "effect";

import { type AnySlot, type ErasedMatcher, SlotConflict, SlotUndeclared } from "@liminal/sdk";

/** One registration in a slot. */
export interface Entry<C> {
  /** Unique per registration; what removal matches on. */
  readonly id: number;
  /** The registering plugin. */
  readonly plugin: string;
  readonly slot: string;
  /** The place within the slot: `""` for single and chain slots, the id or key otherwise. */
  readonly cell: string;
  readonly priority: number;
  /** A list registration's position. */
  readonly order: number;
  /** A keyed registration's metadata. */
  readonly meta: unknown;
  /** A chain registration's matcher. */
  readonly select: ErasedMatcher | undefined;
  readonly component: C;
  /** The child slots this registration owns. */
  readonly declares: ReadonlyArray<AnySlot>;
}

/** A declared slot; `owner` is the declaring registration, absent for built-in slots. */
interface Declaration {
  readonly slot: AnySlot;
  readonly owner: number | undefined;
}

export interface SlotTree<C> {
  readonly declared: ReadonlyMap<string, Declaration>;
  readonly entries: ReadonlyArray<Entry<C>>;
}

/** A tree with only the built-in slots declared. */
export const makeTree = <C>(builtIn: ReadonlyArray<AnySlot>): SlotTree<C> => ({
  declared: new Map(builtIn.map((slot) => [slot.name, { slot, owner: undefined }])),
  entries: [],
});

const holderOf = <C>(tree: SlotTree<C>, entry: Entry<C>) =>
  tree.entries.find(
    (held) =>
      held.slot === entry.slot && held.cell === entry.cell && held.priority === entry.priority,
  );

const ownerPlugin = <C>(tree: SlotTree<C>, declaration: Declaration) =>
  tree.entries.find((held) => held.id === declaration.owner)?.plugin ?? "the frontend";

/** Adds the entry and declares its child slots, or says why it cannot. */
export const register = <C>(
  tree: SlotTree<C>,
  entry: Entry<C>,
): Result.Result<SlotTree<C>, SlotConflict | SlotUndeclared> => {
  if (!tree.declared.has(entry.slot)) return Result.fail(new SlotUndeclared({ slot: entry.slot }));

  const holder = holderOf(tree, entry);

  if (holder !== undefined) {
    const { slot, cell, priority } = entry;

    return Result.fail(new SlotConflict({ slot, cell, priority, holder: holder.plugin }));
  }

  const declared = new Map(tree.declared);

  for (const child of entry.declares) {
    const existing = declared.get(child.name);

    if (existing !== undefined) {
      const owner = ownerPlugin(tree, existing);

      return Result.fail(
        new SlotConflict({ slot: child.name, cell: "", priority: entry.priority, holder: owner }),
      );
    }

    declared.set(child.name, { slot: child, owner: entry.id });
  }

  return Result.succeed({ declared, entries: [...tree.entries, entry] });
};

/** The tree without an entry, and the plugins whose entries went with its child slots. */
export interface Removed<C> {
  readonly tree: SlotTree<C>;
  /** Each dropped plugin and the slots it was dropped from. */
  readonly dropped: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Removes the entry; each child slot it declared collapses, taking its entries and, in turn, their
 * child slots.
 */
export const remove = <C>(tree: SlotTree<C>, id: number): Removed<C> => {
  const declared = new Map(tree.declared);
  const removedIds = new Set<number>();
  const dropped = new Map<string, Set<string>>();
  const pending = [id];

  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    removedIds.add(next);

    for (const [name, declaration] of tree.declared) {
      if (declaration.owner !== next) continue;
      declared.delete(name);

      const children = tree.entries.filter(
        (held) => held.slot === name && !removedIds.has(held.id),
      );

      for (const child of children) {
        pending.push(child.id);
        dropped.set(child.plugin, new Set([...(dropped.get(child.plugin) ?? []), name]));
      }
    }
  }

  const entries = tree.entries.filter((entry) => !removedIds.has(entry.id));

  return { tree: { declared, entries }, dropped };
};

const byRank = <C>(left: Entry<C>, right: Entry<C>) => left.priority - right.priority;

/** The entries of a slot cell, lowest priority first. */
const cellOf = <C>(tree: SlotTree<C>, slot: string, cell: string) =>
  tree.entries.filter((entry) => entry.slot === slot && entry.cell === cell).toSorted(byRank);

/** What a single or keyed slot shows for `cell`: its lowest-priority entry. */
export const winner = <C>(tree: SlotTree<C>, slot: string, cell = ""): Entry<C> | undefined =>
  cellOf(tree, slot, cell)[0];

/** What a list slot shows: each cell's winner, by order, then id. */
export const listed = <C>(tree: SlotTree<C>, slot: string): ReadonlyArray<Entry<C>> => {
  const cells = new Set(tree.entries.flatMap((entry) => (entry.slot === slot ? [entry.cell] : [])));

  return [...cells]
    .flatMap((cell) => cellOf(tree, slot, cell).slice(0, 1))
    .toSorted((left, right) => left.order - right.order || left.cell.localeCompare(right.cell));
};

/** A chain slot's entries in the order they are tried. */
export const chained = <C>(tree: SlotTree<C>, slot: string): ReadonlyArray<Entry<C>> =>
  cellOf(tree, slot, "");
