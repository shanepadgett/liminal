/** The gallery states of the `/connect` dialogs, in the order a login meets them. */

import type { JSX } from "@opentui/solid";

import type { RoleColor } from "@liminal/sdk/tui";

import { withRoles } from "../entryViews.ts";
import type { EntryState } from "../shell/entries.ts";
import {
  LoginDialog,
  MethodList,
  PromptDialog,
  ProviderList,
  SignOutDialog,
  type Vendor,
  WayList,
} from "./Connect.tsx";

const state = (name: string, draw: (color: RoleColor) => JSX.Element): EntryState => ({
  name,
  fill: "screen",
  view: withRoles(draw),
});

const OPENAI: Vendor = {
  name: "OpenAI",
  ways: [
    { title: "Sign in with ChatGPT", state: "out" },
    { title: "ChatGPT plan (Codex)", state: "saved" },
    { title: "API key", state: "env:OPENAI_API_KEY" },
  ],
};

const VENDORS: readonly Vendor[] = [
  {
    name: "Anthropic",
    ways: [
      { title: "Claude subscription", state: "out" },
      { title: "API key", state: "out" },
    ],
  },
  OPENAI,
  { name: "OpenCode", ways: [{ title: "OpenCode Go", state: "out" }] },
  { name: "OpenRouter", ways: [{ title: "API key", state: "saved" }] },
];

const KEY_NOTE = "Saved in Liminal's credential store. OPENAI_API_KEY is used while none is saved.";

const AUTH_URL = "https://auth.openai.com/oauth/authorize?client_id=app_EMoamEEZ73f0CkXaXp7hrann";

export const CONNECT_STATES: readonly [EntryState, ...EntryState[]] = [
  state("Providers", (color) => <ProviderList color={color} vendors={VENDORS} selected="OpenAI" />),
  state("Ways", (color) => (
    <WayList color={color} vendor={OPENAI} selected="Sign in with ChatGPT" />
  )),
  state("Methods", (color) => (
    <MethodList
      color={color}
      title="ChatGPT plan (Codex)"
      methods={["Browser", "Device code"]}
      selected="Browser"
    />
  )),
  state("API key, empty", (color) => (
    <PromptDialog
      color={color}
      title="OpenAI"
      question="API key"
      text=""
      isSecret
      note={KEY_NOTE}
    />
  )),
  state("API key, typed", (color) => (
    <PromptDialog
      color={color}
      title="OpenAI"
      question="API key"
      text="sk-proj-4f9a2c"
      isSecret
      note={KEY_NOTE}
    />
  )),
  state("Browser", (color) => (
    <LoginDialog color={color} title="OpenAI" step={{ type: "open-url", url: AUTH_URL }} />
  )),
  state("Device code", (color) => (
    <LoginDialog
      color={color}
      title="OpenAI"
      step={{ type: "show-code", code: "QXJT-7KPD", url: "https://auth.openai.com/codex/device" }}
    />
  )),
  state("Failed", (color) => (
    <LoginDialog
      color={color}
      title="OpenAI"
      step={{ type: "failed", message: "The browser sign-in was denied: access_denied" }}
    />
  )),
  state("Sign out", (color) => (
    <SignOutDialog
      color={color}
      title="OpenRouter"
      question="Sign out of OpenRouter (API key)? The saved key is removed from Liminal."
    />
  )),
];
