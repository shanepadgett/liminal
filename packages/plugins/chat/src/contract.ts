/**
 * Chat: the TUI's chat screen and the slots other plugins draw into: header items, transcript
 * entries, tool rows, the live tip, the composer and the key hints.
 */

import type { Schema } from "effect";

import { type LiveState, type NoProps, type SavedEntry, Slot } from "@liminal/sdk";

type Json = Schema.Json;

/** How a tool call ended, from its result entry. */
export interface ToolOutcome {
  readonly status: "done" | "failed" | "denied" | "cancelled" | "interrupted";
  readonly result: Json;
  readonly details?: Json;
}

/** A tool call in the transcript; `outcome` is absent while it runs. */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly params: Json;
  readonly outcome?: ToolOutcome;
}

/**
 * One row of work, as a tool words its call: `Read src/kernel.ts (40 lines)`. Consecutive rows with
 * the same `joins.verb` show as one row: `Explored 3 files`.
 */
export interface WorkRow {
  readonly verb: string;
  readonly subject: string;
  readonly detail?: string;
  readonly joins?: { readonly verb: string; readonly noun: string };
}

/** A tool's registration in `chat/tool`: how its calls read as work rows. */
export interface ToolRows {
  readonly fold: (call: ToolCall) => WorkRow;
}

/** The props of the composer and the hints: whether a turn is running. */
export interface TurnProps {
  readonly running: boolean;
}

/** The slots chat declares under the root slot. */
export const ChatSlots = {
  /** Items at the header's right end. */
  header: Slot.list<NoProps, "root">("chat/header", { scope: "root" }),
  /** A transcript entry, keyed by entry kind. */
  entry: Slot.keyed<{ readonly entry: SavedEntry }, NoProps, "session">("chat/entry", {
    scope: "session",
  }),
  /** A tool call's opened detail, keyed by tool name; its metadata words the call's row. */
  tool: Slot.keyed<{ readonly call: ToolCall }, ToolRows, "session">("chat/tool", {
    scope: "session",
  }),
  /** The session's live state at the transcript's end, keyed by live kind. */
  live: Slot.keyed<{ readonly live: LiveState }, NoProps, "session">("chat/live", {
    scope: "session",
  }),
  /** Where the user writes; the first registration whose `select` matches takes it. */
  composer: Slot.chain<TurnProps, true, "session">("chat/composer", { scope: "session" }),
  /** Key hints under the composer, one group per registration. */
  hints: Slot.list<TurnProps, "session">("chat/hints", { scope: "session" }),
};
