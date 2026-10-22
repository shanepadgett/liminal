/** What other plugins add to the chat screen: renderers for their event kinds, and two slots. */
import type { JSX } from "@opentui/solid";

import type { SessionView } from "@shanepadgett/liminal-client";
import { Registry } from "@shanepadgett/liminal-core";
import type { SendMode } from "@shanepadgett/liminal-loop/contract";
import type { SessionEvent, SessionId } from "@shanepadgett/liminal-session/contract";
import { defineSlot } from "@shanepadgett/liminal-tui";

/** How a plugin's saved events of `kind` show in the transcript. */
export interface ItemView {
  readonly kind: string;
  readonly component: (props: { readonly event: SessionEvent }) => JSX.Element;
}

/** Read when the transcript first draws, so add to it from a `tui` entry. */
export class ItemRenderer extends Registry.Service<ItemRenderer, ItemView>()("chat/ItemRenderer") {}

export interface SidebarProps {
  readonly session: SessionId;
  readonly state: SessionView.ViewState;
}

/** The column beside the transcript once a session starts; every fill shows, in order. */
export const sidebar = defineSlot<SidebarProps>("chat/sidebar", "append");

export interface ComposerProps {
  readonly running: boolean;
  /** Starts a turn; while one runs, `mode` says whether the text steers it or follows it. */
  readonly send: (text: string, mode?: SendMode) => void;
  /** Stops the running turn. */
  readonly cancel: () => void;
}

/** Where the user writes; the last fill wins. */
export const composer = defineSlot<ComposerProps>("chat/composer", "replace");
