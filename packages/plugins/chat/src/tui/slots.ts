/**
 * What other plugins add to the chat screen: renderers for their event kinds and tools' rows, three
 * slots, covers for the composer, Porter's moods, and the pipeline every send passes through.
 */
import type { JSX } from "@opentui/solid";

import type { SessionView } from "@shanepadgett/liminal-client";
import { Pipeline, Registry } from "@shanepadgett/liminal-core";
import type { Queued, SendMode } from "@shanepadgett/liminal-loop/contract";
import type {
  EventInvalid,
  NewEvent,
  SessionEvent,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";
import { defineSlot, type kit } from "@shanepadgett/liminal-tui";

import type { ToolItem } from "../view/index.ts";

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
  /** Inputs sent while the turn runs, oldest first, until it takes them. */
  readonly queued: ReadonlyArray<Queued>;
  /** Starts a turn; while one runs, `mode` says whether the text steers it or follows it. */
  readonly send: (text: string, mode?: SendMode) => void;
  /** Stops the running turn and puts the queued inputs back into the draft. */
  readonly cancel: () => void;
  /** Puts the queued inputs back into the draft; the turn goes on. */
  readonly pullBack: () => void;
}

/** Where the user writes; the last fill wins. */
export const composer = defineSlot<ComposerProps>("chat/composer", "replace");

export interface CoverProps extends ComposerProps {
  readonly session: SessionId;
  readonly state: SessionView.ViewState;
}

/** Something that takes the composer's place while it is active, such as a question to answer. */
export interface ComposerCover {
  readonly active: (props: CoverProps) => boolean;
  readonly component: (props: CoverProps) => JSX.Element;
}

/** Read when the session screen first draws; the first active cover shows, else the composer. */
export class ComposerCovers extends Registry.Service<ComposerCovers, ComposerCover>()(
  "chat/ComposerCovers",
) {}

export interface ToolRowProps {
  readonly item: ToolItem;
  readonly state: SessionView.ViewState;
}

/** How calls to `tool` show in the transcript, in place of the plain row. */
export interface ToolRowView {
  readonly tool: string;
  readonly component: (props: ToolRowProps) => JSX.Element;
}

/** Read when the transcript first draws, so add to it from a `tui` entry. */
export class ToolRows extends Registry.Service<ToolRows, ToolRowView>()("chat/ToolRows") {}

export interface MoodProps {
  readonly session: SessionId;
  readonly state: SessionView.ViewState;
}

/** How the working screen looks while it applies: what Porter murmurs, his faces, the header. */
export interface Mood {
  readonly active: (props: MoodProps) => boolean;
  /** Murmured one at a time; a single word holds still. */
  readonly words: (props: MoodProps) => ReadonlyArray<string>;
  /** Missing keeps his own faces. */
  readonly poses?: ReadonlyArray<kit.Pose> | undefined;
  /** Whether the header's diagonals scan while the turn runs; missing scans. */
  readonly header?: "scanning" | "still" | undefined;
}

/** Read when the session screen first draws; the first active mood wins, else the screen's own. */
export class Moods extends Registry.Service<Moods, Mood>()("chat/Moods") {}

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
