# attention

Plays a sound when the on-screen session needs the user: its turn ends or a workflow waits for input.

Status: built

## Provides

- None

## Requires

- None

## Adds

- TUI: a composer line part at order 60 that plays `assets/notification.wav`

## Requirements

- A sound plays when the on-screen session's turn ends, unless the turn was cancelled
- A sound plays when a new shared input wait appears for the on-screen session, including approval asks and commit review and push prompts
- Repeated snapshots of the same pending wait and removal of waits make no sound
- Input waits release on answer, cancellation, failure or plugin unload
- A question form ends the turn, so the turn end sound covers it
- Other sessions make no sound
- The system player plays the file: `afplay` on macOS, `paplay`, `pw-play` or `aplay` on Linux
- No player found means no sound

## References

- Tau `src/tui/Notifications.ts`, `src/tui/internal/notification-sound.ts`, `src/tui/internal/turn-attention.ts`
