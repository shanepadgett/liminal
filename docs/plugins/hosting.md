# Milestones 6 and 8: bundles, the binary, the server and embedding

Work for [status.md](../status.md) milestones 6 and 8. Hosts and distribution are in [architecture.md](../architecture.md#hosts).

## Milestone 6

### `loader`

- Host level, CLI and desktop only.
- Scans `~/.liminal/` and `<project>/.liminal/` for bundles, reads `plugins.json`, loads a project's bundles and settings only in a trusted workspace.
- Imports bundles after installing OpenTUI's runtime plugin support with a module map for `effect`, `@liminal/*` contracts and OpenTUI.
- Reload restarts the app and reopens the current session from its log. Nothing is rebuilt in-process and no supervisor process runs.
  - TUI: a `/reload` command.
  - Desktop: a banner when a bundle or `plugins.json` changes.
  - In a Liminal checkout, a change to Liminal's own source offers the same reload.
- Previous code: `trust`.

```text
scan folders → read package.json "liminal".plugins → filter by plugins.json and trust
→ import → compose
```

### Binary

- `apps/cli` compiles with `bun build --compile`; bundles on disk use the binary's copy of core, Effect and contracts.

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

- Provides `SessionLog` on servers: event and session tables, lease row runner, `LISTEN/NOTIFY` for live deltas, lease release on `SIGTERM`.

### Packages

- `client` over HTTP; `@liminal/agent` exporting `agent()`; npm publishing as ESM with types.

### Work order agent

- `work-orders` and `work-order-threads` in the Fresh app, as in [architecture.md](../architecture.md#example-the-work-order-agent).
