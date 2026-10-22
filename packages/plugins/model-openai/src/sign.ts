/** What the OpenAI providers share in signing calls: their errors and the saved tokens. */
import { Effect, Option } from "effect";
import { AiError } from "effect/ai";

import type { Credentials, OAuth, TokensRefused } from "@shanepadgett/liminal-accounts/contract";

/** A call `module` could not sign. */
export const authFailed = (
  module: string,
  description: string,
  kind: AiError.AuthenticationError["kind"] = "MissingKey",
) =>
  AiError.make({
    module,
    method: "sign",
    reason: new AiError.AuthenticationError({ kind, description }),
  });

/** The OAuth tokens saved under `provider`, refreshed when due. */
export const freshTokens = (
  credentials: Credentials["Service"],
  login: { readonly provider: string; readonly module: string; readonly title: string },
  refresh: (stale: OAuth) => Effect.Effect<OAuth, TokensRefused>,
) =>
  Effect.gen(function* () {
    const saved = yield* credentials.get(login.provider);
    if (Option.isNone(saved)) return yield* authFailed(login.module, "Run liminal connect.");

    return yield* credentials
      .fresh(login.provider, refresh)
      .pipe(
        Effect.catchTag("TokensRefused", (error) =>
          authFailed(
            login.module,
            `Refreshing the ${login.title} login failed: ${error.message}. Run liminal connect.`,
            "ExpiredKey",
          ),
        ),
      );
  }).pipe(
    Effect.catchTag("CredentialsFailed", (error) =>
      authFailed(login.module, error.message, "Unknown"),
    ),
  );
