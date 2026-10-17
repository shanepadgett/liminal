# Step 4: `settings`, `credential-store`, Codex provider, command runner, file and shell tools

Builds step 4 of [milestones.md](../milestones.md) behind Round 7 (settings, credentials) and Round 6 (command runner) of [core-contracts.md](../core-contracts.md), and Round 3 for the provider. Proves: a real model does work in a test session, replayed from a recorded response.

## Packages

```text
packages/plugins/
  settings/          contract.ts  Settings, SettingsInvalid, SettingsWriteFailed   jsonc-parser
  credential-store/  contract.ts  Credential, CredentialStore, CredentialError     SQLite in Directories.data
  command-runner/    contract.ts  CommandSpec, CommandResult, CommandRunner, CommandFailed
  tools-file/        read, write, edit tools (Tools registry)
  tools-shell/       shell tool over CommandRunner
  model-codex/       ModelProvider "codex" over @effect/ai-openai; credential method "codex"
```

## Types at the boundaries

```ts
// settings: layers built-in defaults < <global>/settings.json < <project>/settings.json (trusted only)
Settings {
  section<A>(name, schema: Schema.Codec<A, Json>): Effect<A, SettingsInvalid>   // missing section decodes {}
  write(layer: "global" | "project", path: [section, ...keys], value?: Json): Effect<void, SettingsWriteFailed>   // no value removes it
  trustProject: Effect<void, SettingsWriteFailed>   // adds the folder to the settings section "trustedFolders"
  projectTrusted: Effect<boolean, SettingsInvalid>
}
merge(lower, higher): objects key by key; any other value (lists too) from the higher layer

// credential-store
Credential  ApiKey{ key: Redacted } | OAuth{ access: Redacted; refresh: Redacted; expiresAt: number; extra: Record<string, Json> } | Command{ command: string }
CredentialStore {
  get(method): Effect<Option<Credential>, CredentialError>
  set(method, credential), remove(method): Effect<void, CredentialError>
  secret(method, { env?: string }): Effect<Option<Redacted>, CredentialError>   // store, then env; Command runs
  fresh<E>(method, refresh: (stale: OAuth) => Effect<OAuth, E>, skew): Effect<OAuth, CredentialError | E>
    // BEGIN IMMEDIATE; reread; refresh only if expiresAt - skew < now; write; COMMIT
}
// SQLite busy timeout 0; a busy database is retried every 20 ms for up to 30 s, off the thread

// command-runner (default: no jail)
CommandSpec    { command: string; cwd: string; timeout: Duration; env?: Record<string, string> }
CommandEnd     { type: "exited"; code: number } | { type: "timed-out" }
CommandResult  { end: CommandEnd; stdout: string; stderr: string }
CommandRunner  { run(spec): Effect<CommandResult, CommandFailed> }   // interrupt kills the process

// model-codex
codex provider: OpenAiClient.make({ apiUrl: "https://chatgpt.com/backend-api/codex", transformClient: sign })
sign: Authorization Bearer access, chatgpt-account-id (JWT claim), originator "liminal", session-id = cacheKey
config: store false, include reasoning.encrypted_content, prompt_cache_key, reasoning { effort, summary auto }, streaming only
providerData: { openai: { itemId, encryptedContent } } on each reply part, sent back on the next request
ModelRequest -> Prompt + Tool.dynamic(spec) ; Response stream parts -> ModelEvent ; AiError -> ModelError
models: GET <apiUrl>/models?client_version=… -> ModelInfo[]
refresh: POST https://auth.openai.com/oauth/token (form, client_id of the Codex CLI)
```

## Tools

| Tool | Params | Hints | Alongside | Safe to rerun |
| --- | --- | --- | --- | --- |
| `read` | `path`, `offset?`, `limit?` | read-only | yes | yes |
| `write` | `path`, `content` | destructive | no | yes |
| `edit` | `path`, `oldText`, `newText` (must match once) | destructive | no | no |
| `shell` | `command`, `timeout?` | open world, destructive | no | no |

Paths resolve against the workspace: the parent of `Directories.project`.

## Injection

| Service | Production | Tests |
| --- | --- | --- |
| `HttpClient` | `FetchHttpClient` in model-codex | recorded SSE replayed by a fake client |
| `CredentialStore` | SQLite store | the real store on a temp folder; live recording reads Tau's `~/.tau/credentials.db` read only and refresh fails |
| Child processes | base `ChildProcessSpawner` | same, on a temp folder |

## Deletes

- Nothing

## Open

- Live tests run only with `LIMINAL_LIVE=1` and a valid Tau `codex` token; recordings live in `model-codex/test/fixtures/`; a new `models.json` recording needs the formatter run on it
- The codex provider plugin holds its own refresh step and login method; a separate login plugin with the device flow follows later
- Trust is a list of folders in the global `settings` section; turning plugins on or off from settings is a graph change and comes with step 6
- Command output is returned whole when the command ends; streaming output to the TUI comes with step 5
- A command credential runs on every `secret` call; no caching
- Settings writes are serialized within one process only
- `session-store` waits on a busy database inside SQLite, blocking the thread; it needs the credential store's retry before step 6 runs two graphs
- The codex provider sends every declared tool from the start; offers and withdrawals arrive as system text, and a call to a withdrawn tool is not refused by the provider
- `maxOutputTokens` is not sent; the ChatGPT plan backend rejects it (OpenCode `core/src/plugin/provider/openai.ts`)
- Thinking `off` maps to reasoning effort `none`
- Provider data is keyed `openai`, as `@effect/ai-openai` reads it, so other OpenAI-protocol providers share the key
- Tool params that are not JSON fail the call as a provider error
