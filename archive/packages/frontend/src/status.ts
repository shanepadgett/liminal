/** Each UI part's state, and why a part is not running. */

import { type Cause, Data } from "effect";

import type { SlotConflict, SlotUndeclared } from "@liminal/sdk";

export type PartFailure = Data.TaggedEnum<{
  /** Another plugin holds the cell, or the child slot, at the same priority. */
  Conflict: { readonly error: SlotConflict };
  /** The slot it registers into is not declared; the part runs again once it is. */
  Undeclared: { readonly error: SlotUndeclared };
  /** The module the kernel imported is not a part for this frontend. */
  Invalid: { readonly cause: Cause.Cause<unknown> };
  /** `setup` failed. */
  SetupFailed: { readonly cause: Cause.Cause<unknown> };
}>;

export const PartFailure = Data.taggedEnum<PartFailure>();

export type PartStatus = Data.TaggedEnum<{
  Running: {};
  Failed: { readonly failure: PartFailure };
}>;

export const PartStatus = Data.taggedEnum<PartStatus>();
