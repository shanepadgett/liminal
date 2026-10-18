# model-openrouter

Provider `openrouter`: OpenRouter's models with an API key.

Status: built

## Requires

- `ModelProviders`, `CredentialStore`, `LoginMethods`

## Requirements

- Registers login method `openrouter`: `ApiKey` with `OPENROUTER_API_KEY`
- Models come from the `models.dev` catalog under `openrouter`; listing fails with an `auth` error while no key is saved or set
- Requests go to `https://openrouter.ai/api/v1` on Chat Completions through `@effect/ai-openrouter`, signed with the key
- Thinking sends `reasoning`: `enabled` for off and on, `effort` for an effort, `max_tokens` for a budget
- Cache marks send `cache_control: ephemeral`
- Reasoning details from the upstream model go back on later turns
- OpenRouter's decision models are left out

## References

- Tau `src/ai/Providers.ts`, `src/ai/internal/protocols/thinking.ts`
