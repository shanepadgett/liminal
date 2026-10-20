# tools

The tools the model can call, how each call runs, and how the model should use them.

Status: built

## Requires

- `PromptSections`
- `ToolSources`

## Provides

- `Tools`, keyed by tool name
- `ToolPipeline`
- `ToolChecks`
- `ToolWrappers`
- `Approvers`: the newest registration answers asks; with none, an ask is denied

## Requirements

- Registers every tool in `Tools` as one list in `ToolSources`
- One prompt section, `tools/guidance`, at order 50
- `guidance` holds only rules across tools; the section lists the lines of tools with `offer: "start"`, in tool-name order, each line once
- A deferred or plugin-offered tool carries all its rules in its description
- The section renders as `<tool_rules>`
- A tool added or removed later sends only its new or dropped lines, in the instructions reminder
- No lines, no text
