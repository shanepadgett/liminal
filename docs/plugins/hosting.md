# Milestones 6 and 8: annexes, the binary, the server and embedding

Work for [status.md](../status.md) milestones 6 and 8. Hosts and distribution are in [architecture.md](../architecture.md#hosts).

## Milestone 6

### `loader`

- Host level, CLI and desktop only.
- Scans `~/.liminal/` and `<project>/.liminal/` for annexes, reads `plugins.json`, loads a project's annexes only in a trusted workspace.
- Rebuilds the composition between turns when an annex or `plugins.json` changes; watches with `fs.watch`.
- Imports annexes after installing OpenTUI's runtime plugin support with a module map for `effect`, `@liminal/*` contracts and OpenTUI.
- Previous code: `trust`, `reload`, `archive/packages/kernel/src/reload`.

```text
scan folders → read package.json "liminal".plugins → filter by plugins.json and trust
→ import → compose → on change: wait for turn end → compose new → swap → close old scope
```

### Binary

- `apps/cli` compiles with `bun build --compile`; annexes on disk use the binary's copy of core, Effect and contracts.

### Guides

- Plugin author guides in `guides/`, written from what milestones 1 to 6 settled.

## Milestone 8

### `actors`

- `Actor` attribute; `Send` middleware attaches it to every input from the caller's identity.
- Policy middleware decides who may answer questions and approvals.

### `http`

- Routes: `POST /sessions/:id/inputs`, `GET /sessions/:id/live` (SSE), `GET /sessions/:id/events?before=<id>`.
- A plain `Request → Response` handler a Fresh route can mount; the host supplies the actor.
- Previous code: `archive/packages/kernel/src/server`.

### `session-postgres`

- Replaces `SessionLog`: event and session tables, lease row runner, `LISTEN/NOTIFY` for live deltas, lease release on `SIGTERM`.

### Packages

- `client` over HTTP; `@liminal/agent` exporting `agent()`; npm publishing as ESM with types.

### Work order agent

- `work-orders` and `work-order-threads` in the Fresh app, as in [architecture.md](../architecture.md#example-the-work-order-agent).
