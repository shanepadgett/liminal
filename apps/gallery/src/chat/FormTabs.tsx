/**
 * The form's tabs: a number per question, ticked once answered, then additional context. The tab in
 * view sits on the selected surface; unanswered ones are faint, so what is left stands out.
 */

import { Index } from "solid-js";

import type { RoleColor, RoleName } from "../tokens/roles.ts";
import { type FormState, isAnswered } from "./formState.ts";

type TabLabel = { readonly text: string; readonly isDone: boolean };

const labelsOf = (form: FormState): readonly TabLabel[] => [
  ...form.drafts.map((draft, index) => ({ text: `${index + 1}`, isDone: isAnswered(draft) })),
  { text: "context", isDone: form.context.trim() !== "" },
];

const roleOf = (label: TabLabel, isCurrent: boolean): RoleName => {
  if (isCurrent) return "text.heading";

  return label.isDone ? "text.muted" : "text.faint";
};

export function FormTabs(props: { readonly color: RoleColor; readonly form: FormState }) {
  return (
    <box flexDirection="row" height={1} marginX={-1}>
      <Index each={labelsOf(props.form)}>
        {(label, index) => {
          const isCurrent = () => index === props.form.tab;

          return (
            <text
              wrapMode="none"
              flexShrink={0}
              bg={isCurrent() ? props.color("surface.selected") : "transparent"}
            >
              <span style={{ fg: props.color(roleOf(label(), isCurrent())) }}>
                {` ${label().text}`}
              </span>
              <span style={{ fg: props.color("feedback.success") }}>
                {label().isDone ? " ✓" : ""}
              </span>
              <span> </span>
            </text>
          );
        }}
      </Index>
    </box>
  );
}
