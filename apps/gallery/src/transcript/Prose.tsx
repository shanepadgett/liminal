/**
 * The assistant's words, no chrome. The answer is in the base color; what it says between actions
 * is muted, so narration never reads as the answer.
 */

import type { RoleColor, RoleName } from "../tokens/roles.ts";

export function Prose(props: {
  readonly color: RoleColor;
  readonly role: RoleName;
  readonly children: string;
}) {
  return <text fg={props.color(props.role)}>{props.children}</text>;
}
