# compaction

Keeps the context within the model's window.

Status: built

## Requires

- `Context`, `SessionLog`, `Tools`, `ToolChecks`, `BeforeCallHooks`, `Models`, `ModelTask`, `Settings`

## Adds

- A checkpoint entry kind
- A view step in the context's chain
- The sidebar's Compaction section

## Requirements

- Follows Tau: the agent writes its own checkpoint and continues, never waiting on a summary step
- Changes only what the model sees; visible history is never removed
- Shapes the model's view through its view step; the context knows nothing about checkpoints
- Keeps the view stable between checkpoints so the request stays append-only
- A separate, cheaper model writes bounded summaries of entry ranges in the background, as short-term and long-term memories
- Memories are stored beside the log, not in it, and stay out of the context until a checkpoint
- At a checkpoint, memories replace the entries they cover, reminders included

### Checkpoint

- The model writes a checkpoint through a `checkpoint` tool, called alone, with a handoff and an optional `name` that renames the session; the model fills it only when the current name no longer describes the work
- Hidden nudges at 50% and 75% of the budget; the 50% nudge says to keep working, the 75% nudge says to finish the current bounded unit and then checkpoint, and both say to send a final answer rather than checkpoint for it; at the budget every other tool is refused until a checkpoint
- Budget is the lesser of the context window less a 16,000-token reserve and a setting defaulting to 200,000
- Size is the last reply's input and output tokens, plus 4 characters per token for entries since
- After a checkpoint the model sees the system prompt, long-term memories, short-term notes, recent entries, the handoff, the session's name when it has one, then what follows

### System prompt

- The view step drops system prompt entries before the checkpoint, so the context sends a fresh baseline of current sections and tools
- Instruction reminders before the checkpoint are dropped
- A model or provider switch also sends a fresh system prompt, without folding entries

### Automatic checkpoints

- At 50% of the budget or more, with notes the latest checkpoint does not use, a checkpoint is written automatically when the provider's cache is already lost: idle past the provider's cache lifetime, or a model or provider switch
- An automatic checkpoint has no handoff
- Each provider declares its cache lifetime

### Memories

- A cheap model (`Models.cheap`) writes short-term notes in the background, about one per 16,000 tokens of history, starting with the first 16,000
- When unfolded notes pass about 30,000 tokens, they are condensed into long-term memory
- A fork reuses its parent's notes and memories up to the fork point

### History

- A `history` tool reads entries `from` through `through` back as a transcript, so the model can recall details a memory left out
- Its rows read `Recalled entries 12–40`

### Transcript

- The transcript keeps every entry; scrolling back shows everything before a checkpoint
- A checkpoint draws as a faint rule spanning the transcript, labeled "Checkpoint", with a blank line above and below
- The handoff shows only in the debug view, under the rule, folded to its first line and unfolding on click
- The `checkpoint` tool call has no work row; only the rule shows
- Each note or memory written shows in the transcript as one faint line with its entry range and tokens
- Nudges show only in the debug view

## Sidebar

- `compaction/status` streams the session's size, budget, stage, how far notes reach and the checkpoint count, again after each burst of new entries
- The Compaction section shows budget used and its share, notes through an entry, and checkpoints; the budget is in the warning color from the warning stage

## References

- Tau `src/core/ContextMethod.ts`
