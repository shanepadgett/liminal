# Transcript

Lets the user compare ways the chat transcript can show a session, from Pi's full blocks to Codex's single working line, and blend them per kind of entry. Everything is explored in the gallery (`apps/gallery`).

## Agreed

- One typed sample session holds every kind of entry; every style renders the same session.
- A style is a table: each kind gets a level for the working phase and for the finished phase, plus grouping rules.
- Harness entries show or hide with a gallery-wide `d` key, saved in the bookmark like theme and size.
- Build order: work entries (thinking, tool calls) first.
- Expansion: component pages get collapsed and expanded states; the full-screen sample has one row expanded.
- A failed tool call always opens to show its error, even at the `line` level.

## References studied

| Harness | Shape | Where |
| --- | --- | --- |
| Pi | Every tool draws a call block and a result block, same shape for all | `renderCall` / `renderResult` in Pi's extension docs |
| Grok Build | One line per action, expandable to its output | `crates/codegen/xai-grok-pager-render/src/render/` |
| Codex | One live working line; interim messages replaced; `Worked for 2m 5s` before the final message | `codex-rs/tui/src/history_cell/separators.rs` |
| Tau | Entry and reminder kinds, checkpoint, dreaming | `src/session/Entry.ts`, `src/session/Reminder.ts`, `src/core/internal/context/memory/` |

## Kinds

| Category | Kinds | Hidden unless `d` |
| --- | --- | --- |
| Conversation | user, steering, assistant (interim, final) | no |
| Work | thinking; tool call per tool (read, edit, run, search, checks, ask question), each running, done or failed; permission request | no |
| Memory | checkpoint with handoff note, short-term note, dreaming pass | yes |
| Harness | reminder by kind, nudge, instructions update, folder listings | yes |
| Media | image attached by the user or read by a tool | no |
| Session | compaction, error, turn summary | no |

## Shape

```mermaid
flowchart LR
  Sample[sample session] --> Transcript
  Style[style table] --> Transcript
  Debug[d key] --> Transcript
  Transcript --> Group[grouping rules]
  Group --> Level[level per entry]
  Level --> Pieces[entry components]
```

| Level | Draws | Like |
| --- | --- | --- |
| `full` | The whole block: call and result | Pi |
| `line` | One line; expandable to its block | Grok Build |
| `live` | Only while it is the current action, then gone | Codex |
| `hidden` | Nothing | |

Grouping folds neighboring entries of a kind into one line, such as several reads into `Explored`. It beat separate renderers per style: a blend changes table rows instead of adding code.

Starting styles: **Full** (Pi), **Folded** (Grok Build), **Quiet** (Codex).

## Gallery

| Place | Entry | States |
| --- | --- | --- |
| Components → Transcript | one per kind | one per level it supports, collapsed and expanded |
| Screens → Transcript | the sample session | each style, working and finished |
| Screens → Chat | the chat screen | uses the transcript in place of `Conversation` |

Replaces `chat/Conversation.tsx`, `chat/Message.tsx` and `chat/ToolCall.tsx` once the transcript covers them.

## Step 1: work entries (built)

```text
apps/gallery/src/transcript/
  entries.ts        Entry union: user, thinking, interim, answer, worked, tool calls; Outcome running/done/failed
  sample.ts         the sample session, working and finished; each tool done, running and failed
  levels.ts         Phase, Level, DrawnLevel, GroupRule, Style
  styles.ts         Full, Folded, Quiet; the Explored group rule
  fold.ts           a turn as rows: entries, or neighboring tool calls folded into a group
  Transcript.tsx    picks each row's level for its turn's phase and draws it
  Thinking.tsx, ToolCall.tsx, Group.tsx, Worked.tsx
  results/          one face per tool: verb, present-tense verb, subject, summary, body
  galleryEntries.tsx  Components → Transcript and Screens → Transcript
```

- `worked` (`Worked for 2m 5s`) is an entry kind so Quiet can show it; Full and Folded hide it.
- Group rules name tool kinds only.
- A running call reads in the present tense (`Running`); `live` is its bare line.
- The `d` key waits for the harness kinds, since there is nothing to show with it yet.

## Open

- Whether Quiet should show the answered question once the turn is done.
