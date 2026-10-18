# Tools

One `tools` plugin owns the tool plumbing; a `files` plugin owns workspace file access; file tools sit in two packages.

## Packages

| Package | Holds | Replaces |
| --- | --- | --- |
| `tools` | `Tools`, `ToolPipeline`, `ToolChecks`, `ToolWrappers`, `Approvers`; the `tools/guidance` prompt section; the tool list for context | `tool-registry`, `tool-pipeline`, `tool-guidance` |
| `files` | `WorkspaceFiles`: resolve, read and write files in the workspace | file access inside each tool |
| `tools-read` | `read` | unchanged package, now over `WorkspaceFiles` |
| `tools-edit` | `edit` and `write`: the tools that change files | `tools-write` |
| `tools-shell` | `shell` | unchanged |

## The flip

`context` no longer knows `Tools`. It owns a registry other plugins add tool lists to:

```ts
// @liminal/context/contract
/** Lists of tools the model can call; the request declares every list's tools, in order. */
export class ToolSources extends Registry.Service<
  ToolSources,
  Effect.Effect<ReadonlyArray<ModelTool>>
>()("liminal/context/ToolSources") {}
```

- `context` provides `ToolSources`, drops `uses: [Tools]`, and reads `toolSources.list` where `toolsOf` was.
- `tools` requires `PromptSections` and `ToolSources`, and in its server registers:
  - `Effect.map(tools.list, (all) => all.map((tool) => ({ ...tool.spec, offered: tool.offeredAtStart })))` into `ToolSources`
  - the guidance section, key `tools/guidance`, order 50

Dependency order: `session-log` ← `context` ← `tools` ← `tools-*`, `agent-loop`.

## Contracts

```ts
// @liminal/tools/contract: the old tool-registry and tool-pipeline contracts, tags renamed to liminal/tools/*

// @liminal/files/contract
export class FileFailed extends Schema.TaggedError<FileFailed, { readonly brand: unique symbol }>()(
  "FileFailed",
  { path: Schema.String, message: Schema.String },
) {}

export class WorkspaceFiles extends Context.Service<WorkspaceFiles, {
  /** `file` as an absolute path; a relative one resolves in the workspace. */
  readonly resolve: (file: string) => string;
  readonly read: (file: string) => Effect.Effect<string, FileFailed>;
  /** Writes the whole file, making its folders. */
  readonly write: (file: string, content: string) => Effect.Effect<void, FileFailed>;
}>()("liminal/files/WorkspaceFiles") {}
```

- `files` server: `FileSystem`, `Path` and `Directories.workspace`; maps `PlatformError` to `FileFailed`.
- Each file tool maps `FileFailed` to `ToolFailed`.

## Call path

```text
agent-loop turn
  → Context.build → toolSources.list → tools plugin's source → Tools.list
  → model call → ToolPipeline.run(call, Tools.get(name))
  → tools-read / tools-edit run → WorkspaceFiles.read / write
```

## Deleted

- `packages/plugins/tool-registry/`, `tool-pipeline/`, `tool-guidance/`, `tools-write/`
- `docs/plugins/tool-guidance.md` (its requirements move to `docs/plugins/tools.md`)

## Updated

- Imports and peers: `agent-loop`, `context`, `cancel`, `inbox`, `notices`, `model-codex` tests, `tools-*`
- `apps/cli/test/restart.test.ts` plugin list
- `docs/plugins/_index.md`, `docs/requirements/03-plugin-model.md`, guides, `docs/status.md`
