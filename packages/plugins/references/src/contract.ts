/**
 * References: read-only git clones of other repositories in `<data>/references`, which a session
 * attaches so the model reads them.
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { defineEntry, InvalidEntry, SessionId, SessionNotFound, StoreError } from "@liminal/sdk";

/**
 * A clone: its folder name, the branch it has checked out (a short hash on a detached head), and a
 * one-line description, GitHub's or the README's first line.
 */
export const Reference = Schema.Struct({
  name: Schema.String,
  branch: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
});

export type Reference = typeof Reference.Type;

/**
 * The folder name of a clone of `url`: `https://github.com/owner/repo.git` and
 * `git@github.com:owner/repo` both give `repo`; empty when the URL names nothing.
 */
export const referenceNameOf = (url: string) =>
  (
    url
      .trim()
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .replace(/\.git$/i, "")
      .split(/[/:]/)
      .at(-1) ?? ""
  )
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "");

/** A step of `git clone`, such as `receiving` at 37%. */
export const CloneProgress = Schema.TaggedStruct("CloneProgress", {
  phase: Schema.Literals(["receiving", "resolving", "updating"]),
  percent: Schema.Int,
});

export type CloneProgress = typeof CloneProgress.Type;

/** The finished clone. */
export const Cloned = Schema.TaggedStruct("Cloned", { reference: Reference });

/** What `references/clone` streams: progress, then the clone. */
export const CloneEvent = Schema.Union([CloneProgress, Cloned]);

export type CloneEvent = typeof CloneEvent.Type;

/** A git command or file change on a reference failed; `message` is git's line saying why. */
export class ReferenceFailed extends Schema.TaggedError<
  ReferenceFailed,
  { readonly brand: unique symbol }
>()("ReferenceFailed", { reference: Schema.String, message: Schema.String }) {}

/** The references a session has attached; the newest entry holds them all. */
export const AttachedEntry = defineEntry({
  kind: "references/attached",
  data: Schema.Struct({ names: Schema.Array(Schema.String) }),
  model: false,
  user: "hidden",
});

const AttachError = Schema.Union([SessionNotFound, InvalidEntry, StoreError]);

const name = { name: Schema.String };

/** References' commands for frontends. */
export class ReferencesRpcs extends RpcGroup.make(
  /** The clones by name. */
  Rpc.make("references/list", { success: Schema.Array(Reference) }),
  /** The names the session has attached, then each change. */
  Rpc.make("references/attached", {
    payload: { session: SessionId },
    success: Schema.Array(Schema.String),
    stream: true,
  }),
  /** Saves `names` as the session's attached references, creating the session if it is new. */
  Rpc.make("references/attach", {
    payload: { session: SessionId, names: Schema.Array(Schema.String) },
    error: AttachError,
  }),
  /** Clones `url` into a folder named after it. */
  Rpc.make("references/clone", {
    payload: { url: Schema.String },
    success: CloneEvent,
    error: ReferenceFailed,
    stream: true,
  }),
  /** Pulls new commits of the clone's branch; fails when that is not a fast-forward. */
  Rpc.make("references/pull", { payload: name, error: ReferenceFailed }),
  /** The branches the clone and its remote have. */
  Rpc.make("references/branches", {
    payload: name,
    success: Schema.Array(Schema.String),
    error: ReferenceFailed,
  }),
  Rpc.make("references/switch", {
    payload: { ...name, branch: Schema.String },
    success: Reference,
    error: ReferenceFailed,
  }),
  /** Deletes the clone from disk. */
  Rpc.make("references/remove", { payload: name, error: ReferenceFailed }),
  /** Opens the clone in `$VISUAL`, `$EDITOR` or `code`, without waiting for it. */
  Rpc.make("references/open", { payload: name, error: ReferenceFailed }),
) {}
