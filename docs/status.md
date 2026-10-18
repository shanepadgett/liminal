# Status

Step 1 is built: the SDK plugin definition and test harness, the kernel host, `session-store` and `session-log`. `apps/cli` boots `packages/plugins/` and prints each plugin's status; `apps/cli/test/restart.test.ts` proves entries survive a restart. The gallery (`apps/gallery`) holds the TUI components.

Step 2 is built ([plans/archive/step-2.md](plans/archive/step-2.md)): `KeyedRegistry` in the SDK, `models`, `model-scripted`, `tool-registry` and `context`; their `RpcGroup`s come with step 5.

Step 3 is built ([plans/archive/step-3.md](plans/archive/step-3.md)): the SDK `Pipeline`, `tool-pipeline` and `agent-loop`; turns with tool calls, steering, follow-ups, retry, cancel and resume run on the scripted provider.

Step 4 is built ([plans/archive/step-4.md](plans/archive/step-4.md)): `settings`, `credential-store`, `command-runner`, the file and shell tools and `model-codex`; a turn on the replayed Codex provider reads a workspace file and answers from it.

Step 5 is built ([plans/archive/step-5.md](plans/archive/step-5.md), [plans/archive/tui-session.md](plans/archive/tui-session.md)): the kernel serves `KernelRpcs` and every active plugin's `RpcGroup` over an in-memory ndjson socket, with the `EventBus` and session following through `SessionFeed`; `session-store` keeps a session index; `apps/cli` runs the TUI: `packages/frontend` loads each plugin's UI part into the slot tree, and the `chat`, `inbox`, `cancel` and tool parts draw the chat screen on a live session.

Step 6 is built ([plans/archive/step-6.md](plans/archive/step-6.md)): the kernel holds plugin graphs by reference count and `Kernel.reload` rebuilds changed plugins and their dependents beside the running graph; requests, steps and `Work` tasks finish on the graph they hold; `agent-loop` turns run as kernel-held work and resume at boot; `apps/cli/src/supervisor.ts` restarts the app on exit code 75.

Reload at turn end is built ([plans/reload.md](plans/reload.md)): each plugin package loads in its own `Bun.ModuleGraph` with the host's shared modules; the kernel's reload machine checks changed code aside and applies it under the `TurnGate` once no turn runs, swapping the graph for plugin changes or exiting 75 for the rest; the `reload` plugin shows a ready reload or a failed check in the chat header and applies it on ctrl+r; `mise run dev` runs the supervisor.

Third-party parity is built ([plans/archive/third-party.md](plans/archive/third-party.md)): plugin packages are publishable with other plugins as peers, enforced by the anatomy check; the kernel serves each plugin package's exports from the folder it loaded that package from, so a plugin never reads its own installed copy; the app loads plugins from the built-in folder, `~/.liminal/plugins/` and `<project>/.liminal/plugins/`; `apps/cli/test/plugins/pins` is a third-party plugin that saves its own entry kind and draws it in the transcript.

Connect and login step 1 is built ([plans/connect.md](plans/connect.md)): `model-catalog` serves `models.dev` model details from a cache; `models` lists a provider's models from a fixed list, the catalog, or the catalog filtered by a plan list; each model has its own thinking options, picked after the model in `/model`. No login exists yet, so in the running app Codex lists no models.

Connect and login step 2 is built ([plans/connect.md](plans/connect.md)): `@liminal/sdk/ai` holds the shared `effect/ai` translation; `logins` runs login flows on the server and draws `/connect`; `model-openai` signs in with an API key; `/model` lists only signed-in providers, with the failure under one whose list failed.

Connect and login step 3 is built ([plans/connect.md](plans/connect.md)): `LoginFlow.authorizeInBrowser` runs PKCE, a local callback server and the paste fallback; `model-codex` signs in in the browser or with a device code; live Codex tests read Liminal's credential store. A live sign-in works with `originator: liminal`. Plan lists come from a kept copy and are read again behind it.

Connect and login step 6 is built ([plans/connect.md](plans/connect.md)): `@liminal/sdk/ai/{messages,responses,chat}` hold the protocol streams; `model-openrouter` and `model-opencode-go` sign in with API keys; neither has had a live request yet.

Instructions steps 1 to 5 are built ([plans/instructions.md](plans/instructions.md)): `context` sends section updates as a user-role instructions reminder; `notices`; `chat` draws only its own entries; `tools` puts each tool's `guidance` lines in the system prompt; `system-prompt` holds the base prompt; `environment` holds the workspace facts and file listing.

Tool packages are built ([plans/tools.md](plans/tools.md)): `tools` holds the registry, pipeline and guidance; `context` takes tool lists through `ToolSources`; `files` gives `WorkspaceFiles`; `tools-read`, `tools-edit` (`edit` and `write`) and `tools-shell`.

Guides are written ([guides/](guides/_index.md)): plugins, TUI parts, model providers and testing, each matching the built code.

## Focus

- Each step's code plan goes in `docs/plans/` and is built right away; the user reviews plan and code afterwards.
- Questions the contracts leave open: pick what fits the contracts and prior art, build it, list it under `Open` in that step's plan; stop if it would change an agreed requirement or contract.
- Live model tests use the `codex` login in Liminal's credential store, read only while valid; never refresh it; pause live recording when it expires. Tau's tokens are never refreshed.
- Approved dependencies: `@effect/ai-openai` (or a direct HTTP provider if it cannot reach `chatgpt.com/backend-api/codex`), `@effect/ai-anthropic`, `jsonc-parser`.
- One local commit per finished step, only when checks pass; no pushes.
- "What's next" means live checks of built work are done; answer with the next build or planning step.

## Next

- Plan plugin toggles: user and project config enable, disable and replace plugins, so third parties can replace built-ins
- Build instructions step 6 ([plans/instructions.md](plans/instructions.md)), then plan folding; Liminal is not usable day to day without them.
- Read <https://anoma.ly/notes/opencode-reloaded>, only up to its "The End" heading; the rest is unrelated
- Settle the open items in the plugin files: [agent-loop](plugins/agent-loop.md), [context](plugins/context.md), [compaction](plugins/compaction.md), [file-snapshots](plugins/file-snapshots.md), [processes](plugins/processes.md), [questions](plugins/questions.md).

## Open topics

- Code conventions: port Tau's standards and custom lint rules, reviewed per rule
- Host copies of shared modules: plugins loaded from user and project folders must get the host's `effect`, `@liminal/sdk` and OpenTUI, never their own copies. OpenCode does this with a Bun plugin that serves host modules and rejects plugin copies (`packages/plugin/src/runtime.ts`); [plans/reload.md](plans/reload.md) serves them into each build's `Bun.ModuleGraph`, and plugin packages' exports come from the folder the host loaded them from; an import of a package no plugin folder holds still resolves the plugin's own copy
- ACP adapter as a server plugin
- Approvals: safe shell commands (split with `unbash`, an extensive default safe list including pipes) run without review; others go to a decision model (Jev or Luna) when one is available, which approves or hands off when unsure, when the user should decide, or when the call runs code it cannot see; the hand-off goes to the provider's cheap model, which approves or writes a plain-language description for the user; reviewers approve anything on task that is not destructive and irreversible, and ask only for state changes outside what the user asked for; context is the last two user prompts and the final assistant messages; cheap models: Anthropic `claude-haiku-5-5`, OpenAI providers Luna 6, OpenCode Go and OpenRouter DeepSeek 4.1 Flash latest
  - Reviewed: `shell` always; `write` and `edit` only for paths outside the workspace
  - Decision model: Jev through OpenRouter when signed in, else Luna Decisions when it is the only one available
  - Reviewer: always the session provider's cheap model
  - Every provider names a cheap model that any plugin can use
  - The review is one model call with structured output and only `read` and safe-list shell; any other shell command is blocked for the reviewer, and its guidance says so
  - Per-session mode through an `/approval-mode` dialog and `shift+tab`; the composer shows the mode next to the model
- Collab-style session sharing through an encrypted relay
- TUI: built per [plans/archive/tui-session.md](plans/archive/tui-session.md); its `Open` list holds the choices made while building (entry kinds drawn by `chat`, tokens moved into `@liminal/sdk/tui`).
- Gallery: its own isolated app, a minimal Storybook for the TUI; built before any TUI components or screens; every element, primitives through screens, is approved there first; houses its own components, duplication accepted; keep Tau's tier, state and width rules, redesign the shell

## Later

- Switch from oxlint and oxfmt to Bun's built-in `bun lint` and `bun fmt` once they are in a stable Bun release and run Liminal's custom JS rules and type-aware lint; they read `.oxlintrc.json` and oxfmt configs (oven-sh/bun#44805, canary only in Oct 2026). Until then lint rule tests stay on Node: oxc will not support `RuleTester` on Bun (oxc#26740)
- Release tooling, probably changesets with a `fixed` group as Effect uses; `changeset publish` runs `npm publish`, which leaves `workspace:*` unresolved under Bun (changesets#1468, bun#16074), so publish with `bun publish`
- Bundles: named plugin sets
- Subagents: the user does not use them
- MCP as its own plugin, including tools hidden until found by search
- Sandboxing commands in an OS jail, as a command runner provider
- Automatic approvals by a model judge, as its own plugin (prior art: Codex, Goose `SmartApprove`, Tau main branch)
- Trust boundaries: UI parts from untrusted servers, plugin permissions

## Sessions

Pi session IDs and the topics each discussed.

- 01a1422a-e542-7552-bffd-f776453ed1b6: Goals, Architecture, Plugin model, Frontends, Repository
- 01a142dc-34b1-7558-a286-281c362d462a: Frontends, Gallery
- 01a1430c-57fe-7284-8f7a-053cbfe928dc: TUI design, Ornament placement, Gallery, Transcript styles
- 01a145a9-703a-7284-8f7a-054aea36ec2c: TUI design (transcript)
- 01a14649-dee8-74a7-b272-e37fd82f47b6: Sessions, Plugin catalog, docs layout
- 01a1473c-d9a2-74a7-b272-e383d7bf6e43: session-log contract, entry kinds and visibility, compaction memories, plugin foundation, build order, testing, step 1 build, repository layout
- 01a14808-d956-74a7-b272-e38f743d4301: Planning approach, core contracts, graph changes, protocol, models, context, agent-loop, tools, settings, credentials, step 1 re-check, steps 2 to 6 build, gallery and TUI sync, TUI slot contract, reload at turn end, slash commands and dialogs, connect and login, model catalog and thinking options, contracts importing contracts, TUI keys, blank launch and restart handoff, connect step 6 (SDK protocol subpaths, no local provider), instructions plan, notices, one package per tool
