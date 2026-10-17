# Status

Step 1 is built: the SDK plugin definition and test harness, the kernel host, `session-store` and `session-log`. `apps/cli` boots `packages/plugins/` and prints each plugin's status; `apps/cli/test/restart.test.ts` proves entries survive a restart. The gallery (`apps/gallery`) holds the TUI components.

## Focus

- Step 2 of [plans/milestones.md](plans/milestones.md): `models` seam with a scripted fake provider, minimal `context`, one-step `agent-loop`.

## Next

- Review the transcript in a live terminal ([plans/transcript.md](plans/transcript.md)).
- Plan step 2.
- Settle the open items in the plugin files: [agent-loop](plugins/agent-loop.md), [context](plugins/context.md), [compaction](plugins/compaction.md), [file-snapshots](plugins/file-snapshots.md), [processes](plugins/processes.md), [questions](plugins/questions.md).

## Open topics

- CLI folders are provisional: global `~/.liminal`, project `<cwd>/.liminal`, data `~/.liminal/data`
- Step 1 differs from its plan: `EntryKinds` is a `Registry`, so there is no `DuplicateEntryKind`; one global append lock instead of one per session; `SessionLog.create` added; the restart proof lives in `apps/cli` because fallow forbids kernel importing plugins; `effectTest` takes the layer as a required third argument
- Code conventions: port Tau's standards and custom lint rules, reviewed per rule
- Stable service handles vs rebuilding dependents on swap
- Host copies of shared modules: plugins loaded from user and project folders must get the host's `effect`, `@liminal/sdk` and OpenTUI, never their own copies. OpenCode does this with a Bun plugin that serves host modules and rejects plugin copies (`packages/plugin/src/runtime.ts`)
- ACP adapter as a server plugin
- Collab-style session sharing through an encrypted relay
- TUI
- Gallery: its own isolated app, a minimal Storybook for the TUI; built before any TUI components or screens; every element, primitives through screens, is approved there first; houses its own components, duplication accepted; keep Tau's tier, state and width rules, redesign the shell

## Later

- Release tooling, probably changesets with a `fixed` group as Effect uses; `changeset publish` runs `npm publish`, which leaves `workspace:*` unresolved under Bun (changesets#1468, bun#16074), so publish with `bun publish`
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
- 01a1473c-d9a2-74a7-b272-e383d7bf6e43: session-log contract, entry kinds and visibility, compaction memories, plugin foundation, build order, testing, step 1 build, repository layout
