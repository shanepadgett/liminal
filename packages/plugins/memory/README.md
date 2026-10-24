# @shanepadgett/liminal-memory

Long sessions keep going past the context window. The small model writes memories of the oldest work as the session goes; a checkpoint starts the model's context over from those memories, the recent work, a note and files read back in.

- Memories: once about 15K tokens of entries no memory covers pile up, a background writer, one per session, sums up the oldest of them with the small model, cutting only where no tool call waits for its result, and logs `memory/memory`. Once the memories pass 30K tokens it compacts all but the newest 8K of them into one. A failed write is logged as a warning and tried again on the next start.
- `checkpoint`: a tool, always offered, called alone. Its `note` carries the model on; `files`, with optional line ranges, are read back as `read` shows them, up to 30K tokens; `name` renames the session. It waits for the memories that are due, logs `memory/checkpoint`, then logs the system prompt and tool list again.
- Context after a checkpoint: a `History` wrap sends the checkpoint's memories as one user message, then the entries from the first one no memory covered. The tool call holding the note and its result with the files sit among them.
- Nudges: before each model call, at 150K, 200K and 250K tokens of context, each at most the window less 16K, a `memory/nudge` reminds the model to checkpoint. From the last one, a `ToolCall` wrap refuses every call but `checkpoint`.
- Automatic checkpoints: before a call, past 150K, a session whose cache has expired since its latest step, or whose model changed, checkpoints without a note. A call that fails because the context overflows checkpoints and tries the step again once, through `CallFailed`.
- `memory/status`: the session's memory count, checkpoint count and whether the writer is writing, then each change.
- `./contract` exports the three events, `checkpointName` and `MemoryRpc`.

Requires `SessionLog`, `Models`, `SessionModel`, `History`, `Converters`, `SystemPrompt`, `ToolList`, `Tools`, `ToolCall`, `BeforeCall`, `TurnEnd`, `CallFailed`, `Directories`, `FileSystem` and `Path`.

## TUI

The `tui` entry draws `memory/memory` as a star and the memory's line (hollow over entries, solid over compacted memories) and `memory/checkpoint` as a Checkpoint row with the number of files read back. It hides `checkpoint` calls through `ToolRows` and adds the Memory section to `chat`'s sidebar from the first memory: the memory and checkpoint counts, noted "writing" while the small model writes. It requires `ItemRenderer`, `ToolRows` and `Slots` and calls `memory/status`.
