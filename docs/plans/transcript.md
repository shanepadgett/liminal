# Transcript

The transcript as built in the gallery (`apps/gallery`), awaiting review in a live terminal. Its design is in [requirements/06-tui-design.md](../requirements/06-tui-design.md#transcript).

## Files

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
  Tip.tsx, LiveLine.tsx, Vapor.tsx, details.tsx, Answers.tsx, WorkRows.tsx, Asked.tsx, WorkedFor.tsx, Said.tsx
  Sent.tsx     the prompt or answers band; Reply.tsx the assistant's side; Turn.tsx both, on its own
  pin.ts       which prompt is pinned to the top and how far the next pushes it
  Conversation.tsx  a session held at one moment, with the pinned prompt; Playback.tsx plays it
  galleryEntries.tsx
apps/gallery/src/chat/
  formState.ts, QuestionForm.tsx, FormTabs.tsx, ChoiceTab.tsx, WriteTab.tsx, Suggested.tsx   the composer's question form
```

## Gallery

| Place | Entry | States |
| --- | --- | --- |
| Components → Transcript | Turn | the sample turns held at each moment |
| Components → Transcript | Work rows | current and left behind |
| Components → Chat | Composer | the `Questions, …` states |
| Screens → Transcript | Session | playing, finished |
| Screens → Chat | the chat screen | `Conversation` held mid-run while working, finished otherwise |
| Tokens → Sample | each palette | `Conversation` with one finished turn |

Only the transcript screen animates; everywhere else holds a moment from `frameAt`.

## Open

- Whether past turns keep their trails at the palest level or hide them.
- Timings (`SHIMMER_PERIOD_MS`, `FRESH_CHARS`, `HOLD_MS`, `SETTLE_MS`, `BETWEEN_TURNS_MS`, `DIM_MS`) need review in a live terminal.
- The composer's question form is static; its keys are not wired.
