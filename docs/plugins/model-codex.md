# model-codex

Provider `codex`: OpenAI models on a ChatGPT plan login, through the Codex backend.

Status: built

## Requires

- `ModelProviders`, `CredentialStore`, `LoginMethods`

## Requirements

- Registers login method `codex`: a `Flow` with ways browser and device code
- Browser: `authorizeInBrowser` at `auth.openai.com/oauth/authorize`, callback `127.0.0.1:1455/auth/callback`, `originator` `liminal`
- Device code: shows the code and `auth.openai.com/codex/device`, polls until it is entered, gives up after 15 minutes; an account with device code off is told to sign in in the browser
- Tokens that name no ChatGPT account fail the login
- Listing fails with `auth` while no Codex login is saved
- Requests refresh a login that expires soon and save the new tokens
- Models are the catalog's `openai` models on the plan's live list
- Live recording tests read the `codex` login from Liminal's credential store and never refresh it

## References

- Codex CLI `codex-rs/login/src/{server,device_code_auth}.rs`, Tau `src/ai/Providers.ts`
