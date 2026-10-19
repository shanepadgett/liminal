/**
 * Inbox: the user's input to a session, sent now or queued while a turn runs; the `@` tags and
 * pictures it carries; and the drafts the user stashes for later.
 */

import { Context, Effect, Option, Schema, type Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  type EntryDraft,
  ImageMediaType,
  InvalidEntry,
  Registry,
  SessionId,
  SessionNotFound,
  Slot,
  StoreError,
} from "@liminal/sdk";

/**
 * How input sent while a turn runs joins it: a steer before the turn's next model call, a follow-up
 * once the turn would end. Input sent while no turn runs starts one.
 */
export const SendMode = Schema.Literals(["steer", "follow-up"]);

export type SendMode = typeof SendMode.Type;

/** A session's input waiting for its running turn, oldest first; kept in memory only. */
export const Queued = Schema.Struct({
  steers: Schema.Array(Schema.String),
  followUps: Schema.Array(Schema.String),
});

export type Queued = typeof Queued.Type;

/** A picture the user added to the input, shown in its text as `[Image N]`. */
export const Picture = Schema.Struct({ data: Schema.Uint8Array, mediaType: ImageMediaType });

export type Picture = typeof Picture.Type;

/** What the user sends: the text, and the pictures its `[Image N]` chips name, in order. */
export const UserInput = Schema.Struct({ text: Schema.String, pictures: Schema.Array(Picture) });

export type UserInput = typeof UserInput.Type;

/** No turn can start: its settings are missing or invalid. */
export class NoTurnSettings extends Schema.TaggedError<
  NoTurnSettings,
  { readonly brand: unique symbol }
>()("NoTurnSettings", { message: Schema.String }) {}

/** A picture or a tag's attachment could not be saved. */
export class AttachFailed extends Schema.TaggedError<
  AttachFailed,
  { readonly brand: unique symbol }
>()("AttachFailed", { message: Schema.String }) {}

export const SendError = Schema.Union([
  NoTurnSettings,
  AttachFailed,
  SessionNotFound,
  InvalidEntry,
  StoreError,
]);

export type SendError = typeof SendError.Type;

/** What an `@` tag names; each kind has its own icon in the list. */
export const TagKind = Schema.Literals(["file", "folder", "reference", "image"]);

export type TagKind = typeof TagKind.Type;

/**
 * A row of the `@` list. `path` is what the query matches and the list shows, such as
 * `opencode/src/`; `tag` is what the input gets after `@`. A folder's path ends in `/`.
 */
export const TagRow = Schema.Struct({
  kind: TagKind,
  path: Schema.String,
  tag: Schema.String,
  /** Said on the right, such as a picture's size. */
  note: Schema.optionalKey(Schema.String),
});

export type TagRow = typeof TagRow.Type;

/** Text a tag adds to the message, such as a folder's listing. */
export const TagText = Schema.TaggedStruct("TagText", { text: Schema.String });

/** A picture a tag adds to the message. */
export const TagImage = Schema.TaggedStruct("TagImage", {
  data: Schema.Uint8Array,
  mediaType: ImageMediaType,
});

export const TagAttachment = Schema.Union([TagText, TagImage]);

export type TagAttachment = typeof TagAttachment.Type;

/** One kind of thing an `@` can tag, such as workspace files or references. */
export interface TagSource {
  /** Its rows matching `query`, the text after `@`, best first. */
  readonly find: (query: string) => Effect.Effect<ReadonlyArray<TagRow>>;
  /** What tag `tag` (the text after `@`) adds to a message; none when this source does not know it. */
  readonly attach: (tag: string) => Effect.Effect<Option.Option<TagAttachment>, AttachFailed>;
}

/**
 * The tag sources by order: the `@` list shows their rows in it, and the first to attach a tag
 * wins.
 */
export class TagSources extends Registry.Service<TagSources, TagSource>()(
  "liminal/inbox/TagSources",
) {}

/** Registers a plugin's tag source when the inbox is loaded. */
export const offerTagSource = (source: TagSource, order: number) =>
  Effect.flatMap(
    Effect.serviceOption(TagSources),
    Option.match({
      onNone: () => Effect.void,
      onSome: (sources) => sources.register(source, { order }),
    }),
  );

/** The most rows one query of a tag source gives. */
const ROWS = 12;

/** Each path and every folder above it, folders ending in `/`. */
export const withFolders = (files: ReadonlyArray<string>) => {
  const folders = new Set<string>();

  for (const file of files) {
    for (let slash = file.indexOf("/"); slash !== -1; slash = file.indexOf("/", slash + 1))
      folders.add(file.slice(0, slash + 1));
  }

  return [...folders, ...files];
};

/**
 * How many separate stretches of `text` hold `query`'s characters in order, ignoring case; fewer
 * reads as a closer match. None when `text` does not hold them all.
 */
const runsOf = (query: string, text: string) => {
  const lower = text.toLowerCase();
  let from = 0;
  let runs = 0;

  for (const char of query.toLowerCase()) {
    const found = lower.indexOf(char, from);
    if (found === -1) return Option.none<number>();
    if (found !== from || from === 0) runs += 1;
    from = found + 1;
  }

  return Option.some(runs);
};

/** The paths matching `query`, closest first, then shortest. */
export const ranked = (paths: ReadonlyArray<string>, query: string) =>
  paths
    .flatMap((candidate) =>
      Option.match(runsOf(query, candidate), {
        onNone: () => [],
        onSome: (runs) => [{ candidate, runs }],
      }),
    )
    .toSorted((a, b) => a.runs - b.runs || a.candidate.length - b.candidate.length)
    .slice(0, ROWS)
    .map((found) => found.candidate);

/** `@` then a quoted path, closed or not yet, or a path without spaces, up to the cursor. */
const TAG_BEFORE_CURSOR = /(?:^|\s)@("[^"\n]*|[^\s"]*)$/;

/** The rest of a quoted tag after the cursor, and of a tag without quotes. */
const QUOTED_REST = /^[^"\n]*"?/;
const PLAIN_REST = /^\S*/;

/** `@` then a quoted path or a path without spaces; a tag starts the text or follows a space. */
const TAG_PATH = /(?<=^|\s)@(?:"([^"\n]*)"|([^\s"]+))/g;

/** The tag at the cursor: where it is in the text, and the path typed after `@`. */
export interface TagAt {
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

/** The tag the cursor is in, if any; `me@example.com` holds none. */
export const tagAt = (text: string, cursor: number): TagAt | undefined => {
  const before = TAG_BEFORE_CURSOR.exec(text.slice(0, cursor));
  if (before === null) return undefined;
  const typed = before[1] ?? "";
  const isQuoted = typed.startsWith('"');
  const rest = (isQuoted ? QUOTED_REST : PLAIN_REST).exec(text.slice(cursor))?.[0] ?? "";
  const whole = typed + rest;

  return {
    start: cursor - typed.length - 1,
    end: cursor + rest.length,
    query: isQuoted ? whole.slice(1).replace(/"$/, "") : whole,
  };
};

/** `@src/a.ts`, or `@"docs/my notes.md"` for a path with spaces. */
export const tagText = (path: string) => (/\s/.test(path) ? `@"${path}"` : `@${path}`);

/** The path of each tag in `text`, once each, in order. */
export const tagPaths = (text: string) => [
  ...new Set([...text.matchAll(TAG_PATH)].map((match) => match[1] ?? match[2] ?? "")),
];

/** A stashed draft; `id` names it for `inbox/unstash`. */
export const Stash = Schema.Struct({
  id: Schema.Int,
  text: Schema.String,
  createdAt: Schema.DateTimeUtc,
});

export type Stash = typeof Stash.Type;

/** `stashes.db` could not be read or written. */
export class StashesError extends Schema.TaggedError<
  StashesError,
  { readonly brand: unique symbol }
>()("StashesError", { message: Schema.String }) {}

/** `duplicate`: this folder already holds the same text. */
export const Stashed = Schema.Literals(["stashed", "duplicate"]);

export type Stashed = typeof Stashed.Type;

export class Inbox extends Context.Service<
  Inbox,
  {
    /**
     * Starts a turn on `input` when none runs, with any input still queued saved before it;
     * otherwise queues it by `mode`. Its pictures and tags' attachments are saved first.
     */
    readonly send: (
      session: SessionId,
      input: UserInput,
      mode: SendMode,
    ) => Effect.Effect<void, SendError>;
    /**
     * As `send`, for a message another plugin drafted, such as `/qna`'s request; `text` is what the
     * queue shows while it waits.
     */
    readonly sendDraft: (
      session: SessionId,
      message: { readonly text: string; readonly draft: EntryDraft },
      mode: SendMode,
    ) => Effect.Effect<void, SendError>;
    /** The session's queue now, then after each change. */
    readonly queue: (session: SessionId) => Stream.Stream<Queued>;
  }
>()("liminal/inbox/Inbox") {}

export class InboxRpcs extends RpcGroup.make(
  Rpc.make("inbox/send", {
    payload: { session: SessionId, input: UserInput, mode: SendMode },
    error: SendError,
  }),
  Rpc.make("inbox/queue", { payload: { session: SessionId }, success: Queued, stream: true }),
  Rpc.make("inbox/tags", { payload: { query: Schema.String }, success: Schema.Array(TagRow) }),
  Rpc.make("inbox/stash", {
    payload: { text: Schema.String },
    success: Stashed,
    error: StashesError,
  }),
  Rpc.make("inbox/stashes", { success: Schema.Array(Stash), error: StashesError }),
  Rpc.make("inbox/unstash", { payload: { id: Schema.Int }, error: StashesError }),
) {}

/** The props of what the composer shows in place of its draft. */
export interface InputProps {
  readonly running: boolean;
}

/** The slots inbox's composer draws. */
export const InboxSlots = {
  /**
   * What the composer shows in place of its draft, above the model line, such as a form of
   * questions; the first registration whose `select` matches takes it, else the draft shows.
   */
  input: Slot.chain<InputProps, true, "session">("inbox/input", { scope: "session" }),
};
