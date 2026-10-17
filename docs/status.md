# Status

Nothing in the agent is built yet: `kernel/src/kernel.ts` and `sdk/src/sdk.ts` are stubs and `plugins/` is empty. The gallery (`apps/gallery`) holds the TUI components.

## Focus

- Core service contracts for a plain chat: `session-log`, `session-store`, `agent-loop`, `context`, then `models`, `credential-store`, `tool-registry`, `tool-pipeline`, `settings`.

## Next

- Review the transcript in a live terminal ([plans/transcript.md](plans/transcript.md)).
- Settle the open items in the plugin files: [session-store](plugins/session-store.md), [agent-loop](plugins/agent-loop.md), [context](plugins/context.md), [compaction](plugins/compaction.md), [file-snapshots](plugins/file-snapshots.md), [processes](plugins/processes.md), [questions](plugins/questions.md).

## Open topics

- Code conventions: port Tau's standards and custom lint rules, reviewed per rule
- Stable service handles vs rebuilding dependents on swap
- ACP adapter as a server plugin
- Collab-style session sharing through an encrypted relay
- TUI
- Gallery: its own isolated app, a minimal Storybook for the TUI; built before any TUI components or screens; every element, primitives through screens, is approved there first; houses its own components, duplication accepted; keep Tau's tier, state and width rules, redesign the shell

## Later

- Bundles: named plugin sets
- Subagents: the user does not use them
- Trust boundaries: UI parts from untrusted servers, plugin permissions

## Sessions

Pi session IDs and the topics each discussed.

- 01a1422a-e542-7552-bffd-f776453ed1b6: Goals, Architecture, Plugin model, Frontends, Repository
- 01a142dc-34b1-7558-a286-281c362d462a: Frontends, Gallery
- 01a1430c-57fe-7284-8f7a-053cbfe928dc: TUI design, Ornament placement, Gallery, Transcript styles
- 01a145a9-703a-7284-8f7a-054aea36ec2c: TUI design (transcript)
- 01a14649-dee8-74a7-b272-e37fd82f47b6: Sessions, Plugin catalog, docs layout
