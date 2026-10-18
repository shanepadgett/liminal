/**
 * The model picker, opened by `/model`: a dialog titled Models with a filter line and each
 * provider's models in its own section, every model's name then its id. The current model is
 * highlighted when it opens. A provider that lists nothing shows why in one row: a sign-in row that
 * opens /connect, or the catalog's failure. Picking a model that offers thinking options opens a
 * second dialog, titled with the model's name, listing that model's own options with the saved one
 * highlighted.
 */

import { For, Show } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";
import { Section } from "./Section.tsx";

type Model = { readonly id: string; readonly name: string };

/** A provider and its models, or why it lists none: it needs a sign-in, or its catalog failed. */
type Provider = {
  readonly name: string;
  readonly models: readonly Model[];
  readonly notice?: { readonly id: string; readonly text: string; readonly isSignIn: boolean };
};

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

/** Providers that list nothing, shown under the ones that list. */
const UNLISTED: readonly Provider[] = [
  {
    name: "OpenAI",
    models: [],
    notice: { id: "sign-in:openai", text: "Sign in with /connect", isSignIn: true },
  },
  {
    name: "OpenRouter",
    models: [],
    notice: {
      id: "catalog:openrouter",
      text: "models.dev is unreachable and no copy is saved",
      isSignIn: false,
    },
  },
];

/** Why a provider lists nothing; a sign-in row can be picked to open /connect. */
function NoticeRow(props: {
  readonly color: RoleColor;
  readonly notice: NonNullable<Provider["notice"]>;
  readonly isSelected: boolean;
}) {
  const fg = () => {
    if (!props.notice.isSignIn) return props.color("feedback.warning");

    return props.color(props.isSelected ? "text.accent" : "text.muted");
  };

  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <text flexGrow={1} wrapMode="none" fg={fg()}>
        {props.notice.text}
      </text>
    </ListRow>
  );
}

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

/** The empty filter line at the top of a picker. */
function FilterLine(props: { readonly color: RoleColor }) {
  return (
    <text flexShrink={0}>
      <span style={{ fg: props.color("text.accent") }}>{"› "}</span>
      <span style={{ fg: props.color("text.ghost") }}>Type to filter</span>
    </text>
  );
}

/** A model's thinking options; a token budget shows its tokens in the label. */
const THINKING: readonly Model[] = [
  { id: "off", name: "off" },
  { id: "low", name: "low · 1,024 tokens" },
  { id: "medium", name: "medium · 32,000 tokens" },
  { id: "high", name: "high · 64,000 tokens" },
  { id: "max", name: "max · 127,999 tokens" },
];

export function ThinkingPicker(props: { readonly color: RoleColor; readonly selected: string }) {
  return (
    <Dialog color={props.color} title="Thinking · Claude Opus 4.7" hints={HINTS}>
      <FilterLine color={props.color} />
      <box flexDirection="column">
        <For each={THINKING}>
          {(option) => (
            <ListRow color={props.color} isSelected={option.id === props.selected}>
              <text
                flexGrow={1}
                wrapMode="none"
                fg={props.color(option.id === props.selected ? "text.base" : "text.muted")}
              >
                {option.name}
              </text>
            </ListRow>
          )}
        </For>
      </box>
    </Dialog>
  );
}

export function ModelPicker(props: {
  readonly color: RoleColor;
  readonly selected: string;
  readonly hasUnlisted: boolean;
}) {
  const providers = () => (props.hasUnlisted ? [...PROVIDERS, ...UNLISTED] : PROVIDERS);

  return (
    <Dialog color={props.color} title="Models" hints={HINTS}>
      <FilterLine color={props.color} />
      <box flexDirection="column" gap={1}>
        <For each={providers()}>
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
              <Show when={provider.notice}>
                {(notice) => (
                  <NoticeRow
                    color={props.color}
                    notice={notice()}
                    isSelected={notice().id === props.selected}
                  />
                )}
              </Show>
            </box>
          )}
        </For>
      </box>
    </Dialog>
  );
}
