/** Selected-skill details shared by browsing and deletion confirmation. */

import { Predicate } from "effect";
import { Show } from "solid-js";

import { useColor } from "@liminal/sdk/tui";

import type { ManagedSkill } from "../contract.ts";

export function SkillTarget(props: { readonly skill: ManagedSkill }) {
  const color = useColor();

  const target = () => {
    const location = props.skill.location;

    return Predicate.isTagged(location, "Symlink") || Predicate.isTagged(location, "MissingTarget")
      ? location.target
      : null;
  };

  return (
    <box flexDirection="column">
      <Show when={target()}>
        {(path) => (
          <text
            fg={color(
              Predicate.isTagged(props.skill.location, "MissingTarget")
                ? "feedback.warning"
                : "text.muted",
            )}
          >{`→ ${path()}`}</text>
        )}
      </Show>
    </box>
  );
}

export function SkillDetails(props: { readonly skill: ManagedSkill }) {
  const color = useColor();

  return (
    <box flexDirection="column">
      <text fg={color("text.base")}>{props.skill.description}</text>
      <SkillTarget skill={props.skill} />
    </box>
  );
}

export const locationLabel = (skill: ManagedSkill) => {
  if (Predicate.isTagged(skill.location, "Folder")) return "";

  return Predicate.isTagged(skill.location, "MissingTarget")
    ? "Symlink · target missing"
    : "Symlink";
};
