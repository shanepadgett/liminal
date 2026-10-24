/** Skills: what the `$` list shows, and the skills a draft names. */
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/** A skill as the `$` list shows it. */
export const SkillSummary = Schema.Struct({ name: Schema.String, description: Schema.String });

export type SkillSummary = typeof SkillSummary.Type;

/** What screens call. */
export class SkillsRpc extends RpcGroup.make(
  Rpc.make("skills/list", { success: Schema.Array(SkillSummary) }),
) {}

/** `$name` where a word starts; a trailing `.` ends the sentence, as in `use $review.` */
const SKILL = /(?:^|\s)\$([\w-]+(?:\.[\w-]+)*)/g;

/** The distinct skill names written in `text`, in order. */
export const skillsIn = (text: string): ReadonlyArray<string> => [
  ...new Set([...text.matchAll(SKILL)].flatMap(([, name]) => (name === undefined ? [] : [name]))),
];
