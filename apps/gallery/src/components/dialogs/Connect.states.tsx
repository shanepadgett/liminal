import type { State } from "../../entries.ts";
import { ConnectBrowser, ConnectKey } from "./Connect.tsx";
import { Picker, PICKER_HINTS, type PickerRow } from "./Picker.tsx";

const PROVIDERS: readonly PickerRow[] = [
  { id: "anthropic", title: "Anthropic", detail: "signed in" },
  { id: "codex", title: "Codex" },
  { id: "openai", title: "OpenAI", detail: "API key" },
  { id: "openrouter", title: "OpenRouter", detail: "API key" },
  { id: "opencode-go", title: "OpenCode Go", detail: "API key" },
];

const METHODS: readonly PickerRow[] = [
  { id: "subscription", title: "Claude Pro or Max", detail: "browser" },
  { id: "key", title: "API key", detail: "paste" },
  { id: "command", title: "Command", detail: "runs a command for the key" },
];

const picker = (title: string, rows: readonly PickerRow[], selected: string) => () => (
  <Picker
    title={title}
    placeholder="Search"
    empty=""
    rows={rows}
    query=""
    selected={selected}
    hints={PICKER_HINTS}
  />
);

const OPENROUTER_KEYS = "openrouter.ai/settings/keys";

export const connectStates: readonly [State, ...State[]] = [
  { name: "Providers", fill: "center", view: picker("Connect", PROVIDERS, "openrouter") },
  { name: "Methods", fill: "center", view: picker("Connect Anthropic", METHODS, "subscription") },
  {
    name: "API key",
    fill: "center",
    view: () => (
      <ConnectKey provider="OpenRouter" where={OPENROUTER_KEYS} apiKey="sk-or-v1-3f9a2c7d" />
    ),
  },
  {
    name: "API key refused",
    fill: "center",
    view: () => (
      <ConnectKey
        provider="OpenRouter"
        where={OPENROUTER_KEYS}
        apiKey="sk-or-v1-3f9a2c7d"
        error="OpenRouter refused that key (401)."
      />
    ),
  },
  {
    name: "Browser",
    fill: "center",
    view: () => (
      <ConnectBrowser provider="Anthropic" url="https://claude.ai/oauth/authorize?code=true" />
    ),
  },
  {
    name: "Device code",
    fill: "center",
    view: () => (
      <ConnectBrowser
        provider="Codex"
        url="https://auth.openai.com/codex/device"
        code="K7QF-2MXP"
      />
    ),
  },
];
