# inbox

The composer and all sending: starts a turn when idle, queues steers and follow-ups while one runs, with the input's `@` tags, pictures and stashes.

Status: built

## Provides

- `Inbox`, `TagSources`

## Requires

- `SessionLog`, `AgentLoop`, `BeforeCallHooks`, `TurnEndingHooks`

## Requirements

### Sending

- `inbox/send` takes the text and its pictures; idle starts a turn, a running turn queues it as a steer or a follow-up
- Pictures are saved as `<data>/pictures/<sha256>.<ext>` and reach the model as image parts whatever input it accepts
- Each `@` tag attaches what the first tag source that knows it gives, after the text and before the pictures

### Tags

- `@` at the cursor opens the list; up and down move, enter tags the row, tab opens a folder or tags anything else, esc closes the list for that tag
- A path with spaces is tagged as `@"path"`
- Tag sources register with `offerTagSource(source, order)`; the list shows every source's rows in order

### Pictures

- Ctrl+v or an empty paste adds the clipboard's picture as an `[Image N]` chip; a pasted picture path adds that file
- Sending renumbers the chips in order and drops pictures whose chip was deleted

### Stashes

- Ctrl+s stashes the draft and clears it; the same text twice in a folder is kept once
- `stashes.db` holds one list per workspace folder, newest first
- `/pop` lists the stashes; enter puts one after the draft and removes it, ctrl+d discards one after a confirm

## References

- Tau `src/tui/internal/{stash.ts,pictures.ts,file-suggestions.ts}`, `src/core/{FileTags.ts,Stashes.ts}`, `src/proc/ClipboardImage.ts`
