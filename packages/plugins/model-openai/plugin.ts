/**
 * Model-openai: registers providers `openai` (API key) and `chatgpt` (Sign in with ChatGPT), both
 * on the OpenAI API, and their logins.
 */

import { CredentialStore } from "@liminal/credential-store/contract";
import { DecisionModels } from "@liminal/decisions/contract";
import { LoginMethods } from "@liminal/logins/contract";
import { ModelProviders } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";

export default definePlugin({
  name: "model-openai",
  provides: [],
  requires: [ModelProviders, CredentialStore, LoginMethods],
  uses: [DecisionModels],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
