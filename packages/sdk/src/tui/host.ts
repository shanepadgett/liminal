/** The TUI's host service and `defineTui`, the default export of every plugin's `src/tui.tsx`. */

import { type Cause, Context, type Effect, type Scope } from "effect";
import type { Component } from "solid-js";

import type { ComponentKind, FrontendHost, FrontendPart } from "../core/frontend.ts";

/** Solid components, as the frontend host types them. */
export interface SolidKind extends ComponentKind {
  // Solid's components take object props; a slot's props are always an object.
  readonly component: Component<this["props"] & object>;
}

/** What a UI part's `setup` registers into and connects through. */
export class TuiHost extends Context.Service<TuiHost, FrontendHost<SolidKind>>()(
  "liminal/sdk/TuiHost",
) {}

/** Declares a plugin's TUI part. */
export const defineTui = <E extends Cause.YieldableError>(part: {
  readonly setup: Effect.Effect<void, E, TuiHost | Scope.Scope>;
}): FrontendPart<TuiHost> => part;
