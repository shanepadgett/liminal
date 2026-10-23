# @shanepadgett/liminal-questions

Questions the model puts to the user inside a tool call. The call logs what it asks and waits; the user's answer comes back as an input, and the call's result carries it to the model.

## Contract

`./contract` exports:

- Events: `questions/asked` (`id`, `callId`, `kind`, `data`), which the model never sees; `questions/answered` (`id`, `answer`), an input; `questions/requested` (`text`), `/qna`'s request, which the model reads as a user message.
- `Questions`: `ask(asker, kind, data)` logs an ask for the tool call in `asker` and waits for its answer. A cancelled turn interrupts the wait.
- `defineQuestion(kind, data, answer)`: a kind of question with JSON codecs for what it asks and how it is answered; its `ask` encodes, asks and decodes, failing with `AnswerInvalid` on an answer the codec rejects.
- `QuestionsRpc`: `questions/qna` sends `/qna`'s request with the text after it, as a follow-up while a turn runs; `questions/answer` sends the answer to an ask. An answer for an ask that no longer waits is logged as a warning and dropped.

## ask_question

`ask_question` is a deferred tool: a form with a title and questions to pick (`select`), confirm (`confirm`) or write (`input`), each with an optional suggested answer. The turn that takes `/qna`'s request offers it through `ToolList.offer`; every other turn withdraws it. The model reads the answers as text: each answer, `(own answer)` and `(suggested)` marks, the note on a picked option and the additional notes.

The plugin requires `SessionLog`, `ToolList`, `Tools`, `Send`, `BeforeCall`, `Converters` and `Inbox`.

## TUI

While the running turn waits on asks, the oldest takes the composer's place, drawn by its kind's view in `AskViews`; `./tui` exports `AskViews` and the `Ask` frame, `Field` and `Note` for other kinds. `ask_question`'s form has a tab per question and a last `notes` tab:

| Key | Does |
| --- | --- |
| Up, Down | Choose an option, or the row for an own answer |
| Enter | Pick the option, accept the written answer, or on the `notes` tab send the answers |
| `n` | Pick the option and write a note on it; Enter keeps it, Esc drops it |
| Tab, Shift+Tab | Next and previous tab |
| Esc | Cancel the turn |

While an ask waits, Porter murmurs `patiently waiting`, `waiting for you` and `all ears`, with slow blinks, and the header's diagonals hold still until the answer is sent. `ask_question`'s row shows the form's title and how it was answered, and once the user answers, a click on the row opens the answers under it. `/qna`, alone or before text in the draft, sends the request; alone it is listed only in a session. The `tui` entry requires `Host`, `Dialogs`, `Pickers`, `Keymap`, `ChatScreen`, `ChatSend`, `ComposerCovers`, `ToolRows` and `Moods`.
