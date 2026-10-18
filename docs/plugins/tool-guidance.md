# tool-guidance

Tells the model how to use the registered tools.

Status: built

## Requires

- `Tools`
- `PromptSections`

## Requirements

- One prompt section, `tool-guidance/rules`, at order 50
- Lists the `guidance` lines of every registered tool, in tool-name order, each line once
- A tool added or removed later sends only its new or dropped lines, in the instructions reminder
- No lines, no text
