/**
 * Slots: the named places in a frontend's slot tree that plugins render into. The plugin that owns
 * a slot exports its handle from its contract; registrants import the handle, so its kind, scope
 * and prop types travel with it.
 */

import { Schema } from "effect";

import type { SessionId } from "./session.ts";

declare const noProps: unique symbol;

/** The owner props of a slot whose owner passes nothing. */
export interface NoProps {
  readonly [noProps]?: never;
}

/** What a chain matcher returns, with its slot's type erased; `undefined` means no match. */
export type AnyMatch = {} | null | undefined;

/**
 * A chain registration's matcher as the slot tree stores it beside other slots' registrations.
 * `<Slot>` passes it the owner props of its own slot.
 */
export type ErasedMatcher = (owner: never) => AnyMatch;

/** How many registrations a slot shows. */
export type SlotKind = "single" | "list" | "keyed" | "chain";

/** `session` slots render once per session and get its id as a prop. */
export type SlotScope = "root" | "session";

/**
 * A slot handle. `Owner` is the props the owner passes; `Extra` is a keyed slot's metadata or what
 * a chain slot's matcher selects.
 */
export interface Slot<K extends SlotKind, S extends SlotScope, Owner, Extra> {
  readonly name: string;
  readonly kind: K;
  readonly scope: S;
  /** Carries the prop types; never set at runtime. */
  readonly types?: (owner: Owner) => Extra;
}

/** Any slot handle. */
// oxlint-disable-next-line typescript/no-explicit-any -- the owner and extra types vary per slot; `unknown` would reject function-typed owners by variance.
export type AnySlot = Slot<SlotKind, SlotScope, any, any>;

export type OwnerOf<S> =
  S extends Slot<SlotKind, SlotScope, infer Owner, infer _Extra> ? Owner : never;

export type ExtraOf<S> =
  S extends Slot<SlotKind, SlotScope, infer _Owner, infer Extra> ? Extra : never;

/** What a registered component receives. */
export type PropsOf<S> = OwnerOf<S>
  & (S extends Slot<SlotKind, "session", infer _Owner, infer _Extra>
    ? { readonly sessionId: SessionId }
    : unknown)
  & (S extends Slot<"chain", SlotScope, infer _Owner, infer Matched>
    ? { readonly matched: Matched }
    : unknown);

/** Lower runs first: a lower priority wins a cell and is tried first in a chain. Default 0. */
interface Ranked {
  readonly priority?: number;
}

/** How a registration places itself in its slot. */
export type RegisterOptions<S> =
  S extends Slot<"single", SlotScope, infer _Owner, infer _Extra>
    ? Ranked
    : S extends Slot<"list", SlotScope, infer _Owner, infer _Extra>
      ? Ranked & { readonly id: string; readonly order?: number }
      : S extends Slot<"keyed", SlotScope, infer _Owner, infer Meta>
        ? Ranked & { readonly key: string; readonly meta: Meta }
        : S extends Slot<"chain", SlotScope, infer Owner, infer Matched>
          ? Ranked & { readonly select: (owner: Owner) => Matched | undefined }
          : never;

interface SlotOptions<S extends SlotScope> {
  readonly scope: S;
}

const make =
  <K extends SlotKind>(kind: K) =>
  <Owner, Extra, S extends SlotScope>(name: string, options: SlotOptions<S>) => {
    const slot: Slot<K, S, Owner, Extra> = { name, kind, scope: options.scope };

    return slot;
  };

/** Constructors for slot handles, each named `<plugin>/<place>`. */
export const Slot = {
  /** One component; a lower priority shadows. */
  single: <Owner, S extends SlotScope = SlotScope>(name: string, options: SlotOptions<S>) =>
    make("single")<Owner, never, S>(name, options),
  /** Every registration, by `order` then priority; `id` names a registration's cell. */
  list: <Owner, S extends SlotScope = SlotScope>(name: string, options: SlotOptions<S>) =>
    make("list")<Owner, never, S>(name, options),
  /** One component per key, each with metadata the owner reads. */
  keyed: <Owner, Meta, S extends SlotScope = SlotScope>(name: string, options: SlotOptions<S>) =>
    make("keyed")<Owner, Meta, S>(name, options),
  /** The first registration, by priority, whose `select` matches the owner's props. */
  chain: <Owner, Matched, S extends SlotScope = SlotScope>(name: string, options: SlotOptions<S>) =>
    make("chain")<Owner, Matched, S>(name, options),
};

/** The one built-in slot: the frontend renders whatever wins it as its whole screen. */
export const RootSlot = Slot.single<NoProps, "root">("root", { scope: "root" });

/** Another plugin already holds the slot's cell at this priority. */
export class SlotConflict extends Schema.TaggedError<
  SlotConflict,
  { readonly brand: unique symbol }
>()("SlotConflict", {
  slot: Schema.String,
  cell: Schema.String,
  priority: Schema.Finite,
  holder: Schema.String,
}) {
  override get message() {
    return `${this.holder} already holds ${this.slot} [${this.cell}] at priority ${this.priority}; register at another priority or disable one of the plugins.`;
  }
}

/** No mounted owner declares the slot. */
export class SlotUndeclared extends Schema.TaggedError<
  SlotUndeclared,
  { readonly brand: unique symbol }
>()("SlotUndeclared", { slot: Schema.String }) {
  override get message() {
    return `No plugin declares ${this.slot}; enable the plugin that owns it.`;
  }
}
