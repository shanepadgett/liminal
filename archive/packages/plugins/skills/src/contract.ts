/**
 * Skills: what the TUI lists as `/<name>` commands, and starting a skill in a session with the text
 * typed after its name.
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

/** Skills' commands for frontends. */
export class SkillsRpcs extends RpcGroup.make(
  /** Every skill found now, the user-only ones included, by name. */
  Rpc.make("skills/list", { success: Schema.Array(SkillSummary) }),
  /** Sends the skill to the session as the user's message, with `args` after it. */
  Rpc.make("skills/use", {
    payload: { session: SessionId, name: Schema.String, args: Schema.String },
    error: Schema.Union([UnknownSkill, SendError]),
  }),
) {}
