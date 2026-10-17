# questions

Lets the agent end a turn with a form of questions for the user.

Status: planned

## Provides

- Tool: `ask_question`

## Requires

- `SessionLog`, `AgentLoop`

## Adds

- Entry kinds: the form, `answers`
- TUI: the composer's question form, the asked line and the answers band in the transcript

## Requirements

- `ask_question` is declared but not offered; `/qna` offers it and answering the form withdraws it
- `ask_question` ends the turn; its entry holds the form
- The form has a title
- Answers are a structured `answers` user entry the model reads as text
- A pending form is derived: the last turn ended with a form and no answers followed
- Follows Tau's `/qna`; the look is in [requirements/06-tui-design.md](../requirements/06-tui-design.md#transcript)

## References

- Tau `ask_question` and `/qna`
