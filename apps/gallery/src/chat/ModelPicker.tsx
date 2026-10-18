/**
 * The model picker, opened by `/model`: a dialog titled Models with a filter line and each
 * provider's models in its own section, every model's name then its id. The current model is
 * highlighted when it opens.
 */

import { For } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";
import { Section } from "./Section.tsx";

type Model = { readonly id: string; readonly name: string };

type Provider = { readonly name: string; readonly models: readonly Model[] };

const PROVIDERS: readonly Provider[] = [
  {
    name: "Codex",
    models: [
      { id: "gpt-5.5", name: "GPT-5.5" },
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-5.4-mini", name: "GPT-5.4 mini" },
    ],
  },
  {
    name: "Anthropic",
    models: [
      { id: "claude-opus-4-7", name: "Claude Opus 4.7" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    ],
  },
];

const HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "select"],
];

function ModelRow(props: {
  readonly color: RoleColor;
  readonly model: Model;
  readonly isSelected: boolean;
}) {
  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <box flexDirection="row" gap={2} flexGrow={1}>
        <text
          flexShrink={0}
          wrapMode="none"
          fg={props.color(props.isSelected ? "text.base" : "text.muted")}
        >
          {props.model.name}
        </text>
        <text
          flexGrow={1}
          wrapMode="none"
          fg={props.color(props.isSelected ? "text.muted" : "text.faint")}
        >
          {props.model.id}
        </text>
      </box>
    </ListRow>
  );
}

export function ModelPicker(props: { readonly color: RoleColor; readonly selected: string }) {
  return (
    <Dialog color={props.color} title="Models" hints={HINTS}>
      <text flexShrink={0}>
        <span style={{ fg: props.color("text.accent") }}>{"› "}</span>
        <span style={{ fg: props.color("text.ghost") }}>Type to filter</span>
      </text>
      <box flexDirection="column" gap={1}>
        <For each={PROVIDERS}>
          {(provider) => (
            <box flexDirection="column">
              <Section color={props.color} title={provider.name} />
              <For each={provider.models}>
                {(model) => (
                  <ModelRow
                    color={props.color}
                    model={model}
                    isSelected={model.id === props.selected}
                  />
                )}
              </For>
            </box>
          )}
        </For>
      </box>
    </Dialog>
  );
}
