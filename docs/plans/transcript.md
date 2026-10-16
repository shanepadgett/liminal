# Transcript

How the chat transcript shows a session, played as a live turn in the gallery (`apps/gallery`). Brightness follows importance, and what is newest is brightest. This design (first built as Transcript 2.0) replaced the original Full, Folded, Quiet and Liminal styles, which are retired and deleted.

## Design (built, awaiting review)

- A turn is a prompt and a reply. The prompt is a raised band with an accent bar; a long prompt shows two lines ending in `…`, and a click opens and closes it.
- While working, the tip of the turn is one live line: a turning arc and the action in the present tense with a band of light sweeping across it; elapsed time after 3s.
- Under the live line, what the action produces, gone when it ends: thinking as three fading italic lines that rise and thin out, a command's newest two output lines, the diff an edit writes, checks ticking off.
- Work reads like Grok Build's folded rows: everything the assistant says is full-brightness text, and all its work is gray rows between, so the two never blur. Prose and rows share one left edge, with a blank line between blocks.
- Between two things the assistant said, the work folds into one row per group: a mark, the verb in bold, what it worked on, and detail in brackets (`◆ Thought for 4s`, `◈ Explored kernel/test, 2 files, 1 search`, `◈ Edited kernel/test, 2 files`, `◆ Ran bun test kernel`, `◆ Ran checks (all passed)`). Reads and searches in a row join one group; so do edits in a row. `◈` marks a group of several actions, `◆` a single one.
- Everything the assistant says, between actions or as its answer, is Markdown (`<markdown>`, markers concealed) in the normal text color, arriving a whole word at a time. The assistant talks out loud between stretches of work.
- Work dims once it is left behind: a stretch of work fades to its dim colors over 600ms once the assistant next speaks, and all of it dims once the turn's work is over. `◇ Worked for` is drawn dim from the start. Only the stretch being worked on is at the brighter gray.
- Only failures have color: `(failed)` or `(lint failed)` in the danger color. No green counts or check marks.
- A group of several actions opens on a click to one row per action (`◆ Read …`, `◆ Search … (2 hits)`, `◆ Edit … (+1 -1)`); a thought opens to its text. Past turns fold the same way.
- While a group goes on, it is the live line in the present tense (`Exploring kernel/test, 2 files`), and settles into its row once the next thing starts.
- Thinking streams in with its newest characters warming up from the background; the rest of the word being written is laid out unseen, so words never jump lines.
- Questions follow Tau's `/qna`: the run ends by drafting a form, shown only as the live line `Drafting questions`. The user answers in the composer, which the form takes over; the transcript does not show the form being answered.
- Once drafted, the form settles under the worked line into one line: `? <title>  4 questions for you`.
- The user's answers are the next prompt, in the prompt's raised band with the accent bar: each question muted, `→ answer` in the user's voice, `as suggested` or `own answer` beside it, `suggested <answer>` under it when the user chose another, notes left on options as `└ note on <option>`, and Additional context last.
- The form has a title, which Tau's `ask_question` does not take yet.
- The composer's question form (`apps/gallery/src/chat/`: `formState.ts`, `QuestionForm.tsx`, `FormTabs.tsx`, `ChoiceTab.tsx`, `WriteTab.tsx`, `Suggested.tsx`) replaces the input and keeps the model line and key hints. It shows the title, then tabs (`1 ✓  2  3  4  context`, the tab in view on the selected surface, unanswered ones faint), then the tab in view. A select or yes/no tab lists options as rows with `○`/`●` marks and aligned descriptions; a select ends in an `Other…` row that becomes a field; notes hang under options as `└ note`, and an open note is a field there. A written-answer tab and the optional context tab have a `›` field. The suggested answer and its reason close a question's tab. Questions can be skipped: sending with a question open sends it as skipped, with no warning, and the Answers band shows `→ skipped` in faint text. Gallery: Components → Chat → Composer, the `Questions, …` states.
- The turn ends in one gray row, `◇ Worked for 34s`, inking in as the work ends, then the answer with code in the accent.

```text
apps/gallery/src/transcript/
  script.ts    a turn: a prompt (text or answers), timed beats (think, say, act), then a close (answer or questions)
  questions.ts how a question and its answer read
  workGroups.ts  work between two things said, gathered into groups
  wording.ts   how a group reads as a row, past or present tense
  frame.ts     what shows at one moment: blocks, tip, ending
  play.ts      frameAt(script, ms): pure, shared by playback, held moments, screens and tests
  ink.ts       streaming thought as colored runs
  shimmer.ts   the live line's light band
  useClock.ts  looping time for anything that moves
  duration.ts, wrapWords.ts, UserPrompt.tsx
  Turn.tsx, Tip.tsx, LiveLine.tsx, Vapor.tsx, details.tsx, Answers.tsx, WorkRows.tsx, Asked.tsx, WorkedFor.tsx, Said.tsx
  Conversation.tsx  a session held at one moment; Playback.tsx plays it
  galleryEntries.tsx
```

## Gallery

| Place | Entry | States |
| --- | --- | --- |
| Components → Transcript | Turn | the sample turns held at each moment |
| Components → Transcript | Work rows | current and left behind |
| Screens → Transcript | Session | playing, finished |
| Screens → Chat | the chat screen | `Conversation` held mid-run while working, finished otherwise |
| Tokens → Sample | each palette | `Conversation` with one finished turn |

Only the transcript screen animates; everywhere else holds a moment from `frameAt`.

## Open

- Whether past turns keep their trails at the palest level or hide them.
- Timings (`SHIMMER_PERIOD_MS`, `FRESH_CHARS`, `HOLD_MS`, `SETTLE_MS`, `BETWEEN_TURNS_MS`, `DIM_MS`) need review in a live terminal.
- The composer's question form is static; its keys are not wired.
- The form title needs a change to Tau's `ask_question`.
