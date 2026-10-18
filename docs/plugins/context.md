# context

Builds what the model sees from a session's entries.

Status: built

## Provides

- `Context` service: `build` writes the sync entry and returns the next model request; `preview` returns it without writing
- `PromptSections` registry
- `RpcGroup` with `preview`
- View steps: an ordered chain that plugins add to; each rewrites the entries before they become messages
- `RequestSteps`: an ordered chain that rewrites the finished request, for build and preview alike; what a step adds is never saved

## Requires

- `SessionLog`

## Adds

- Entry kinds: context message, system prompt and tools

## Requirements

- System prompt, instructions, compaction and cache hints are separate plugins that add to the context
- Builds model messages from the text saved on each entry; needs no converter per entry kind
- A shared context message kind holds a plugin's label, its text and a show or hide setting on each entry; plugins use it for nudges, notices and similar messages
- The system prompt and tool list live in the log: the first request saves every prompt section and tool, and later entries add, replace or remove sections and tools
- Sections sort by number, then key
- A section reads a value, and the sync entry saves that value with the text it rendered; each section renders its first text, a change from the saved value and, optionally, a removal
- A failed read keeps the saved value and writes nothing for that section
- Before every model call, the context compares current sections and tools with the saved ones and appends one entry at the point of change when they differ
- The baseline is the system message; an update is a user message with the changed section texts in `<reminder kind="instructions">`, then its tool changes, which a provider without native tool changes receives in `<reminder kind="tools">`
- Knows nothing about checkpoints; when no saved baseline is left in view after the view steps, it writes a full one
- The context stays append-only between checkpoints
- An instruction file such as `AGENTS.md` that changes before a checkpoint reaches the model as a diff against the text it saw
- File sections share one value shape (`FileTexts`) and renderer: whole files at first; later a diff, or the whole new text when the diff is longer; a removed file gets a line telling the model to stop following it
- Each tool is declared in the baseline as offered or not; offering and withdrawing a tool are entries at the point of change
- A provider that cannot offer or withdraw a tool mid-conversation keeps every declared tool in the request, and a call to a tool not offered is refused
- A tool that appears after the baseline is declared and offered by one entry at that point; providers that can define a tool mid-conversation do so there, and others add it to the tool list at once
- No entry kind hides or replaces an earlier entry for the model (no Pi `context_edit`)

## References

- Tau `src/core/ContextMethod.ts`, `src/session/Reminder.ts`
- Pi `docs/session-format.md`: system messages, `custom_message`, `context_edit`
- OpenCode `session.synthetic`, `session.instructions.updated`
- Goose `MessageMetadata`: `user_visible`, `agent_visible`
