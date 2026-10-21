/** Model-codex: registers provider `codex`, the ChatGPT plan's Codex backend, and its login. */

import { CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethods } from "@liminal/logins/contract";
import { ModelProviders } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";

export default definePlugin({
  name: "model-codex",
  provides: [],
  requires: [ModelProviders, CredentialStore, LoginMethods],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
