# Plan: milestone 1 plugins

The base plugins, storage, accounts, providers, `client` and `apps/cli` from [plugins/base.md](../plugins/base.md). Contracts: [architecture.md](../architecture.md#base-plugins-the-agent).

## Systems

| System | Change |
| --- | --- |
| `packages/plugins/{directories,settings,model,session,tools,tool-definitions,system-prompt,persona,history,loop}` | Adds the base plugins: contracts and the behavior every host shares |
| `packages/plugins/{sqlite,accounts}` | Adds the database and credentials |
| `packages/plugins/model-*`, `model-catalog` | Adds the five archived providers and the models.dev catalog |
| `packages/client` | Adds `host.client(Group)` over Effect RPC, in memory |
| `apps/cli` | Adds `liminal connect` and print mode |

## Storage today

How the archive split storage from behavior (`archive/packages/plugins/`):

| Concern | Behavior | Storage | Notes |
| --- | --- | --- | --- |
| Sessions | `session-log`: numbering, live updates over an in-process `PubSub`, entry kinds | `session-store`: `SessionStore` over SQLite, 12 methods | Live updates reach only the process that wrote |
| Settings | `settings`: one plugin reads files, merges layers and decodes sections | none separate | Global, then project once trusted, then launch flags |
| Credentials | `credential-store`: get, set, remove, `secret` with an env fallback, `fresh` refreshes OAuth | SQLite `credentials.db`, mode `0600` | The write lock spans read, refresh and save, so one process refreshes |
| Logins | `logins`: `LoginMethods` registry, API key and OAuth flows | none | Providers add their methods |

Prior art: Pi keeps `auth.json` at `0600` and takes a lock file around each OAuth refresh. OpenCode keeps `auth.json` at `0600` with no lock.

## Decisions

- Runtime services: Effect's own `FileSystem`, `Path` and the rest. Base plugins ask only for those, so they run on any runtime. `apps/cli` hands in `BunServices.layer` with a few-line plugin of its own; no package. The host guide covers it once built.
- One database: a `sqlite` plugin opens `liminal.db` in the global folder (mode `0600`, WAL so the CLI, TUI and desktop app share it) and provides Effect's `SqlClient`. Every plugin that keeps state requires it and owns its tables and migrations. A server swaps in `postgres`.
- Sessions: base `session` stores the log through `SqlClient`, with live updates and the runner within one process. Across server processes is open in [architecture.md](../architecture.md#open).
- Settings: one base plugin, `settings`, reads and writes `settings.json` in the global and project folders through Effect's `FileSystem`, which the host supplies. A host whose settings live elsewhere composes its own plugin that provides `Settings` and `DeclaredSettings`.
- Folders: a base plugin, `directories`, provides `Directories`; `settings` and `sqlite` require it, and a harness that stores files elsewhere replaces it.
- `Directories` fields: `global` (`~/.liminal`), `workspace` (the folder Liminal works in) and `project` (`<workspace>/.liminal`). `liminal.db` goes in `global`. Other folders arrive with their first caller.
- `settings` reads the global file, then the project file. Trust, which will gate project settings, comes later with `loader`.
- `settings` uses `jsonc-parser`, so `write` keeps the user's comments.
- A setting is one plugin's key in `settings.json`, made once with `Setting.make(key, schema)`. `Settings.get(setting)` reads it; plugins add theirs to the `DeclaredSettings` registry, which the milestone 2 settings screen lists.
- Credentials: one `accounts` plugin holds the `Credentials` and `LoginMethods` contract and the store. Providers import its contract. A host that keeps credentials elsewhere provides `Credentials` from its own plugin when that host is built.
- Credentials: `accounts` keeps its table in `liminal.db`. The CLI, TUI and desktop app can refresh the same expired token at once; a write transaction makes one of them do it. Pi locks a JSON file for the same reason.

- Retries: base `model` retries every model call, turns and one-off calls alike, when `AiError` says the error is retryable, waiting `retryAfter` when given. The user sees "Anthropic is overloaded, retrying in 4s (2/5)"; a reply that fails partway is cleared and restarts under that line. Out of attempts, the turn ends with a notice and the input stays. Esc cancels at any point, the wait included. Every attempt counts toward usage. The attempt limit is part of `model`'s setting.
- Choosing models: a model is named `provider/model`, such as `anthropic/claude-opus-5-5`, with an optional thinking level. `model`'s setting holds two roles, `main` for turns and `small` for side calls. Each provider names its default `main` and `small`; `liminal connect` writes them into settings when the roles are unset, so print mode works right after connecting.

- Types: `Message` and `Part` are Liminal's schemas, since the log stores them; base `model` converts them to and from Effect AI's types in one place, about 200 lines. The live reply stream and errors are Effect AI's `Response` parts and `AiError`. Effect AI marks its prompt types unstable, so storing them would mean migrations that each need a copy of the old schema.
- Model details: each provider says which models it offers, from `model-catalog`'s list for that provider and, for subscriptions, filtered to the account's plan. `model-catalog` supplies details from models.dev: name, context window, output limit, prices, thinking levels, image input. `Models.list` returns them merged, so `usage` computes cost from the same data.

- Steer and follow-up: input sent during a turn is a steer, which joins before the turn's next model call, or a follow-up, which waits until the turn would end and then continues it. A queued input can be pulled back until the turn takes it.
- Queue: each session's queued inputs live in memory, as in Pi. An input sent to an idle session is logged and starts a turn; one sent during a turn waits in the queue and is logged when the turn takes it, so the log holds only what the model saw, in order. A cancel is handled at once and never queues. A crash loses queued inputs.
- `loop` owns the queue, `Inbox`, `Send` and `Commands`, next to the turn that takes the inputs, so one lock covers a send and a turn deciding to end.
- `session` is the log only: `open`, `append`, `read`, `page`, `live`, `publish`, `defineEvent`. `append` assigns the seq inside the write; events are named by session and seq. No runner claim and no `expectedSeq`: within one process only the running turn logs inputs.
- Deltas: streamed output viewers see live and nothing stores, such as reply text, retry status and tool output. A delta kind is made with `defineEvent` and published, never appended.
- `session`'s own event kinds: `session/message` holds `Part[]`; `session/notice` holds a level and text and the model never sees it. `page` returns 100 events. Replies, tool calls and turn markers belong to `loop` and `tools`.
- Commands run as soon as they are sent, never queue, and are logged as `session/command`. One that changes the log, such as `/compact`, waits for the running turn to end.
- The turn: from the user's input to the agent's final answer. The agent replies; when the reply asks for tools, they run, their results are logged, and the agent replies again. Before each model call, one step logs the steers and whatever records plugins add there: a section's change note, a memory reminder, an automatic checkpoint. When the agent answers without tool calls, waiting follow-ups continue the turn; with none, it ends.
- Tool calls in one reply run at the same time. A tool marked `sequential` makes the whole batch run one after another, as in Pi. Results are logged in the order the model asked for them.
- Cancel (Esc): the partial reply is logged, marked interrupted, and never reaches the model; each unfinished tool call gets a cancelled result; queued steers and follow-ups go back to the input box.
- Deltas are published one by one as they arrive, as in Pi. Each viewer limits its own rate: the TUI redraws at most once a frame, and the HTTP transport groups deltas or waits for a slow reader.
- A crash mid-turn: when the session next opens, the unfinished turn is closed. Each unfinished tool call gets an interrupted result, a notice says the turn stopped, and the agent waits for the user.
- The model's context is append-only. The system prompt is built from the sections when the session starts and logged as a record; it never changes in place. When a section's text changes, a diff note is logged before the next model call. A checkpoint (milestone 5) folds the changes in by logging a new system prompt built from the current sections.
- The system prompt is its own plugin, `system-prompt`: it collects named sections from other plugins, logs the system prompt at session start, logs a diff note when a section changes, and offers "fold now". It never decides when to fold; `memory` or a compaction plugin calls it. Every section comes from its own swappable plugin: `persona` (who the agent is, communication style), instructions, environment, tool guidance.
- `tool-definitions` is a base plugin, the tool counterpart of `system-prompt`: it builds what the model is told about each tool (name, description, input shape) and adds a tool guidance section from each tool's optional guidance. A plugin changes a tool's description without replacing the tool by wrapping the step that produces it. `tools` keeps the list of tools and the step that runs a tool call.
- Tool definitions follow the system prompt: logged at session start, a change logged as a note before the next model call, rebuilt at a fold.
- Deferred tools: a tool marked `deferred` is shown to the model by name only until a tool result loads it. A tool result lists the tools it loads. Each provider decides how a loaded tool reaches the model: natively (Anthropic's `defer_loading` and `tool_reference`, OpenAI's `tool_search`), with no cache miss, or by adding it to the tool list, at one cache miss. Effect AI 4.0.5 does not send either for our own tools, so a provider rewrites the request body, as the archive did (`archive/packages/sdk/src/ai/messages.ts`).
- Tools added or removed mid-session are logged as add and remove records by `tool-definitions`. A removed tool is still sent, with a note telling the model not to use it, until the next fold. Sources: plugin reload, MCP servers connecting or disconnecting, turning a tool on or off in settings, and a command that offers a tool for one turn, such as a question tool.
- Milestone 1 has the contract shapes: `deferred` on a tool, the tools a result loads, and the add and remove records. Provider wire work and the search tool come with `tools-search` in milestone 5.
- `history` builds the messages each model call sends from the log. Each plugin adds a converter for its own event kinds, which turns those events into messages; a kind with no converter, such as a notice, never reaches the model.
- Credential kinds: an API key; OAuth tokens (access, refresh, expiry and extras such as an account id); and a command whose output is the key, such as `op read op://Private/Anthropic/credential` or `security find-generic-password -ws anthropic`, run once per process and kept in memory, as in Pi. With nothing saved, a provider reads its environment variable: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OPENCODE_API_KEY`.
- Login methods: an API key method, which `accounts` asks for and saves, or a flow, which the provider runs and `accounts` saves the result of. A flow offers one or more ways to finish, such as browser, device code or copying a code. It is written against a fixed set of actions: open a URL, show a code, ask, ask for a secret, show waiting, tell, and sign in through the browser with a local callback and a pasted address as fallback. `accounts` turns each action into a step it streams to the screen; the screen shows the step and sends what the user types back with `answer`.
- Claude subscription login: `model-anthropic` keeps it, signing in and sending requests as Claude Code, as the archive and Pi do. It adds Claude Code's identity line to each subscription request on the way out; the line is never logged and never a section.
- ChatGPT plan login: `model-codex` signs in by browser or device code and sends requests to `chatgpt.com/backend-api/codex`, as the archive did.
- Wire code: the Anthropic Messages, OpenAI Responses and Chat Completions code the providers share lives in `@shanepadgett/liminal-model-wire`, a library providers import, so `model` depends on no provider package.
- Packages are named `@shanepadgett/liminal-<name>`.
- The session list and titles come in milestone 2 with saved sessions. Queries across sessions come with `memory` in milestone 5, if it needs them.
- Where the agent runs: in each app's own process, the CLI and TUI in the CLI process and the desktop app in its main process. A server runs only when a host composes `http`. Multiplayer is the server host: each browser connects over HTTP.
- Screens reach plugins through Effect RPC. Each plugin's contract declares an RPC group: the functions its screens may call, with schemas, as one-shot calls or streams. `session` declares `page` and `live`; `loop` declares `send`, `pullBack` and `queue`. A frontend gets a client with `host.client(Group)`, and the host picks the connection: Effect's in-memory client in the same process, the desktop shell's IPC, or `http`. `client` depends on Effect.
- Print mode uses only `send` and `live`. `-p` writes the final reply when the turn ends; errors and notices go to stderr. `--json` writes one JSON line per item `live` sends, saved events and deltas, from the input to the turn's end. Piped stdin joins the prompt.
- Exit codes: 0 when the turn answered, 1 when it failed or was cancelled, 2 for bad flags, 130 for Ctrl-C, which cancels the turn first.
- Bare `liminal` prints help until the TUI arrives in milestone 2.
- `--approve` comes with `approvals` and `questions` in milestone 3; `--model` comes with the model picker in milestone 2. Until then print mode uses the `main` role.
- The code behind a plugin's RPC functions is an ordinary service in the plugin's own layer. `host.client(Group)` in the same process finds it there, so core adds nothing. A list of every group arrives with the desktop app and `http`, the first to serve groups over a connection.
- RPC calls go from screen to plugin only, so a plugin reaches a screen by streaming. `accounts` declares the login methods, the sign-in stream and `answer`. `liminal connect` and the TUI's `/connect` show the same steps through `client`.
- `SessionLog.live(id, after?)` sends the saved events after a seq, then new ones, so a screen that reads and then watches neither misses nor repeats an event.
- Milestone 1's RPC groups hold what its screens call: `session`'s `live`, `loop`'s `send`, and `accounts`' functions. `page`, `pullBack` and `queue` come with the TUI in milestone 2.
- Print mode always starts a new session; `--session <id>` comes with saved sessions in milestone 2.
- Print mode reads the few events it needs itself: the final reply at the turn's end, and notices and errors for stderr. The session view comes with the TUI in milestone 2.
