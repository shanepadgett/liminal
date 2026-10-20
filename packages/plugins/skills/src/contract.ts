/**
 * Skills: invoking a skill by name and managing physical folders and symlinks independently of
 * which same-name skill takes precedence.
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { SendError } from "@liminal/inbox/contract";
import { SessionId } from "@liminal/sdk";

/** A skill as its command shows it. */
export const SkillSummary = Schema.Struct({ name: Schema.String, description: Schema.String });

export type SkillSummary = typeof SkillSummary.Type;

/** No skill has this name now. */
export class UnknownSkill extends Schema.TaggedError<
  UnknownSkill,
  { readonly brand: unique symbol }
>()("UnknownSkill", { skill: Schema.String }) {}

/** The physical entry, independently of invocation precedence. */
export const FolderLocation = Schema.TaggedStruct("Folder", {});

export const SymlinkLocation = Schema.TaggedStruct("Symlink", { target: Schema.String });

export const MissingTargetLocation = Schema.TaggedStruct("MissingTarget", {
  target: Schema.String,
});

export const SkillLocation = Schema.Union([FolderLocation, SymlinkLocation, MissingTargetLocation]);

export const ManagedSkill = Schema.Struct({
  id: Schema.String,
  revision: Schema.String,
  name: Schema.String,
  path: Schema.String,
  description: Schema.String,
  location: SkillLocation,
});

export type ManagedSkill = typeof ManagedSkill.Type;

export const SkillFolder = Schema.Struct({
  path: Schema.String,
  isGlobal: Schema.Boolean,
  entries: Schema.Array(ManagedSkill),
  problem: Schema.NullOr(Schema.String),
});

export type SkillFolder = typeof SkillFolder.Type;

export const DeleteSkillRequest = Schema.Struct({
  id: Schema.String,
  revision: Schema.String,
  mode: Schema.Literals(["folder", "symlink-only", "symlink-and-target"]),
});

export type DeleteSkillRequest = typeof DeleteSkillRequest.Type;

/** A stale selection, unsafe deletion, filesystem failure or partially completed deletion. */
export class SkillManagementFailed extends Schema.TaggedError<
  SkillManagementFailed,
  { readonly brand: unique symbol }
>()("SkillManagementFailed", {
  path: Schema.String,
  reason: Schema.Literals(["changed", "forbidden", "io", "partial"]),
  message: Schema.String,
}) {}

/** Skills' commands for frontends. */
export class SkillsRpcs extends RpcGroup.make(
  Rpc.make("skills/inventory", {
    success: Schema.Array(SkillFolder),
    error: SkillManagementFailed,
  }),
  Rpc.make("skills/delete", { payload: DeleteSkillRequest, error: SkillManagementFailed }),
  /** Every skill found now, the user-only ones included, by name. */
  Rpc.make("skills/list", { success: Schema.Array(SkillSummary) }),
  /** Sends the skill to the session as the user's message, with `args` after it. */
  Rpc.make("skills/use", {
    payload: { session: SessionId, name: Schema.String, args: Schema.String },
    error: Schema.Union([UnknownSkill, SendError]),
  }),
) {}
