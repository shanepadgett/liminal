/** What the gallery shows: groups of sections, sections of entries, and each entry's states. */

import type { JSX } from "@opentui/solid";

import { components } from "./components/index.ts";
import { primitives } from "./primitives/index.ts";
import { screens } from "./screens/index.ts";
import { tokens } from "./tokens/index.ts";

/**
 * How a state sits in the frame: `page` scrolls from the top, `center` lets the view set its own
 * width, `screen` fills the frame.
 */
export type Fill = "page" | "center" | "screen";

export interface State {
  readonly name: string;
  readonly fill: Fill;
  readonly view: () => JSX.Element;
}

export interface Entry {
  readonly id: string;
  readonly title: string;
  readonly states: readonly [State, ...State[]];
}

export interface Section {
  readonly title: string;
  readonly entries: readonly Entry[];
}

export interface Group {
  readonly title: string;
  readonly sections: readonly Section[];
}

export const GROUPS: readonly [Group, ...Group[]] = [tokens, primitives, components, screens];
