# Plan: milestone 3, the coding agent

Tools that read, edit and run things, the prompt that tells the model where it is, and the questions and approvals that keep the user in charge. Work list: [plugins/coding.md](../plugins/coding.md). Each step has its own plan; built steps are in `_archive/`.

## Systems

| System | Change |
| --- | --- |
| `packages/plugins/tools-read`, `tools-edit`, `tools-write` | Add `read`, `edit`, `write` |
| `packages/plugins/tools-shell`, `tools-processes` | Add `shell` and background processes |
| `packages/plugins/tools-web` | Adds `websearch`, `webfetch` |
| `packages/plugins/tool-output` | Adds a `ToolCall` wrap that cuts large results and saves the whole output |
| `packages/plugins/instructions`, `environment` | Add prompt sections: the base prompt, `AGENTS.md`, `.liminal/instructions/`, workspace facts |
| `packages/plugins/questions`, `approvals` | Add questions as events and answers as inputs; a `ToolCall` wrap that asks before risky calls |
| `model` contract | Changes `ToolResult`: text and image parts, not only JSON; `generateObject` takes tools |
| `tools` contract | Expands `Tool` with `access` and `sequential`, and `ToolContext` with progress |
| `chat` | Expands: diffs for edits, shell output as it runs, the question in the composer's place |
| `.liminal/` | Holds the instruction files with `read-when` front matter |

## Build order

| Step | Plugins | Plan |
| --- | --- | --- |
| 1 | `instructions`, `environment`; `.liminal/instructions/` | [coding-prompt-sections.md](_archive/coding-prompt-sections.md) |
| 2 | `read`, `tool-output`; `ToolResult` parts | [coding-read.md](_archive/coding-read.md) |
| 3 | `questions` | [coding-questions.md](_archive/coding-questions.md) |
| 4 | `tools-shell`, `tools-processes`; `ToolContext.progress` | [coding-shell.md](_archive/coding-shell.md) |
| 5 | `approvals`; `Tool.access` | [coding-approvals.md](_archive/coding-approvals.md) |
| 6 | `tools-read`, `tools-edit`, `tools-write`; diffs in chat | [coding-edit-write.md](_archive/coding-edit-write.md) |
| 7 | `tools-web` | [coding-web.md](coding-web.md) |
| 8 | Liminal works on its own repository | Not planned yet |

- Each tool is its own plugin, so one can be swapped, such as an OpenAI patch tool for `edit` and `write`.
- Each contract change lands with its first user. Its shape comes from the code that needs it.
