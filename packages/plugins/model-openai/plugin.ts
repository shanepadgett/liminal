/** Model-openai: registers provider `openai`, the OpenAI API, and its API key login. */

import { CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethods } from "@liminal/logins/contract";
import { ModelProviders } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";

export default definePlugin({
  name: "model-openai",
  provides: [],
  requires: [ModelProviders, CredentialStore, LoginMethods],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
