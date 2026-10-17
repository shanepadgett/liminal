# credential-store

Stores secrets for login methods and refreshes OAuth credentials.

Status: planned

## Requirements

### Storage

- Default store is a SQLite file in `~/.liminal/` readable only by the user
- The store contract is replaceable; a keychain store is another plugin
- One credential per login method; a provider with several login methods (OpenAI API key, Codex, ChatGPT) holds one for each

### Sources

- A credential comes from the store, then an environment variable
- A command credential runs a command to fetch the secret

### Refresh

- The store refreshes OAuth credentials under an exclusive lock and re-reads before refreshing
- The login plugin supplies the refresh step

## References

- Pi `coding-agent/docs/providers.md`, `src/core/auth-storage.ts`
- OpenCode `schema/src/credential.ts`, `core/src/credential.ts`
- Codex `secrets/src/local.rs`
- Goose `config/base.rs`
- DeepSeek `docs/subsystems/credentials.md`
- Tau `src/host/CredentialStore.ts`, `src/ai/Providers.ts`
- Bun `docs/runtime/secrets.mdx`
