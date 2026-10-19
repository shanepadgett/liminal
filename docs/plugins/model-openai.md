# model-openai

Providers `openai` and `chatgpt`: the OpenAI API with an API key, and on the user's ChatGPT plan through Sign in with ChatGPT.

Status: built

## Requires

- `ModelProviders`, `CredentialStore`, `LoginMethods`

## Requirements

- Registers login method `openai`: `ApiKey` with `OPENAI_API_KEY`
- Models come from the `models.dev` catalog under `openai`; listing fails with an `auth` error while no key is saved or set
- Each request sends the whole conversation with `store: false`, the encrypted reasoning and the cache key
- Each request with a cache key also sends it as the `session-id` header, which OpenAI's prompt cache needs
- Thinking takes efforts only; off sends `none`

### chatgpt

- Registers login method `chatgpt`: `Flow` "Sign in with ChatGPT", browser only, returning to `127.0.0.1:1455/auth/callback`
- The first login registers Liminal as its own app on the account; later logins send the issued client id and the last ID token
- Every login sends the host id from `host-id` in the data folder, made on first use and kept apart from the credentials
- A login fails unless the granted scope allows plan use and the ID token's RS256 signature, issuer, audience, expiry and nonce check out
- The credential keeps the issued client id and the ID token beside its tokens
- Sign-out revokes the refresh token; a failed revoke says to disconnect Liminal in ChatGPT settings
- Models are the catalog's `openai` models that `GET api.openai.com/v1/models` lists for the plan
- Requests go to the same Responses API as `openai`, signed with the access token, refreshed within a minute of expiry

## References

- Tau `src/ai/Providers.ts`, `src/ai/internal/login/chatgpt-app.ts`, `src/host/HostId.ts`
