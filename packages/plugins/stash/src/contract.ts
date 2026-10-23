/** Stashes: drafts the user sets aside, one list per workspace folder, served over `StashRpc`. */
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/** A stashed draft; `id` names it for `stash/drop`. */
export const Stash = Schema.Struct({
  id: Schema.Int,
  text: Schema.String,
  /** When it was stashed, in epoch milliseconds. */
  createdAt: Schema.Int,
});

export type Stash = typeof Stash.Type;

/** The stashes table could not be read or written. */
export class StashesFailed extends Schema.TaggedError<
  StashesFailed,
  { readonly brand: unique symbol }
>()("StashesFailed", { message: Schema.String }) {}

export class StashRpc extends RpcGroup.make(
  /** Stashes `text` in the workspace folder's list; the same text again keeps one stash. */
  Rpc.make("stash/save", { payload: { text: Schema.String }, error: StashesFailed }),
  /** The workspace folder's stashes, newest first. */
  Rpc.make("stash/list", { success: Schema.Array(Stash), error: StashesFailed }),
  Rpc.make("stash/drop", { payload: { id: Schema.Int }, error: StashesFailed }),
) {}
