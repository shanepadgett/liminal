/** Model-openrouter: registers provider `openrouter`, signed with an API key, and its login. */

import { CredentialStore } from "@liminal/credential-store/contract";
import { DecisionModels } from "@liminal/decisions/contract";
import { LoginMethods } from "@liminal/logins/contract";
import { ModelProviders } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";

export default definePlugin({
  name: "model-openrouter",
  provides: [],
  requires: [ModelProviders, CredentialStore, LoginMethods],
  uses: [DecisionModels],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
