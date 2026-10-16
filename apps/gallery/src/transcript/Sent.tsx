/**
 * What the user sent to start a turn: their prompt, or their answers to the assistant's form. A
 * long prompt opens and closes on a click; whoever draws it holds whether it is open, so a pinned
 * copy opens with it. Pinned, a band of answers folds to its title line until opened, so it never
 * covers the reply under it.
 */

import { Show } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { Answers } from "./Answers.tsx";
import type { Prompt } from "./script.ts";
import { UserPrompt } from "./UserPrompt.tsx";

export function Sent(props: {
  readonly color: RoleColor;
  readonly prompt: Prompt;
  readonly isOpen: boolean;
  readonly isPinned: boolean;
  readonly onToggle: () => void;
}) {
  const text = () => (props.prompt.kind === "text" ? props.prompt : undefined);
  const answers = () => (props.prompt.kind === "answers" ? props.prompt : undefined);

  return (
    <>
      <Show when={text()}>
        {(sent) => (
          <UserPrompt
            color={props.color}
            text={sent().text}
            isExpanded={props.isOpen}
            onToggle={props.onToggle}
          />
        )}
      </Show>
      <Show when={answers()}>
        {(sent) => (
          <Answers
            color={props.color}
            title={sent().title}
            answered={sent().answered}
            context={sent().context}
            isFolded={props.isPinned && !props.isOpen}
            onToggle={() => {
              if (props.isPinned) props.onToggle();
            }}
          />
        )}
      </Show>
    </>
  );
}
