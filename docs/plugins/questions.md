# questions

Lets the agent end a turn with a form of questions for the user.

Status: built

## Provides

- Tool: `ask_question`

## Requires

- `SessionLog`, `EntryKinds`, `Tools`, `BeforeCallHooks`, `Inbox`

## Adds

- Entries: `questions/form` (shown, not sent), `questions/answers` (shown and sent), `questions/cancelled` (hidden, sent)
- TUI: `/qna`, the form in the composer's draft area and key hints, the asked line and the answers band in the transcript

## Requirements

### Asking

- `ask_question` is declared but not offered; `/qna` sends a user message that offers it, with any text after `/qna` as context
- `ask_question` ends the turn as answered; its form entry holds the title and questions
- A question is a select with at least two options, a yes or no, or a written answer; ids are unique and a recommendation names one of its options
- The call streams as "Drafting questions" and stays out of the work rows

### Form

- A pending form is derived from the session log: the latest form with no answers, cancel or user message after it
- While a form waits it takes the composer's draft area and key hints; steering waits for the answers
- Tab and shift+tab move between tabs, up and down move rows, enter picks or accepts, `n` notes an option, esc drops a note or cancels the form
- One tab per question, then additional context; questions left open are sent as skipped
- Answering or cancelling names the form's entry; a form no longer waiting fails with `FormGone`

### Answers

- Answers are a structured `questions/answers` user entry the model reads as text, sent with the tool's withdrawal
- A cancel saves `questions/cancelled` and the tool's withdrawal without starting a turn
- The look follows [requirements/06-tui-design.md](../requirements/06-tui-design.md#transcript)

## References

- Tau `ask_question` and `/qna`
