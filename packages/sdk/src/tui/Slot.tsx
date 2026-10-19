/**
 * The `<SlotView>` element: where a component that owns a slot shows what plugins registered into
 * it. The renderer supplies the registrations through SlotSourceContext.
 */

import { Dynamic } from "@opentui/solid";
import {
  type Component,
  createContext,
  createMemo,
  For,
  type JSX,
  Show,
  useContext,
} from "solid-js";

import type { AnySlot, ErasedMatcher, ExtraOf, PropsOf } from "../core/slot.ts";

/** One registration as the renderer hands it to `<SlotView>`. */
export interface SlotEntry {
  readonly id: number;
  // oxlint-disable-next-line typescript/no-explicit-any -- the props are checked where the component is registered, against its slot.
  readonly component: Component<any>;
  readonly meta: unknown;
  readonly select: ErasedMatcher | undefined;
}

/** The slot tree as the renderer exposes it; each read tracks changes. */
export interface SlotSource {
  /** What a single or keyed slot shows for `cell`. */
  readonly winner: (slot: string, cell: string) => SlotEntry | undefined;
  /** What a list slot shows, in order. */
  readonly listed: (slot: string) => ReadonlyArray<SlotEntry>;
  /** A chain slot's registrations in the order they are tried. */
  readonly chained: (slot: string) => ReadonlyArray<SlotEntry>;
}

export const SlotSourceContext = createContext<SlotSource>();

const useSource = () => {
  const source = useContext(SlotSourceContext);
  if (source === undefined) throw new Error("<SlotView> rendered outside a SlotSourceContext.");

  return source;
};

/** What the owner passes: the slot's props, without what a chain's matcher adds. */
export type SlotProps<S extends AnySlot> = Omit<PropsOf<S>, "matched">;

interface SlotElementProps<S extends AnySlot> {
  readonly of: S;
  /** The cell of a keyed slot. */
  readonly cell?: string;
  readonly props: SlotProps<S>;
  readonly fallback?: JSX.Element;
}

const firstMatch = <S extends AnySlot>(entries: ReadonlyArray<SlotEntry>, owner: SlotProps<S>) =>
  entries.flatMap((entry) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the matcher was registered against this slot's owner props, which `owner` is.
    const matched = entry.select?.(owner as never);

    return matched === undefined ? [] : [{ entry, matched }];
  })[0];

/**
 * A chain slot's first match. The component stays mounted while the same registration matches; new
 * owner props or a new `matched` reach it as prop changes.
 */
function ChainView<S extends AnySlot>(props: SlotElementProps<S>) {
  const source = useSource();
  const match = createMemo(() => firstMatch(source.chained(props.of.name), props.props));

  return (
    <Show when={match()?.entry} keyed fallback={props.fallback}>
      {(entry) => (
        <Dynamic component={entry.component} {...props.props} matched={match()?.matched} />
      )}
    </Show>
  );
}

/** Shows the registrations of `of`; nothing registered shows `fallback`. */
export function SlotView<S extends AnySlot>(props: SlotElementProps<S>) {
  const source = useSource();

  if (props.of.kind === "chain") return <ChainView {...props} />;

  if (props.of.kind === "list") {
    return (
      <For each={source.listed(props.of.name)} fallback={props.fallback}>
        {(entry) => <Dynamic component={entry.component} {...props.props} />}
      </For>
    );
  }

  return (
    <Show when={source.winner(props.of.name, props.cell ?? "")} keyed fallback={props.fallback}>
      {(entry) => <Dynamic component={entry.component} {...props.props} />}
    </Show>
  );
}

/** A keyed slot's metadata for each cell; `undefined` while nothing is registered there. */
export const useSlotMeta = <S extends AnySlot>(slot: S) => {
  const source = useSource();

  return (cell: string) =>
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keyed metadata is registered against this slot's Meta type.
    source.winner(slot.name, cell)?.meta as ExtraOf<S> | undefined;
};
