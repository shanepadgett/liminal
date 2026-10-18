# model-openai

Provider `openai`: the OpenAI API with an API key.

Status: built

## Requires

- `ModelProviders`, `CredentialStore`, `LoginMethods`

## Requirements

- Registers login method `openai`: `ApiKey` with `OPENAI_API_KEY`
- Models come from the `models.dev` catalog under `openai`; listing fails with an `auth` error while no key is saved or set
- Each request sends the whole conversation with `store: false`, the encrypted reasoning and the cache key
- Thinking takes efforts only; off sends `none`

## References

- Tau `src/ai/Providers.ts`
