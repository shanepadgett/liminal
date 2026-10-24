# Gallery sync

Bring `apps/gallery` in line with what the TUI shows today. Where the two differ, the product is right: change the gallery to match. Gallery entries for designs the product has not built yet, such as Memory and Checkpoint, stay as sketches.

## How

For each pair, read the product component, then the gallery one, and change the gallery's look, layout, text, keys, hints and states to match. Add an entry for anything the TUI shows that the gallery lacks.

## Pairs

| Gallery entry | Product | Status |
| --- | --- | --- |
| Primitives: Hints | `kit/Hints.tsx`, `kit/hint-layout.ts` | Done: ported, with `ctrl+g more` and expanded states |
| Primitives: Choice row | `kit/ChoiceRow.tsx` | Done: `suffix` added |
| Primitives: Chip, Matched text, Ink, Gradient, Hatch, Logo, Rule, Section, List row | `packages/tui/src/kit/` | Done: Ink ported with eased warmth; the rest already matched |
| Primitives: Spinner | `kit/Porter.tsx` | Done: replaced by `primitives/Porter.tsx` |
| (missing) Choices | `kit/Choices.tsx` | Added: `primitives/Choices.tsx` |
| (missing) Diff | `kit/Diff.tsx` | Added: `primitives/Diff.tsx` |
| Chat: Header | `chat/tui/Header.tsx` | Done: already matched |
| Chat: Landing | `chat/tui/Landing.tsx` | Done: wordmark and one line, no version or hints |
| Chat: Composer | `chat/tui/Composer.tsx`, `model-choice/tui/ModelLine.tsx` | Done: order, placeholder, model line, product hints, asks take the whole composer |
| Chat: Slash menu | `chat/tui/DraftMenu.tsx`, `slash/tui/index.tsx`: argument hints, notifications above the menu | Done: product commands and titles, `[hint]`/`<hint>` suffixes |
| (missing) Tag menu | `tags/tui/index.tsx` with `DraftMenu` | Not done: same menu as the slash menu with other rows |
| Chat: Sidebar | `chat/tui/Sidebar.tsx`, `usage/tui`, `session-name/tui` | Done: Session and Usage sections only |
| Chat: Notifications | `kit/NotificationList.tsx`, `chat/tui/Composer.tsx` | Done: already matched; state over the slash menu added |
| (missing) Sticky prompt | `chat/tui/sticky.tsx` | Done: approximated in the Chat screen; the prompt sits over the top of the transcript |
| Transcript: Turn, Reply, Turn end, Notice | `chat/tui/Turn.tsx`, `Reply.tsx`, `TurnEnd.tsx`, `Notice.tsx`, `Prompt.tsx` | Done: Prompt ported, product endings and notice levels, prose cap and diagrams |
| Transcript: Work rows | `chat/tui/WorkRow.tsx`, the tool rows in `tools-edit`, `tools-shell`, `tools-web`, `tools-write`, `tools-processes` | Done: details open under the row, streamed and running states |
| Transcript: Answers | `questions/tui/AskRow.tsx` | Done: answers open under the row |
| Transcript: Memory, Checkpoint | not built; stay as sketches | Sketch |
| Asks: Ask | `questions/tui/Ask.tsx` | Done: already matched |
| Asks: Approval | `approvals/tui/Choose.tsx`, `CallAsk.tsx`, `AccessAsk.tsx`; now on `Choices` | Done: on `Choices`, verdict body, failed review, folder asks |
| Asks: Questions | `questions/tui/FormAsk.tsx`, `FormParts.tsx` | Done: hints follow the product rules |
| Asks: Commit | `commit/tui/Commit.tsx`; push question on `Choices` | Done: push question on `Choices` |
| Dialogs: frame | `kit/Dialog.tsx` | Done: footer row keeps its height; confirm question in place of the hints |
| Dialogs: Commands | `palette/tui` | Done: Picker has spaced sections and section details; rows not compared |
| Dialogs: Models | `model-choice/tui`, `model-favorites/tui` | Not done: rows not compared |
| Dialogs: Sessions | `session-picker/tui` | Not done: rows not compared |
| Dialogs: Connect | `accounts/tui/SignIn.tsx` | Not done: not compared |
| (missing) Theme, Stash pickers | `theme/tui`, `stash/tui` | Not done: both are plain Pickers |
| Screens: Chat | `chat/tui/ChatView.tsx`, `Layout.tsx` | Done: Answered screen uses product rows and notices |
