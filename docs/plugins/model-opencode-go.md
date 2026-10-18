# model-opencode-go

Provider `opencode-go`: the OpenCode Go subscription with an OpenCode API key.

Status: built

## Requires

- `ModelProviders`, `ModelCatalog`, `CredentialStore`, `LoginMethods`

## Requirements

- Registers login method `opencode-go`: `ApiKey` under vendor OpenCode Go, with `OPENCODE_API_KEY`
- Models come from the `models.dev` catalog under `opencode-go`, kept to those on a protocol Liminal calls
- Each model's models.dev package picks its protocol: none for Chat Completions, `@ai-sdk/anthropic` for Messages, `@ai-sdk/openai` for Responses; other packages are left out
- Requests go to `https://opencode.ai/inference/go/v1`, signed with the key
- Every request sends `x-opencode-client: liminal` and, when the request has a cache key, `x-opencode-session`
- Messages replies get the null fields Anthropic sends and OpenCode leaves out before they are decoded
- A model the catalog does not list uses Chat Completions

## References

- Tau `src/ai/Providers.ts`, `src/ai/Models.ts`, `src/ai/internal/protocols/messages-defaults.ts`
