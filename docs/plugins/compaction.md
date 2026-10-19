# compaction

Keeps the context within the model's window.

Status: built; memory files planned ([plans/memory.md](../plans/memory.md))

## Requires

- `Context`, `SessionLog`, `Tools`, `ToolChecks`, `BeforeCallHooks`, `Models`, `ModelTask`, `Settings`

## Adds

- A checkpoint entry kind
- A view step in the context's chain
- Rows in the sidebar's Context section

## Requirements

- Follows Tau: the agent writes its own checkpoint and continues, never waiting on a summary step
- Changes only what the model sees; visible history is never removed
- Shapes the model's view through its view step; the context knows nothing about checkpoints
- Keeps the view stable between checkpoints so the request stays append-only
- A separate, cheaper model writes bounded summaries of entry ranges in the background, as short-term and long-term memories
- Memories are stored beside the log, not in it, and stay out of the context until a checkpoint
- At a checkpoint, memories replace the entries they cover, reminders included

### Naming

- The plugin is `memory`: its package, entry kinds, RPCs and `settings.json` section use that name
- User-facing words are short-term memory and long-term memory, never notes or compaction
- Saved `compaction/*` entries are rewritten once to `memory/*` kinds

### Checkpoint

- The model writes a checkpoint through a `checkpoint` tool, called alone, with a handoff and an optional `name` that renames the session; the model fills it only when the current name no longer describes the work
- Hidden nudges at 50% and 75% of the budget; the 50% nudge says to keep working, the 75% nudge says to finish the current bounded unit and then checkpoint, and both say to send a final answer rather than checkpoint for it; at the budget every other tool is refused until a checkpoint
- Budget is the lesser of the context window less a 16,000-token reserve and a setting defaulting to 200,000
- Size is the last reply's input and output tokens, plus 4 characters per token for entries since
- After a checkpoint the model sees the system prompt, long-term memory, short-term memories, restored files, recent entries, the handoff, the session's name when it has one, then what follows

### System prompt

- The view step drops system prompt entries before the checkpoint, so the context sends a fresh baseline of current sections and tools
- Instruction reminders before the checkpoint are dropped
- A model or provider switch also sends a fresh system prompt, without folding entries

### Automatic checkpoints

- At 50% of the budget or more, with short-term memories the latest checkpoint does not use, a checkpoint is written automatically when the provider's cache is already lost: idle past the provider's cache lifetime, or a model or provider switch
- An automatic checkpoint has no handoff
- Each provider declares its cache lifetime

### Memories

- A cheap model (`Models.cheap`) writes short-term memories in the background, about one per 16,000 tokens of history, starting with the first 16,000
- When unfolded short-term memories pass about 30,000 tokens, they are condensed into long-term memory
- A fork reuses its parent's memories up to the fork point

### Memory files

- Each memory holds a summary and a file list: path, line ranges, relevant or not relevant, and a one-line reason
- A wrapper on the tool pipeline records what each `read`, `edit`, `write`, `shell` and `process_start` call read or changed, inner calls of `run` included; these are the candidates
- An edit's lines are where its new text sits after the call; a write covers the whole file
- A shell or process call changed the files `git status --porcelain` newly lists after it, or lists with another mtime or size
- The cheap model labels each candidate, and adds files it finds in shell commands and their output; code keeps an added file only when it exists in the workspace and its path appears in that range's commands or output
- Once file-snapshots is built, its workspace diffs replace `git status` for changed files
- Long-term memory merges the file lists; the newest label wins; deleted files drop out
- Files marked not relevant are listed in the memory with their reason and never read back

### Restored files

- `checkpoint` takes an optional `files` list of paths with optional line ranges; when given, it decides which files are restored
- Without it, the newest memories' relevant files are restored
- A checkpoint reads its restored files once and saves their text in the log, so the view stays stable
- A file under 300 lines is read whole; a larger one by its ranges with 20 lines of padding above and below, overlapping ranges merged
- Restored files are capped at 15% of the budget: the model's list first, then edited files, then the most recent; files left out are listed by path
- Each restored file reaches the model as its own `<reminder kind="files">` with its path and lines in `read` format; the files left out follow in one list

### History

- A `history` tool reads entries `from` through `through` back as a transcript, so the model can recall details a memory left out
- Its rows read `Recalled entries 12–40`

### Transcript

- The transcript keeps every entry; scrolling back shows everything before a checkpoint
- A checkpoint draws as a faint rule spanning the transcript, labeled "Checkpoint", with a blank line above and below
- The rule's label adds how many files the checkpoint read back, as in `Checkpoint · 6 files read`
- The handoff shows only in the debug view, under the rule, folded to its first line and unfolding on click
- The files read back show only in the debug view, after the handoff, folded to `▸ Files  4 read, 1 left out` and unfolding to each path with its lines, then the files left out
- The `checkpoint` tool call has no work row; only the rule shows
- Each short-term or long-term memory written shows in the transcript as one faint line with its entry range and tokens
- Nudges show only in the debug view

## Sidebar

- `compaction/status` streams the session's size, budget, stage, memory counts and the checkpoint count, again after each burst of new entries
- No section of its own: the Context section gains budget, short-term, long-term and checkpoints rows
- Budget shows tokens used and its share, in the warning color from the warning stage
- Short-term and long-term show counts of memories written

## References

- Tau `src/core/ContextMethod.ts`
- Pi `packages/coding-agent/src/core/compaction/utils.ts`: read and modified file lists in the summary
