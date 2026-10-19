/**
 * Chat: the TUI's chat screen and the slots other plugins draw into: header items, transcript
 * entries, tool rows, the live tip, the composer, the key hints and the sidebar's sections. Entries
 * marked `debug` show only while the debug view is on.
 */

import { Data, Effect, Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

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
  /** Calls a `run` script made inside this call, in the order they ended. */
  readonly inner?: ReadonlyArray<ToolCall>;
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
  /** Cuts the subject to one line with `…`, its detail still shown; the opened row has it all. */
  readonly oneLine?: boolean;
}

/**
 * A tool's registration in `chat/tool`: how its calls read as work rows, or `Hidden` when its calls
 * draw no row, such as a call the transcript shows as its own entry; `live` is what a hidden call
 * reads as while the model writes it, else `Calling <name>`.
 */
export type ToolRows = Data.TaggedEnum<{
  Rows: { readonly fold: (call: ToolCall) => WorkRow };
  Hidden: { readonly live?: string };
}>;

export const ToolRows = Data.taggedEnum<ToolRows>();

/** What a tool's opened row gets: the call, and its result as text, empty when it is not text. */
export interface ToolView {
  readonly call: ToolCall;
  readonly text: string;
}

const decodePath = Schema.decodeUnknownOption(Schema.Struct({ path: Schema.String }));

/**
 * Rows for a tool whose params name a `path`: `<running> <path>` while it runs, `<done> <path>`
 * after, joined with neighbours by `joins`.
 */
export const pathRows = (words: {
  readonly running: string;
  readonly done: string;
  readonly joins: NonNullable<WorkRow["joins"]>;
}): ToolRows =>
  ToolRows.Rows({
    fold: (call) => ({
      verb: call.outcome === undefined ? words.running : words.done,
      subject: Option.match(decodePath(call.params), {
        onNone: () => "",
        onSome: ({ path }) => path,
      }),
      joins: words.joins,
    }),
  });

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
  tool: Slot.keyed<ToolView, ToolRows, "session">("chat/tool", { scope: "session" }),
  /**
   * The session's live state at the transcript's end, keyed by live kind. `afterWork` says the
   * transcript ends in a run of work, so live work can join it with no gap.
   */
  live: Slot.keyed<{ readonly live: LiveState; readonly afterWork: boolean }, NoProps, "session">(
    "chat/live",
    { scope: "session" },
  ),
  /** Where the user writes; the first registration whose `select` matches takes it. */
  composer: Slot.chain<TurnProps, true, "session">("chat/composer", { scope: "session" }),
  /** Short items after the composer's model line, such as the approval mode; drawn by the composer. */
  composerLine: Slot.list<TurnProps, "session">("chat/composer-line", { scope: "session" }),
  /**
   * The composer's key hints, first under the composer; the first registration whose `select`
   * matches, so they follow whoever holds the composer.
   */
  composerHints: Slot.chain<TurnProps, true, "session">("chat/composer-hints", {
    scope: "session",
  }),
  /** Further key hints after the composer's, one group per registration. */
  hints: Slot.list<TurnProps, "session">("chat/hints", { scope: "session" }),
  /**
   * The sidebar's sections, top to bottom by `order`: environment's Session at -10, usage's Context
   * at 0 and Cost at 10, compaction's at 20.
   */
  sidebar: Slot.list<NoProps, "session">("chat/sidebar", { scope: "session" }),
};

/** The `chat` section of `settings.json`. */
export const ChatSettings = Schema.Struct({
  /** Whether the debug view starts on; `/debug` flips it for the run. */
  debug: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
});

export type ChatSettings = typeof ChatSettings.Type;

export class ChatRpcs extends RpcGroup.make(
  /** The `debug` setting: whether the debug view starts on. */
  Rpc.make("chat/debug", { success: Schema.Boolean }),
) {}
