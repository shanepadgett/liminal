/** Model-codex: registers provider `codex`, the ChatGPT plan's Codex backend. */

import { CredentialStore } from "@liminal/credential-store/contract";
import { ModelProviders } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";

export default definePlugin({
  name: "model-codex",
  provides: [],
  requires: [ModelProviders, CredentialStore],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
