# Liminal architecture

Liminal is an agent harness where everything is a plugin. A tiny core composes plugins. The agent itself (model calls, tools, the turn loop, sessions) is a base set of plugins. Products are compositions: a terminal app, a desktop app, a web server, or a library embedded in someone else's app.

This file is the intended design. Once something is built and settled, its how-to moves into `guides/`.

## Goals

- Clear seams: every behavior sits behind a contract that another plugin can extend or replace.
- The simplest implementation that keeps those seams. No mechanism exists until a plugin needs it.
- Long-term health over speed: no shortcut that bends a seam to get something working.
- Solve the common case. No mechanism, option or special case for an edge case few users hit.
- One harness for every host: TUI binary, desktop app, web server, embedded SDK.
- Multiplayer sessions: many people watch and steer one session.
- External authors build plugins with the same tools as built-in plugins.

## Layers

Each layer imports only from the layers above it.

```text
core                      definePlugin, compose, Registry, Pipeline, Attribute     knows nothing about agents
  ↑
base plugins              directories · settings · model · session · tools · history · system-prompt · persona · tool-definitions · loop      "an agent"
  ↑
providers & features      model-anthropic, sqlite, tools-files, approvals, memory, …
  ↑
frontend kit              client (framework-free, Effect RPC) · tui (OpenTUI + slots)
  ↑
hosts                     apps/cli · apps/desktop · an embedding app
```

- Core and base plugins use only `effect` and standard JavaScript, so they run on Bun, Node and Deno. `client` uses only `effect` and plugin contracts, so it also runs in a browser. Fallow boundaries enforce the layers; oxlint bans runtime imports and globals in core, base plugins and `client`. Bun APIs and drivers live in other plugins and hosts.

## Stack

Versions are pinned in `package.json`; [reference/copies/index.md](reference/copies/index.md) has each dependency's docs.

| Need | Technology |
| --- | --- |
| Runtime, package manager, binary | Bun |
| Plugins, services, streams, schemas | Effect 4 |
| Model calls, structured output | `effect/ai` with `@effect/ai-anthropic`, `-openai`, `-openai-compat`, `-openrouter` |
| Command line | `effect/cli` |
| Processes | `effect/process` |
| Storage | `effect/sql` `SqlClient`, provided by `sqlite` over `@effect/sql-sqlite-bun`, later by `postgres` over `@effect/sql-pg` |
| TUI | OpenTUI (`@opentui/core`, `@opentui/solid`, `@opentui/keymap`) on Solid 1.x |
| Desktop | Electrobun: Bun main process and a system webview |
| Tooling | TypeScript 7, `@effect/tsgo`, oxlint, oxfmt, fallow, mise |

- `effect/ai`, `effect/cli` and `effect/process` are marked unstable; they stay behind Liminal's contracts.
- Every dependency has a source in `reference/sources.json`. Dependencies of plugins not yet built are pinned in `tools/planned/package.json` for their docs, and move into the plugin's package when it is built.
- Prefer what OpenTUI, Bun and Effect already provide over a new library.

| Library | Used by |
| --- | --- |
| `fuzzysort` | `palette`, `chat` (`@` file tags), model picker |
| `diff` | `tools-files` edit patches |
| `partial-json` | `tools-files` `tui` entry, only if Effect AI gives no partial tool arguments |
| `unbash` | `tools-shell` safety rules |
| `@opencode/codemode` | `tools-execute` |
| `jsonc-parser` | Settings files with comments |
| `beautiful-mermaid` | Mermaid diagrams in TUI markdown |

## Folder structure

```text
packages/
  core/                     plugin, compose, Registry, Pipeline, Attribute
  client/                   host.client(Group) over in-memory RPC, IPC or HTTP; session view store
  tui/                      OpenTUI renderer, slot tree, UI kit
  plugins/<name>/           one package per plugin
  <concept>/                a library: pure code shared by plugins, named for one concept
apps/
  cli/                      compose + TUI, compiled with bun build --compile
  desktop/                  compose in the main process + webview using client over IPC
tools/                      lint rules and repository checks
archive/                    the previous implementation, read-only reference
docs/
```

## Plugin anatomy

```text
plugins/approvals/
  package.json        exports ".", "./contract", "./tui", "./web"; "liminal": { "plugins": ["./src/index.ts"] }
  README.md           what it provides and requires, how to use or replace it
  src/
    index.ts          definePlugin(...): the server side
    contract.ts       tags, event kinds, schemas, slot handles, the RPC group its screens call
    tui.tsx           TUI slot registrations (optional)
    web.tsx           desktop webview slot registrations (optional)
```

- `contract.ts`, `tui.tsx` or `tui/`, and `web.tsx` or `web/` are fixed. Every other file under `src/` is server side, laid out freely.

```ts
export default definePlugin({
  name: "approvals",
  provides: [Approvals],
  requires: [ToolCall, Inbox, Models],
  layer: ApprovalsLive,
  entries: { tui: () => import("./tui.tsx"), web: () => import("./web.tsx") },
});
```

- A server never imports frontend entries. A frontend loads its entry of every plugin in the composition.
- A plugin imports other plugins only through their `./contract` export.
- A plugin's `tui` and `web` entries reach its server side only through the RPC group in its contract.
- A `tui` or `web` entry that grows becomes a folder with an `index` file.
- Code shared by plugins is Effect or standard JavaScript first. Pure code a second plugin needs moves to a library package named for one concept, never a grab-bag. It becomes a plugin only when it needs swapping, state or runtime services.

## Core

Core is the mechanism that lets plugins plug into each other. It runs on any JavaScript runtime and depends only on Effect.

```ts
definePlugin({ name, provides, requires, layer, entries })   // a plugin is an Effect Layer
compose(plugins): Layer<Services, CompositionError>
Registry<T>          // a collection others add to; ordered by `order`
Pipeline<In, Out, E> // an operation others wrap with middleware calling next(input)
Attribute<T>         // a typed key for data attached to sessions, inputs and events
```

- `provides` and `requires` are Effect service tags. `compose` checks the graph, builds plugins in dependency order, and ties every registration to the plugin's scope.
- A missing requirement, a cycle, two providers of one tag or a layer that fails to build is a `CompositionError` naming the plugins.
- Host services, such as a SQL driver, enter the composition as plugins.
- Core holds no sessions, messages, transports or loaders.
- Test: core can compose a program that is not an agent.

## Extension mechanisms

Every extension uses one of four mechanisms; [extension-basics.md](extension-basics.md) walks through each with examples. When a feature can only be built by editing a base plugin, that base plugin is missing an extension point.

| Mechanism | Use | Example |
| --- | --- | --- |
| Add | Contribute to a `Registry` | A tool, a prompt section, a model provider, a slash command, a UI component |
| Wrap | Middleware on a `Pipeline` | Approval before a tool call, retry around a model call |
| Attach | Set an `Attribute` on a session, input or event | The actor who sent an input, the work order a session belongs to |
| Replace | Provide the same contract | `postgres` in place of `sqlite` on a server |

## Base plugins: the agent

Each base plugin owns a contract that other plugins import.

```ts
// settings: each plugin owns one key in settings.json
Setting.make<T>(key, schema): Setting<T>                           // an object schema holding the defaults; a missing key reads as {}
DeclaredSettings: Registry<Setting>                                // the settings screen lists these
Settings.get<T>(setting): Effect<T, SettingsInvalid>               // read on each call
Settings.write(scope: "global" | "project", path, value): Effect<void>

// model: the LLM vocabulary, providers and one-off calls; knows nothing of sessions
type Part = Text | Image | Reasoning | ToolCall | ToolResult
type Message = { role: "user" | "assistant" | "tool"; parts: Part[] }
type ModelId = string                         // provider/model
type ModelRequest = { model; thinking?; system; tools: ToolDefinition[]; messages: Message[]; toolChoice?; output?: { name; schema } }
type ModelDelta = Response.AnyPart | Retrying  // Effect AI's reply parts, plus a retry that clears the reply so far
interface ModelProvider {
  id; name; defaults: { main; small }        // used when the model setting leaves a role unset
  models: Effect<ModelInfo[]>               // ModelInfo = { id; name; details?: ModelDetails }
  languageModel(model, thinking?): Effect<LanguageModel>   // an Effect AI language model
}
ModelProviders: Registry<ModelProvider>
ModelCall: Pipeline<ModelRequest, Stream<ModelDelta>>   // retries inside; converts to Effect AI's types
Reply.add(reply, delta) / Reply.message(reply)          // deltas into the assistant Message
Models.resolve("main" | "small" | ModelId): Effect<ModelChoice>
Models.list: Effect<ModelInfo[]>
Models.generate(options: {
  model?: "main" | "small" | ModelId        // missing is the prefix's model, or small
  prompt: Part[]
  prefix?: ModelRequest                      // start from this request, such as Turns.request(id)
}): Effect<Message>
Models.generateObject<T>(options: { ...; schema: Schema<T> }): Effect<T>   // structured output
type ModelDetails = { contextWindow; outputLimit; thinking: string[]; images; toolCalls; structuredOutput; price?: { input; output; cacheRead?; cacheWrite? } }

// model-catalog: model details from models.dev, cached in ~/.liminal/catalog.json
ModelCatalog.models(catalogId): Effect<CatalogModel[], CatalogUnavailable>   // CatalogModel = { id; name; details }

// session: the log
type SessionEvent = { session: SessionId; seq: Seq; at: Date; kind: string; data: Schema.Json; attributes: Attributes }
type NewEvent = { kind: string; data: Schema.Json; attributes: Attributes }
type Delta = { kind: string; data: Schema.Json }   // streamed to viewers, never stored
defineEvent(kind, schema): { make(data, attributes?): Effect<NewEvent>; decode(item): Effect<Option<T>> } // deltas use it too
MessageEvent                                   // session/message: model's Message, role and parts
Notice                                         // session/notice: level and text; the model never sees it
interface SessionLog {
  open(attributes?): Effect<SessionId>
  append(id, events: NewEvent[]): Effect<SessionEvent[]>  // seq is assigned inside the write
  read(id, after?): Effect<SessionEvent[]>    // the whole log, for History
  page(id, before?): Effect<SessionEvent[]>   // latest events, or the page before a seq
  live(id, after?): Stream<SessionEvent | Delta> // saved events after a seq, deltas since the last append, then new events and deltas
  publish(id, delta): Effect<void>
}

// tools
interface Tool { name; description; deferred?; sequential?; input: JsonSchema; run(params: Json, ctx: ToolContext): Effect<ToolOutput, ToolFailed> }
defineTool({ name; description; input: Schema<I>; run(input: I, ctx) }): Tool   // checks params before run
type ToolContext = { session; callId; attributes }   // attributes of the latest input the turn consumed
type ToolOutput = { result: Json; loads?: string[] }
// a deferred tool shows by name only until a ToolResult lists it in `loads`
Tools: Registry<Tool>                          // of two with one name, the last added is used
ToolCall: Pipeline<{ session; call: ToolCall; attributes }, ToolResult>   // failures, unknown tools and crashes become failed results

// tool-definitions: what the model is told about each tool
ToolDefinitions: Pipeline<Tool, ToolDefinition>   // name, description, input shape; wrap to change a description
ToolList.sync(id): Effect<void>               // logs the tool list at start, then added and removed records
ToolList.current(events): ToolDefinition[]    // a removed tool is still sent, with a note, until the next fold
ToolList.fold(id): Effect<void>               // logs the full tool list again

// system-prompt: the system prompt, built from sections
Sections: Registry<Section>                  // Section = { name; text: Effect<string> }; empty text is left out
SystemPrompt.sync(id): Effect<void>          // logs the prompt at start, then a note with each changed section's full text
SystemPrompt.current(events): string         // the prompt the log says the model is sent
SystemPrompt.fold(id): Effect<void>          // logs the prompt again from the current sections

// history: the messages each model call sends
Converters: Registry<Converter>              // one per event kind; a kind with no converter never reaches the model
defineConverter(EventKind<T>, (data: T) => Message[]): Converter
History: Pipeline<SessionEvent[], Message[]> // the log, through the converters, into model messages

// loop: the turn, the inbox and commands
interface Inbox {
  send(id, input: Input, mode: "steer" | "follow-up"): Effect<void>   // input: event kind + data + attributes
  pullBack(id, queued): Effect<Option<Input>>
  queue(id): Stream<Queued[]>
}
Send: Pipeline<Input, void>
Commands: Registry<Command>                  // slash commands, run on the agent side as soon as they are sent
BeforeCall: Registry<Hook>                    // records logged before each model call after both syncs, such as reminders
Turns.request(id): Effect<ModelRequest>      // system prompt + tool definitions + History, as the next model call sends them
Turns.fold(id): Effect<void>                 // SystemPrompt.fold + ToolList.fold; waits for a running turn
TurnEnd: Registry<Hook>
```

The loop runs one turn:

```text
take queued inputs → log steers and before-call records → system prompt + tool definitions + History → ModelCall → ToolCall for each call
→ append events → repeat while tools owe a result or new input arrived → TurnEnd hooks
```

- Each step carries the attributes of the latest input it consumed; tool calls read them from `ToolContext` and log them.
- The system prompt and tool definitions are logged at session start and never change in place. A change is logged as a note before the next model call; a fold logs them anew.
- Cancel is an input the loop handles: the partial reply is logged marked interrupted and never reaches the model, unfinished tool calls get cancelled results, and queued inputs go back to the input box.
- Deltas are published as they arrive; each viewer limits its own rate.
- Tool calls in one reply run at the same time unless one is marked `sequential`; results are logged in the order asked.
- A turn left unfinished by a crash is closed when the session next opens: interrupted results, a notice, and no restart.
- Shared provider code, such as an OpenAI-compatible wire format, is a library the provider plugins import, not a contract.
- The session log stores Liminal's own `Message` and `Part` schema, so saved sessions outlive Effect AI changes. Base `model` converts them to and from Effect AI's types in one place. The live reply stream and errors are Effect AI's `Response` parts and `AiError`, since nothing stores them.
- Each provider lists the models it offers and requires `ModelCatalog` to add their details from models.dev. Without the catalog, models list without details and calls still go out.

### Settings

- Every plugin reads its configuration only through `Settings`; plugins take no options of their own.
- `settings` keeps settings in `settings.json` in the global and project folders `directories` names, `~/.liminal/` and `<workspace>/.liminal/`; project values win.
- A settings screen lists every setting in `DeclaredSettings`.
- Credentials are not settings; `accounts` keeps them.

### One-off model calls and structured output

- `Models.generate` and `Models.generateObject` make a single model call outside the turn loop, through the `ModelCall` pipeline, so usage and cache hints apply.
- `model` retries a call whose `AiError` is retryable, turns and one-off calls alike. Viewers see "retrying in 4s (2/5)"; a reply that fails partway is cleared and restarts. Out of attempts, the turn ends with a notice and the input stays.
- `generateObject` decodes the reply through its schema. Its request carries the schema as `output`, and `ModelCall` asks Effect AI's `LanguageModel.generateObject`, which picks native JSON output or a forced tool call per provider.
- With `prefix`, the request starts from another request. `Turns.request(id)` gives the session's next request: its system prompt, tool definitions and history, the same prefix as its last turn, so the call hits the provider's cache. The prompt goes at the end and the result is not appended to the session. A side question over the current chat ("by the way") is this call.
- Commit grouping, approval verdicts and session names are `Models.generateObject` on the `small` model.

## Sessions

- The session log is the source of truth. Everything the model sees is logged; model context is a projection of the log.
- Event kinds declare whether the model sees them. Notices are events the model never sees.
- Live streaming deltas are not stored. A finished assistant message is committed as one event.
- Every way into a session is an input through `Inbox.send`: a user message, an answer to a question, a notification, chat history, a cancel, a command.
- An input sent during a turn is a steer or a follow-up. A steer joins before the turn's next model call. A follow-up waits until the turn would end, then continues it. A queued input can be pulled back until the turn takes it. An input sent to an idle session starts a turn.
- Queued inputs live in memory. An input is logged when a turn takes it, so the log holds what the model saw, in order.
- A command runs as soon as it is sent and never queues; the log records it. A command that changes the log, such as `/compact`, waits for the running turn to end.
- One runner per session: within one process, `loop` runs one turn per session at a time.
- Recovery is per turn. After a crash or shutdown, an unfinished turn gets an `interrupted` event and continues from the log.

### Multiplayer

Multiplayer needs no extra mechanism beyond the session rules:

- Many viewers: opening a session shows the latest events and keeps updating; scrolling back loads older pages. Nothing tracks what a viewer has seen.
- Many senders: inputs queue in the session.
- Acting on behalf of someone: the `actors` plugin attaches an `Actor` attribute to every input through `Send` middleware. Tool calls run with the actor of the latest consumed input, and the log records it.
- Questions and approvals are events. Answers are inputs. A policy middleware decides who may answer.

## UI

Three layers, each usable without the next:

```text
client         host.client(Group): plugins' RPC groups in memory, over IPC or HTTP   any JS with Effect, no framework
session view   folds events into state: messages, streaming text,
               pending questions, who's acting, turn status                   any JS, no framework
frontend       components                                                      TUI, desktop, an embedding app
```

```ts
const view = SessionView.open(client, sessionId)
view.state      // { messages, streaming, questions, status: "idle" | "running", actors }
view.subscribe(listener)
view.send(input)
view.answer(questionId, value)
view.loadOlder()
```

- Each plugin's contract declares the functions its screens may call as an Effect RPC group: names, input and output schemas, one-shot calls or streams. `session` declares `page` and `live`; `loop` declares `send`, `pullBack` and `queue`; `accounts` declares the login methods, the sign-in stream and `answer`.
- The code behind a group's functions is an ordinary service in the plugin's layer. RPC calls go from screen to plugin only, so a plugin reaches a screen by streaming, as sign-in does.
- A frontend gets a client for a group with `host.client(Group)`. The host picks the connection: Effect's in-memory client in the same process, the desktop shell's IPC, or HTTP through `http`. A plugin's screen code is the same in every host.

### Slots: TUI and desktop

A slot is a named region of the screen that plugins fill from their `tui` and `web` entries. The TUI uses OpenTUI's plugin slots (`createSolidSlotRegistry`, `<Slot>`).

| Slot mode | Mechanism | Example |
| --- | --- | --- |
| `append` | Add | Status bar items, sidebar sections |
| `replace`, `single_winner` | Replace | The whole composer, the message list, the root layout |

How an event renders is not a slot: `EventRenderer` is a registry keyed by event kind.

```ts
// chat plugin owns the screen, its slots and the event renderers
type ChatSlots = { sidebar: { session: SessionId }; composer: { session: SessionId } }
export const EventRenderer: Registry<{ kind: string; component: Component<{ event: SessionEvent }> }>

// approvals tui entry
EventRenderer.add({ kind: "question", component: QuestionCard })
```

- An event kind with no renderer gets a generic view.
- The TUI and the desktop webview both use Solid 1.x. The session view and state code are shared. Components and the slot registry are not: OpenTUI's need its native core, so the desktop gets its own small slot registry with the same slot names.

### Embedding apps

An embedding app is the host, so it owns its UI. It uses `client` and the session view and renders with its own components. A plain map from event kind to component plays the role of the `EventRenderer` slot. Plugin `tui` and `web` entries are for Liminal's own frontends.

## Hosts

| Host | Composition | Frontend and connection |
| --- | --- | --- |
| CLI binary | Base + `sqlite` + `accounts` + providers + coding tools + `loader` | TUI in the same process; in-memory RPC |
| Desktop app | Same as CLI, in the app's main process | Webview using `client` over the desktop shell's IPC |
| Web server | Base + `postgres` + app plugins + `actors` + `http` | Browser UI using `client` over HTTP |
| Embedded | Whatever the embedding code imports | The embedding app's own UI |

- `apps/cli` is a full command line: the TUI by default, and a print mode like Pi's and OpenCode's that runs a prompt without the TUI and writes the result to stdout.
- `liminal connect` saves a provider's credentials: pick a provider, then a login method, then enter an API key or finish an OAuth flow. The TUI's `/connect` and the desktop app use the same login methods and credentials file.
- Print mode is a frontend over `client`. `-p` writes the final reply when the turn ends; `--json` writes saved events and deltas as JSON lines. Questions and approvals are denied unless `--approve` is passed. There is no RPC mode over stdin; `http` covers remote control.
- No host runs a server unless it composes `http`. A CLI that composes `http` lets a second client attach to a running session.
- `http` serves every plugin's RPC group over HTTP; `actors` supplies the caller through RPC middleware.
- `client` depends on Effect, so a browser island that uses it loads Effect.

### Multiple processes

A server runs sessions across many processes sharing one Postgres database through `postgres`. It needs:

- Runner: one process runs a session's turn at a time; `send` returns once the input is appended.
- Live deltas: viewers on any process see streaming output.
- Shutdown: on `SIGTERM` the runner stops at a step boundary; another process resumes the turn.

How `session` does these over `SqlClient` is open.

## Plugins

| Group | Plugin | Does | Mechanism | Previous code in `archive/packages/plugins/` |
| --- | --- | --- | --- | --- |
| Base | `directories` | `Directories`: the global, workspace and project folders | base | `archive/packages/sdk/src/core/directories.ts` |
| Base | `settings` | `Settings` over the global and project settings files, `Setting`, `DeclaredSettings` | base | `settings` |
| Base | `model` | Message types, providers, `ModelCall`, `Models` | base | `models`, `decisions` |
| Base | `session` | The session log over `SqlClient`, event kinds, deltas | base | `session-log`, `session-store`, `notices` |
| Base | `tools` | Tool registry, `ToolCall` | base | `tools` |
| Base | `tool-definitions` | `ToolDefinitions`, tool list records and notes | base | `tools` |
| Base | `system-prompt` | `Sections`, the logged system prompt, change notes, fold | base | `context` |
| Base | `persona` | Who the agent is and how it talks, as a section | base | `context` |
| Base | `history` | `Converters`, `History` | base | `context` |
| Base | `loop` | The turn, the inbox, `Send`, `Commands`, `BeforeCall`, `TurnEnd`, cancel | base | `agent-loop`, `cancel`, `inbox` |
| Providers | `model-anthropic`, `model-openai`, `model-codex`, `model-openrouter`, `model-opencode-go` | Model providers and their logins | Add | same names |
| Providers | `model-scripted` | Scripted replies for tests | Add | `model-scripted` |
| Providers | `model-catalog` | Names, limits, prices from models.dev | base service | `model-catalog` |
| Providers | `accounts` | Credentials, login methods, `liminal connect` and `/connect` | Add | `logins`, `credential-store` |
| Storage | `sqlite`, `postgres` | The database: Effect's `SqlClient`; plugins that keep state own their tables | Replace | `session-store`, `credential-store` |
| Tools | `tools-files` | `read`, `edit`, `write`, `@` file tags | Add | `files`, `tools-read`, `tools-edit` |
| Tools | `tools-shell` | `shell`, command runner, shell safety, background processes | Add | `tools-shell`, `command-runner`, `shell-safety`, `processes` |
| Tools | `tools-web` | `websearch`, `webfetch` | Add | `tools-web` |
| Tools | `tools-execute` | Code mode | Add | `tools-execute` |
| Tools | `tools-search` | Deferred tools | Add, Wrap | `tools-search` |
| Tools | `tool-output` | Output limits | Wrap | `tool-output` |
| Context | `instructions` | Base prompt, `AGENTS.md`, `.liminal/instructions/` | Add | `system-prompt`, `agents-files`, `instruction-files` |
| Context | `environment` | Workspace facts | Add | `environment` |
| Context | `skills`, `references`, `vocabulary` | Skill folders, reference repos, project terms | Add | same names |
| Features | `approvals` | Tool call gate: decision model, reviewer, user | Wrap | `approval` |
| Features | `questions` | `ask_question`, `/qna` | Add | `questions` |
| Features | `memory` | Checkpoints, notes, context window | Wrap | `memory` |
| Features | `session-name`, `usage`, `cache-hints` | Naming, cost, cache marks | Add, Attach, Wrap | same names |
| Features | `checks`, `commit` | Project checks, `/commit` | Wrap, Add | same names |
| Hosting | `loader` | Plugin folders, `plugins.json`, trust, reload | host level | `trust`, `archive/packages/kernel` |
| Hosting | `actors` | Who sent each input | Attach, Wrap | none |
| Hosting | `http` | Serves plugins' RPC groups over HTTP | none | `archive/packages/kernel/src/server` |
| TUI | `chat` | Chat screen, composer, the session slots | Add (slots) | `chat`, `inbox` (composer) |
| TUI | `palette`, `theme`, `attention` | Command palette, theme, sounds | Add (slots) | same names |

## Example: the work order agent

A Deno/Fresh app on AWS Fargate embeds Liminal on its server. People reach the agent two ways: by @mentioning it in a work order chat thread, and through a multiplayer agent panel. Each thread the agent is pulled into is its own session.

```ts
compose([...agent(), postgres, modelAnthropic,
         actors, approvals, workOrders, workOrderThreads, http])
```

| Need | Plugin | Mechanism |
| --- | --- | --- |
| Session per thread | `work-order-threads` | Session `Subject` attribute plus its own thread-to-session table |
| Chat history on @mention | `work-order-threads` | The app's save-message code calls `mention({ threadId, message, actor })`, which sends a chat-history input with the messages since the agent's last read, then the mention |
| Reply in the thread | `work-order-threads` | `TurnEnd` hook inserts the reply into the app's thread table, so the existing thread UI shows it |
| Work order context | `work-orders` | Adds a `Section` |
| Work order tools | `work-orders` | Adds `Tools` that call the app's API with the actor's permissions |
| Multiplayer panel | `http` + `client` | A Preact island uses the session view and its own components |
| Acting for whoever steered | `actors` | `Actor` attribute on inputs |

- The Fresh route mounts the `http` handler and the app's auth supplies the actor.
- @mention UI is the app's: Agent as a mentionable participant, an optional working indicator, approvals as a message with buttons or a link to the panel.
- An agent reply can link to the panel, which opens the thread's session.

## Distribution

### Packages

All packages publish to npm as ESM JavaScript with type declarations, so Node, Bun and Deno (through `npm:` specifiers) consume them the same way.

| Package | Holds |
| --- | --- |
| `@shanepadgett/liminal-core` | Core |
| `@shanepadgett/liminal-directories`, `-settings`, `-model`, `-session`, `-tools`, `-tool-definitions`, `-system-prompt`, `-persona`, `-history`, `-loop` | Base plugins with their contracts |
| `@shanepadgett/liminal-agent` | `agent()`: the base plugin list, for embedding in one import |
| `@shanepadgett/liminal-<plugin>` | Providers and features |
| `@shanepadgett/liminal-model-wire` | The Anthropic Messages, OpenAI Responses and Chat Completions wire code providers share; a library, not a plugin |
| `@shanepadgett/liminal-client` | Client and session view |
| `@shanepadgett/liminal-tui` | TUI frontend and the UI kit for `tui` entries |

- Every package is named `@shanepadgett/liminal-<name>`.

- Every workspace package shares one version.
- Core, base plugins and `client` run on any runtime; see [Layers](#layers).

### CLI binary

- `apps/cli` compiles with `bun build --compile` into one `liminal` executable per platform.
- The binary contains core, the built-in plugins, the TUI and `loader`.
- `loader` reads `~/.liminal/` and `<project>/.liminal/` for installed bundles and `plugins.json`, and imports them at startup.
- Reload restarts the app and reopens the current session from its log: `/reload` in the TUI, a banner in the desktop app when plugins change. Nothing is rebuilt in-process.

### Desktop app

- `apps/desktop` runs the same composition as the CLI in a Bun main process and renders a webview frontend connected through `client` over IPC.
- It installs and loads bundles from the same folders as the CLI.

### Embedding

- An app installs `@shanepadgett/liminal-agent` and the plugins it wants, composes them in code, and serves them with `http` or calls them directly.
- Embedded compositions import plugins statically. They need no loader, no plugin folders and no reload.

## External plugins

A bundle is the distribution unit for external plugins: an npm, git or local package containing one or more plugins.

```json
{
  "name": "@acme/liminal-jira",
  "type": "module",
  "exports": { ".": "./dist/plugin.js", "./contract": "./dist/contract.js" },
  "peerDependencies": { "@shanepadgett/liminal-core": "x.y.z", "@shanepadgett/liminal-tools": "x.y.z", "effect": "x.y.z" },
  "liminal": { "plugins": ["./dist/plugin.js"] }
}
```

- A bundle depends on `@shanepadgett/liminal-core`, `effect` and the contracts it extends as peer dependencies.
- A bundle exports its contract separately, so other bundles can extend it without loading its implementation.
- Embedding apps use a bundle by importing it. The CLI and desktop use a bundle by installing it into a plugin folder, where `loader` finds it through the `liminal` key.
- Loaded bundles get the host's copy of core, Effect, OpenTUI and every contract, so service tags and schemas match. `loader` does this with OpenTUI's runtime plugin support, whose module map points those imports at the host's instances, including inside a compiled binary.
- A project's bundles and `plugins.json` load only in a trusted workspace.

## Open

- How `loader` installs bundles from npm and git.
- Who may call which plugin RPC on a shared server: a policy middleware in `actors`, so a person connected over `http` cannot reach every declared function, such as logins.
- How `loop` runs one turn per session and keeps its queue, and how `session` streams live deltas, across processes over `SqlClient`: two apps sharing `liminal.db`, or a server.
