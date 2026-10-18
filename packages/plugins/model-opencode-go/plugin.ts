/**
 * Model-opencode-go: registers provider `opencode-go`, signed with an OpenCode API key, and its
 * login.
 */

import { CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethods } from "@liminal/logins/contract";
import { ModelCatalog } from "@liminal/model-catalog/contract";
import { ModelProviders } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";

export default definePlugin({
  name: "model-opencode-go",
  provides: [],
  requires: [ModelProviders, ModelCatalog, CredentialStore, LoginMethods],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
