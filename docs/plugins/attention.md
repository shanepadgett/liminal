# attention

Plays a sound when the on-screen session needs the user: its turn ends or a workflow waits for input.

Status: built

## Provides

- None

## Requires

- Settings

## Adds

- Settings section `attention`: `enabled` (on when unset) and `sound`, the id of one of the four sounds (`threshold`, `lantern`, `vesper`, `lintel`)
- RPCs: `attention/get` reads the saved choices, `attention/set-enabled` and `attention/set-sound` write them to the global settings
- TUI: a composer line part at order 60 that plays the chosen sound from `assets/`
- TUI: a palette section, Notifications, with Toggle notifications and Notification sound

## Requirements

- A sound plays when the on-screen session's turn ends, unless the turn was cancelled
- A sound plays when a new shared input wait appears for the on-screen session, including approval asks and commit review and push prompts
- Repeated snapshots of the same pending wait and removal of waits make no sound
- Input waits release on answer, cancellation, failure or plugin unload
- A question form ends the turn, so the turn end sound covers it
- Other sessions make no sound
- The system player plays the file: `afplay` on macOS, `paplay`, `pw-play` or `aplay` on Linux
- No player found means no sound, and no Notifications section
- The TUI starts with the saved choices; global and project settings both apply, the project's winning
- Threshold is the sound when `attention.sound` is unset or names no sound
- Toggle notifications flips the sound on or off, saves it to the global settings and shows a toast
- Notification sound lists the four sounds with their mood
- The highlighted sound plays as the highlight moves, and again on ctrl+y, even with notifications off; opening the menu plays nothing
- Enter saves the highlighted sound to the global settings; Esc keeps the saved sound
- A settings file that cannot be read leaves the sound on with the default sound

## References

- Lantern, Vesper and Lintel are Universfield's "New Notification 010", "Notification Chime" and "Notification Beep" from Pixabay, under the Pixabay Content License
- Tau `src/tui/Notifications.ts`, `src/tui/internal/notification-sound.ts`, `src/tui/internal/turn-attention.ts`
