/**
 * What other plugins add to the chat screen: renderers for their event kinds, three slots, and the
 * pipeline every send passes through.
 */
import type { JSX } from "@opentui/solid";

import type { SessionView } from "@shanepadgett/liminal-client";
import { Pipeline, Registry } from "@shanepadgett/liminal-core";
import type { SendMode } from "@shanepadgett/liminal-loop/contract";
import type {
  EventInvalid,
  NewEvent,
  SessionEvent,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";
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

export interface StatusProps {
  /** The session on screen; undefined on the landing screen. */
  readonly session: SessionId | undefined;
}

/** The left of the composer's hint row, such as the model line; every fill shows, in order. */
export const status = defineSlot<StatusProps>("chat/status", "append");

export interface ChatSendRequest {
  readonly session: SessionId;
  readonly input: NewEvent;
  /** Only while a turn runs: whether the input steers it or follows it. */
  readonly mode?: SendMode | undefined;
}

/**
 * Every input the chat screen sends, before it shows the session; the session on screen is still
 * the one the user sent from, so a wrap can add what was chosen there.
 */
export class ChatSend extends Pipeline.Service<
  ChatSend,
  ChatSendRequest,
  void,
  SessionNotFound | SessionStoreFailed | EventInvalid
>()("chat/Send") {}
