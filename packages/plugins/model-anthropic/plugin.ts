/**
 * Model-anthropic: registers providers `anthropic` (Claude subscription) and `anthropic-api` (API
 * key), both on Anthropic's Messages API, and their logins.
 */

import { CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethods } from "@liminal/logins/contract";
import { ModelProviders } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";

export default definePlugin({
  name: "model-anthropic",
  provides: [],
  requires: [ModelProviders, CredentialStore, LoginMethods],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
