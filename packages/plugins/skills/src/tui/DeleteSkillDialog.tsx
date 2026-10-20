/** Cancel-first deletion choices; the exact selected snapshot stays fixed during the request. */

import { useBindings } from "@opentui/keymap/solid";
import { Predicate } from "effect";
import { createSignal, For, Show } from "solid-js";

import {
  DialogFrame,
  type DialogProps,
  enterKeys,
  ListRow,
  moveKeys,
  useColor,
} from "@liminal/sdk/tui";

import type { DeleteSkillRequest, ManagedSkill } from "../contract.ts";
import { SkillDetails } from "./details.tsx";

type Choice = { readonly title: string; readonly mode: DeleteSkillRequest["mode"] | "cancel" };

const choicesOf = (skill: ManagedSkill): ReadonlyArray<Choice> => [
  { title: "Cancel", mode: "cancel" },
  Predicate.isTagged(skill.location, "Folder")
    ? { title: "Delete skill folder", mode: "folder" }
    : { title: "Delete symlink only", mode: "symlink-only" },
  ...(Predicate.isTagged(skill.location, "Symlink")
    ? [{ title: "Delete symlink and target", mode: "symlink-and-target" } satisfies Choice]
    : []),
];

const warningOf = (skill: ManagedSkill) => {
  if (Predicate.isTagged(skill.location, "Folder"))
    return "Permanently delete this skill folder and every file inside it. This cannot be undone.";

  if (Predicate.isTagged(skill.location, "MissingTarget"))
    return "Delete this symlink. Its target is already missing.";

  return "Delete symlink only keeps the target. Deleting the target permanently deletes its folder and every file inside it. This cannot be undone.";
};

function DeleteDetails(props: { readonly skill: ManagedSkill; readonly isGlobal: boolean }) {
  const color = useColor();

  return (
    <box flexDirection="column" gap={1}>
      <text fg={color("text.muted")}>{props.skill.path}</text>
      <SkillDetails skill={props.skill} />
      <text
        fg={color(
          Predicate.isTagged(props.skill.location, "Folder") ? "feedback.warning" : "text.base",
        )}
      >
        {warningOf(props.skill)}
      </text>
      <Show when={props.isGlobal}>
        <text fg={color("feedback.warning")}>
          This is a global skill. Removing it affects every project that uses this path.
        </text>
      </Show>
    </box>
  );
}

export function DeleteSkillDialog(
  props: DialogProps & {
    readonly skill: ManagedSkill;
    readonly isGlobal: boolean;
    readonly isWorking: boolean;
    readonly remove: (mode: DeleteSkillRequest["mode"]) => void;
  },
) {
  const color = useColor();

  const [selected, setSelected] = createSignal(0);

  const choices = choicesOf(props.skill);

  const close = () => {
    if (!props.isWorking) props.close();
  };

  const moves = moveKeys("skills.delete", {
    count: () => (props.isWorking ? 0 : choices.length),
    select: setSelected,
  });

  const confirm = () => {
    if (props.isWorking) return;

    const choice = choices[selected()];

    if (choice?.mode === "cancel") close();
    else if (choice) props.remove(choice.mode);
  };

  useBindings(() => ({
    commands: [...moves.commands, { name: "skills.delete.confirm", run: confirm }],
    bindings: [...moves.bindings, ...enterKeys("skills.delete.confirm")],
  }));

  return (
    <DialogFrame
      title={
        Predicate.isTagged(props.skill.location, "Folder") ? "Delete skill?" : "Delete symlink?"
      }
      width={76}
      close={close}
      isWorking={props.isWorking}
      hints={[
        ["↑↓", "choose"],
        ["enter", "confirm"],
        ["esc", "cancel"],
      ]}
    >
      <DeleteDetails skill={props.skill} isGlobal={props.isGlobal} />
      <box flexDirection="column">
        <For each={choices}>
          {(choice, index) => (
            <ListRow color={color} isSelected={index() === selected()}>
              <text fg={color(choice.mode === "cancel" ? "text.base" : "feedback.danger")}>
                {choice.title}
              </text>
            </ListRow>
          )}
        </For>
      </box>
      <Show when={props.isWorking}>
        <text fg={color("text.muted")}>Deleting…</text>
      </Show>
    </DialogFrame>
  );
}
