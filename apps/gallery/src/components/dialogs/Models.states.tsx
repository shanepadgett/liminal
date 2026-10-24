import type { State } from "../../entries.ts";
import { Picker, PICKER_HINTS, type PickerRow } from "./Picker.tsx";

export const MODELS: readonly PickerRow[] = [
  {
    id: "anthropic/claude-opus-4.1",
    title: "claude-opus-4.1",
    detail: "200k",
    section: "Anthropic",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    title: "claude-sonnet-4.5",
    detail: "current",
    section: "Anthropic",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    title: "claude-haiku-4.5",
    detail: "200k",
    section: "Anthropic",
  },
  { id: "codex/gpt-5", title: "gpt-5", detail: "400k", section: "Codex" },
  { id: "codex/gpt-5-codex", title: "gpt-5-codex", detail: "400k", section: "Codex" },
  {
    id: "openrouter/qwen3-coder",
    title: "qwen/qwen3-coder",
    detail: "262k",
    section: "OpenRouter",
  },
  { id: "opencode-go/kimi-k2", title: "kimi-k2", detail: "262k", section: "OpenCode Go" },
];

const models = (query: string, selected: string) => () => (
  <Picker
    title="Model for main"
    placeholder="Search models"
    empty="No models. Connect a provider first."
    rows={MODELS}
    query={query}
    selected={selected}
    hints={[...PICKER_HINTS.slice(0, 2), { keys: "tab", label: "role" }, ...PICKER_HINTS.slice(2)]}
  />
);

export const modelsStates: readonly [State, ...State[]] = [
  { name: "Open", fill: "center", view: models("", "anthropic/claude-sonnet-4.5") },
  { name: "Filtered", fill: "center", view: models("gpt", "codex/gpt-5") },
];
