# tools

The tools the model can call, how each call runs, and how the model should use them.

Status: built

## Requires

- `PromptSections`
- `ToolSources`

## Uses

- `Approvals`

## Provides

- `Tools`, keyed by tool name
- `ToolPipeline`
- `ToolChecks`
- `ToolWrappers`

## Requirements

- Registers every tool in `Tools` as one list in `ToolSources`
- One prompt section, `tools/guidance`, at order 50
- Lists the `guidance` lines of every registered tool, in tool-name order, each line once
- A tool added or removed later sends only its new or dropped lines, in the instructions reminder
- No lines, no text
