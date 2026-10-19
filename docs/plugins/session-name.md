# session-name

The `name_session` tool: the model names its session once; a checkpoint renames it later.

Status: built

## Requires

- `SessionLog`, `Tools`, `ToolChecks`

## Adds

- The `name_session` tool

## Requirements

- The model calls `name_session` with a name; the session list shows it instead of the first user message
- A name is one line of 1 to 80 characters with no edge whitespace, about 10 words; a bad name fails the call with the reason
- Guidance in the system prompt: name the session once, after the first exchange makes the topic clear, never on a vague opening message; never rename, because `checkpoint` renames
- A check allows `name_session` once per session; a later call is denied with a reason pointing to the checkpoint's `name` field
- The tool stays in the tool list, so the cached request prefix is unchanged
- A fork starts with its parent's name, so its first call is denied
- The call has no row in the transcript
- The call returns the name it set

## References

- Compaction's forced check, which denies tools while keeping them listed
