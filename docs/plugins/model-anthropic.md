# model-anthropic

Providers `anthropic` (Claude subscription) and `anthropic-api` (API key) on Anthropic's Messages API, through `@effect/ai-anthropic`.

Status: built

## Requires

- `ModelProviders`, `CredentialStore`, `LoginMethods`

## Requirements

- Registers login method `anthropic`: a `Flow` titled "Claude subscription" with ways browser and copy a code
- Browser: `authorizeInBrowser` at `claude.ai/oauth/authorize`, callback `localhost:53692/callback`
- Copy a code: returns to `platform.claude.com/oauth/code/callback`, which shows `code#state` to paste
- Tokens come from `platform.claude.com/v1/oauth/token` with a JSON body
- Registers login method `anthropic-api`: an API key, read from `ANTHROPIC_API_KEY` while none is saved
- Subscription requests carry Claude Code's headers (bearer token, Claude Code betas, `user-agent claude-cli/<version>`, `x-app cli`) and Claude Code's identity as the first system block
- The Claude Code version is read from `registry.npmjs.org/@anthropic-ai/claude-code/latest`, kept in `<data>/claude-code.json` and read again once a day in the background; with no copy, the first request waits for the read
- Requests refresh a subscription login that expires soon and save the new tokens
- Listing fails with `auth` while the provider has no login
- Models are the catalog's `anthropic` models for both providers
- Off sends thinking disabled; On sends adaptive thinking; an effort sends adaptive thinking with `output_config.effort`, every effort the model offers; a budget sends `budget_tokens` and the request's output limit when set
- A cache mark becomes `cache_control: ephemeral` on that block
- Reasoning parts keep the thinking signature or redacted thinking and send it back

## References

- Tau `src/ai/Providers.ts`, `src/ai/internal/thinking.ts`
