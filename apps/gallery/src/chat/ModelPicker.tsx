/**
 * The model picker, opened by `/model`: a dialog titled Models with a filter line and each
 * provider's models in its own section, every model's name then its id. Favorite models sit in a
 * Favorites section above the providers', each with its provider's name before its id; ctrl+f moves
 * the highlighted model in or out. The default model for new sessions carries a faint `default` at
 * the right; ctrl+d sets it. The current model is highlighted when it opens. Only signed-in
 * providers are listed; one whose list failed shows the failure in one row. Picking a model that
 * offers thinking options opens a second dialog, titled with the model's name, listing that model's
 * own options with the saved one highlighted.
 */

import { For, Show } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";
import { FilterLine, NamedRow } from "./PickerRows.tsx";
import { Section } from "./Section.tsx";

type Model = { readonly id: string; readonly name: string; readonly detail?: string };

/** A provider and its models, or the failure that kept it from listing any. */
type Provider = {
  readonly name: string;
  readonly models: readonly Model[];
  readonly failure?: { readonly id: string; readonly text: string };
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

/** The ids of the models the sample marks as favorites. */
const FAVORITE_IDS: ReadonlySet<string> = new Set(["gpt-5.5", "claude-sonnet-4-6"]);

/** The favorite models as a section, each detailed with its provider's name. */
const FAVORITES: Provider = {
  name: "Favorites",
  models: PROVIDERS.flatMap((provider) =>
    provider.models.flatMap((model) =>
      FAVORITE_IDS.has(model.id)
        ? [{ id: model.id, name: model.name, detail: `${provider.name} · ${model.id}` }]
        : [],
    ),
  ),
};

/** The providers without the models that moved to Favorites. */
const REST: readonly Provider[] = PROVIDERS.map((provider) => ({
  name: provider.name,
  models: provider.models.filter((model) => !FAVORITE_IDS.has(model.id)),
}));

/** A signed-in provider whose list failed, shown under the ones that list. */
const FAILED: Provider = {
  name: "OpenRouter",
  models: [],
  failure: { id: "failure:openrouter", text: "models.dev is unreachable and no copy is saved" },
};

/** Why a signed-in provider lists nothing, in the warning color. */
function FailureRow(props: {
  readonly color: RoleColor;
  readonly failure: NonNullable<Provider["failure"]>;
  readonly isSelected: boolean;
}) {
  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <text flexGrow={1} wrapMode="none" fg={props.color("feedback.warning")}>
        {props.failure.text}
      </text>
    </ListRow>
  );
}

const HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "select"],
];

const MODEL_HINTS: readonly Hint[] = [...HINTS, ["ctrl+f", "favorite"], ["ctrl+d", "default"]];

/** The id of the model the sample sets as the default. */
const DEFAULT_ID = "gpt-5.5";

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
  readonly hasFailure: boolean;
}) {
  const providers = () => [FAVORITES, ...REST, ...(props.hasFailure ? [FAILED] : [])];

  return (
    <Dialog color={props.color} title="Models" hints={MODEL_HINTS}>
      <FilterLine color={props.color} />
      <box flexDirection="column" gap={1}>
        <For each={providers()}>
          {(provider) => (
            <box flexDirection="column">
              <Section color={props.color} title={provider.name} />
              <For each={provider.models}>
                {(model) => (
                  <NamedRow
                    color={props.color}
                    name={model.name}
                    detail={model.detail ?? model.id}
                    tag={model.id === DEFAULT_ID ? "default" : undefined}
                    isSelected={model.id === props.selected}
                  />
                )}
              </For>
              <Show when={provider.failure}>
                {(failure) => (
                  <FailureRow
                    color={props.color}
                    failure={failure()}
                    isSelected={failure().id === props.selected}
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
