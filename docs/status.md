# Status

Step 1 is built: the SDK plugin definition and test harness, the kernel host, `session-store` and `session-log`. `apps/cli` boots `packages/plugins/` and prints each plugin's status; `apps/cli/test/restart.test.ts` proves entries survive a restart. The gallery (`apps/gallery`) holds the TUI components.

Step 2 is built ([plans/archive/step-2.md](plans/archive/step-2.md)): `KeyedRegistry` in the SDK, `models`, `model-scripted`, `tool-registry` and `context`; their `RpcGroup`s come with step 5.

Step 3 is built ([plans/archive/step-3.md](plans/archive/step-3.md)): the SDK `Pipeline`, `tool-pipeline` and `agent-loop`; turns with tool calls, steering, follow-ups, retry, cancel and resume run on the scripted provider.

Step 4 is built ([plans/archive/step-4.md](plans/archive/step-4.md)): `settings`, `credential-store`, `command-runner`, `tools-file`, `tools-shell` and `model-codex`; a turn on the replayed Codex provider reads a workspace file and answers from it.

Step 5 is built ([plans/archive/step-5.md](plans/archive/step-5.md), [plans/archive/tui-session.md](plans/archive/tui-session.md)): the kernel serves `KernelRpcs` and every active plugin's `RpcGroup` over an in-memory ndjson socket, with the `EventBus` and session following through `SessionFeed`; `session-store` keeps a session index; `apps/cli` runs the TUI: `packages/frontend` loads each plugin's UI part into the slot tree, and the `chat`, `inbox`, `cancel`, `tools-file` and `tools-shell` parts draw the chat screen on a live session.

Step 6 is built ([plans/archive/step-6.md](plans/archive/step-6.md)): the kernel holds plugin graphs by reference count and `Kernel.reload` rebuilds changed plugins and their dependents beside the running graph; requests, steps and `Work` tasks finish on the graph they hold; `agent-loop` turns run as kernel-held work and resume at boot; `apps/cli/src/supervisor.ts` restarts the app on exit code 75.

## Focus

- Review of the built steps 2 to 6 and the TUI session ([plans/archive/tui-session.md](plans/archive/tui-session.md), its `Open` list).
- Each step's code plan goes in `docs/plans/` and is built right away; the user reviews plan and code afterwards.
- Questions the contracts leave open: pick what fits the contracts and prior art, build it, list it under `Open` in that step's plan; stop if it would change an agreed requirement or contract.
- Live model tests use Tau's `codex`/`chatgpt` tokens read only while valid; never refresh them; pause live recording when they expire.
- Approved dependencies: `@effect/ai-openai` (or a direct HTTP provider if it cannot reach `chatgpt.com/backend-api/codex`), `jsonc-parser`.
- One local commit per finished step, only when checks pass; no pushes.

## Next

- Reload at turn end: [plans/reload.md](plans/reload.md), code-level plan next.
- Review the transcript in a live terminal ([plans/transcript.md](plans/transcript.md)).
- Read <https://anoma.ly/notes/opencode-reloaded>, only up to its "The End" heading; the rest is unrelated
- Settle the open items in the plugin files: [agent-loop](plugins/agent-loop.md), [context](plugins/context.md), [compaction](plugins/compaction.md), [file-snapshots](plugins/file-snapshots.md), [processes](plugins/processes.md), [questions](plugins/questions.md).

## Open topics

- Code conventions: port Tau's standards and custom lint rules, reviewed per rule
- Host copies of shared modules: plugins loaded from user and project folders must get the host's `effect`, `@liminal/sdk` and OpenTUI, never their own copies. OpenCode does this with a Bun plugin that serves host modules and rejects plugin copies (`packages/plugin/src/runtime.ts`); [plans/reload.md](plans/reload.md) serves them into each build's `Bun.ModuleGraph`; rejecting a plugin's own copies stays open
- ACP adapter as a server plugin
- Collab-style session sharing through an encrypted relay
- TUI: built per [plans/archive/tui-session.md](plans/archive/tui-session.md); its `Open` list holds the choices made while building (entry kinds drawn by `chat`, tokens moved into `@liminal/sdk/tui`). Model switching waits for the command palette.
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
- 01a14808-d956-74a7-b272-e38f743d4301: Planning approach, core contracts, graph changes, protocol, models, context, agent-loop, tools, settings, credentials, step 1 re-check, steps 2 to 6 build, gallery and TUI sync, TUI slot contract, reload at turn end
